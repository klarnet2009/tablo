import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api-auth';

/**
 * Manual "do not park in front of the screen" warning for the public display.
 *
 * GET stays public: the display board itself is unauthenticated and polls this.
 * It returns the timestamp of the last trigger rather than a boolean flag the
 * caller has to clear, so the display needs no write access (it just watches the
 * value change) and several screens can react to the same trigger.
 *
 * ponytail: module-level state, so it resets on restart and does not span
 * replicas. Fine for the current single-container deployment; move to a row in
 * the database if the app is ever scaled out.
 */
let triggeredAt = 0;

export async function GET() {
    return NextResponse.json({ triggeredAt });
}

export async function POST() {
    const guard = await requireRole(['DISPATCHER', 'SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;

    triggeredAt = Date.now();
    return NextResponse.json({ success: true, triggeredAt });
}

export async function DELETE() {
    const guard = await requireRole(['DISPATCHER', 'SUPERVISOR', 'ADMIN']);
    if (!guard.ok) return guard.response;

    triggeredAt = 0;
    return NextResponse.json({ success: true, triggeredAt });
}
