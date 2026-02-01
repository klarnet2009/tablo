'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Square, Settings, Truck, Snowflake, AlertTriangle } from 'lucide-react';

interface Dock {
    id: string;
    name: string;
    dockNumber: number;
    dockType: string;
    status: string;
    hasReeferPower: boolean;
    hazmatOk: boolean;
    currentVisit?: {
        id: string;
        truckPlate: string;
        status: string;
        carrier?: string;
    };
}

export default function DocksPage() {
    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const canManage = ['SUPERVISOR', 'ADMIN'].includes(session?.user?.role || '');

    const { data: docks = [], isLoading } = useQuery<Dock[]>({
        queryKey: ['docks'],
        queryFn: async () => {
            const res = await fetch('/api/docks');
            return res.json();
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => {
            const res = await fetch(`/api/docks/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error('Failed to update dock');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['docks'] });
        },
    });

    const statusColors: Record<string, { bg: string; border: string; text: string }> = {
        AVAILABLE: { bg: 'bg-green-500/10', border: 'border-green-500/50', text: 'text-green-400' },
        BUSY: { bg: 'bg-blue-500/10', border: 'border-blue-500/50', text: 'text-blue-400' },
        CLOSED: { bg: 'bg-gray-500/10', border: 'border-gray-500/50', text: 'text-gray-400' },
        MAINTENANCE: { bg: 'bg-orange-500/10', border: 'border-orange-500/50', text: 'text-orange-400' },
    };

    const typeLabels: Record<string, string> = {
        INBOUND: 'Inbound only',
        OUTBOUND: 'Outbound only',
        BOTH: 'In/Outbound',
    };

    return (
        <div className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white">Dock Management</h1>
                    <p className="text-slate-400 text-sm md:text-base">View and manage loading docks</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {docks.map(dock => {
                        const colors = statusColors[dock.status] || statusColors.AVAILABLE;

                        return (
                            <div
                                key={dock.id}
                                className={`rounded-xl border-2 ${colors.bg} ${colors.border} p-5 transition`}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colors.bg} border ${colors.border}`}>
                                            <Square className={`w-6 h-6 ${colors.text}`} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{dock.name}</h3>
                                            <p className={`text-sm capitalize ${colors.text}`}>{dock.status.toLowerCase()}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Capabilities */}
                                <div className="flex flex-wrap gap-2 mb-4">
                                    <span className="px-2 py-1 text-xs bg-slate-700/50 text-slate-300 rounded">
                                        {typeLabels[dock.dockType]}
                                    </span>
                                    {dock.hasReeferPower && (
                                        <span className="px-2 py-1 text-xs bg-cyan-500/20 text-cyan-400 rounded flex items-center gap-1">
                                            <Snowflake className="w-3 h-3" />
                                            Reefer
                                        </span>
                                    )}
                                    {dock.hazmatOk && (
                                        <span className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 rounded flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            Hazmat
                                        </span>
                                    )}
                                </div>

                                {/* Current Visit */}
                                {dock.currentVisit && (
                                    <div className="bg-slate-800/50 rounded-lg p-3 mb-4">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Truck className="w-4 h-4 text-blue-400" />
                                            <span className="font-mono font-bold text-white">{dock.currentVisit.truckPlate}</span>
                                        </div>
                                        {dock.currentVisit.carrier && (
                                            <p className="text-xs text-slate-400 mt-1">{dock.currentVisit.carrier}</p>
                                        )}
                                    </div>
                                )}

                                {/* Actions */}
                                {canManage && dock.status !== 'BUSY' && (
                                    <div className="flex gap-2">
                                        {dock.status === 'AVAILABLE' && (
                                            <>
                                                <button
                                                    onClick={() => updateMutation.mutate({ id: dock.id, status: 'CLOSED' })}
                                                    className="flex-1 px-3 py-2 text-xs bg-gray-500/20 text-gray-400 rounded-lg hover:bg-gray-500/30 transition"
                                                >
                                                    Close
                                                </button>
                                                <button
                                                    onClick={() => updateMutation.mutate({ id: dock.id, status: 'MAINTENANCE' })}
                                                    className="flex-1 px-3 py-2 text-xs bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 transition"
                                                >
                                                    Maintenance
                                                </button>
                                            </>
                                        )}
                                        {(dock.status === 'CLOSED' || dock.status === 'MAINTENANCE') && (
                                            <button
                                                onClick={() => updateMutation.mutate({ id: dock.id, status: 'AVAILABLE' })}
                                                className="flex-1 px-3 py-2 text-xs bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition"
                                            >
                                                Open
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
