import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const updateVisitSchema = z.object({
    truckPlate: z.string().optional().transform(s => s?.toUpperCase().replace(/\s/g, '')),
    trailerPlate: z.string().optional().transform(s => s?.toUpperCase().replace(/\s/g, '')),
    carrier: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    loadType: z.enum(['INBOUND', 'OUTBOUND', 'MIXED']).optional(),
    orderRef: z.string().optional(),
    priority: z.enum(['NORMAL', 'HIGH', 'URGENT', 'SLA']).optional(),
    scheduledAt: z.string().optional(),
    notes: z.string().optional(),
});

export const dynamic = 'force-dynamic';

// GET /api/visits/[id] - Get single visit
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const visit = await prisma.truckVisit.findUnique({
        where: { id },
        include: {
            assignedDock: true,
            createdBy: {
                select: { id: true, displayName: true },
            },
        },
    });

    if (!visit) {
        return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
    }

    return NextResponse.json(visit);
}

// PATCH /api/visits/[id] - Update visit details
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await request.json();
        const data = updateVisitSchema.parse(body);

        // Check visit exists
        const existingVisit = await prisma.truckVisit.findUnique({
            where: { id },
        });

        if (!existingVisit) {
            return NextResponse.json({ error: 'Visit not found' }, { status: 404 });
        }

        // Build update data
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = { ...data };

        // Convert scheduledAt time string to Date if provided
        if (data.scheduledAt) {
            const today = new Date();
            const [hours, minutes] = data.scheduledAt.split(':');
            updateData.scheduledAt = new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(hours), parseInt(minutes));
        } else if (data.scheduledAt === '') {
            updateData.scheduledAt = null;
        }

        const updatedVisit = await prisma.truckVisit.update({
            where: { id },
            data: updateData,
            include: {
                assignedDock: true,
            },
        });

        return NextResponse.json(updatedVisit);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: (error as z.ZodError).errors }, { status: 400 });
        }
        console.error('Error updating visit:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
