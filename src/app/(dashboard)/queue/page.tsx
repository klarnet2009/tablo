'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { StatusBadge, PriorityBadge } from '@/components/queue/StatusBadge';
import { getAvailableTransitions, VisitStatus, UserRole } from '@/lib/status-machine';
import {
    Phone,
    MoreVertical,
    Play,
    Pause,
    X,
    CheckCircle,
    Truck,
    Clock,
    RotateCcw,
    LogOut
} from 'lucide-react';
import { useState } from 'react';

interface TruckVisit {
    id: string;
    truckPlate: string;
    trailerPlate?: string;
    carrier?: string;
    driverName?: string;
    driverPhone?: string;
    loadType: string;
    priority: string;
    status: string;
    queuePosition?: number;
    assignedDock?: { id: string; name: string; dockNumber: number };
    createdAt: string;
    arrivedAt?: string;
    calledAt?: string;
    orderRef?: string;
}

interface Dock {
    id: string;
    name: string;
    dockNumber: number;
    dockType: string;
    status: string;
}

export default function QueuePage() {
    const { data: session } = useSession();
    const queryClient = useQueryClient();
    const [selectedVisit, setSelectedVisit] = useState<TruckVisit | null>(null);
    const [showDockModal, setShowDockModal] = useState(false);
    const [reassignMode, setReassignMode] = useState(false);

    const { data: visits = [], isLoading } = useQuery<TruckVisit[]>({
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

    const statusMutation = useMutation({
        mutationFn: async ({ id, status, dockId }: { id: string; status: string; dockId?: string }) => {
            const res = await fetch(`/api/visits/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, dockId }),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update status');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['visits'] });
            queryClient.invalidateQueries({ queryKey: ['docks'] });
            setShowDockModal(false);
            setSelectedVisit(null);
        },
    });

    const userRole = (session?.user?.role || 'SECURITY') as UserRole;

    const handleStatusChange = (visit: TruckVisit, newStatus: string) => {
        if (newStatus === 'CALLED' && !visit.assignedDock) {
            setSelectedVisit(visit);
            setShowDockModal(true);
        } else {
            statusMutation.mutate({ id: visit.id, status: newStatus });
        }
    };

    const handleAssignDock = (dockId: string) => {
        if (selectedVisit) {
            if (reassignMode) {
                reassignMutation.mutate({ id: selectedVisit.id, dockId });
            } else {
                statusMutation.mutate({ id: selectedVisit.id, status: 'CALLED', dockId });
            }
        }
    };

    const reassignMutation = useMutation({
        mutationFn: async ({ id, dockId }: { id: string; dockId: string }) => {
            const res = await fetch(`/api/visits/${id}/dock`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dockId }),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to reassign dock');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['visits'] });
            queryClient.invalidateQueries({ queryKey: ['docks'] });
            setShowDockModal(false);
            setSelectedVisit(null);
            setReassignMode(false);
        },
    });

    const handleReassignDock = (visit: TruckVisit) => {
        setSelectedVisit(visit);
        setReassignMode(true);
        setShowDockModal(true);
    };

    // Group by status
    const arrived = visits.filter(v => v.status === 'ARRIVED');
    const waiting = visits.filter(v => v.status === 'WAITING');
    const called = visits.filter(v => v.status === 'CALLED');
    const docked = visits.filter(v => v.status === 'DOCKED');
    const inService = visits.filter(v => v.status === 'IN_SERVICE');
    const onHold = visits.filter(v => v.status === 'HOLD');

    const renderVisitCard = (visit: TruckVisit) => {
        const availableTransitions = getAvailableTransitions(visit.status as VisitStatus, userRole);

        return (
            <div key={visit.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 hover:border-slate-600 transition">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-lg font-bold text-white">{visit.truckPlate}</span>
                            <PriorityBadge priority={visit.priority} size="sm" />
                        </div>
                        <p className="text-sm text-slate-400">{visit.carrier || 'Unknown carrier'}</p>
                    </div>
                    <StatusBadge status={visit.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div className="text-slate-400">
                        Type: <span className="text-slate-300">{visit.loadType}</span>
                    </div>
                    {visit.assignedDock && (
                        <div className="text-slate-400 flex items-center gap-1">
                            Dock:
                            {['CALLED', 'DOCKED'].includes(visit.status) && ['DISPATCHER', 'SUPERVISOR', 'ADMIN'].includes(userRole) ? (
                                <button
                                    onClick={() => handleReassignDock(visit)}
                                    className="text-blue-400 font-medium hover:text-blue-300 hover:underline flex items-center gap-1"
                                >
                                    {visit.assignedDock.name}
                                    <span className="text-xs">✎</span>
                                </button>
                            ) : (
                                <span className="text-blue-400 font-medium">{visit.assignedDock.name}</span>
                            )}
                        </div>
                    )}
                    {visit.driverName && (
                        <div className="text-slate-400">
                            Driver: <span className="text-slate-300">{visit.driverName}</span>
                        </div>
                    )}
                    {visit.orderRef && (
                        <div className="text-slate-400">
                            Ref: <span className="text-slate-300">{visit.orderRef}</span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                {availableTransitions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-700">
                        {availableTransitions.map(status => {
                            // Context-dependent label for WAITING transition
                            const waitingLabel = visit.status === 'ARRIVED' ? 'Add to Queue' : 'Back to Queue';
                            const waitingIcon = visit.status === 'ARRIVED' ? <Play className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />;
                            const waitingColor = visit.status === 'ARRIVED' ? 'bg-green-500 hover:bg-green-600' : 'bg-slate-500 hover:bg-slate-600';

                            const actionConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
                                CALLED: { label: 'Call to Dock', icon: <Play className="w-3 h-3" />, color: 'bg-green-500 hover:bg-green-600' },
                                DOCKED: { label: 'At Dock', icon: <Truck className="w-3 h-3" />, color: 'bg-blue-500 hover:bg-blue-600' },
                                IN_SERVICE: { label: 'Start Loading', icon: <Play className="w-3 h-3" />, color: 'bg-indigo-500 hover:bg-indigo-600' },
                                DONE: { label: 'Complete', icon: <CheckCircle className="w-3 h-3" />, color: 'bg-green-500 hover:bg-green-600' },
                                LEFT: { label: 'Departed', icon: <LogOut className="w-3 h-3" />, color: 'bg-gray-500 hover:bg-gray-600' },
                                HOLD: { label: 'Put on Hold', icon: <Pause className="w-3 h-3" />, color: 'bg-amber-500 hover:bg-amber-600' },
                                WAITING: { label: waitingLabel, icon: waitingIcon, color: waitingColor },
                                CANCELLED: { label: 'Cancel', icon: <X className="w-3 h-3" />, color: 'bg-red-500 hover:bg-red-600' },
                                NO_SHOW: { label: 'No Show', icon: <X className="w-3 h-3" />, color: 'bg-red-500 hover:bg-red-600' },
                            };

                            const config = actionConfig[status] || { label: status, icon: null, color: 'bg-slate-600' };

                            return (
                                <button
                                    key={status}
                                    onClick={() => handleStatusChange(visit, status)}
                                    disabled={statusMutation.isPending}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded transition ${config.color} disabled:opacity-50`}
                                >
                                    {config.icon}
                                    {config.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const availableDocks = docks.filter(d => d.status === 'AVAILABLE');

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Queue Management</h1>
                    <p className="text-slate-400">Manage truck queue and dock assignments</p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
                    {/* Arrived Column */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Truck className="w-5 h-5 text-blue-400" />
                            <h2 className="text-lg font-semibold text-white">Arrived ({arrived.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {arrived.map(renderVisitCard)}
                            {arrived.length === 0 && (
                                <div className="text-center py-8 text-slate-500">No trucks arrived</div>
                            )}
                        </div>
                    </div>

                    {/* Waiting Column */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            <h2 className="text-lg font-semibold text-white">Waiting ({waiting.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {waiting.map(renderVisitCard)}
                            {waiting.length === 0 && (
                                <div className="text-center py-8 text-slate-500">No trucks waiting</div>
                            )}
                        </div>
                    </div>

                    {/* In Progress Column */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Truck className="w-5 h-5 text-blue-400" />
                            <h2 className="text-lg font-semibold text-white">In Progress ({called.length + docked.length + inService.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {[...called, ...docked, ...inService].map(renderVisitCard)}
                            {called.length + docked.length + inService.length === 0 && (
                                <div className="text-center py-8 text-slate-500">No trucks in progress</div>
                            )}
                        </div>
                    </div>

                    {/* On Hold Column */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Pause className="w-5 h-5 text-amber-400" />
                            <h2 className="text-lg font-semibold text-white">On Hold ({onHold.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {onHold.map(renderVisitCard)}
                            {onHold.length === 0 && (
                                <div className="text-center py-8 text-slate-500">No trucks on hold</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Dock Assignment Modal */}
            {showDockModal && selectedVisit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-white mb-4">
                            {reassignMode ? 'Change Dock' : 'Assign Dock'} for {selectedVisit.truckPlate}
                        </h3>

                        {/* Scales option for INBOUND visits */}
                        {selectedVisit.loadType === 'INBOUND' && !reassignMode && (() => {
                            const scalesDock = docks.find(d => d.dockType === 'SCALES' && d.status === 'AVAILABLE');
                            return scalesDock ? (
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 uppercase mb-2">Weighing</div>
                                    <button
                                        onClick={() => handleAssignDock(scalesDock.id)}
                                        disabled={statusMutation.isPending || reassignMutation.isPending}
                                        className="w-full p-4 bg-amber-900/50 border border-amber-600 rounded-lg hover:bg-amber-800/50 hover:border-amber-500 transition text-left disabled:opacity-50"
                                    >
                                        <div className="font-bold text-amber-400">⚖ Scales</div>
                                        <div className="text-xs text-amber-300">Send to weighing station</div>
                                    </button>
                                </div>
                            ) : null;
                        })()}

                        {/* Regular docks */}
                        <div className="text-xs text-slate-400 uppercase mb-2">Docks</div>
                        {availableDocks.filter(d => d.dockType !== 'SCALES').length === 0 ? (
                            <p className="text-slate-400 mb-4">No docks available</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                {availableDocks.filter(d => d.dockType !== 'SCALES').map(dock => (
                                    <button
                                        key={dock.id}
                                        onClick={() => handleAssignDock(dock.id)}
                                        disabled={statusMutation.isPending || reassignMutation.isPending}
                                        className="p-4 bg-slate-700 border border-slate-600 rounded-lg hover:bg-slate-600 hover:border-blue-500 transition text-left disabled:opacity-50"
                                    >
                                        <div className="font-bold text-white">{dock.name}</div>
                                        <div className="text-xs text-slate-400">Available</div>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => { setShowDockModal(false); setSelectedVisit(null); setReassignMode(false); }}
                                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
