/**
 * LDAP Configuration API
 * GET: Retrieve current config (masked password)
 * PUT: Update config (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/api-auth';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// GET /api/admin/auth/ldap/config
export async function GET() {
    try {
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

        // Get or create config singleton
        let config = await prisma.ldapConfig.findUnique({
            where: { id: 'singleton' },
        });

        if (!config) {
            config = await prisma.ldapConfig.create({
                data: { id: 'singleton' },
            });
        }

        // Mask the password
        const masked = {
            ...config,
            bindPasswordEnc: config.bindPasswordEnc ? '••••••••' : '',
            hasPassword: !!config.bindPasswordEnc,
        };

        return NextResponse.json(masked);
    } catch (error) {
        console.error('[LDAP Config GET]', error);
        return NextResponse.json(
            { error: 'Internal error', message: 'Failed to load LDAP configuration' },
            { status: 500 }
        );
    }
}

// PUT /api/admin/auth/ldap/config
export async function PUT(request: NextRequest) {
    try {
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

        const body = await request.json();

        // Prepare update data
        const updateData: Record<string, unknown> = {
            updatedById: guard.session.user.id,
        };

        // Map allowed fields
        const allowedFields = [
            'enabled',
            'host',
            'port',
            'connectionMode',
            'tlsRejectUnauthorized',
            'tlsCaCert',
            'baseDn',
            'bindDn',
            'userSearchFilter',
            'userAttributes',
            'selectedOUs',
            'groupAuthEnabled',
            'groupAuthMode',
            'groupAuthDefaultRole',
            'groupMappingRules',
            'groupAllowList',
            'groupDenyList',
            'connectTimeout',
            'searchTimeout',
            'disableLocalFallback',
        ];

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updateData[field] = body[field];
            }
        }

        // Handle password - only update if provided and not masked placeholder
        if (body.bindPassword && body.bindPassword !== '••••••••') {
            updateData.bindPasswordEnc = encrypt(body.bindPassword);
        }

        // Validate JSON fields
        const jsonFields = ['selectedOUs', 'groupMappingRules', 'groupAllowList', 'groupDenyList'];
        for (const field of jsonFields) {
            if (updateData[field] !== undefined) {
                try {
                    // Ensure it's valid JSON and store as string
                    if (typeof updateData[field] === 'object') {
                        updateData[field] = JSON.stringify(updateData[field]);
                    } else {
                        JSON.parse(updateData[field] as string);
                    }
                } catch {
                    return NextResponse.json(
                        { error: 'Validation error', message: `Invalid JSON for ${field}` },
                        { status: 400 }
                    );
                }
            }
        }

        // Upsert the config
        const config = await prisma.ldapConfig.upsert({
            where: { id: 'singleton' },
            create: { id: 'singleton', ...updateData },
            update: updateData,
        });

        // Return masked config
        const masked = {
            ...config,
            bindPasswordEnc: config.bindPasswordEnc ? '••••••••' : '',
            hasPassword: !!config.bindPasswordEnc,
        };

        return NextResponse.json(masked);
    } catch (error) {
        console.error('[LDAP Config PUT]', error);
        return NextResponse.json(
            { error: 'Internal error', message: 'Failed to save LDAP configuration' },
            { status: 500 }
        );
    }
}
