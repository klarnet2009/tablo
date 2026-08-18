'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { LdapWizard } from '@/components/ldap/LdapWizard';

// Session and role are enforced by src/app/settings/layout.tsx.
export default function LdapSettingsPage() {
    return (
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
    );
}
