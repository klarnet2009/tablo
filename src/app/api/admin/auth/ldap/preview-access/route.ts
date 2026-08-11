/**
 * LDAP Preview Access API
 * POST: Preview effective role for a user (without password verification)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { previewUserAccess } from '@/lib/ldap-service';

export const dynamic = 'force-dynamic';

// POST /api/admin/auth/ldap/preview-access
export async function POST(request: NextRequest) {
    try {
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

        const body = await request.json();
        const { username } = body;

        if (!username) {
            return NextResponse.json({
                found: false,
                error: 'Username is required',
            });
        }

        // Get stored config
        const config = await prisma.ldapConfig.findUnique({
            where: { id: 'singleton' },
        });

        if (!config || !config.host || !config.bindDn || !config.bindPasswordEnc) {
            return NextResponse.json({
                found: false,
                error: 'LDAP configuration incomplete',
            });
        }

        // Preview user access
        const result = await previewUserAccess(config, username);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[LDAP Preview Access]', error);
        return NextResponse.json(
            {
                found: false,
                error: 'Preview failed',
            },
            { status: 500 }
        );
    }
}
