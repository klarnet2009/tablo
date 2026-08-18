import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { z } from 'zod';

// `status: body.status` was unvalidated, so a dock could be put into any state at
// all — including values no query filters on, which makes it invisible to both the
// assignment logic and the dock list.
const updateDockSchema = z.object({
    name: z.string().min(1).optional(),
    dockType: z.enum(['INBOUND', 'OUTBOUND', 'BOTH', 'SCALES']).optional(),
    hasReeferPower: z.boolean().optional(),
    hazmatOk: z.boolean().optional(),
    maxLength: z.number().positive().nullish(),
    dockHeight: z.number().positive().nullish(),
    status: z.enum(['AVAILABLE', 'BUSY', 'CLOSED', 'MAINTENANCE']).optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireRole(['SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;

    const { id } = await params;

    try {
        const data = updateDockSchema.parse(await request.json());

        const before = await prisma.dock.findUnique({ where: { id } });
        if (!before) {
            return NextResponse.json({ error: 'Dock not found' }, { status: 404 });
        }

        const dock = await prisma.dock.update({ where: { id }, data });

        await createAuditLog({
            action: AuditActions.DOCK_UPDATED,
            entityType: 'Dock',
            entityId: id,
            userId: guard.session.user.id,
            beforeState: before,
            afterState: dock,
        });

        return NextResponse.json(dock);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: z.prettifyError(error), issues: error.issues }, { status: 400 });
        }
        console.error('Error updating dock:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
