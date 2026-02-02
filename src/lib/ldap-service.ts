/**
 * LDAP Service Module
 * Handles all LDAP operations including authentication, directory browsing,
 * group membership, and AD-specific features like disabled user detection.
 */

import { Client, SearchOptions } from 'ldapts';
import { decrypt } from './crypto';

// Local interface to avoid Prisma type generation dependency
// This matches the LdapConfig model in prisma/schema.prisma
export interface LdapConfig {
    id: string;
    enabled: boolean;
    host: string;
    port: number;
    connectionMode: string;
    tlsRejectUnauthorized: boolean;
    tlsCaCert: string | null;
    baseDn: string;
    bindDn: string;
    bindPasswordEnc: string;
    userSearchFilter: string;
    userAttributes: string;
    selectedOUs: string;
    groupAuthEnabled: boolean;
    groupAuthMode: string;
    groupAuthDefaultRole: string;
    groupMappingRules: string;
    groupAllowList: string;
    groupDenyList: string;
    connectTimeout: number;
    searchTimeout: number;
    disableLocalFallback: boolean;
    updatedAt: Date;
    updatedById: string | null;
}

// ============================================
// TYPES
// ============================================

export type ConnectionMode = 'LDAP' | 'LDAPS' | 'STARTTLS';

export interface ConnectionResult {
    success: boolean;
    message: string;
    details?: string;
    serverInfo?: {
        vendorName?: string;
        vendorVersion?: string;
        namingContexts?: string[];
    };
    accountInfo?: {
        dn: string;
        cn?: string;
        displayName?: string;
        sAMAccountName?: string;
        userPrincipalName?: string;
    };
}

export interface LdapUser {
    dn: string;
    cn: string;
    displayName: string;
    mail?: string;
    sAMAccountName?: string;
    userPrincipalName?: string;
    uid?: string;
    memberOf: string[];
    userAccountControl?: number;
    accountExpires?: string;
}

export interface AuthResult {
    success: boolean;
    user?: LdapUser;
    groups?: string[];
    error?: string;
    errorCode?: LdapErrorCode;
    disabled?: boolean;
    disabledReason?: 'account_disabled' | 'account_expired' | 'account_locked';
    deniedByGroupList?: boolean;
}

export interface DirectoryEntry {
    dn: string;
    name: string;
    type: 'ou' | 'container' | 'domain' | 'other';
    hasChildren: boolean;
}

export interface LdapGroup {
    cn: string;
    dn: string;
    displayName?: string;
    description?: string;
}

export interface GroupMappingRule {
    groupDn: string;
    role: string;
    priority?: number;
}

export interface AccessPreview {
    found: boolean;
    user?: {
        dn: string;
        displayName: string;
        mail?: string;
    };
    groups: string[];
    matchedRules: GroupMappingRule[];
    effectiveRole: string;
    disabled?: boolean;
    disabledReason?: string;
    deniedByGroupList?: boolean;
    allowedByGroupList?: boolean;
}

export type LdapErrorCode =
    | 'LDAP_UNREACHABLE'
    | 'TLS_HANDSHAKE_FAILED'
    | 'BIND_FAILED'
    | 'BASE_DN_INVALID'
    | 'USER_NOT_FOUND'
    | 'MULTIPLE_USERS'
    | 'INVALID_CREDENTIALS'
    | 'ACCOUNT_DISABLED'
    | 'ACCOUNT_EXPIRED'
    | 'ACCOUNT_LOCKED'
    | 'ACCESS_DENIED'
    | 'SEARCH_ERROR'
    | 'UNKNOWN_ERROR';

// ============================================
// ROLE HIERARCHY (match existing RBAC)
// ============================================

