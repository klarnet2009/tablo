/**
 * Route-level authorization.
 *
 * Every API route repeated the same "load session, check role" pair inline, and
 * some routes forgot one or both halves. The decision lives in
 * api-auth-policy.ts (unit tested); this is the wrapper routes call.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { checkAccess, type Role } from './api-auth-policy';

export type { Role };

type Session = NonNullable<Awaited<ReturnType<typeof getServerSession>>>;

/**
 * Usage:
 *   const guard = await requireRole(['ADMIN']);
 *   if (!guard.ok) return guard.response;
 *   guard.session.user.id
 *
 * With no argument: any authenticated user.
 */
export async function requireRole(
    allowed: readonly Role[] = []
): Promise<{ ok: true; session: Session } | { ok: false; response: NextResponse }> {
    const session = await getServerSession(authOptions);
    const access = checkAccess(session, allowed);

    if (!access.ok) {
        return {
            ok: false,
            response: NextResponse.json({ error: access.message }, { status: access.status }),
        };
    }

    return { ok: true, session: session as Session };
}
