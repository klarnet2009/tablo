/**
 * Public cheap endpoint that returns the current visits-payload revision.
 *
 * Used by the /display client as a freshness watchdog: if the SSE connection
 * stays open but payload delivery quietly stops, the client's stored revision
 * will drift behind the server's. Polling this endpoint every few seconds
 * lets the client detect staleness and force a soft reconnect.
 *
 * No DB access, no auth — just reads an in-memory counter from display-registry.
 */

import { NextResponse } from 'next/server';
import { getVisitsRevision } from '@/lib/display-registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
    return NextResponse.json(
        { revision: getVisitsRevision() },
        {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
        },
    );
}