const roleHierarchy: Record<string, number> = {
    SECURITY: 1,
    DISPATCHER: 2,
    SUPERVISOR: 3,
    ADMIN: 4,
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Build LDAP URL from config
 */
function buildLdapUrl(config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode'>): string {
    const protocol = config.connectionMode === 'LDAPS' ? 'ldaps' : 'ldap';
    return `${protocol}://${config.host}:${config.port}`;
}

/**
 * Create LDAP client with proper TLS settings
 */
function createClient(config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode' | 'tlsRejectUnauthorized' | 'tlsCaCert' | 'connectTimeout'>): Client {
    const url = buildLdapUrl(config);

    const tlsOptions: Record<string, unknown> = {
        rejectUnauthorized: config.tlsRejectUnauthorized,
    };

    if (config.tlsCaCert) {
        tlsOptions.ca = config.tlsCaCert;
    }

    return new Client({
        url,
        timeout: config.connectTimeout || 5000,
        connectTimeout: config.connectTimeout || 5000,
        tlsOptions: config.connectionMode !== 'LDAP' ? tlsOptions : undefined,
        strictDN: false,
    });
}

/**
 * Parse LDAP error into friendly error code
 */
function parseLdapError(error: unknown): { code: LdapErrorCode; message: string; details: string } {
    const err = error as Error & { code?: string; errno?: string };
    const msg = err.message || String(error);
    const details = msg;

    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND')) {
        return { code: 'LDAP_UNREACHABLE', message: 'Cannot reach LDAP server', details };
    }
    if (msg.includes('certificate') || msg.includes('TLS') || msg.includes('SSL') || msg.includes('DEPTH_ZERO_SELF_SIGNED')) {
        return { code: 'TLS_HANDSHAKE_FAILED', message: 'TLS handshake failed', details };
    }
    if (msg.includes('Invalid Credentials') || msg.includes('invalidCredentials') || err.code === '49') {
        return { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials', details };
    }
    if (msg.includes('No Such Object') || msg.includes('noSuchObject')) {
        return { code: 'BASE_DN_INVALID', message: 'Base DN not found', details };
    }

    return { code: 'UNKNOWN_ERROR', message: 'LDAP operation failed', details };
}

/**
 * Check if AD account is disabled using userAccountControl
 */
export function checkAccountStatus(entry: Record<string, unknown>): {
    disabled: boolean;
    reason?: 'account_disabled' | 'account_expired' | 'account_locked';
} {
    // Check userAccountControl flag (AD specific)
    const uac = entry.userAccountControl;
    if (uac !== undefined) {
        const uacValue = typeof uac === 'string' ? parseInt(uac, 10) : Number(uac);
        if (!isNaN(uacValue)) {
            // Flag 0x2 = ACCOUNTDISABLE
            if (uacValue & 0x2) {
                return { disabled: true, reason: 'account_disabled' };
            }
            // Flag 0x10 = LOCKOUT (optional check)
            if (uacValue & 0x10) {
                return { disabled: true, reason: 'account_locked' };
            }
        }
    }

    // Check accountExpires (AD specific)
    const expires = entry.accountExpires;
    if (expires && expires !== '0' && expires !== '9223372036854775807') {
        try {
            // AD uses 100-nanosecond intervals since January 1, 1601
            // Using BigInt() calls instead of literals for ES2019 compatibility
            const expiryBigInt = BigInt(String(expires));
            const divisor = BigInt(10000);
            const offset = BigInt('11644473600000');
            const expiryMs = Number(expiryBigInt / divisor - offset);
            const expiryDate = new Date(expiryMs);

            if (expiryDate < new Date()) {
                return { disabled: true, reason: 'account_expired' };
            }
        } catch {
            // Ignore parsing errors
        }
    }

    return { disabled: false };
}

/**
 * Extract CN from a DN string
 */
function extractCN(dn: string): string {
    const match = dn.match(/^CN=([^,]+)/i) || dn.match(/^OU=([^,]+)/i);
    return match ? match[1] : dn;
}

/**
 * Determine entry type from objectClass
 */
function getEntryType(objectClass: string | string[]): DirectoryEntry['type'] {
    const classes = Array.isArray(objectClass) ? objectClass : [objectClass];
    const classLower = classes.map(c => c.toLowerCase());

    if (classLower.includes('organizationalunit')) return 'ou';
    if (classLower.includes('container')) return 'container';
    if (classLower.includes('domain') || classLower.includes('domaindns')) return 'domain';
    return 'other';
}

// ============================================
// MAIN SERVICE FUNCTIONS
// ============================================

/**
 * Test LDAP connection
 */
export async function testConnection(
    config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode' | 'tlsRejectUnauthorized' | 'tlsCaCert' | 'connectTimeout' | 'bindDn' | 'bindPasswordEnc' | 'baseDn'>
): Promise<ConnectionResult> {
    const client = createClient(config);

    try {
        // Perform STARTTLS upgrade if needed
        if (config.connectionMode === 'STARTTLS') {
            await client.startTLS({
                rejectUnauthorized: config.tlsRejectUnauthorized,
                ca: config.tlsCaCert || undefined,
            });
        }

        // Try to bind with service account
        const bindPassword = decrypt(config.bindPasswordEnc);

        // Check if decryption failed (returns empty string on error)
        if (!bindPassword && config.bindPasswordEnc) {
            console.error('[LDAP] Failed to decrypt bind password - encryption key may have changed');
            return {
                success: false,
                message: 'Failed to decrypt service account password. The encryption key may have changed. Please re-enter the password in LDAP settings.',
            };
        }

        console.log('[LDAP] Attempting bind to:', config.host, 'as:', config.bindDn);
        await client.bind(config.bindDn, bindPassword);

        // Try to read RootDSE for server info
        let serverInfo: ConnectionResult['serverInfo'] = undefined;
        try {
            const rootDSE = await client.search('', {
                scope: 'base',
                filter: '(objectClass=*)',
                attributes: ['vendorName', 'vendorVersion', 'namingContexts', 'defaultNamingContext'],
            });

            if (rootDSE.searchEntries.length > 0) {
                const entry = rootDSE.searchEntries[0];
                serverInfo = {
                    vendorName: entry.vendorName as string | undefined,
                    vendorVersion: entry.vendorVersion as string | undefined,
                    namingContexts: (entry.namingContexts || entry.defaultNamingContext) as string[] | undefined,
                };
            }
        } catch {
            // RootDSE might not be accessible
        }

        // Try to get account info for the bound user
        let accountInfo: ConnectionResult['accountInfo'] = undefined;
        try {
            // Search for the account by DN
            const accountSearch = await client.search(config.bindDn, {
                scope: 'base',
                filter: '(objectClass=*)',
                attributes: ['cn', 'displayName', 'sAMAccountName', 'userPrincipalName', 'name'],
                sizeLimit: 1,
            });

            if (accountSearch.searchEntries.length > 0) {
                const entry = accountSearch.searchEntries[0];
                accountInfo = {
                    dn: config.bindDn,
                    cn: (entry.cn || entry.name) as string | undefined,
                    displayName: entry.displayName as string | undefined,
                    sAMAccountName: entry.sAMAccountName as string | undefined,
                    userPrincipalName: entry.userPrincipalName as string | undefined,
                };
            }
        } catch {
            // Account info might not be accessible (e.g., for non-DN bind formats)
            // Still consider the bind successful
            accountInfo = {
                dn: config.bindDn,
            };
        }

        // Verify base DN exists
        if (config.baseDn) {
            try {
                await client.search(config.baseDn, {
                    scope: 'base',
                    filter: '(objectClass=*)',
                    attributes: ['dn'],
                    sizeLimit: 1,
                });
            } catch (err) {
                await client.unbind();
                const parsed = parseLdapError(err);
                return {
                    success: false,
                    message: 'Base DN not found in directory',
                    details: parsed.details,
                };
            }
        }

        await client.unbind();

        return {
            success: true,
            message: 'Connection successful',
            serverInfo,
            accountInfo,
        };
    } catch (error) {
        const parsed = parseLdapError(error);
        return {
            success: false,
            message: parsed.message,
            details: parsed.details,
        };
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore unbind errors
        }
    }
}

