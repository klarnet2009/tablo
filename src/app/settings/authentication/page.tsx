'use client';

import Link from 'next/link';
import { Shield, ChevronRight } from 'lucide-react';

// Session and role are enforced by src/app/settings/layout.tsx.
export default function AuthenticationSettingsPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
                    {/* Header */}
                    <div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                            <Link href="/settings" className="hover:text-white">Settings</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span>Authentication</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-bold text-white">Authentication</h1>
                        <p className="text-slate-400 text-sm md:text-base">
                            Configure external authentication providers
                        </p>
                    </div>

                    {/* LDAP Card */}
                    <Link
                        href="/settings/authentication/ldap"
                        className="block bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 
                            hover:bg-slate-800/70 hover:border-slate-600/50 transition group"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4">
                                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                                    <Shield className="w-6 h-6 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition">
                                        LDAP / Active Directory
                                    </h3>
                                    <p className="text-sm text-slate-400 mt-1">
                                        Authenticate users against your company directory with group-based
                                        role mapping and AD disabled-user blocking.
                                    </p>
                                    <div className="flex items-center gap-3 mt-3">
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 
                                            rounded text-xs text-slate-400">
                                            LDAP / LDAPS / STARTTLS
                                        </span>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700/50 
                                            rounded text-xs text-slate-400">
                                            Group RBAC
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition" />
                        </div>
                    </Link>

                    {/* Future providers placeholder */}
                    <div className="bg-slate-800/30 rounded-xl border border-dashed border-slate-700/50 p-6">
                        <div className="text-center text-slate-500">
                            <p className="text-sm">More authentication providers coming soon...</p>
                            <p className="text-xs mt-1">OAuth 2.0, SAML, etc.</p>
                        </div>
                    </div>
        </div>
    );
}
