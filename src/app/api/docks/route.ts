import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { z } from 'zod';

// Was unvalidated: a missing name or a string dockNumber reached Prisma and came
// back as a 500.
const createDockSchema = z.object({
    name: z.string().min(1),
    dockNumber: z.number().int().positive(),
    dockType: z.enum(['INBOUND', 'OUTBOUND', 'BOTH', 'SCALES']).default('BOTH'),
    hasReeferPower: z.boolean().default(false),
    hazmatOk: z.boolean().default(false),
    maxLength: z.number().positive().nullish(),
    dockHeight: z.number().positive().nullish(),
});

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
        const data = createDockSchema.parse(await request.json());

        const dock = await prisma.dock.create({
            data: { ...data, status: 'AVAILABLE' },
        });

        return NextResponse.json(dock, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: z.prettifyError(error), issues: error.issues }, { status: 400 });
        }
        console.error('Error creating dock:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
