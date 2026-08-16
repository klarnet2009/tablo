'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { StatusBadge, PriorityBadge } from '@/components/queue/StatusBadge';
import { getAvailableTransitions, VisitStatus, UserRole } from '@/lib/status-machine';
import { sortVisitsForQueue } from '@/lib/queue-order';
import { Modal } from '@/components/Modal';
import { Field, controlClass } from '@/components/Field';
import { SpinnerBlock } from '@/components/Spinner';
import {
    Play,
    Scale,
    TriangleAlert,
    Pause,
    X,
    CheckCircle,
    Check,
    Truck,
    Clock,
    RotateCcw,
    LogOut,
    RefreshCw,
    Calendar,
    Pencil,
    Trash2,
    Save
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
    scheduledAt?: string;
    arrivedAt?: string;
    calledAt?: string;
    orderRef?: string;
    notes?: string;
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
    const [showCargoModal, setShowCargoModal] = useState(false);
    const [cargoData, setCargoData] = useState<Array<{
        externalId: number;
        truckPlate: string;
        trailerPlate: string | null;
        carrier: string | null;
        orderRef: string;
        loadType: 'INBOUND' | 'OUTBOUND';
        scheduledAt: string | null;
        scheduledEnd: string | null;
        containerNumber: string | null;
        partner: string | null;
        notes: string | null;
        externalTitle: string;
    }>>([]);
    const [cargoLoading, setCargoLoading] = useState(false);
    const [cargoError, setCargoError] = useState<string | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingVisit, setEditingVisit] = useState<TruckVisit | null>(null);
    const [editForm, setEditForm] = useState({
        truckPlate: '',
        trailerPlate: '',
        carrier: '',
        driverName: '',
        driverPhone: '',
        loadType: 'INBOUND',
        orderRef: '',
        priority: 'NORMAL',
        scheduledAt: '',
        notes: '',
    });
    const [editSaving, setEditSaving] = useState(false);

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
        // Without this the rejection reason ("Dock is already assigned to another
        // active visit", "You do not have permission for this transition") was
        // thrown away and the button just appeared to do nothing.
        onError: (error: Error) => alert(error.message),
    });

    const userRole = (session?.user?.role || 'SECURITY') as UserRole;
    // Mirrors CAN_EDIT_VISIT in the PATCH /api/visits/[id] route.
    const canEditVisit = ['DISPATCHER', 'SUPERVISOR', 'ADMIN'].includes(userRole);

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
        onError: (error: Error) => alert(error.message),
    });

    const closeDockModal = () => {
        setShowDockModal(false);
        setSelectedVisit(null);
        setReassignMode(false);
    };

    const importCargo = async () => {
        setCargoLoading(true);
        try {
            const res = await fetch('/api/visits/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cargos: cargoData }),
            });
            const result = await res.json();
            if (result.error) {
                setCargoError(result.error);
            } else {
                setShowCargoModal(false);
                setCargoData([]);
                queryClient.invalidateQueries({ queryKey: ['visits'] });
            }
        } catch (err) {
            setCargoError(err instanceof Error ? err.message : 'Failed to import');
        } finally {
            setCargoLoading(false);
        }
    };

    const saveEdit = async () => {
        if (!editingVisit) return;
        setEditSaving(true);
        try {
            const res = await fetch(`/api/visits/${editingVisit.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                queryClient.invalidateQueries({ queryKey: ['visits'] });
                setShowEditModal(false);
            } else {
                const body = await res.json().catch(() => ({}));
                alert(body.error || 'Failed to save changes');
            }
        } catch {
            alert('Failed to save changes');
        } finally {
            setEditSaving(false);
        }
    };

    const handleReassignDock = (visit: TruckVisit) => {
        setSelectedVisit(visit);
        setReassignMode(true);
        setShowDockModal(true);
    };

    // Sort by scheduledAt ascending (earliest first), then by createdAt
    const sortByScheduled = (a: TruckVisit, b: TruckVisit) => {
        const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
        const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
        if (aTime !== bTime) return aTime - bTime;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    };

    // Group by status and sort. Pre-queue columns go by appointment time; WAITING is
    // the queue itself, so it uses the same order as the public display board —
    // otherwise the two screens disagree about who is next.
    const planned = visits.filter(v => v.status === 'PLANNED').sort(sortByScheduled);
    const arrived = visits.filter(v => v.status === 'ARRIVED').sort(sortByScheduled);
    const waiting = sortVisitsForQueue(visits.filter(v => v.status === 'WAITING'));
    const called = visits.filter(v => v.status === 'CALLED').sort(sortByScheduled);
    const docked = visits.filter(v => v.status === 'DOCKED').sort(sortByScheduled);
    const inService = visits.filter(v => v.status === 'IN_SERVICE').sort(sortByScheduled);
    const onHold = visits.filter(v => v.status === 'HOLD').sort(sortByScheduled);

    const renderVisitCard = (visit: TruckVisit) => {
        const availableTransitions = getAvailableTransitions(visit.status as VisitStatus, userRole);

        return (
            <div key={visit.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-4 hover:border-slate-600 transition">
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-lg font-bold text-white whitespace-nowrap">{visit.truckPlate}</span>
                            <PriorityBadge priority={visit.priority} size="sm" />
                        </div>
                        <p className="text-sm text-slate-400 truncate max-w-[180px]">{visit.carrier || 'Unknown carrier'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {canEditVisit && <button
                            onClick={() => {
                                setEditingVisit(visit);
                                setEditForm({
                                    truckPlate: visit.truckPlate || '',
                                    trailerPlate: visit.trailerPlate || '',
                                    carrier: visit.carrier || '',
                                    driverName: visit.driverName || '',
                                    driverPhone: visit.driverPhone || '',
                                    loadType: visit.loadType || 'INBOUND',
                                    orderRef: visit.orderRef || '',
                                    priority: visit.priority || 'NORMAL',
                                    scheduledAt: visit.scheduledAt ? new Date(visit.scheduledAt).toTimeString().slice(0, 5) : '',
                                    // Was hardcoded to '', which wiped the visit's
                                    // notes on every save from this modal.
                                    notes: visit.notes || '',
                                });
                                setShowEditModal(true);
                            }}
                            className="touch-target flex items-center justify-center rounded-lg bg-slate-700/50 hover:bg-slate-600 text-slate-400 hover:text-white transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                            aria-label={`Edit ${visit.truckPlate}`}
                        >
                            <Pencil className="w-4 h-4" />
                        </button>}
                        <StatusBadge status={visit.status} />
                    </div>
                </div>

                <div className="space-y-1 text-sm mb-3">
                    <div className="flex items-center justify-between text-slate-400">
                        <span>Type: <span className="text-slate-300">{visit.loadType}</span></span>
                        {visit.scheduledAt && (
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span className="text-cyan-400 font-medium">
                                    {new Date(visit.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                                </span>
                            </span>
                        )}
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
                                    <Pencil className="w-3 h-3" />
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
                        <div className="text-slate-400 truncate" title={visit.orderRef}>
                            Ref: <span className="text-slate-300 font-mono text-xs">{visit.orderRef}</span>
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
                                ARRIVED: { label: 'Mark Arrived', icon: <Truck className="w-3 h-3" />, color: 'bg-blue-500 hover:bg-blue-600' },
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
        <div className="p-4 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white">Queue</h1>
                    <p className="text-slate-400 text-sm md:text-base">Trucks waiting, called and at the docks</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={async () => {
                            setCargoLoading(true);
                            setCargoError(null);
                            setShowCargoModal(true);
                            try {
                                const res = await fetch('/api/external/cargo-schedule');
                                const data = await res.json();
                                if (data.error) {
                                    setCargoError(data.error);
                                } else {
                                    setCargoData(data.data || []);
                                }
                            } catch (err) {
                                setCargoError(err instanceof Error ? err.message : 'Failed to fetch cargo');
                            } finally {
                                setCargoLoading(false);
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition font-medium text-sm touch-target"
                    >
                        <Calendar className="w-4 h-4" />
                        <span className="hidden sm:inline">Sync cargo</span>
                    </button>
                    <button
                        onClick={async () => {
                            if (!confirm(`Discard all ${planned.length} planned visit(s)? Trucks that have arrived are not affected. This cannot be undone.`)) return;
                            try {
                                const res = await fetch('/api/visits/clear-all', { method: 'DELETE' });
                                if (res.ok) {
                                    queryClient.invalidateQueries({ queryKey: ['visits'] });
                                } else {
                                    const body = await res.json().catch(() => ({}));
                                    alert(body.error || 'Failed to clear planned visits');
                                }
                            } catch {
                                alert('Failed to clear planned visits');
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium text-sm touch-target"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Clear planned</span>
                    </button>
                    <button
                        onClick={async () => {
                            try {
                                await fetch('/api/display/warning-trigger', { method: 'POST' });
                            } catch {
                                // Ignore errors
                            }
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition font-medium text-sm touch-target"
                        aria-label="Show the parking warning on the display board"
                    >
                        <TriangleAlert className="w-4 h-4" />
                        <span className="hidden sm:inline">Warning</span>
                    </button>
                </div>
            </div>

            {isLoading ? (
                <SpinnerBlock label="Loading the queue" />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                    {/* Planned Column */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-4">
                            <Calendar className="w-5 h-5 text-cyan-400" />
                            <h2 className="text-lg font-semibold text-white">Planned ({planned.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {planned.map(renderVisitCard)}
                            {planned.length === 0 && (
                                <div className="text-center py-8 text-slate-400">No planned visits</div>
                            )}
                        </div>
                    </div>

                    {/* Arrived Column */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-4">
                            <Truck className="w-5 h-5 text-blue-400" />
                            <h2 className="text-lg font-semibold text-white">Arrived ({arrived.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {arrived.map(renderVisitCard)}
                            {arrived.length === 0 && (
                                <div className="text-center py-8 text-slate-400">No trucks arrived</div>
                            )}
                        </div>
                    </div>

                    {/* Waiting Column */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-4">
                            <Clock className="w-5 h-5 text-yellow-400" />
                            <h2 className="text-lg font-semibold text-white">Waiting ({waiting.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {waiting.map(renderVisitCard)}
                            {waiting.length === 0 && (
                                <div className="text-center py-8 text-slate-400">No trucks waiting</div>
                            )}
                        </div>
                    </div>

                    {/* In Progress Column */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-4">
                            <Truck className="w-5 h-5 text-blue-400" />
                            <h2 className="text-lg font-semibold text-white">In Progress ({called.length + docked.length + inService.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {[...called, ...docked, ...inService].map(renderVisitCard)}
                            {called.length + docked.length + inService.length === 0 && (
                                <div className="text-center py-8 text-slate-400">No trucks in progress</div>
                            )}
                        </div>
                    </div>

                    {/* On Hold Column */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-4">
                            <Pause className="w-5 h-5 text-amber-400" />
                            <h2 className="text-lg font-semibold text-white">On Hold ({onHold.length})</h2>
                        </div>
                        <div className="space-y-3">
                            {onHold.map(renderVisitCard)}
                            {onHold.length === 0 && (
                                <div className="text-center py-8 text-slate-400">No trucks on hold</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Dock Assignment Modal */}
            {showDockModal && selectedVisit && (
                <Modal
                    title={`${reassignMode ? 'Change dock' : 'Assign dock'} for ${selectedVisit.truckPlate}`}
                    onClose={closeDockModal}
                    footer={
                        <button
                            onClick={closeDockModal}
                            className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            Cancel
                        </button>
                    }
                >
                        {/* Scales option for INBOUND visits - always available (multiple trucks can weigh) */}
                        {selectedVisit.loadType === 'INBOUND' && !reassignMode && (() => {
                            const scalesDock = docks.find(d => d.dockType === 'SCALES');
                            return scalesDock ? (
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 uppercase mb-2">Weighing</div>
                                    <button
                                        onClick={() => handleAssignDock(scalesDock.id)}
                                        disabled={statusMutation.isPending || reassignMutation.isPending}
                                        className="w-full p-4 bg-amber-900/50 border border-amber-600 rounded-lg hover:bg-amber-800/50 hover:border-amber-500 transition text-left disabled:opacity-50"
                                    >
                                        <div className="font-bold text-amber-400 flex items-center gap-2"><Scale className="w-4 h-4" /> Scales</div>
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

                </Modal>
            )}

            {/* Cargo Schedule Modal */}
            {showCargoModal && (
                <Modal
                    title="Cargo schedule"
                    size="xl"
                    onClose={() => setShowCargoModal(false)}
                    footer={
                        <div className="flex flex-1 justify-between items-center gap-3">
                            <span className="text-sm text-slate-400">
                                {cargoData.length === 0 ? 'Nothing scheduled' : `${cargoData.length} cargo(s) found`}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowCargoModal(false)}
                                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    Close
                                </button>
                                {cargoData.length > 0 && (
                                    <button
                                        onClick={importCargo}
                                        disabled={cargoLoading}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {cargoLoading ? (
                                            <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Check className="w-4 h-4" />
                                        )}
                                        Accept as planned
                                    </button>
                                )}
                            </div>
                        </div>
                    }
                >
                        {cargoLoading ? (
                            <SpinnerBlock label="Loading the cargo schedule" className="py-12" />
                        ) : cargoError ? (
                            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300">
                                {cargoError}
                            </div>
                        ) : cargoData.length === 0 ? (
                            <div className="text-center py-12 text-slate-400">
                                No cargo scheduled for the next 7 days
                            </div>
                        ) : (
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-700 sticky top-0">
                                        <tr>
                                            <th className="text-left p-3 text-slate-300">Truck Plate</th>
                                            <th className="text-left p-3 text-slate-300">Trailer</th>
                                            <th className="text-left p-3 text-slate-300">Scheduled</th>
                                            <th className="text-left p-3 text-slate-300">Order Ref</th>
                                            <th className="text-left p-3 text-slate-300">Partner</th>
                                            <th className="text-left p-3 text-slate-300">Carrier</th>
                                            <th className="text-left p-3 text-slate-300">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cargoData.map(cargo => (
                                            <tr key={cargo.externalId} className="border-t border-slate-700 hover:bg-slate-700/50">
                                                <td className="p-3 text-white font-mono">{cargo.truckPlate || '-'}</td>
                                                <td className="p-3 text-slate-300">{cargo.trailerPlate || '-'}</td>
                                                <td className="p-3 text-slate-300">
                                                    {cargo.scheduledAt ? new Date(cargo.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '-'}
                                                </td>
                                                <td className="p-3 text-slate-300 font-mono text-xs">{cargo.orderRef || '-'}</td>
                                                <td className="p-3 text-slate-300">{cargo.partner || '-'}</td>
                                                <td className="p-3 text-slate-300">{cargo.carrier || '-'}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-1 rounded text-xs ${cargo.loadType === 'INBOUND' ? 'bg-green-600' : 'bg-blue-600'}`}>
                                                        {cargo.loadType}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                </Modal>
            )}

            {/* Edit Visit Modal */}
            {showEditModal && editingVisit && (
                <Modal
                    title={`Edit ${editingVisit.truckPlate}`}
                    size="lg"
                    onClose={() => setShowEditModal(false)}
                    footer={
                        <>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="px-6 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={editSaving}
                                className="px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-500 transition disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <Save className="w-4 h-4" />
                                {editSaving ? 'Saving...' : 'Save changes'}
                            </button>
                        </>
                    }
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Truck plate" required>
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={editForm.truckPlate}
                                        onChange={e => setEditForm({ ...editForm, truckPlate: e.target.value.toUpperCase() })}
                                        className={`${controlClass} font-mono`}
                                    />
                                )}
                            </Field>
                            <Field label="Trailer plate">
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={editForm.trailerPlate}
                                        onChange={e => setEditForm({ ...editForm, trailerPlate: e.target.value.toUpperCase() })}
                                        className={`${controlClass} font-mono`}
                                    />
                                )}
                            </Field>
                        </div>

                        <Field label="Carrier">
                            {props => (
                                <input
                                    {...props}
                                    type="text"
                                    value={editForm.carrier}
                                    onChange={e => setEditForm({ ...editForm, carrier: e.target.value })}
                                    className={controlClass}
                                />
                            )}
                        </Field>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Load type">
                                {props => (
                                    <select
                                        {...props}
                                        value={editForm.loadType}
                                        onChange={e => setEditForm({ ...editForm, loadType: e.target.value })}
                                        className={controlClass}
                                    >
                                        <option value="INBOUND">Inbound</option>
                                        <option value="OUTBOUND">Outbound</option>
                                        <option value="MIXED">Mixed</option>
                                    </select>
                                )}
                            </Field>
                            <Field label="Priority">
                                {props => (
                                    <select
                                        {...props}
                                        value={editForm.priority}
                                        onChange={e => setEditForm({ ...editForm, priority: e.target.value })}
                                        className={controlClass}
                                    >
                                        <option value="NORMAL">Normal</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                        <option value="SLA">SLA</option>
                                    </select>
                                )}
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Scheduled time">
                                {props => (
                                    <input
                                        {...props}
                                        type="time"
                                        value={editForm.scheduledAt}
                                        onChange={e => setEditForm({ ...editForm, scheduledAt: e.target.value })}
                                        className={controlClass}
                                    />
                                )}
                            </Field>
                            <Field label="Order ref">
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={editForm.orderRef}
                                        onChange={e => setEditForm({ ...editForm, orderRef: e.target.value })}
                                        className={controlClass}
                                    />
                                )}
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <Field label="Driver name">
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={editForm.driverName}
                                        onChange={e => setEditForm({ ...editForm, driverName: e.target.value })}
                                        className={controlClass}
                                    />
                                )}
                            </Field>
                            <Field label="Driver phone">
                                {props => (
                                    <input
                                        {...props}
                                        type="tel"
                                        value={editForm.driverPhone}
                                        onChange={e => setEditForm({ ...editForm, driverPhone: e.target.value })}
                                        className={controlClass}
                                    />
                                )}
                            </Field>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
