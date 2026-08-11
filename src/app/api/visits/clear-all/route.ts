import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/visits/clear-all
 * Clear all trucks from the queue (set to CANCELLED status)
 */
export async function DELETE() {
    const guard = await requireRole(['SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;
    const session = guard.session;

    try {
        // First, free up all docks that are busy
        await prisma.dock.updateMany({
            where: { status: 'BUSY' },
            data: { status: 'AVAILABLE' },
        });

        // Delete only PLANNED visits (not in progress or at dock)
        const result = await prisma.truckVisit.deleteMany({
            where: {
                status: 'PLANNED',
            },
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
