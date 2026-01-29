import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/audit';
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
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const userRole = session.user.role;

    // Only DISPATCHER, SUPERVISOR, ADMIN can reassign docks
    if (!['DISPATCHER', 'SUPERVISOR', 'ADMIN'].includes(userRole)) {
        return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

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

        // Check if new dock is busy with another visit (but allow multiple for SCALES)
        if (newDock.status === 'BUSY' && newDock.dockType !== 'SCALES') {
            const busyVisit = await prisma.truckVisit.findFirst({
                where: {
                    assignedDockId: newDockId,
                    status: { in: ['CALLED', 'DOCKED', 'IN_SERVICE'] },
                    id: { not: id },
                },
            });
            if (busyVisit) {
                return NextResponse.json(
                    { error: 'Dock is already assigned to another active visit' },
                    { status: 400 }
                );
            }
        }

        // Free old dock if exists
        if (oldDockId && oldDockId !== newDockId) {
            await prisma.dock.update({
                where: { id: oldDockId },
                data: { status: 'AVAILABLE' },
            });
        }

        // Set new dock to busy
        await prisma.dock.update({
            where: { id: newDockId },
            data: { status: 'BUSY' },
        });

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
