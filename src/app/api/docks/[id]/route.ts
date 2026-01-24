import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!['SUPERVISOR', 'ADMIN'].includes(session.user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