/**
 * Test LDAP connectivity only (without bind)
 * This just verifies we can reach the server on the specified port with proper TLS
 */
export async function testConnectivity(
    config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode' | 'tlsRejectUnauthorized' | 'tlsCaCert' | 'connectTimeout'>
): Promise<ConnectionResult> {
    const client = createClient(config);

    try {
        // For LDAPS or STARTTLS, the TLS handshake happens automatically
        // For plain LDAP, we need to try an anonymous bind or just connect
        if (config.connectionMode === 'STARTTLS') {
            await client.startTLS({
                rejectUnauthorized: config.tlsRejectUnauthorized,
                ca: config.tlsCaCert || undefined,
            });
        }

        // Try anonymous bind - this just tests connectivity
        // If server doesn't allow anonymous, we'll get auth error but that proves connectivity
        try {
            await client.bind('', '');
        } catch (bindErr) {
            const bindError = bindErr as Error;
            // If it's just an auth error, that's fine - we proved connectivity
            if (!bindError.message.includes('ECONNREFUSED') &&
                !bindError.message.includes('ETIMEDOUT') &&
                !bindError.message.includes('ENOTFOUND') &&
                !bindError.message.includes('certificate') &&
                !bindError.message.includes('TLS') &&
                !bindError.message.includes('SSL')) {
                // Connection worked but auth failed - that's expected
                return {
                    success: true,
                    message: 'Server is reachable' + (config.connectionMode !== 'LDAP' ? ' (TLS OK)' : ''),
                };
            }
            throw bindErr;
        }

        await client.unbind();

        return {
            success: true,
            message: 'Server is reachable' + (config.connectionMode !== 'LDAP' ? ' (TLS OK)' : ''),
        };
    } catch (error) {
        const parsed = parseLdapError(error);
        return {
            success: false,
            message: parsed.message,
            details: parsed.details,
        };
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore unbind errors
        }
    }
}

