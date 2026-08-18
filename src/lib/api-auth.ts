/**
 * Route-level authorization.
 *
 * Every API route repeated the same "load session, check role" pair inline, and
 * some routes forgot one or both halves. The decision lives in
 * api-auth-policy.ts (unit tested); this is the wrapper routes call.
 */

import { NextResponse } from 'next/server';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/prisma';
import { checkAccess, type Role, type SessionLike } from './api-auth-policy';

export type { Role };

/**
 * Usage:
 *   const guard = await requireRole(['ADMIN']);
 *   if (!guard.ok) return guard.response;
 *   guard.session.user.id
 *
 * With no argument: any authenticated user.
 *
 * The role and active flag are re-read from the database on every call rather
 * than trusted from the JWT: a token minted before a demotion or a deactivation
 * stays cryptographically valid until it expires, so without this a disabled
 * account keeps full access for the remainder of the session lifetime.
 */
export async function requireRole(
    allowed: readonly Role[] = []
): Promise<{ ok: true; session: Session } | { ok: false; response: NextResponse }> {
    const session = await getServerSession(authOptions);

    // Cheap rejection first: no session at all means no database round-trip.
    const sessionCheck = checkAccess(session, allowed);
    if (!sessionCheck.ok) {
        return { ok: false, response: refuse(sessionCheck.status, sessionCheck.message) };
    }

    const dbUser = await prisma.user.findUnique({
        where: { id: session!.user.id },
        select: { role: true, isActive: true },
    });

    // A deleted or deactivated user is treated exactly like an anonymous caller.
    const effective: SessionLike | null = dbUser?.isActive
        ? { user: { ...session!.user, role: dbUser.role } }
        : null;

    const access = checkAccess(effective, allowed);
    if (!access.ok) {
        return { ok: false, response: refuse(access.status, access.message) };
    }

    return {
        ok: true,
        session: { ...session!, user: { ...session!.user, role: dbUser!.role } } as Session,
    };
}

function refuse(status: 401 | 403, message: string): NextResponse {
    return NextResponse.json({ error: message }, { status });
}
