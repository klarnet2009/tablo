/**
 * LDAP Browse Directory API
 * POST: Browse directory tree from given DN
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { browseDirectory, detectBaseDN } from '@/lib/ldap-service';
import { requireRole } from '@/lib/api-auth';
import { encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// Simple in-memory cache for directory browsing
const browseCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60000; // 60 seconds

function getCached(key: string): unknown | null {
    const cached = browseCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    browseCache.delete(key);
    return null;
}

function setCache(key: string, data: unknown): void {
    // Clean old entries
    if (browseCache.size > 100) {
        const now = Date.now();
        for (const [k, v] of browseCache.entries()) {
            if (now - v.timestamp > CACHE_TTL) {
                browseCache.delete(k);
            }
        }
    }
    browseCache.set(key, { data, timestamp: Date.now() });
}

// POST /api/admin/auth/ldap/browse
export async function POST(request: NextRequest) {
    try {
        // ADMIN only: accepts an inline connectionConfig, i.e. it makes the server
        // open a connection to a caller-supplied host. The LDAP wizard that calls
        // this is already reachable by admins only.
        const guard = await requireRole(['ADMIN']);
        if (!guard.ok) return guard.response;

        const body = await request.json();
        const { dn, detectBase, connectionConfig } = body;

        // Determine config source: inline connectionConfig (for wizard) or stored config
        let config: {
            host: string;
            port: number;
            connectionMode: string;
            tlsRejectUnauthorized: boolean;
            tlsCaCert: string | null;
            connectTimeout: number;
            searchTimeout: number;
            bindDn: string;
            bindPasswordEnc: string;
            baseDn: string;
        };

        if (connectionConfig) {
            // Use inline config from request (wizard mode before saving)
            if (!connectionConfig.host || !connectionConfig.bindDn || !connectionConfig.bindPassword) {
                return NextResponse.json({
                    success: false,
                    error: 'Host, Bind DN, and password are required',
                });
            }

            config = {
                host: connectionConfig.host,
                port: connectionConfig.port || 389,
                connectionMode: connectionConfig.connectionMode || 'LDAP',
                tlsRejectUnauthorized: connectionConfig.tlsRejectUnauthorized ?? true,
                tlsCaCert: connectionConfig.tlsCaCert || null,
                connectTimeout: connectionConfig.connectTimeout || 5000,
                searchTimeout: connectionConfig.searchTimeout || 10000,
                bindDn: connectionConfig.bindDn,
                bindPasswordEnc: encrypt(connectionConfig.bindPassword),
                baseDn: connectionConfig.baseDn || '',
            };
        } else {
            // Get stored config from database
            const storedConfig = await prisma.ldapConfig.findUnique({
                where: { id: 'singleton' },
            });

            if (!storedConfig || !storedConfig.host || !storedConfig.bindDn || !storedConfig.bindPasswordEnc) {
                return NextResponse.json({
                    success: false,
                    error: 'LDAP configuration incomplete. Please complete Step 1 and 2 first.',
                });
            }

            config = storedConfig;
        }

        // If detectBase is true, detect base DN from RootDSE
        if (detectBase) {
            const cacheKey = `detect:${config.host}`;
            const cached = getCached(cacheKey);
            if (cached) {
                return NextResponse.json(cached);
            }

            const result = await detectBaseDN(config);
            if (result.success) {
                setCache(cacheKey, result);
            }
            return NextResponse.json(result);
        }

        // Browse directory
        const searchDn = dn || config.baseDn;

        if (!searchDn) {
            return NextResponse.json({
                success: false,
                error: 'Base DN not configured',
            });
        }

        // Check cache
        const cacheKey = `browse:${config.host}:${searchDn}`;
        const cached = getCached(cacheKey);
        if (cached) {
            return NextResponse.json(cached);
        }

        const result = await browseDirectory(config, searchDn);

        if (result.success) {
            setCache(cacheKey, result);
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error('[LDAP Browse]', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Browse failed',
                entries: [],
            },
            { status: 500 }
        );
    }
}