/**
 * Browse directory tree
 */
export async function browseDirectory(
    config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode' | 'tlsRejectUnauthorized' | 'tlsCaCert' | 'connectTimeout' | 'bindDn' | 'bindPasswordEnc' | 'baseDn' | 'searchTimeout'>,
    startDn?: string
): Promise<{ success: boolean; entries: DirectoryEntry[]; error?: string }> {
    const client = createClient(config);
    const searchBase = startDn || config.baseDn;

    try {
        if (config.connectionMode === 'STARTTLS') {
            await client.startTLS({
                rejectUnauthorized: config.tlsRejectUnauthorized,
                ca: config.tlsCaCert || undefined,
            });
        }

        const bindPassword = decrypt(config.bindPasswordEnc);
        await client.bind(config.bindDn, bindPassword);

        // Search for OUs and containers at one level
        const searchOptions: SearchOptions = {
            scope: 'one',
            filter: '(|(objectClass=organizationalUnit)(objectClass=container)(objectClass=domain))',
            attributes: ['dn', 'name', 'ou', 'cn', 'objectClass'],
            sizeLimit: 500,
            timeLimit: (config.searchTimeout || 10000) / 1000,
        };

        const result = await client.search(searchBase, searchOptions);

        const entries: DirectoryEntry[] = [];

        for (const entry of result.searchEntries) {
            const dn = entry.dn;
            const name = (entry.name || entry.ou || entry.cn || extractCN(dn)) as string;
            const objectClass = entry.objectClass as string | string[];

            // Check if has children
            let hasChildren = false;
            try {
                const childCheck = await client.search(dn, {
                    scope: 'one',
                    filter: '(|(objectClass=organizationalUnit)(objectClass=container))',
                    attributes: ['dn'],
                    sizeLimit: 1,
                });
                hasChildren = childCheck.searchEntries.length > 0;
            } catch {
                // Assume no children on error
            }

            entries.push({
                dn,
                name,
                type: getEntryType(objectClass),
                hasChildren,
            });
        }

        // Sort alphabetically by name
        entries.sort((a, b) => a.name.localeCompare(b.name));

        await client.unbind();

        return { success: true, entries };
    } catch (error) {
        const parsed = parseLdapError(error);
        return { success: false, entries: [], error: parsed.message };
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore
        }
    }
}

/**
 * Search for a user by username
 */
