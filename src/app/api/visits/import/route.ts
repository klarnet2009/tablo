import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/visits/import
 * Import cargo schedule data as PLANNED TruckVisits
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { cargos } = body;

        if (!Array.isArray(cargos) || cargos.length === 0) {
            return NextResponse.json({ error: 'No cargo data provided' }, { status: 400 });
        }

        const createdVisits = [];
        const skippedVisits = [];

        for (const cargo of cargos) {
            // Check if a visit with this external reference already exists
            const existingVisit = await prisma.truckVisit.findFirst({
                where: {
                    orderRef: cargo.orderRef,
                    status: { notIn: ['LEFT', 'CANCELLED', 'NO_SHOW'] },
                },
            });

            if (existingVisit) {
                skippedVisits.push({
                    orderRef: cargo.orderRef,
                    reason: 'Already exists',
                });
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

        return NextResponse.json({
            success: true,
            imported: createdVisits.length,
            skipped: skippedVisits.length,
            skippedDetails: skippedVisits,
        });
    } catch (error) {
        console.error('Error importing cargo visits:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to import visits' },
            { status: 500 }
        );
    }
}
