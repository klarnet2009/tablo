/**
 * Display connection registry for Server-Sent Events.
 *
 * Holds an in-memory Map of currently connected display boards and drives a
 * single shared broadcast loop that queries the visits list and pushes updates
 * to every connected client. Also exposes a CREATE TABLE IF NOT EXISTS helper
 * so local-dev databases stay compatible with the Display schema added in
 * docker-entrypoint.sh.
 */

import prisma from './prisma';

export interface ConnectionInfo {
    deviceId: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    lastPayloadAt: Date;
    ip: string | null;
    userAgent: string | null;
    controller: ReadableStreamDefaultController<Uint8Array>;
}

export interface ConnectionSnapshot {
    deviceId: string;
    name: string | null;
    connectedAt: Date;
    lastHeartbeat: Date;
    lastPayloadAt: Date;
    ip: string | null;
    userAgent: string | null;
}

const BROADCAST_INTERVAL_MS = 3000;

type GlobalState = {
    displayRegistry?: Map<string, ConnectionInfo>;
    displayBroadcastInterval?: NodeJS.Timeout;
    displaySchemaReady?: boolean;
};

const globalState = globalThis as unknown as GlobalState;

function registry(): Map<string, ConnectionInfo> {
    if (!globalState.displayRegistry) {
        globalState.displayRegistry = new Map();
    }
    return globalState.displayRegistry;
}

const encoder = new TextEncoder();

export async function ensureDisplaySchema(): Promise<void> {
    if (globalState.displaySchemaReady) return;
    // Idempotent: safe to run on every cold start.
    await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS Display (
            id TEXT PRIMARY KEY,
            deviceId TEXT UNIQUE NOT NULL,
            name TEXT,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
            updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    globalState.displaySchemaReady = true;
}

async function fetchVisits() {
    return prisma.truckVisit.findMany({
        where: { status: { in: ['WAITING', 'CALLED', 'DOCKED', 'IN_SERVICE'] } },
        select: {
            id: true,
            truckPlate: true,
            trailerPlate: true,
            carrier: true,
            status: true,
            queuePosition: true,
            assignedDock: {
                select: { name: true, dockNumber: true, dockType: true },
            },
        },
        orderBy: [
            { priority: 'desc' },
            { queuePosition: 'asc' },
            { createdAt: 'asc' },
        ],
    });
}

function startBroadcastLoopIfNeeded() {
    if (globalState.displayBroadcastInterval) return;
    globalState.displayBroadcastInterval = setInterval(async () => {
        const reg = registry();
        if (reg.size === 0) return;
        try {
            const visits = await fetchVisits();
            broadcast(`event: visits\ndata: ${JSON.stringify(visits)}\n\n`);
        } catch (err) {
            console.error('[display-registry] broadcast failed:', err);
        }
    }, BROADCAST_INTERVAL_MS);
}

function stopBroadcastLoopIfIdle() {
    if (registry().size === 0 && globalState.displayBroadcastInterval) {
        clearInterval(globalState.displayBroadcastInterval);
        globalState.displayBroadcastInterval = undefined;
    }
}

function broadcast(payload: string) {
    const bytes = encoder.encode(payload);
    for (const [deviceId, conn] of registry()) {
        try {
            conn.controller.enqueue(bytes);
            conn.lastPayloadAt = new Date();
        } catch {
            unregister(deviceId);
        }
    }
}

export async function register(info: ConnectionInfo): Promise<void> {
    await ensureDisplaySchema();
    // Evict any stale connection for the same deviceId (page reload, reconnect)
    const existing = registry().get(info.deviceId);
    if (existing && existing !== info) {
        try { existing.controller.close(); } catch { /* ignore */ }
    }
    registry().set(info.deviceId, info);
    startBroadcastLoopIfNeeded();
}

export function unregister(deviceId: string): void {
    const conn = registry().get(deviceId);
    if (conn) {
        try { conn.controller.close(); } catch { /* ignore */ }
        registry().delete(deviceId);
    }
    stopBroadcastLoopIfIdle();
}

export function sendHeartbeat(deviceId: string): void {
    const conn = registry().get(deviceId);
    if (!conn) return;
    try {
        conn.controller.enqueue(encoder.encode(': heartbeat\n\n'));
        conn.lastHeartbeat = new Date();
    } catch {
        unregister(deviceId);
    }
}

export async function sendInitialSnapshot(deviceId: string): Promise<void> {
    const conn = registry().get(deviceId);
    if (!conn) return;
    try {
        const visits = await fetchVisits();
        conn.controller.enqueue(
            encoder.encode(`event: visits\ndata: ${JSON.stringify(visits)}\n\n`)
        );
        conn.lastPayloadAt = new Date();
    } catch (err) {
        console.error('[display-registry] initial snapshot failed:', err);
    }
}

export async function listConnections(): Promise<ConnectionSnapshot[]> {
    await ensureDisplaySchema();
    const reg = registry();
    if (reg.size === 0) return [];

    const deviceIds = Array.from(reg.keys());
    const rows = await prisma.display.findMany({
        where: { deviceId: { in: deviceIds } },
        select: { deviceId: true, name: true },
    });
    const nameByDeviceId = new Map(rows.map(r => [r.deviceId, r.name]));

    return Array.from(reg.values()).map(c => ({
        deviceId: c.deviceId,
        name: nameByDeviceId.get(c.deviceId) ?? null,
        connectedAt: c.connectedAt,
        lastHeartbeat: c.lastHeartbeat,
        lastPayloadAt: c.lastPayloadAt,
        ip: c.ip,
        userAgent: c.userAgent,
    }));
}
