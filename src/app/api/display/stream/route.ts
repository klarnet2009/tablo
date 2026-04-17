import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import {
    ensureDisplaySchema,
    register,
    unregister,
    sendHeartbeat,
    sendInitialSnapshot,
    type ConnectionInfo,
} from '@/lib/display-registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_INTERVAL_MS = 15000;

// GET /api/display/stream?deviceId=<uuid> — public SSE stream for display boards
export async function GET(request: NextRequest) {
    const deviceId = request.nextUrl.searchParams.get('deviceId');
    if (!deviceId) {
        return new Response('deviceId query parameter is required', { status: 400 });
    }

    await ensureDisplaySchema();
    // Ensure a DB row exists so an admin can rename this display later.
    // INSERT OR IGNORE is SQLite-specific and works via libsql adapter.
    await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO Display (id, deviceId) VALUES (?, ?)`,
        crypto.randomUUID(),
        deviceId,
    );

    const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null;
    const userAgent = request.headers.get('user-agent') || null;

    let heartbeatTimer: NodeJS.Timeout | null = null;

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const now = new Date();
            const info: ConnectionInfo = {
                deviceId,
                connectedAt: now,
                lastHeartbeat: now,
                lastPayloadAt: now,
                ip,
                userAgent,
                controller,
            };
            await register(info);
            await sendInitialSnapshot(deviceId);

            heartbeatTimer = setInterval(() => sendHeartbeat(deviceId), HEARTBEAT_INTERVAL_MS);

            request.signal.addEventListener('abort', () => {
                if (heartbeatTimer) clearInterval(heartbeatTimer);
                unregister(deviceId);
            });
        },
        cancel() {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            unregister(deviceId);
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            // Disable buffering by Next.js, nginx and intermediaries
            'X-Accel-Buffering': 'no',
        },
    });
}
