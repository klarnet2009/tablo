'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
    LayoutDashboard,
    List,
    PlusCircle,
    Square,
    Menu,
    LogOut,
    Settings,
    User
} from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/Modal';

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/queue', label: 'Queue', icon: List },
    { href: '/register', label: 'Register', icon: PlusCircle },
    { href: '/docks', label: 'Docks', icon: Square },
];

export function MobileNav() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const [menuOpen, setMenuOpen] = useState(false);

    const isAdmin = ['SUPERVISOR', 'ADMIN'].includes(session?.user?.role || '');

    return (
        <>
            {/* Bottom Navigation Bar */}
            <nav className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 z-50 md:hidden safe-bottom">
                <div className="flex justify-around items-center h-16">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors ${isActive
                                        ? 'text-blue-400'
                                        : 'text-slate-400 active:text-slate-200'
                                    }`}
                            >
                                <item.icon className="w-6 h-6" />
                                <span className="text-xs mt-1 font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                    {/* Menu button */}
                    <button
                        onClick={() => setMenuOpen(true)}
                        className="flex flex-col items-center justify-center flex-1 h-full py-2 text-slate-400 active:text-slate-200"
                    >
                        <Menu className="w-6 h-6" />
                        <span className="text-xs mt-1 font-medium">More</span>
                    </button>
                </div>
            </nav>

            {/* Slide-up Menu */}
            {menuOpen && (
                <Modal title="Menu" onClose={() => setMenuOpen(false)}>
                    {session && (
                        <div className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl mb-4">
                            <div className="w-10 h-10 bg-slate-600 rounded-full flex items-center justify-center">
                                <User className="w-5 h-5 text-slate-300" />
                            </div>
                            <div>
                                <p className="text-white font-medium">{session.user.displayName}</p>
                                <p className="text-sm text-slate-400 capitalize">{session.user.role.toLowerCase()}</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1">
                        {isAdmin && (
                            <Link
                                href="/settings"
                                onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-3 p-3 text-slate-300 hover:bg-slate-700/50 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <Settings className="w-5 h-5" />
                                <span>Settings</span>
                            </Link>
                        )}
                        <button
                            onClick={() => signOut({ callbackUrl: '/login' })}
                            className="flex items-center gap-3 p-3 text-red-400 hover:bg-slate-700/50 rounded-lg transition w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </Modal>
            )}
        </>
    );
}