export async function searchUser(
    config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode' | 'tlsRejectUnauthorized' | 'tlsCaCert' | 'connectTimeout' | 'bindDn' | 'bindPasswordEnc' | 'baseDn' | 'searchTimeout' | 'userSearchFilter' | 'userAttributes' | 'selectedOUs'>,
    username: string
): Promise<{ success: boolean; user?: LdapUser; error?: string; errorCode?: LdapErrorCode }> {
    const client = createClient(config);

    try {
        if (config.connectionMode === 'STARTTLS') {
            await client.startTLS({
                rejectUnauthorized: config.tlsRejectUnauthorized,
                ca: config.tlsCaCert || undefined,
            });
        }

        const bindPassword = decrypt(config.bindPasswordEnc);

        // Check if decryption failed
        if (!bindPassword && config.bindPasswordEnc) {
            console.error('[LDAP searchUser] Failed to decrypt bind password');
            return {
                success: false,
                error: 'Failed to decrypt service account password. Please re-enter it in LDAP settings.',
                errorCode: 'UNKNOWN_ERROR',
            };
        }

        console.log('[LDAP searchUser] Binding as:', config.bindDn);
        await client.bind(config.bindDn, bindPassword);

        // Build filter with username substitution
        const filter = config.userSearchFilter.replace(/\{\{username\}\}/g, username);
        const attributes = config.userAttributes.split(',').map((a: string) => a.trim());

        // Ensure we always get required attributes
        const requiredAttrs = ['dn', 'cn', 'displayName', 'mail', 'memberOf', 'userAccountControl', 'accountExpires', 'sAMAccountName', 'userPrincipalName', 'uid'];
        const allAttributes = [...new Set([...attributes, ...requiredAttrs])];

        // Search in selected OUs or base DN
        const searchBases: string[] = [];
        try {
            const selectedOUs = JSON.parse(config.selectedOUs || '[]');
            if (Array.isArray(selectedOUs) && selectedOUs.length > 0) {
                searchBases.push(...selectedOUs);
            } else {
                searchBases.push(config.baseDn);
            }
        } catch {
            searchBases.push(config.baseDn);
        }

        const allEntries: Array<Record<string, unknown> & { dn: string }> = [];

        for (const searchBase of searchBases) {
            try {
                const result = await client.search(searchBase, {
                    scope: 'sub',
                    filter,
                    attributes: allAttributes,
                    sizeLimit: 10,
                    timeLimit: (config.searchTimeout || 10000) / 1000,
                });
                allEntries.push(...result.searchEntries);
            } catch {
                // Continue searching other OUs
            }
        }

        await client.unbind();

        if (allEntries.length === 0) {
            return { success: false, error: 'User not found', errorCode: 'USER_NOT_FOUND' };
        }

        if (allEntries.length > 1) {
            return { success: false, error: 'Multiple users found', errorCode: 'MULTIPLE_USERS' };
        }

        const entry = allEntries[0];

        // Extract memberOf groups
        let memberOf: string[] = [];
        if (entry.memberOf) {
            memberOf = Array.isArray(entry.memberOf)
                ? entry.memberOf as string[]
                : [entry.memberOf as string];
        }

        const user: LdapUser = {
            dn: entry.dn,
            cn: (entry.cn as string) || '',
            displayName: (entry.displayName || entry.cn || entry.name) as string || username,
            mail: entry.mail as string | undefined,
            sAMAccountName: entry.sAMAccountName as string | undefined,
            userPrincipalName: entry.userPrincipalName as string | undefined,
            uid: entry.uid as string | undefined,
            memberOf,
            userAccountControl: entry.userAccountControl ? parseInt(String(entry.userAccountControl), 10) : undefined,
            accountExpires: entry.accountExpires as string | undefined,
        };

        return { success: true, user };
    } catch (error) {
        const parsed = parseLdapError(error);
        return { success: false, error: parsed.message, errorCode: parsed.code };
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore
        }
    }
}

/**
 * Authenticate a user with username and password
 */
