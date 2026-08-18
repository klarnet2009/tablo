/**
 * LDAP Test Connection API
 * POST: Test connection to LDAP server
 * 
 * Supports two modes:
 * - testMode: 'connectivity' - Just test TCP/TLS connection (no credentials needed)
 * - testMode: 'bind' - Full bind test (requires credentials)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { testConnection, testConnectivity } from '@/lib/ldap-service';
import { resolveBindPasswordSource } from '@/lib/ldap-auth-policy';
import { requireRole } from '@/lib/api-auth';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// POST /api/admin/auth/ldap/test-connection
export async function POST(request: NextRequest) {
    try {
        // ADMIN only: this endpoint can make the server bind to an operator-supplied
        // host with the stored directory credentials.
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

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
            bindPasswordEnc: '',
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
        if (!testConfig.bindDn) {
            return NextResponse.json({
                success: false,
                message: 'Bind DN and password are required',
            });
        }

        // The stored password may only be replayed against the stored target.
        const passwordSource = resolveBindPasswordSource(
            {
                host: testConfig.host,
                port: testConfig.port,
                bindDn: testConfig.bindDn,
                bindPassword: body.bindPassword,
            },
            config
                ? {
                    host: config.host ?? '',
                    port: config.port ?? 389,
                    bindDn: config.bindDn ?? '',
                    hasStoredPassword: !!config.bindPasswordEnc,
                }
                : null
        );

        if ('error' in passwordSource) {
            return NextResponse.json({ success: false, message: passwordSource.error });
        }

        testConfig.bindPasswordEnc =
            passwordSource.source === 'request'
                ? encrypt(body.bindPassword)
                : config?.bindPasswordEnc ?? '';

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

