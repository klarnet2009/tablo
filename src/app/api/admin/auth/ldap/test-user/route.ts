/**
 * LDAP Test User API
 * POST: Test user authentication with username and password
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { authenticateUser, mapGroupsToRole, GroupMappingRule } from '@/lib/ldap-service';

export const dynamic = 'force-dynamic';

// POST /api/admin/auth/ldap/test-user
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || session.user.role !== 'ADMIN') {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Admin access required' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json({
                success: false,
                error: 'Username and password are required',
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
            });
        }

        // Authenticate user
        const result = await authenticateUser(config, username, password);

        // If successful, calculate effective role
        let effectiveRole = config.groupAuthDefaultRole || 'SECURITY';
        let matchedRules: GroupMappingRule[] = [];

        if (result.success && result.groups && config.groupAuthEnabled) {
            const rules: GroupMappingRule[] = JSON.parse(config.groupMappingRules || '[]');
            matchedRules = rules.filter(rule =>
                result.groups!.some(g => g.toLowerCase() === rule.groupDn.toLowerCase())
            );
            effectiveRole = mapGroupsToRole(
                result.groups,
                rules,
                config.groupAuthMode as 'highest_role_wins' | 'merge_permissions',
                config.groupAuthDefaultRole || 'SECURITY'
            );
        }

        return NextResponse.json({
            success: result.success,
            user: result.user ? {
                dn: result.user.dn,
                displayName: result.user.displayName,
                mail: result.user.mail,
                sAMAccountName: result.user.sAMAccountName,
            } : undefined,
            groups: result.groups,
            matchedRules,
            effectiveRole,
            disabled: result.disabled,
            disabledReason: result.disabledReason,
            deniedByGroupList: result.deniedByGroupList,
            error: result.error,
            errorCode: result.errorCode,
        });
    } catch (error) {
        console.error('[LDAP Test User]', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Test failed',
            },
            { status: 500 }
        );
    }
}
