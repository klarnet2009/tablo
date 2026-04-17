/**
 * Admin: rename or remove a registered display board (ADMIN role required).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { z } from 'zod';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { ensureDisplaySchema, unregister } from '@/lib/display-registry';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
    name: z.string().trim().max(80).nullable(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Admin access required' },
                { status: 403 }
            );
        }

        await ensureDisplaySchema();

        const { id } = await params;
        const body = await request.json();
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', issues: parsed.error.issues },
                { status: 400 }
            );
        }

        const existing = await prisma.display.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json(
                { error: 'Not found', message: 'Display not found' },
                { status: 404 }
            );
        }

        const newName = parsed.data.name?.length ? parsed.data.name : null;
        const updated = await prisma.display.update({
            where: { id },
            data: { name: newName },
        });

        await createAuditLog({
            action: AuditActions.DISPLAY_RENAMED,
            entityType: 'Display',
            entityId: existing.id,
            userId: session.user.id,
            beforeState: { name: existing.name },
            afterState: { name: updated.name },
            metadata: { deviceId: existing.deviceId },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('[admin/displays PATCH]', error);
        return NextResponse.json(
            { error: 'Internal error', message: 'Failed to update display' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Admin access required' },
                { status: 403 }
            );
        }

        await ensureDisplaySchema();

        const { id } = await params;
        const existing = await prisma.display.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json(
                { error: 'Not found', message: 'Display not found' },
                { status: 404 }
            );
        }

        await prisma.display.delete({ where: { id } });
        // If the display is currently streaming, close its SSE connection.
        // It will reconnect and be re-registered with a new DB row if still active.
        unregister(existing.deviceId);

        await createAuditLog({
            action: AuditActions.DISPLAY_DELETED,
            entityType: 'Display',
            entityId: existing.id,
            userId: session.user.id,
            beforeState: { name: existing.name, deviceId: existing.deviceId },
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[admin/displays DELETE]', error);
        return NextResponse.json(
            { error: 'Internal error', message: 'Failed to delete display' },
            { status: 500 }
        );
    }
}
