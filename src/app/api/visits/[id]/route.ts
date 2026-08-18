import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';
import { updateVisitSchema, parseTimeOfDay } from '@/lib/visit-schemas';
import { z } from 'zod';

// Editing visit details (priority, plates, carrier, schedule) is dispatcher work;
// see the transition table in lib/status-machine.ts for the same split.
const CAN_EDIT_VISIT = ['DISPATCHER', 'SUPERVISOR', 'ADMIN'] as const;

export const dynamic = 'force-dynamic';

// GET /api/visits/[id] - Get single visit
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireRole();
    if (!guard.ok) return guard.response;

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
    const guard = await requireRole(CAN_EDIT_VISIT);
    if (!guard.ok) return guard.response;

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = { ...data };

        // '' clears the appointment; anything else is a validated HH:MM.
        if (data.scheduledAt !== undefined) {
            updateData.scheduledAt = parseTimeOfDay(data.scheduledAt, new Date());
        }

        const updatedVisit = await prisma.truckVisit.update({
            where: { id },
            data: updateData,
            include: {
                assignedDock: true,
            },
        });

        // Edits used to leave no trace at all in the audit log.
        await createAuditLog({
            action: AuditActions.VISIT_UPDATED,
            entityType: 'TruckVisit',
            entityId: id,
            userId: guard.session.user.id,
            visitId: id,
            beforeState: existingVisit,
            afterState: updatedVisit,
        });

        return NextResponse.json(updatedVisit);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: z.prettifyError(error), issues: error.issues }, { status: 400 });
        }
        console.error('Error updating visit:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
