import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/visits/clear-all
 * Discard the planned (not yet arrived) visits.
 *
 * Deliberately does not touch docks. It used to set every BUSY dock to AVAILABLE
 * first, which freed the docks of trucks that were still being served: those
 * visits kept their assignedDockId while the dock looked free, so the next truck
 * could be called to an occupied dock. Planned visits never hold a dock — one is
 * assigned on CALLED — so there is nothing to free here.
 */
export async function DELETE() {
    const guard = await requireRole(['SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;
    const session = guard.session;

    try {
        const doomed = await prisma.truckVisit.findMany({
            where: { status: 'PLANNED' },
            select: { id: true, truckPlate: true, orderRef: true },
        });

        const result = await prisma.truckVisit.deleteMany({
            where: { status: 'PLANNED' },
        });

        // Bulk deletions were previously invisible in the audit log.
        await createAuditLog({
            action: AuditActions.VISIT_DELETED,
            entityType: 'TruckVisit',
            entityId: 'clear-all',
            userId: session.user.id,
            metadata: { deleted: result.count, visits: doomed },
        });

        return NextResponse.json({
            success: true,
            deleted: result.count,
        });
    } catch (error) {
        console.error('Error clearing queue:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to clear queue' },
            { status: 500 }
        );
    }
}
