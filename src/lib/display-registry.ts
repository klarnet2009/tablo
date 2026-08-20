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
import { nextRevision, shouldRefresh } from './display-freshness.ts';

export interface ConnectionInfo {
    deviceId: string;
    connectedAt: Date;
    lastHeartbeat: Date;
    lastPayloadAt: Date;
    ip: string | null;
    userAgent: string | null;
    controller: ReadableStreamDefaultController<Uint8Array>;
    // Most recent revision the client reported applying (via POST /api/display/ack).
    // Lets the server distinguish "SSE open" from "client actually has fresh data".
    clientRevision?: number;
    clientRevisionAt?: Date;
}

export interface ConnectionSnapshot {
    deviceId: string;
    name: string | null;
    connectedAt: Date;
    lastHeartbeat: Date;
    lastPayloadAt: Date;
    ip: string | null;
    userAgent: string | null;
    clientRevision: number | null;
    clientRevisionAt: Date | null;
}

// How often the loop wakes up. It only touches the database when a mutation marked
// the data dirty, or when the safety net is due, so a quiet yard costs nothing.
const TICK_INTERVAL_MS = 3000;
// Catches changes made outside the application: a direct database edit, a restored
// backup, anything that never called markVisitsDirty().
const SAFETY_NET_MS = 30_000;
// Liveness ping. Carries the current revision, so the client can detect a stalled
// stream without polling a second endpoint.
const PING_INTERVAL_MS = 15_000;

type GlobalState = {
    displayRegistry?: Map<string, ConnectionInfo>;
    displayBroadcastInterval?: NodeJS.Timeout;
    displaySchemaReady?: boolean;
    // Monotonic revision counter for the visits payload. Bumped only when the data
    // actually differs from what was last broadcast. It rides along on every ping,
    // so a client can tell "the stream is alive but payloads stopped arriving"
    // without polling a second endpoint.
    displayVisitsRevision?: number;
    displayVisitsLastJson?: string;
    // Set by markVisitsDirty() from the routes that change visits; consumed by the
    // broadcast loop on its next tick.
    displayVisitsDirty?: boolean;
    displayVisitsFetchedAt?: number;
    displayPingInterval?: NodeJS.Timeout;
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

function buildVisitsPayload(visits: unknown): { payload: string; changed: boolean } {
    const visitsJson = JSON.stringify(visits);
    const { revision, changed } = nextRevision(
        globalState.displayVisitsLastJson ?? null,
        globalState.displayVisitsRevision ?? 0,
        visitsJson,
    );
    globalState.displayVisitsRevision = revision;
    globalState.displayVisitsLastJson = visitsJson;

    // Payload shape: { revision, visits }. Client falls back to treating the
    // root as the visits array for backwards compatibility during rolling deploys.
    return {
        payload: `event: visits\ndata: {"revision":${revision},"visits":${visitsJson}}\n\n`,
        changed,
    };
}

/**
 * Tell the broadcast loop that the visits list changed.
 *
 * Called from every route that mutates a visit. Without it the loop would have to
 * query the database on a timer to find out, which is what it used to do 28,800
 * times a day whether anything had changed or not.
 */
export function markVisitsDirty(): void {
    globalState.displayVisitsDirty = true;
}

export function getVisitsRevision(): number {
    return globalState.displayVisitsRevision ?? 0;
}

/**
 * Client reports it has applied `revision`. Called from POST /api/display/ack.
 * Silently no-ops when the deviceId isn't currently connected (stale ack
 * arriving after disconnect).
 */
export function ackClientRevision(deviceId: string, revision: number): void {
    const conn = registry().get(deviceId);
    if (!conn) return;
    // Monotonicity guard: never regress the stored revision if an older ack
    // arrives out of order over keepalive/fetch.
    if (conn.clientRevision !== undefined && revision < conn.clientRevision) return;
    conn.clientRevision = revision;
    conn.clientRevisionAt = new Date();
}

function startBroadcastLoopIfNeeded() {
    if (!globalState.displayBroadcastInterval) {
        globalState.displayBroadcastInterval = setInterval(async () => {
            if (registry().size === 0) return;

            const dirty = globalState.displayVisitsDirty ?? false;
            const sinceLastFetchMs = Date.now() - (globalState.displayVisitsFetchedAt ?? 0);
            if (!shouldRefresh({ dirty, sinceLastFetchMs, safetyNetMs: SAFETY_NET_MS })) return;

            globalState.displayVisitsDirty = false;
            try {
                const visits = await fetchVisits();
                globalState.displayVisitsFetchedAt = Date.now();
                const { payload, changed } = buildVisitsPayload(visits);
                // Only put bytes on the wire when the queue actually moved. Liveness is
                // the ping's job, not the payload's.
                if (changed) broadcast(payload);
            } catch (err) {
                console.error('[display-registry] broadcast failed:', err);
            }
        }, TICK_INTERVAL_MS);
    }

    if (!globalState.displayPingInterval) {
        // One shared timer instead of one per connection.
        globalState.displayPingInterval = setInterval(() => {
            const revision = globalState.displayVisitsRevision ?? 0;
            const payload = `event: ping\ndata: {"revision":${revision}}\n\n`;
            const bytes = encoder.encode(payload);
            for (const [deviceId, conn] of registry()) {
                try {
                    conn.controller.enqueue(bytes);
                    conn.lastHeartbeat = new Date();
                } catch {
                    unregister(deviceId);
                }
            }
        }, PING_INTERVAL_MS);
    }
}

function stopBroadcastLoopIfIdle() {
    if (registry().size > 0) return;
    if (globalState.displayBroadcastInterval) {
        clearInterval(globalState.displayBroadcastInterval);
        globalState.displayBroadcastInterval = undefined;
    }
    if (globalState.displayPingInterval) {
        clearInterval(globalState.displayPingInterval);
        globalState.displayPingInterval = undefined;
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

export async function sendInitialSnapshot(deviceId: string): Promise<void> {
    const conn = registry().get(deviceId);
    if (!conn) return;
    try {
        const visits = await fetchVisits();
        globalState.displayVisitsFetchedAt = Date.now();
        conn.controller.enqueue(encoder.encode(buildVisitsPayload(visits).payload));
        conn.lastPayloadAt = new Date();
    } catch (err) {
        console.error('[display-registry] initial snapshot failed:', err);
    }
}

/**
 * The live connections, straight from memory.
 *
 * Names are deliberately not resolved here: the only caller already queries the
 * Display table for the full list, so looking them up again was a second query on
 * every poll of the back-office page.
 */
export function listConnections(): ConnectionSnapshot[] {
    return Array.from(registry().values()).map(c => ({
        deviceId: c.deviceId,
        name: null,
        connectedAt: c.connectedAt,
        lastHeartbeat: c.lastHeartbeat,
        lastPayloadAt: c.lastPayloadAt,
        ip: c.ip,
        userAgent: c.userAgent,
        clientRevision: c.clientRevision ?? null,
        clientRevisionAt: c.clientRevisionAt ?? null,
    }));
}
