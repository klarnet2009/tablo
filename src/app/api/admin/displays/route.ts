/**
 * Admin: list active display boards (ADMIN role required).
 * Combines persistent Display rows (names) with the in-memory live
 * SSE connection registry, and computes a per-display data-freshness
 * status derived from client ACKs.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import {
    ensureDisplaySchema,
    listConnections,
    getVisitsRevision,
    type ConnectionSnapshot,
} from '@/lib/display-registry';

export const dynamic = 'force-dynamic';

// Thresholds used to classify each online display's data freshness.
// Broadcast cadence is 3s, so these are generous to avoid false positives.
const STALE_ACK_AGE_MS = 20_000;   // client behind + ack older than this → stale
const NO_ACK_GRACE_MS = 15_000;    // fresh connect gets this long to send first ack
const NO_ACK_STALE_MS = 30_000;    // any connection with no ack this long → stale

type DataStatus = 'synced' | 'lagging' | 'stale' | 'unknown';

function computeDataStatus(
    conn: ConnectionSnapshot,
    serverRevision: number,
    now: number,
): DataStatus {
    const connectionAgeMs = now - conn.connectedAt.getTime();
    const clientRev = conn.clientRevision;
    const ackAgeMs = conn.clientRevisionAt
        ? now - conn.clientRevisionAt.getTime()
        : null;

    // No ack yet
    if (clientRev === null || ackAgeMs === null) {
        if (connectionAgeMs < NO_ACK_GRACE_MS) return 'unknown';
        return 'stale';
    }

    // Any connection silent for too long is stale regardless of revision match.
    if (ackAgeMs > NO_ACK_STALE_MS) return 'stale';

    if (clientRev === serverRevision) return 'synced';

    // Client is behind the server
    if (ackAgeMs > STALE_ACK_AGE_MS) return 'stale';
    return 'lagging';
}

export async function GET() {
    try {
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

        await ensureDisplaySchema();

        const [known, live] = await Promise.all([
            prisma.display.findMany({
                select: {
                    id: true,
                    deviceId: true,
                    name: true,
                    createdAt: true,
                    updatedAt: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            listConnections(),
        ]);

        const serverRevision = getVisitsRevision();
        const now = Date.now();
        const liveByDeviceId = new Map(live.map(c => [c.deviceId, c]));

        const items = known.map(d => {
            const conn = liveByDeviceId.get(d.deviceId);
            const dataStatus: DataStatus = conn
                ? computeDataStatus(conn, serverRevision, now)
                : 'unknown';
            return {
                id: d.id,
                deviceId: d.deviceId,
                name: d.name,
                online: !!conn,
                connectedAt: conn?.connectedAt ?? null,
                lastHeartbeat: conn?.lastHeartbeat ?? null,
                lastPayloadAt: conn?.lastPayloadAt ?? null,
                ip: conn?.ip ?? null,
                userAgent: conn?.userAgent ?? null,
                clientRevision: conn?.clientRevision ?? null,
                clientRevisionAt: conn?.clientRevisionAt ?? null,
                dataStatus,
                createdAt: d.createdAt,
                updatedAt: d.updatedAt,
            };
        });

        return NextResponse.json({ serverRevision, items });
    } catch (error) {
        console.error('[admin/displays GET]', error);
        return NextResponse.json(
            { error: 'Internal error', message: 'Failed to list displays' },
            { status: 500 }
        );
    }
}
