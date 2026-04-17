/**
 * Admin: list active display boards (ADMIN role required).
 * Combines persistent Display rows (names) with the in-memory live
 * SSE connection registry.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { ensureDisplaySchema, listConnections } from '@/lib/display-registry';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Admin access required' },
                { status: 403 }
            );
        }

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

        const liveByDeviceId = new Map(live.map(c => [c.deviceId, c]));

        const items = known.map(d => {
            const conn = liveByDeviceId.get(d.deviceId);
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
                createdAt: d.createdAt,
                updatedAt: d.updatedAt,
            };
        });

        return NextResponse.json({ items });
    } catch (error) {
        console.error('[admin/displays GET]', error);
        return NextResponse.json(
            { error: 'Internal error', message: 'Failed to list displays' },
            { status: 500 }
        );
    }
}
