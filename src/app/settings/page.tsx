'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Settings, Users, Database, Bell, Shield, ChevronRight } from 'lucide-react';

export default function SettingsPage() {
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

    // Check for admin/supervisor role
    if (!['ADMIN', 'SUPERVISOR'].includes(session.user.role)) {
        redirect('/queue');
    }

    const isAdmin = session.user.role === 'ADMIN';

    return (
        <div className="flex min-h-screen bg-slate-900">
            <Sidebar />
            <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">
                <div className="space-y-6">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-white">Settings</h1>
                        <p className="text-slate-400 text-sm md:text-base">System configuration and preferences</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Authentication - Admin Only */}
                        {isAdmin && (
                            <Link
                                href="/settings/authentication"
                                className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 md:p-6 
                                    hover:bg-slate-800/70 hover:border-slate-600/50 transition group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Shield className="w-8 h-8 text-cyan-400" />
                                        <div>
                                            <h3 className="text-lg font-semibold text-white group-hover:text-cyan-400 transition">
                                                Authentication
                                            </h3>
                                            <p className="text-sm text-slate-400">LDAP / Active Directory</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition" />
                                </div>
                            </Link>
                        )}

                        {/* User Management Card */}
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 md:p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <Users className="w-8 h-8 text-blue-400" />
                                <div>
                                    <h3 className="text-lg font-semibold text-white">User Management</h3>
                                    <p className="text-sm text-slate-400">Manage users and roles</p>
                                </div>
                            </div>
                            <p className="text-slate-500 text-sm">Coming soon...</p>
                        </div>

                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 md:p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <Database className="w-8 h-8 text-green-400" />
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Database</h3>
                                    <p className="text-sm text-slate-400">Backup and maintenance</p>
                                </div>
                            </div>
                            <p className="text-slate-500 text-sm">Coming soon...</p>
                        </div>

                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 md:p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <Bell className="w-8 h-8 text-yellow-400" />
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Notifications</h3>
                                    <p className="text-sm text-slate-400">Alert preferences</p>
                                </div>
                            </div>
                            <p className="text-slate-500 text-sm">Coming soon...</p>
                        </div>

                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 md:p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <Settings className="w-8 h-8 text-purple-400" />
                                <div>
                                    <h3 className="text-lg font-semibold text-white">System</h3>
                                    <p className="text-sm text-slate-400">General settings</p>
                                </div>
                            </div>
                            <p className="text-slate-500 text-sm">Coming soon...</p>
                        </div>
                    </div>

                    {/* Version Info */}
                    <div className="text-center text-slate-500 text-sm pt-8">
                        Tablo Queue Management System v1.0.0
                    </div>
                </div>
            </main>
            <MobileNav />
        </div>
    );
}

