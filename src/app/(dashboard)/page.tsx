'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import {
    Truck,
    Clock,
    CheckCircle,
    AlertTriangle,
    Square,
    TrendingUp
} from 'lucide-react';
import { StatusBadge, PriorityBadge } from '@/components/queue/StatusBadge';
import Link from 'next/link';

interface TruckVisit {
    id: string;
    truckPlate: string;
    carrier?: string;
    driverName?: string;
    loadType: string;
    priority: string;
    status: string;
    queuePosition?: number;
    assignedDock?: { id: string; name: string; dockNumber: number };
    createdAt: string;
    arrivedAt?: string;
}

interface Dock {
    id: string;
    name: string;
    dockNumber: number;
    status: string;
    dockType: string;
    currentVisit?: TruckVisit;
}

export default function DashboardPage() {
    const { data: session } = useSession();

    const { data: visits = [] } = useQuery<TruckVisit[]>({
        queryKey: ['visits', 'active'],
        queryFn: async () => {
            const res = await fetch('/api/visits?active=true');
            return res.json();
        },
    });

    const { data: docks = [] } = useQuery<Dock[]>({
        queryKey: ['docks'],
        queryFn: async () => {
            const res = await fetch('/api/docks');
            return res.json();
        },
    });

    // Calculate stats
    const waiting = visits.filter(v => v.status === 'WAITING').length;
    const inService = visits.filter(v => ['CALLED', 'DOCKED', 'IN_SERVICE'].includes(v.status)).length;
    const availableDocks = docks.filter(d => d.status === 'AVAILABLE').length;
    const busyDocks = docks.filter(d => d.status === 'BUSY').length;

    const stats = [
        { label: 'Waiting', value: waiting, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
        { label: 'In Service', value: inService, icon: Truck, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Available Docks', value: availableDocks, icon: Square, color: 'text-green-400', bg: 'bg-green-500/10' },
        { label: 'Busy Docks', value: busyDocks, icon: TrendingUp, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    ];

    // Queue sorted by priority and position
    const queue = visits
        .filter(v => v.status === 'WAITING')
        .sort((a, b) => {
            const priorityOrder = { URGENT: 0, SLA: 1, HIGH: 2, NORMAL: 3 };
            const pa = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3;
            const pb = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3;
            if (pa !== pb) return pa - pb;
            return (a.queuePosition || 999) - (b.queuePosition || 999);
        });

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-white">Dashboard</h1>
                <p className="text-slate-400">Welcome back, {session?.user.displayName}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat) => (
                    <div key={stat.label} className={`${stat.bg} rounded-xl p-5 border border-slate-700/50`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-400">{stat.label}</p>
                                <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                            </div>
                            <stat.icon className={`w-10 h-10 ${stat.color}`} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Queue */}
                <div className="lg:col-span-2 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-white">Current Queue</h2>
                        <Link
                            href="/queue"
                            className="text-sm text-blue-400 hover:text-blue-300"
                        >
                            View All →
                        </Link>
                    </div>
                    <div className="divide-y divide-slate-700/50">
                        {queue.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                <p>No trucks waiting in queue</p>
                            </div>
                        ) : (
                            queue.slice(0, 5).map((visit, idx) => (
                                <div key={visit.id} className="p-4 flex items-center gap-4 hover:bg-slate-700/30 transition">
                                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-sm font-bold text-white">
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-white">{visit.truckPlate}</span>
                                            <PriorityBadge priority={visit.priority} size="sm" />
                                        </div>
                                        <p className="text-sm text-slate-400 truncate">
                                            {visit.carrier || 'Unknown carrier'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <StatusBadge status={visit.status} size="sm" />
                                        <p className="text-xs text-slate-500 mt-1">
                                            {visit.loadType}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Docks */}
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-white">Dock Status</h2>
                        <Link
                            href="/docks"
                            className="text-sm text-blue-400 hover:text-blue-300"
                        >
                            Manage →
                        </Link>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                        {docks.map((dock) => {
                            const statusColors: Record<string, string> = {
                                AVAILABLE: 'bg-green-500/20 border-green-500/50 text-green-400',
                                BUSY: 'bg-blue-500/20 border-blue-500/50 text-blue-400',
                                CLOSED: 'bg-gray-500/20 border-gray-500/50 text-gray-400',
                                MAINTENANCE: 'bg-orange-500/20 border-orange-500/50 text-orange-400',
                            };

                            return (
                                <div
                                    key={dock.id}
                                    className={`rounded-lg border p-3 ${statusColors[dock.status] || statusColors.AVAILABLE}`}
                                >
                                    <div className="font-bold">{dock.name}</div>
                                    <div className="text-xs opacity-75 capitalize">{dock.status.toLowerCase()}</div>
                                    {dock.currentVisit && (
                                        <div className="mt-2 pt-2 border-t border-current/20 text-xs font-mono">
                                            {dock.currentVisit.truckPlate}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
