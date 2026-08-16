'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { SpinnerBlock } from '@/components/Spinner';

/**
 * Shell and access check for /settings/*.
 *
 * Each settings page used to render Sidebar + MobileNav itself and repeat the
 * session/role checks, three copies of the same thing.
 *
 * This is a client-side gate: the API routes are the real boundary (see
 * lib/api-auth.ts), this only keeps the navigation honest.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();

    if (status === 'loading') {
        return (
            <SpinnerBlock label="Loading your session" className="min-h-screen bg-slate-900" />
        );
    }

    if (!session) {
        redirect('/login');
    }

    if (!['ADMIN', 'SUPERVISOR'].includes(session.user.role)) {
        redirect('/queue');
    }

    return (
        <div className="flex min-h-screen bg-slate-900">
            <Sidebar />
            <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">{children}</main>
            <MobileNav />
        </div>
    );
}
