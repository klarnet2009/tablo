import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const guard = await requireRole(['SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;

    const { id } = await params;

    try {
        const body = await request.json();

        const dock = await prisma.dock.update({
            where: { id },
            data: {
                name: body.name,
                dockType: body.dockType,
                hasReeferPower: body.hasReeferPower,
                hazmatOk: body.hazmatOk,
                maxLength: body.maxLength,
                dockHeight: body.dockHeight,
                status: body.status,
            },
        });

        return NextResponse.json(dock);
    } catch (error) {
        console.error('Error updating dock:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
