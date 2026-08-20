'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { SpinnerBlock } from '@/components/Spinner';
import { Providers } from '@/components/Providers';

function DashboardShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const { data: session, status } = useSession();

    if (status === 'loading') {
        return (
            <SpinnerBlock label="Loading your session" className="min-h-screen bg-slate-900" />
        );
    }

    if (!session) {
        redirect('/login');
    }

    return (
        <div className="flex min-h-screen bg-slate-900">
            <Sidebar />
            <main className="flex-1 overflow-auto pb-20 md:pb-0">
                {children}
            </main>
            <MobileNav />
        </div>
    );
}

/**
 * The session and query providers live here rather than in the root layout: the
 * public display board needs neither, and having them above it shipped next-auth
 * and react-query to every kiosk and fired /api/auth/session on boot.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <DashboardShell>{children}</DashboardShell>
        </Providers>
    );
}