export async function authenticateUser(
    config: LdapConfig,
    username: string,
    password: string
): Promise<AuthResult> {
    // First, search for the user using service account
    const searchResult = await searchUser(config, username);

    if (!searchResult.success || !searchResult.user) {
        return {
            success: false,
            error: searchResult.error,
            errorCode: searchResult.errorCode,
        };
    }

    const user = searchResult.user;

    // Check if account is disabled (AD)
    const accountStatus = checkAccountStatus({
        userAccountControl: user.userAccountControl,
        accountExpires: user.accountExpires,
    });

    if (accountStatus.disabled) {
        return {
            success: false,
            user,
            groups: user.memberOf,
            disabled: true,
            disabledReason: accountStatus.reason,
            errorCode: accountStatus.reason === 'account_expired' ? 'ACCOUNT_EXPIRED' :
                accountStatus.reason === 'account_locked' ? 'ACCOUNT_LOCKED' : 'ACCOUNT_DISABLED',
            error: accountStatus.reason === 'account_expired'
                ? 'Account has expired'
                : accountStatus.reason === 'account_locked'
                    ? 'Account is locked'
                    : 'Account is disabled',
        };
    }

    // Now attempt to bind as the user to verify password
    const client = createClient(config);

    try {
        if (config.connectionMode === 'STARTTLS') {
            await client.startTLS({
                rejectUnauthorized: config.tlsRejectUnauthorized,
                ca: config.tlsCaCert || undefined,
            });
        }

        await client.bind(user.dn, password);
        await client.unbind();

        // Check group allow/deny lists
        const groups = user.memberOf;

        // Check deny list first
        const denyList: string[] = JSON.parse(config.groupDenyList || '[]');
        if (denyList.length > 0) {
            const inDenyList = groups.some(g =>
                denyList.some(d => d.toLowerCase() === g.toLowerCase())
            );
            if (inDenyList) {
                return {
                    success: false,
                    user,
                    groups,
                    deniedByGroupList: true,
                    error: 'Access denied by group policy',
                    errorCode: 'ACCESS_DENIED',
                };
            }
        }

        // Check allow list
        const allowList: string[] = JSON.parse(config.groupAllowList || '[]');
        if (allowList.length > 0) {
            const inAllowList = groups.some(g =>
                allowList.some(a => a.toLowerCase() === g.toLowerCase())
            );
            if (!inAllowList) {
                return {
                    success: false,
                    user,
                    groups,
                    deniedByGroupList: true,
                    error: 'Access denied - not in allowed groups',
                    errorCode: 'ACCESS_DENIED',
                };
            }
        }

        return {
            success: true,
            user,
            groups,
        };
    } catch (error) {
        const parsed = parseLdapError(error);
        return {
            success: false,
            user,
            groups: user.memberOf,
            error: parsed.message,
            errorCode: parsed.code,
        };
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore
        }
    }
}

/**
 * Search for groups by name
 */
export async function searchGroups(
    config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode' | 'tlsRejectUnauthorized' | 'tlsCaCert' | 'connectTimeout' | 'bindDn' | 'bindPasswordEnc' | 'baseDn' | 'searchTimeout'>,
    query: string,
    searchBase?: string
): Promise<{ success: boolean; groups: LdapGroup[]; error?: string }> {
    const client = createClient(config);

    try {
        if (config.connectionMode === 'STARTTLS') {
            await client.startTLS({
                rejectUnauthorized: config.tlsRejectUnauthorized,
                ca: config.tlsCaCert || undefined,
            });
        }

        const bindPassword = decrypt(config.bindPasswordEnc);
        await client.bind(config.bindDn, bindPassword);

        // Search for groups matching the query
        const filter = `(&(objectClass=group)(|(cn=*${query}*)(name=*${query}*)(displayName=*${query}*)))`;

        const result = await client.search(searchBase || config.baseDn, {
            scope: 'sub',
            filter,
            attributes: ['dn', 'cn', 'name', 'displayName', 'description'],
            sizeLimit: 50,
            timeLimit: (config.searchTimeout || 10000) / 1000,
        });

        await client.unbind();

        const groups: LdapGroup[] = result.searchEntries.map(entry => ({
            dn: entry.dn,
            cn: (entry.cn || entry.name || extractCN(entry.dn)) as string,
            displayName: entry.displayName as string | undefined,
            description: entry.description as string | undefined,
        }));

        // Sort alphabetically
        groups.sort((a, b) => a.cn.localeCompare(b.cn));

        return { success: true, groups };
    } catch (error) {
        const parsed = parseLdapError(error);
        return { success: false, groups: [], error: parsed.message };
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore
        }
    }
}

/**
 * Map user's groups to application role
 */
export function mapGroupsToRole(
    userGroups: string[],
    rules: GroupMappingRule[],
    mode: 'highest_role_wins' | 'merge_permissions',
    defaultRole: string
): string {
    if (!rules || rules.length === 0) {
        return defaultRole;
    }

    // Find matching rules
    const matchedRules = rules.filter(rule =>
        userGroups.some(g => g.toLowerCase() === rule.groupDn.toLowerCase())
    );

    if (matchedRules.length === 0) {
        return defaultRole;
    }

    if (mode === 'highest_role_wins') {
        // Sort by priority (higher wins), then by role hierarchy
        const sorted = [...matchedRules].sort((a, b) => {
            const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
            if (priorityDiff !== 0) return priorityDiff;

            const hierA = roleHierarchy[a.role] ?? 0;
            const hierB = roleHierarchy[b.role] ?? 0;
            return hierB - hierA;
        });
        return sorted[0].role;
    }

    // merge_permissions: return highest role reached via any path
    return matchedRules.reduce((highest, rule) => {
        const currentHier = roleHierarchy[highest] ?? 0;
        const ruleHier = roleHierarchy[rule.role] ?? 0;
        return ruleHier > currentHier ? rule.role : highest;
    }, defaultRole);
}

