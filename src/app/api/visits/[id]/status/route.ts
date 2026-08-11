import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { claimDock, releaseDock } from '@/lib/docks';
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
                const dock = await prisma.dock.findUnique({ where: { id: dockId } });
                if (!dock) {
                    return NextResponse.json({ error: 'Dock not found' }, { status: 404 });
                }
                if (dock.status === 'CLOSED' || dock.status === 'MAINTENANCE') {
                    return NextResponse.json(
                        { error: `Dock is ${dock.status.toLowerCase()}` },
                        { status: 400 }
                    );
                }

                const claimed = await claimDock(dockId, dock.dockType, id, visit.assignedDockId);
                if (!claimed) {
                    return NextResponse.json(
                        { error: 'Dock is already assigned to another active visit' },
                        { status: 400 }
                    );
                }

                updateData.assignedDockId = dockId;
            }

            // Remove from queue
            updateData.queuePosition = null;
        }

        // Terminal states used to delete the row. That destroyed the visit's
        // timestamps (arrivedAt..leftAt), so nothing could be reported on afterwards,
        // and it detached the visit's existing audit entries. The row is kept instead;
        // every query in the app filters on active statuses, so it disappears from the
        // UI either way.
        const terminalStates = ['LEFT', 'CANCELLED', 'NO_SHOW'];
        if (terminalStates.includes(newStatus)) {
            if (visit.assignedDockId) {
                await releaseDock(visit.assignedDockId, id);
            }
            // Leave the dock reference in place as history, but drop the queue slot.
            updateData.queuePosition = null;
        }

        // Free dock when done (but keep visit for LEFT transition)
        if (newStatus === 'DONE' && visit.assignedDockId) {
            await releaseDock(visit.assignedDockId, id);
        }

        // Free dock when returning to WAITING (e.g., from CALLED, DOCKED, or DONE after weighing)
        if (newStatus === 'WAITING' && visit.assignedDockId) {
            await releaseDock(visit.assignedDockId, id);
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
            // zod v4 exposes .issues; .errors does not exist, so this used to
            // answer {"error": undefined} and the client showed no reason at all.
            return NextResponse.json({ error: z.prettifyError(error), issues: error.issues }, { status: 400 });
        }
        console.error('Error updating visit status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
