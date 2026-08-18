import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { sortVisitsForQueue } from '@/lib/queue-order';
import { createVisitSchema, parseTimeOfDay } from '@/lib/visit-schemas';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// GET /api/visits - List visits with optional filtering
export async function GET(request: NextRequest) {
    const guard = await requireRole();
    if (!guard.ok) return guard.response;

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
        if (Number.isNaN(startOfDay.getTime())) {
            // An unparseable date used to reach Prisma as an Invalid Date and come
            // back as a 500.
            return NextResponse.json({ error: 'Invalid date parameter' }, { status: 400 });
        }
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
    });

    return NextResponse.json(sortVisitsForQueue(visits));
}

// POST /api/visits - Create new visit
export async function POST(request: NextRequest) {
    const guard = await requireRole();
    if (!guard.ok) return guard.response;
    const session = guard.session;

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

        const scheduledAtDate = data.scheduledAt
            ? parseTimeOfDay(data.scheduledAt, new Date())
            : null;

        // Reading the last position and inserting must be one unit of work, or two
        // simultaneous registrations are handed the same queue position.
        const visit = await prisma.$transaction(async (tx) => {
            const lastInQueue = await tx.truckVisit.findFirst({
                where: {
                    status: { in: ['WAITING', 'ARRIVED'] },
                    queuePosition: { not: null },
                },
                orderBy: { queuePosition: 'desc' },
            });

            return tx.truckVisit.create({
                data: {
                    ...data,
                    scheduledAt: scheduledAtDate,
                    flags: data.flags ? JSON.stringify(data.flags) : null,
                    status: 'ARRIVED',
                    arrivedAt: new Date(),
                    queuePosition: (lastInQueue?.queuePosition ?? 0) + 1,
                    createdById: session.user.id,
                },
                include: {
                    assignedDock: true,
                },
            });
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
            // zod v4 exposes .issues; .errors does not exist, so this used to
            // answer {"error": undefined} and the client showed no reason at all.
            return NextResponse.json({ error: z.prettifyError(error), issues: error.issues }, { status: 400 });
        }
        console.error('Error creating visit:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
