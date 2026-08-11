import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import {
    isValidTransition,
    canUserTransition,
    getTimestampField,
    VisitStatus,
    UserRole
} from '@/lib/status-machine';
import { z } from 'zod';

const statusChangeSchema = z.object({
    status: z.enum([
        'NEW', 'ARRIVED', 'WAITING', 'CALLED', 'DOCKED',
        'IN_SERVICE', 'DONE', 'LEFT', 'CANCELLED', 'NO_SHOW', 'HOLD'
    ]),
    dockId: z.string().optional(),
    notes: z.string().optional(),
});

export const dynamic = 'force-dynamic';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireRole();
    if (!guard.ok) return guard.response;
    const session = guard.session;

    const { id } = await params;

    try {
        const body = await request.json();
        const { status: newStatus, dockId, notes } = statusChangeSchema.parse(body);

        // Get current visit
        const visit = await prisma.truckVisit.findUnique({
            where: { id },
            include: { assignedDock: true },
        });

        if (!visit) {
            return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
        }

        const currentStatus = visit.status as VisitStatus;
        const userRole = session.user.role as UserRole;

        // Validate transition
        if (!isValidTransition(currentStatus, newStatus)) {
            return NextResponse.json(
                { error: `Invalid transition from ${currentStatus} to ${newStatus}` },
                { status: 400 }
            );
        }

        if (!canUserTransition(currentStatus, newStatus, userRole)) {
            return NextResponse.json(
                { error: 'You do not have permission for this transition' },
                { status: 403 }
            );
        }

        // Handle dock assignment for CALLED status
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {
            status: newStatus,
        };

        // Set timestamp field if applicable
        const timestampField = getTimestampField(newStatus);
        if (timestampField) {
            updateData[timestampField] = new Date();
        }

        // Handle notes
        if (notes) {
            updateData.notes = notes;
        }

        // Handle dock assignment
        if (newStatus === 'CALLED') {
            if (!dockId && !visit.assignedDockId) {
                return NextResponse.json(
                    { error: 'Dock must be assigned before calling truck' },
                    { status: 400 }
                );
            }

            if (dockId) {
                // Check if dock is available
                const dock = await prisma.dock.findUnique({ where: { id: dockId } });
                if (!dock) {
                    return NextResponse.json({ error: 'Dock not found' }, { status: 404 });
                }
                if (dock.status === 'BUSY' && dock.dockType !== 'SCALES') {
                    // Check if it's busy with another visit (but allow multiple for SCALES)
                    const busyVisit = await prisma.truckVisit.findFirst({
                        where: {
                            assignedDockId: dockId,
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
                if (dock.status === 'CLOSED' || dock.status === 'MAINTENANCE') {
                    return NextResponse.json(
                        { error: `Dock is ${dock.status.toLowerCase()}` },
                        { status: 400 }
                    );
                }

                updateData.assignedDockId = dockId;

                // Update dock status to busy
                await prisma.dock.update({
                    where: { id: dockId },
                    data: { status: 'BUSY' },
                });
            }

            // Remove from queue
            updateData.queuePosition = null;
        }

        // Handle terminal states - delete the visit instead of keeping it
        const terminalStates = ['LEFT', 'CANCELLED', 'NO_SHOW'];
        if (terminalStates.includes(newStatus)) {
            // Free dock if assigned
            if (visit.assignedDockId) {
                await prisma.dock.update({
                    where: { id: visit.assignedDockId },
                    data: { status: 'AVAILABLE' },
                });
            }

            // Create audit log before deletion
            await createAuditLog({
                action: AuditActions.STATUS_CHANGE,
                entityType: 'TruckVisit',
                entityId: id,
                userId: session.user.id,
                visitId: undefined, // Will be undefined since we're deleting
                beforeState: { status: currentStatus, truckPlate: visit.truckPlate },
                afterState: { status: newStatus, deleted: true },
                metadata: { dockId, notes, reason: 'Terminal state - visit deleted' },
            });

            // Delete the visit
            await prisma.truckVisit.delete({
                where: { id },
            });

            return NextResponse.json({ success: true, deleted: true, status: newStatus });
        }

        // Free dock when done (but keep visit for LEFT transition)
        if (newStatus === 'DONE' && visit.assignedDockId) {
            await prisma.dock.update({
                where: { id: visit.assignedDockId },
                data: { status: 'AVAILABLE' },
            });
        }

        // Free dock when returning to WAITING (e.g., from CALLED, DOCKED, or DONE after weighing)
        if (newStatus === 'WAITING' && visit.assignedDockId) {
            await prisma.dock.update({
                where: { id: visit.assignedDockId },
                data: { status: 'AVAILABLE' },
            });
            updateData.assignedDockId = null;
        }

        // Update visit
        const updatedVisit = await prisma.truckVisit.update({
            where: { id },
            data: updateData,
            include: { assignedDock: true },
        });

        // Create audit log
        await createAuditLog({
            action: AuditActions.STATUS_CHANGE,
            entityType: 'TruckVisit',
            entityId: id,
            userId: session.user.id,
            visitId: id,
            beforeState: { status: currentStatus },
            afterState: { status: newStatus },
            metadata: { dockId, notes },
        });

        return NextResponse.json(updatedVisit);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: (error as any).errors }, { status: 400 });
        }
        console.error('Error updating visit status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
