import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';

// GET /api/docks - List all docks
export async function GET() {
    const guard = await requireRole();
    if (!guard.ok) return guard.response;

    const docks = await prisma.dock.findMany({
        orderBy: { dockNumber: 'asc' },
        include: {
            visits: {
                where: {
                    status: { in: ['CALLED', 'DOCKED', 'IN_SERVICE'] },
                },
                take: 1,
                orderBy: { calledAt: 'desc' },
            },
        },
    });

    // Transform to include current visit info
    const docksWithCurrent = docks.map(dock => ({
        ...dock,
        currentVisit: dock.visits[0] || null,
        visits: undefined, // Remove the visits array
    }));

    return NextResponse.json(docksWithCurrent);
}

// POST /api/docks - Create new dock (SUPERVISOR+)
export async function POST(request: NextRequest) {
    const guard = await requireRole(['SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;

    try {
        const body = await request.json();

        const dock = await prisma.dock.create({
            data: {
                name: body.name,
                dockNumber: body.dockNumber,
                dockType: body.dockType || 'BOTH',
                hasReeferPower: body.hasReeferPower || false,
                hazmatOk: body.hazmatOk || false,
                maxLength: body.maxLength,
                dockHeight: body.dockHeight,
                status: 'AVAILABLE',
            },
        });

        return NextResponse.json(dock, { status: 201 });
    } catch (error) {
        console.error('Error creating dock:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
