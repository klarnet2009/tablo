'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { SpinnerBlock } from '@/components/Spinner';

export default function DashboardLayout({
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
