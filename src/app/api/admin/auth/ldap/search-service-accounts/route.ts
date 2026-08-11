/**
 * Search Service Accounts API
 * Searches for user accounts in the directory that could be used as bind accounts.
 * This endpoint is designed for the user-friendly Bind DN picker.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Client } from 'ldapts';
import { escapeFilterValue } from '@/lib/ldap-filter';

export async function POST(request: NextRequest) {
    try {
        // Check authorization
        const session = await getServerSession(authOptions);
        if (!session || !['ADMIN', 'SUPERVISOR'].includes(session.user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { query, connectionConfig } = body;

        if (!query || query.length < 2) {
            return NextResponse.json({ success: true, users: [] });
        }

        if (!connectionConfig) {
            return NextResponse.json({
                success: false,
                error: 'Connection configuration required'
            }, { status: 400 });
        }

        const { host, port, connectionMode, baseDn, bindDn, bindPassword } = connectionConfig;
        // Honour the operator's TLS choice instead of blindly trusting any certificate.
        const tlsOptions = {
            rejectUnauthorized: connectionConfig.tlsRejectUnauthorized ?? true,
            ...(connectionConfig.tlsCaCert ? { ca: connectionConfig.tlsCaCert } : {}),
        };

        if (!host || !baseDn) {
            return NextResponse.json({
                success: false,
                error: 'Host and Base DN are required'
            }, { status: 400 });
        }

        // Create LDAP client
        const protocol = connectionMode === 'LDAPS' ? 'ldaps' : 'ldap';
        const url = `${protocol}://${host}:${port}`;

        const client = new Client({
            url,
            timeout: 5000,
            connectTimeout: 5000,
            tlsOptions: connectionMode !== 'LDAP' ? tlsOptions : undefined,
            strictDN: false,
        });

        try {
            // Perform STARTTLS upgrade if needed
            if (connectionMode === 'STARTTLS') {
                await client.startTLS(tlsOptions);
            }

            // If we have bind credentials, use them; otherwise try anonymous
            if (bindDn && bindPassword) {
                await client.bind(bindDn, bindPassword);
            }

            const escapedQuery = escapeFilterValue(query);

            // Search for users/service accounts matching the query
            // Look for user objects (including service accounts)
            const filter = `(&(|(objectClass=user)(objectClass=person)(objectClass=organizationalPerson))(|(cn=*${escapedQuery}*)(sAMAccountName=*${escapedQuery}*)(displayName=*${escapedQuery}*)(name=*${escapedQuery}*)))`;

            const result = await client.search(baseDn, {
                scope: 'sub',
                filter,
                attributes: ['dn', 'cn', 'displayName', 'sAMAccountName', 'userPrincipalName', 'name', 'description'],
                sizeLimit: 20,
                timeLimit: 10,
            });

            await client.unbind();

            const users = result.searchEntries.map(entry => ({
                dn: entry.dn,
                cn: (entry.cn || entry.name || '') as string,
                displayName: entry.displayName as string | undefined,
                sAMAccountName: entry.sAMAccountName as string | undefined,
                description: entry.description as string | undefined,
            }));

            // Sort by name
            users.sort((a, b) => (a.displayName || a.cn).localeCompare(b.displayName || b.cn));

            return NextResponse.json({ success: true, users });
        } catch (error) {
            await client.unbind().catch(() => { });
            const err = error as Error;
            console.error('[Search Service Accounts]', err.message);
            return NextResponse.json({
                success: false,
                error: 'Failed to search directory',
                details: err.message
            });
        }
    } catch (error) {
        const err = error as Error;
        console.error('[Search Service Accounts]', err.message);
        return NextResponse.json({
            success: false,
            error: 'Request failed'
        }, { status: 500 });
    }
}
