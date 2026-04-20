/**
 * POST /api/display/ack
 *
 * Client-to-server acknowledgement that a display board successfully applied
 * a specific visits payload revision. Used by /settings/displays to distinguish
 * "SSE open but delivery silently stopped" from "client actually has fresh data".
 *
 * Public endpoint — same risk profile as /api/display/stream. No DB.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ackClientRevision } from '@/lib/display-registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ackSchema = z.object({
    deviceId: z.string().min(1).max(200),
    revision: z.number().int().nonnegative(),
});

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = ackSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Invalid input', issues: parsed.error.issues },
            { status: 400 },
        );
    }

    ackClientRevision(parsed.data.deviceId, parsed.data.revision);
    return new NextResponse(null, { status: 204 });
}
