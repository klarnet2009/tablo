import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

// GET /api/docks - List all docks
export async function GET() {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['SUPERVISOR', 'ADMIN'].includes(session.user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
