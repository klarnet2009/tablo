'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck, ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';

export default function EditVisitPage() {
    const router = useRouter();
    const params = useParams();
    const queryClient = useQueryClient();
    const visitId = params.id as string;

    const [form, setForm] = useState({
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

    const { data: visit, isLoading } = useQuery({
        queryKey: ['visit', visitId],
        queryFn: async () => {
            const res = await fetch(`/api/visits/${visitId}`);
            if (!res.ok) throw new Error('Failed to fetch visit');
            return res.json();
        },
        enabled: !!visitId,
    });

    useEffect(() => {
        if (visit) {
            setForm({
                truckPlate: visit.truckPlate || '',
                trailerPlate: visit.trailerPlate || '',
                carrier: visit.carrier || '',
                driverName: visit.driverName || '',
                driverPhone: visit.driverPhone || '',
                loadType: visit.loadType || 'INBOUND',
                orderRef: visit.orderRef || '',
                priority: visit.priority || 'NORMAL',
                scheduledAt: visit.scheduledAt ? new Date(visit.scheduledAt).toTimeString().slice(0, 5) : '',
                notes: visit.notes || '',
            });
        }
    }, [visit]);

    const mutation = useMutation({
        mutationFn: async (data: typeof form) => {
            const res = await fetch(`/api/visits/${visitId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to update visit');
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['visits'] });
            queryClient.invalidateQueries({ queryKey: ['visit', visitId] });
            router.push('/');
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate(form);
    };

    if (isLoading) {
        return (
            <div className="p-6 max-w-2xl mx-auto">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/" className="p-2 hover:bg-slate-700 rounded-lg transition">
                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Edit Truck Visit</h1>
                        <p className="text-slate-400">Update truck information</p>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {mutation.error && (
                        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                            {mutation.error.message}
                        </div>
                    )}

                    {/* Truck Info */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Truck className="w-5 h-5" />
                            Vehicle Information
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Truck Plate *
                                </label>
                                <input
                                    type="text"
                                    value={form.truckPlate}
                                    onChange={(e) => setForm({ ...form, truckPlate: e.target.value.toUpperCase() })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white font-mono text-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="AB1234CD"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Trailer Plate
                                </label>
                                <input
                                    type="text"
                                    value={form.trailerPlate}
                                    onChange={(e) => setForm({ ...form, trailerPlate: e.target.value.toUpperCase() })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white font-mono placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Optional"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Load Type *
                                </label>
                                <select
                                    value={form.loadType}
                                    onChange={(e) => setForm({ ...form, loadType: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="INBOUND">Inbound (Unload)</option>
                                    <option value="OUTBOUND">Outbound (Load)</option>
                                    <option value="MIXED">Mixed</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Priority
                                </label>
                                <select
                                    value={form.priority}
                                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="NORMAL">Normal</option>
                                    <option value="HIGH">High</option>
                                    <option value="URGENT">Urgent</option>
                                    <option value="SLA">SLA</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                Scheduled Time
                            </label>
                            <input
                                type="time"
                                value={form.scheduledAt}
                                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                                className="w-full md:w-48 px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-slate-500 mt-1">Expected arrival time</p>
                        </div>
                    </div>

                    {/* Carrier & Driver */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
                        <h3 className="text-lg font-semibold text-white">Carrier & Driver</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Carrier / Company
                                </label>
                                <input
                                    type="text"
                                    value={form.carrier}
                                    onChange={(e) => setForm({ ...form, carrier: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Transport company name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Order / Shipment Ref
                                </label>
                                <input
                                    type="text"
                                    value={form.orderRef}
                                    onChange={(e) => setForm({ ...form, orderRef: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="PO-12345"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Driver Name
                                </label>
                                <input
                                    type="text"
                                    value={form.driverName}
                                    onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="John Doe"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                                    Driver Phone
                                </label>
                                <input
                                    type="tel"
                                    value={form.driverPhone}
                                    onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
                                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="+371 ..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Notes
                        </label>
                        <textarea
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                            placeholder="Any special instructions..."
                        />
                    </div>

                    {/* Submit */}
                    <div className="flex gap-4">
                        <button
                            type="submit"
                            disabled={mutation.isPending}
                            className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-cyan-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            {mutation.isPending ? 'Saving...' : 'Save Changes'}
                        </button>
                        <Link
                            href="/"
                            className="px-6 py-3 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                        >
                            Cancel
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
}
