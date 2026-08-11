import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sortVisitsForQueue } from '@/lib/queue-order';

export const dynamic = 'force-dynamic';

// GET /api/display - Public API for display board (no auth required)
export async function GET() {
    const visits = await prisma.truckVisit.findMany({
        where: {
            status: {
                in: ['WAITING', 'CALLED', 'DOCKED', 'IN_SERVICE'],
            },
        },
        select: {
            id: true,
            truckPlate: true,
            trailerPlate: true,
            carrier: true,
            status: true,
            queuePosition: true,
            // Needed to order the queue; see sortVisitsForQueue for why this cannot
            // be an ORDER BY.
            priority: true,
            createdAt: true,
            assignedDock: {
                select: {
                    name: true,
                    dockNumber: true,
                    dockType: true,
                },
            },
        },
    });

    return NextResponse.json(sortVisitsForQueue(visits));
}
