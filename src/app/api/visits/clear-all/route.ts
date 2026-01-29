import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * DELETE /api/visits/clear-all
 * Clear all trucks from the queue (set to CANCELLED status)
 */
export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admins or supervisors to clear all
    if (!['ADMIN', 'SUPERVISOR'].includes(session.user.role)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

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
