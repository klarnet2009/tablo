'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { ChevronRight } from 'lucide-react';
import { LdapWizard } from '@/components/ldap/LdapWizard';

export default function LdapSettingsPage() {
    const { data: session, status } = useSession();

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!session) {
        redirect('/login');
    }

    if (session.user.role !== 'ADMIN') {
        redirect('/queue');
    }

    return (
        <div className="flex min-h-screen bg-slate-900">
            <Sidebar />
            <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Header */}
                    <div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                            <Link href="/settings" className="hover:text-white">Settings</Link>
                            <ChevronRight className="w-4 h-4" />
                            <Link href="/settings/authentication" className="hover:text-white">Authentication</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span>LDAP</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-bold text-white">LDAP / Active Directory</h1>
                        <p className="text-slate-400 text-sm md:text-base">
                            Configure LDAP authentication with group-based access control
                        </p>
                    </div>

                    {/* LDAP Wizard */}
                    <LdapWizard />
                </div>
            </main>
            <MobileNav />
        </div>
    );
}
