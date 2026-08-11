import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { createAuditLog, AuditActions } from '@/lib/audit';

/**
 * POST /api/visits/import
 * Import cargo schedule data as PLANNED TruckVisits
 */
export async function POST(request: NextRequest) {
    try {
        const guard = await requireRole(['DISPATCHER', 'SUPERVISOR', 'ADMIN']);
        if (!guard.ok) return guard.response;
        const session = guard.session;

        const body = await request.json();
        const { cargos } = body;

        if (!Array.isArray(cargos) || cargos.length === 0) {
            return NextResponse.json({ error: 'No cargo data provided' }, { status: 400 });
        }

        const createdVisits = [];
        const updatedVisits = [];

        for (const cargo of cargos) {
            // Check if a visit with this external reference already exists (active visit)
            const existingVisit = await prisma.truckVisit.findFirst({
                where: {
                    orderRef: cargo.orderRef,
                    status: { notIn: ['LEFT', 'CANCELLED', 'NO_SHOW'] },
                },
            });

            if (existingVisit) {
                // Update existing visit but preserve status
                const updated = await prisma.truckVisit.update({
                    where: { id: existingVisit.id },
                    data: {
                        truckPlate: cargo.truckPlate || existingVisit.truckPlate,
                        trailerPlate: cargo.trailerPlate ?? existingVisit.trailerPlate,
                        carrier: cargo.carrier ?? existingVisit.carrier,
                        loadType: cargo.loadType === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
                        scheduledAt: cargo.scheduledAt ? new Date(cargo.scheduledAt) : existingVisit.scheduledAt,
                        notes: cargo.notes || cargo.externalTitle || existingVisit.notes,
                        // Status is NOT updated - preserve current status
                    },
                });
                updatedVisits.push(updated);
                continue;
            }

            // Create a new PLANNED visit
            const visit = await prisma.truckVisit.create({
                data: {
                    truckPlate: cargo.truckPlate || 'UNKNOWN',
                    trailerPlate: cargo.trailerPlate || null,
                    carrier: cargo.carrier || null,
                    orderRef: cargo.orderRef,
                    loadType: cargo.loadType === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND',
                    status: 'PLANNED',
                    priority: 'NORMAL',
                    scheduledAt: cargo.scheduledAt ? new Date(cargo.scheduledAt) : null,
                    notes: cargo.notes || cargo.externalTitle || null,
                    createdById: session.user.id,
                },
            });

            createdVisits.push(visit);
        }

        await createAuditLog({
            action: AuditActions.VISIT_CREATED,
            entityType: 'TruckVisit',
            entityId: 'cargo-import',
            userId: session.user.id,
            metadata: {
                imported: createdVisits.map(v => ({ id: v.id, orderRef: v.orderRef })),
                updated: updatedVisits.map(v => ({ id: v.id, orderRef: v.orderRef })),
            },
        });

        return NextResponse.json({
            success: true,
            imported: createdVisits.length,
            updated: updatedVisits.length,
        });
    } catch (error) {
        console.error('Error importing cargo visits:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to import visits' },
            { status: 500 }
        );
    }
}
