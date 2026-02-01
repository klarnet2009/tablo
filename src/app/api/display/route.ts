import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/display - Public API for display board (no auth required)
export async function GET(request: NextRequest) {
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
            assignedDock: {
                select: {
                    name: true,
                    dockNumber: true,
                    dockType: true,
                },
            },
        },
        orderBy: [
            { priority: 'desc' },
            { queuePosition: 'asc' },
            { createdAt: 'asc' },
        ],
    });

    return NextResponse.json(visits);
}
