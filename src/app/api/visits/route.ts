import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { z } from 'zod';

// Validation schema for creating a visit
const createVisitSchema = z.object({
    truckPlate: z.string().min(1).transform(s => s.toUpperCase().replace(/\s/g, '')),
    trailerPlate: z.string().optional().transform(s => s?.toUpperCase().replace(/\s/g, '')),
    carrier: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    loadType: z.enum(['INBOUND', 'OUTBOUND', 'MIXED']).default('INBOUND'),
    orderRef: z.string().optional(),
    priority: z.enum(['NORMAL', 'HIGH', 'URGENT', 'SLA']).default('NORMAL'),
    scheduledAt: z.string().optional(),
    notes: z.string().optional(),
    flags: z.array(z.string()).optional(),
});

export const dynamic = 'force-dynamic';

// GET /api/visits - List visits with optional filtering
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const date = searchParams.get('date');
    const dockId = searchParams.get('dockId');
    const active = searchParams.get('active');

    const where: Record<string, unknown> = {};

    if (status) {
        where.status = status;
    }

    if (active === 'true') {
        where.status = {
            in: ['PLANNED', 'NEW', 'ARRIVED', 'WAITING', 'CALLED', 'DOCKED', 'IN_SERVICE', 'HOLD'],
        };
    }

    if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt = {
            gte: startOfDay,
            lte: endOfDay,
        };
    }

    if (dockId) {
        where.assignedDockId = dockId;
    }

    const visits = await prisma.truckVisit.findMany({
        where,
        include: {
            assignedDock: true,
            createdBy: {
                select: { id: true, displayName: true },
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

// POST /api/visits - Create new visit
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const data = createVisitSchema.parse(body);

        // Check for duplicate active visit with same plate
        const existingActive = await prisma.truckVisit.findFirst({
            where: {
                truckPlate: data.truckPlate,
                status: {
                    in: ['PLANNED', 'NEW', 'ARRIVED', 'WAITING', 'CALLED', 'DOCKED', 'IN_SERVICE', 'HOLD'],
                },
            },
        });

        if (existingActive) {
            return NextResponse.json(
                { error: 'Active visit already exists for this truck plate' },
                { status: 400 }
            );
        }

        // Get next queue position
        const lastInQueue = await prisma.truckVisit.findFirst({
            where: {
                status: { in: ['WAITING', 'ARRIVED'] },
                queuePosition: { not: null },
            },
            orderBy: { queuePosition: 'desc' },
        });
        const nextPosition = (lastInQueue?.queuePosition || 0) + 1;

        // Convert scheduledAt time string to Date if provided
        let scheduledAtDate: Date | null = null;
        if (data.scheduledAt) {
            const today = new Date();
            const [hours, minutes] = data.scheduledAt.split(':');
            scheduledAtDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(hours), parseInt(minutes));
        }

        const visit = await prisma.truckVisit.create({
            data: {
                ...data,
                scheduledAt: scheduledAtDate,
                flags: data.flags ? JSON.stringify(data.flags) : null,
                status: 'ARRIVED',
                arrivedAt: new Date(),
                queuePosition: nextPosition,
                createdById: session.user.id,
            },
            include: {
                assignedDock: true,
            },
        });

        await createAuditLog({
            action: AuditActions.VISIT_CREATED,
            entityType: 'TruckVisit',
            entityId: visit.id,
            userId: session.user.id,
            visitId: visit.id,
            afterState: visit,
        });

        return NextResponse.json(visit, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: (error as any).errors }, { status: 400 });
        }
        console.error('Error creating visit:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
