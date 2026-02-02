/**
 * LDAP Test Connection API
 * POST: Test connection to LDAP server
 * 
 * Supports two modes:
 * - testMode: 'connectivity' - Just test TCP/TLS connection (no credentials needed)
 * - testMode: 'bind' - Full bind test (requires credentials)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { testConnection, testConnectivity } from '@/lib/ldap-service';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// POST /api/admin/auth/ldap/test-connection
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);

        if (!session || !['ADMIN', 'SUPERVISOR'].includes(session.user.role)) {
            return NextResponse.json(
                { error: 'Unauthorized', message: 'Admin access required' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const testMode = body.testMode || 'bind'; // 'connectivity' or 'bind'

        // Get stored config for password if not provided
        let config: {
            host?: string;
            port?: number;
            connectionMode?: string;
            tlsRejectUnauthorized?: boolean;
            tlsCaCert?: string | null;
            connectTimeout?: number;
            bindDn?: string;
            bindPasswordEnc?: string;
            baseDn?: string;
        } | null = null;

        try {
            config = await prisma.ldapConfig.findUnique({
                where: { id: 'singleton' },
            });
        } catch {
            // Prisma might not have ldapConfig model yet, continue without stored config
        }

        // Build test config from request or stored values
        const testConfig = {
            host: body.host ?? config?.host ?? '',
            port: body.port ?? config?.port ?? 389,
            connectionMode: body.connectionMode ?? config?.connectionMode ?? 'LDAP',
            tlsRejectUnauthorized: body.tlsRejectUnauthorized ?? config?.tlsRejectUnauthorized ?? true,
            tlsCaCert: body.tlsCaCert ?? config?.tlsCaCert ?? null,
            connectTimeout: body.connectTimeout ?? config?.connectTimeout ?? 5000,
            bindDn: body.bindDn ?? config?.bindDn ?? '',
            bindPasswordEnc: body.bindPassword
                ? encrypt(body.bindPassword)
                : config?.bindPasswordEnc ?? '',
            baseDn: body.baseDn ?? config?.baseDn ?? '',
        };

        // Validate required fields
        if (!testConfig.host) {
            return NextResponse.json({
                success: false,
                message: 'Host is required',
            });
        }

        // Connectivity-only mode (Step 1) - just test TCP/TLS connection
        if (testMode === 'connectivity') {
            const result = await testConnectivity(testConfig);
            return NextResponse.json(result);
        }

        // Bind mode (Step 2) - full bind test with credentials
        if (!testConfig.bindDn || !testConfig.bindPasswordEnc) {
            return NextResponse.json({
                success: false,
                message: 'Bind DN and password are required',
            });
        }

        // Test the connection with bind
        const result = await testConnection(testConfig);

        return NextResponse.json(result);
    } catch (error) {
        console.error('[LDAP Test Connection]', error);
        return NextResponse.json(
            {
                success: false,
                message: 'Connection test failed',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

