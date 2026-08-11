/**
 * LDAP Search Groups API
 * POST: Search for groups by name
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { searchGroups } from '@/lib/ldap-service';

export const dynamic = 'force-dynamic';

// POST /api/admin/auth/ldap/search-groups
export async function POST(request: NextRequest) {
    try {
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

        const body = await request.json();
        const { query, baseDn } = body;

        if (!query || query.length < 2) {
            return NextResponse.json({
                success: true,
                groups: [],
            });
        }

        // Get stored config
        const config = await prisma.ldapConfig.findUnique({
            where: { id: 'singleton' },
        });

        if (!config || !config.host || !config.bindDn || !config.bindPasswordEnc) {
            return NextResponse.json({
                success: false,
                error: 'LDAP configuration incomplete',
                groups: [],
            });
        }

        // Search for groups
        const result = await searchGroups(config, query, baseDn || config.baseDn);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[LDAP Search Groups]', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Search failed',
                groups: [],
            },
            { status: 500 }
        );
    }
}
