import { NextResponse } from 'next/server';
import { authenticate, isExternalApiConfigured } from '@/lib/external-api';
import { requireRole } from '@/lib/api-auth';

// Diagnostics for the external cargo API connection. Both handlers trigger a
// login with the server's stored credentials, so they are restricted rather than
// left open to the internet.
const ALLOWED = ['SUPERVISOR', 'ADMIN'] as const;

/**
 * POST /api/external/login
 * Authenticate with external API and return status
 */
export async function POST() {
    try {
        const guard = await requireRole(ALLOWED);
        if (!guard.ok) return guard.response;

        if (!isExternalApiConfigured()) {
            return NextResponse.json(
                { error: 'External API not configured. Check environment variables.' },
                { status: 500 }
            );
        }

        const token = await authenticate();

        return NextResponse.json({
            success: true,
            message: 'Successfully authenticated with external API',
            authenticated: !!token,
        });
    } catch (error) {
        console.error('External API login error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Authentication failed' },
            { status: 401 }
        );
    }
}

/**
 * GET /api/external/login
 * Check if authenticated with external API
 */
export async function GET() {
    const guard = await requireRole(ALLOWED);
    if (!guard.ok) return guard.response;

    try {
        if (!isExternalApiConfigured()) {
            return NextResponse.json({
                configured: false,
                authenticated: false,
            });
        }

        await authenticate();

        return NextResponse.json({
            configured: true,
            authenticated: true,
        });
    } catch {
        return NextResponse.json({
            configured: true,
            authenticated: false,
        });
    }
}
