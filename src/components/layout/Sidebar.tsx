'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
    Truck,
    LayoutDashboard,
    List,
    PlusCircle,
    Square,
    Settings,
    LogOut,
    User
} from 'lucide-react';

const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/queue', label: 'Queue', icon: List },
    { href: '/register', label: 'Register', icon: PlusCircle },
    { href: '/docks', label: 'Docks', icon: Square },
];

const adminItems = [
    { href: '/settings', label: 'Settings', icon: Settings, roles: ['SUPERVISOR', 'ADMIN'] },
];

export function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();

    return (
        <aside className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
            {/* Logo */}
            <div className="p-4 border-b border-slate-700">
                <Link href="/" className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                        <Truck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Tablo</h1>
                        <p className="text-xs text-slate-400">Queue Management</p>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${isActive
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                                }`}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    );
                })}

                {/* Admin items */}
                {session && adminItems
                    .filter(item => item.roles.includes(session.user.role))
                    .map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${isActive
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                                    }`}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
            </nav>

            {/* User section */}
            {session && (
                <div className="p-4 border-t border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
                            <User className="w-5 h-5 text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                                {session.user.displayName}
                            </p>
                            <p className="text-xs text-slate-400 capitalize">
                                {session.user.role.toLowerCase()}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => signOut({ callbackUrl: '/login' })}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="text-sm">Sign Out</span>
                    </button>
                </div>
            )}
        </aside>
    );
}
