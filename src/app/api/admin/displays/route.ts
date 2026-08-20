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
} from '@/lib/display-registry';
import { computeDataStatus, type DataStatus } from '@/lib/display-freshness';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

        await ensureDisplaySchema();

        const known = await prisma.display.findMany({
            select: {
                id: true,
                deviceId: true,
                name: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        // In-memory, no second query.
        const live = listConnections();

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
