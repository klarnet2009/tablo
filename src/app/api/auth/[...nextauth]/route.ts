import NextAuth, { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authenticateUser, mapGroupsToRole, GroupMappingRule } from '@/lib/ldap-service';
import { resolveLdapFailure } from '@/lib/ldap-auth-policy';

export const dynamic = 'force-dynamic';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            username: string;
            displayName: string;
            role: string;
            ldapAuthenticated?: boolean;
        };
    }
    interface User {
        id: string;
        username: string;
        displayName: string;
        role: string;
        ldapAuthenticated?: boolean;
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id: string;
        username: string;
        displayName?: string;
        role: string;
        ldapAuthenticated?: boolean;
    }
}

/**
 * Attempt LDAP authentication.
 * Returns a user if successful, 'fallback' to try local auth, or throws to deny.
 * Whether a failure may fall back to local auth is decided by resolveLdapFailure,
 * which honours the disableLocalFallback setting.
 */
async function tryLdapAuth(username: string, password: string): Promise<User | null | 'fallback'> {
    try {
        const ldapConfig = await prisma.ldapConfig.findUnique({
            where: { id: 'singleton' },
        });

        // LDAP not enabled - use local auth
        if (!ldapConfig?.enabled) {
            return 'fallback';
        }

        // LDAP enabled but not usable yet. Deliberately still falls back even when
        // disableLocalFallback is set: in this state LDAP was never operational, and
        // denying would lock out the very admin who has to finish configuring it.
        if (!ldapConfig.host || !ldapConfig.bindDn || !ldapConfig.bindPasswordEnc) {
            console.warn('[Auth] LDAP enabled but not fully configured, falling back to local auth');
            return 'fallback';
        }

        // Attempt LDAP authentication
        const result = await authenticateUser(ldapConfig, username, password);

        if (!result.success) {
            const decision = resolveLdapFailure(ldapConfig, {
                success: false,
                disabled: result.disabled,
                disabledReason: result.disabledReason,
                deniedByGroupList: result.deniedByGroupList,
                errorCode: result.errorCode,
                error: result.error,
            });

            if (decision.action === 'deny') {
                console.warn('[Auth] LDAP auth denied. Reason:', result.errorCode || result.error);
                throw new Error(decision.message);
            }

            console.log('[Auth] LDAP auth failed, trying local auth. Reason:', result.errorCode || result.error);
            return 'fallback';
        }

        // LDAP authentication successful
        const ldapUser = result.user!;
        const groups = result.groups || [];

        // Calculate role from group mapping
        let role = ldapConfig.groupAuthDefaultRole || 'SECURITY';
        if (ldapConfig.groupAuthEnabled && groups.length > 0) {
            const rules: GroupMappingRule[] = JSON.parse(ldapConfig.groupMappingRules || '[]');
            role = mapGroupsToRole(
                groups,
                rules,
                ldapConfig.groupAuthMode as 'highest_role_wins' | 'merge_permissions',
                ldapConfig.groupAuthDefaultRole || 'SECURITY'
            );
        }

        // Upsert local user record
        const user = await prisma.user.upsert({
            where: { username },
            update: {
                displayName: ldapUser.displayName || username,
                role: ldapConfig.groupAuthEnabled ? role : undefined,
                ldapDn: ldapUser.dn,
                ldapSyncedAt: new Date(),
                isActive: true,
            },
            create: {
                username,
                passwordHash: '', // Empty for LDAP users
                displayName: ldapUser.displayName || username,
                role,
                ldapDn: ldapUser.dn,
                ldapSyncedAt: new Date(),
                isActive: true,
            },
        });

        return {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            ldapAuthenticated: true,
        };
    } catch (error) {
        // Re-throw auth errors
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('Authentication failed');
    }
}

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                username: { label: 'Username', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials): Promise<User | null> {
                if (!credentials?.username || !credentials?.password) {
                    return null;
                }

                // Try LDAP authentication first
                try {
                    const ldapResult = await tryLdapAuth(credentials.username, credentials.password);

                    // If LDAP returned a user, use it
                    if (ldapResult && ldapResult !== 'fallback') {
                        return ldapResult;
                    }

                    // If LDAP says fallback, continue to local auth
                    // If LDAP threw an error, it would have been caught below
                } catch (error) {
                    // LDAP auth failed with no fallback - throw the error
                    if (error instanceof Error) {
                        throw error;
                    }
                    return null;
                }

                // Local authentication
                const user = await prisma.user.findUnique({
                    where: { username: credentials.username },
                });

                if (!user || !user.isActive) {
                    return null;
                }

                // Skip password check for LDAP-only users (empty password hash)
                if (!user.passwordHash && user.ldapDn) {
                    // This is an LDAP user trying to log in locally
                    // LDAP auth already failed, so deny
                    return null;
                }

                const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
                if (!isValid) {
                    return null;
                }

                return {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    role: user.role,
                    ldapAuthenticated: false,
                };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id;
                token.username = user.username;
                token.displayName = user.displayName; // Store displayName in token
                token.role = user.role;
                token.ldapAuthenticated = user.ldapAuthenticated;
            }
            return token;
        },
        async session({ session, token }) {
            session.user = {
                id: token.id,
                username: token.username,
                displayName: token.displayName || token.username, // Use stored displayName
                role: token.role,
                ldapAuthenticated: token.ldapAuthenticated,
            };
            return session;
        },
    },
    pages: {
        signIn: '/login',
        error: '/login',
    },
    session: {
        strategy: 'jwt',
        // Was 30 days. The role and active flag baked into the token are re-checked
        // against the database by requireRole() on every API call, so this bound
        // only limits how long a stolen token stays usable — a shift, not a month.
        maxAge: 12 * 60 * 60, // 12 hours
    },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