/**
 * Preview access for a user (without password verification)
 */
export async function previewUserAccess(
    config: LdapConfig,
    username: string
): Promise<AccessPreview> {
    // Search for the user
    const searchResult = await searchUser(config, username);

    if (!searchResult.success || !searchResult.user) {
        return {
            found: false,
            groups: [],
            matchedRules: [],
            effectiveRole: config.groupAuthDefaultRole || 'SECURITY',
        };
    }

    const user = searchResult.user;
    const groups = user.memberOf;

    // Check disabled status
    const accountStatus = checkAccountStatus({
        userAccountControl: user.userAccountControl,
        accountExpires: user.accountExpires,
    });

    // Parse mapping rules
    const rules: GroupMappingRule[] = JSON.parse(config.groupMappingRules || '[]');
    const matchedRules = rules.filter(rule =>
        groups.some(g => g.toLowerCase() === rule.groupDn.toLowerCase())
    );

    // Calculate effective role
    const effectiveRole = config.groupAuthEnabled
        ? mapGroupsToRole(groups, rules, config.groupAuthMode as 'highest_role_wins' | 'merge_permissions', config.groupAuthDefaultRole)
        : config.groupAuthDefaultRole || 'SECURITY';

    // Check allow/deny lists
    const denyList: string[] = JSON.parse(config.groupDenyList || '[]');
    const allowList: string[] = JSON.parse(config.groupAllowList || '[]');

    const deniedByGroupList = denyList.length > 0 && groups.some(g =>
        denyList.some(d => d.toLowerCase() === g.toLowerCase())
    );

    const allowedByGroupList = allowList.length === 0 || groups.some(g =>
        allowList.some(a => a.toLowerCase() === g.toLowerCase())
    );

    return {
        found: true,
        user: {
            dn: user.dn,
            displayName: user.displayName,
            mail: user.mail,
        },
        groups,
        matchedRules,
        effectiveRole,
        disabled: accountStatus.disabled,
        disabledReason: accountStatus.reason,
        deniedByGroupList,
        allowedByGroupList,
    };
}

/**
 * Detect base DN from RootDSE
 */
export async function detectBaseDN(
    config: Pick<LdapConfig, 'host' | 'port' | 'connectionMode' | 'tlsRejectUnauthorized' | 'tlsCaCert' | 'connectTimeout' | 'bindDn' | 'bindPasswordEnc'>
): Promise<{ success: boolean; baseDNs: string[]; defaultBaseDN?: string; error?: string }> {
    const client = createClient(config);

    try {
        if (config.connectionMode === 'STARTTLS') {
            await client.startTLS({
                rejectUnauthorized: config.tlsRejectUnauthorized,
                ca: config.tlsCaCert || undefined,
            });
        }

        const bindPassword = decrypt(config.bindPasswordEnc);
        await client.bind(config.bindDn, bindPassword);

        // Read RootDSE
        const rootDSE = await client.search('', {
            scope: 'base',
            filter: '(objectClass=*)',
            attributes: ['namingContexts', 'defaultNamingContext', 'rootDomainNamingContext'],
        });

        await client.unbind();

        if (rootDSE.searchEntries.length === 0) {
            return { success: false, baseDNs: [], error: 'Could not read RootDSE' };
        }

        const entry = rootDSE.searchEntries[0];

        const baseDNs: string[] = [];

        if (entry.namingContexts) {
            const contexts = Array.isArray(entry.namingContexts)
                ? entry.namingContexts
                : [entry.namingContexts];
            baseDNs.push(...contexts.map(c => String(c)));
        }

        const defaultBaseDN = entry.defaultNamingContext
            ? String(entry.defaultNamingContext)
            : entry.rootDomainNamingContext
                ? String(entry.rootDomainNamingContext)
                : baseDNs[0];

        return {
            success: true,
            baseDNs,
            defaultBaseDN,
        };
    } catch (error) {
        const parsed = parseLdapError(error);
        return { success: false, baseDNs: [], error: parsed.message };
    } finally {
        try {
            await client.unbind();
        } catch {
            // Ignore
        }
    }
}
