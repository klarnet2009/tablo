/**
 * Route-level authorization decision.
 *
 * Deliberately free of next/server and next-auth imports so it can be unit
 * tested directly; src/lib/api-auth.ts wires it to the request lifecycle.
 */

export type Role = 'SECURITY' | 'DISPATCHER' | 'SUPERVISOR' | 'ADMIN';

export interface SessionLike {
    user?: { id: string; username: string; displayName: string; role?: string };
}

export type AccessResult =
    | { ok: true }
    | { ok: false; status: 401 | 403; message: string };

/**
 * @param allowed Roles permitted to call the route. An empty list means any
 *                authenticated user.
 */
export function checkAccess(session: SessionLike | null, allowed: readonly string[]): AccessResult {
    if (!session?.user) {
        return { ok: false, status: 401, message: 'Unauthorized' };
    }
    if (allowed.length === 0) {
        return { ok: true };
    }
    // A session with no role must never be read as "no restriction".
    if (!session.user.role || !allowed.includes(session.user.role)) {
        return { ok: false, status: 403, message: 'Forbidden' };
    }
    return { ok: true };
}
