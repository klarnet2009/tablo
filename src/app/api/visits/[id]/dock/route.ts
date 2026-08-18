import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { claimDock, releaseDock } from '@/lib/docks';
import { z } from 'zod';

const reassignDockSchema = z.object({
    dockId: z.string(),
});

export const dynamic = 'force-dynamic';

// PATCH - Reassign dock for a visit
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireRole(['DISPATCHER', 'SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;
    const session = guard.session;

    const { id } = await params;

    try {
        const body = await request.json();
        const { dockId: newDockId } = reassignDockSchema.parse(body);

        // Get current visit
        const visit = await prisma.truckVisit.findUnique({
            where: { id },
            include: { assignedDock: true },
        });

        if (!visit) {
            return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
        }

        // Can only reassign if in CALLED or DOCKED status
        if (!['CALLED', 'DOCKED'].includes(visit.status)) {
            return NextResponse.json(
                { error: 'Can only reassign dock when status is CALLED or DOCKED' },
                { status: 400 }
            );
        }

        const oldDockId = visit.assignedDockId;

        // Check if new dock is available
        const newDock = await prisma.dock.findUnique({ where: { id: newDockId } });
        if (!newDock) {
            return NextResponse.json({ error: 'Dock not found' }, { status: 404 });
        }

        if (newDock.status === 'CLOSED' || newDock.status === 'MAINTENANCE') {
            return NextResponse.json(
                { error: `Dock is ${newDock.status.toLowerCase()}` },
                { status: 400 }
            );
        }

        // Claim the new dock before releasing the old one: if the claim loses a race
        // the visit keeps the dock it already had instead of ending up with none.
        const claimed = await claimDock(newDockId, newDock.dockType, id, oldDockId);
        if (!claimed) {
            return NextResponse.json(
                { error: 'Dock is already assigned to another active visit' },
                { status: 400 }
            );
        }

        if (oldDockId && oldDockId !== newDockId) {
            await releaseDock(oldDockId, id);
        }

        // Update visit with new dock
        const updatedVisit = await prisma.truckVisit.update({
            where: { id },
            data: { assignedDockId: newDockId },
            include: { assignedDock: true },
        });

        // Create audit log
        await createAuditLog({
            action: AuditActions.DOCK_REASSIGN,
            entityType: 'TruckVisit',
            entityId: id,
            userId: session.user.id,
            visitId: id,
            beforeState: { dockId: oldDockId },
            afterState: { dockId: newDockId },
        });

        return NextResponse.json(updatedVisit);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
        }
        console.error('Error reassigning dock:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
