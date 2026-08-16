'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, ArrowLeft, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Field, controlClass } from '@/components/Field';

export default function RegisterPage() {
    const queryClient = useQueryClient();
    const [success, setSuccess] = useState(false);
    const [createdPlate, setCreatedPlate] = useState('');

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

    const mutation = useMutation({
        mutationFn: async (data: typeof form) => {
            const res = await fetch('/api/visits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Failed to register truck');
            }
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['visits'] });
            setCreatedPlate(data.truckPlate);
            setSuccess(true);
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        mutation.mutate(form);
    };

    const handleReset = () => {
        setForm({
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
        setSuccess(false);
        setCreatedPlate('');
    };

    if (success) {
        return (
            <div className="p-6 max-w-lg mx-auto">
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-8 text-center">
                    <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">Truck Registered!</h2>
                    <p className="text-slate-300 mb-2">
                        Plate: <span className="font-mono font-bold text-green-400">{createdPlate}</span>
                    </p>
                    <p className="text-slate-400 text-sm mb-6">
                        The truck has been added to the queue.
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button
                            onClick={handleReset}
                            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                        >
                            Register Another
                        </button>
                        <Link
                            href="/"
                            className="px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition"
                        >
                            Go to Dashboard
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <Link href="/queue" className="p-2 hover:bg-slate-700 rounded-lg transition touch-target flex items-center justify-center">
                        <ArrowLeft className="w-5 h-5 text-slate-400" />
                    </Link>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-white">Register Truck</h1>
                        <p className="text-slate-400 text-sm md:text-base">Add a new truck to the queue</p>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {mutation.error && (
                        <div role="alert" className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                            {mutation.error.message}
                        </div>
                    )}

                    {/* Truck Info */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                            <Truck className="w-5 h-5" />
                            Vehicle information
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Truck plate" required>
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={form.truckPlate}
                                        onChange={e => setForm({ ...form, truckPlate: e.target.value.toUpperCase() })}
                                        className={`${controlClass} font-mono text-lg`}
                                        placeholder="AB1234CD"
                                        required
                                    />
                                )}
                            </Field>
                            <Field label="Trailer plate">
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={form.trailerPlate}
                                        onChange={e => setForm({ ...form, trailerPlate: e.target.value.toUpperCase() })}
                                        className={`${controlClass} font-mono`}
                                        placeholder="Optional"
                                    />
                                )}
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Load type" required>
                                {props => (
                                    <select
                                        {...props}
                                        value={form.loadType}
                                        onChange={e => setForm({ ...form, loadType: e.target.value })}
                                        className={controlClass}
                                    >
                                        <option value="INBOUND">Inbound (unload)</option>
                                        <option value="OUTBOUND">Outbound (load)</option>
                                        <option value="MIXED">Mixed</option>
                                    </select>
                                )}
                            </Field>
                            <Field label="Priority">
                                {props => (
                                    <select
                                        {...props}
                                        value={form.priority}
                                        onChange={e => setForm({ ...form, priority: e.target.value })}
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

                        <Field label="Scheduled time" hint="Expected arrival time (optional)">
                            {props => (
                                <input
                                    {...props}
                                    type="time"
                                    value={form.scheduledAt}
                                    onChange={e => setForm({ ...form, scheduledAt: e.target.value })}
                                    className={`${controlClass} md:w-48`}
                                />
                            )}
                        </Field>
                    </div>

                    {/* Carrier & Driver */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 space-y-4">
                        <h2 className="text-lg font-semibold text-white">Carrier and driver</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Carrier / company">
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={form.carrier}
                                        onChange={e => setForm({ ...form, carrier: e.target.value })}
                                        className={controlClass}
                                        placeholder="Transport company name"
                                    />
                                )}
                            </Field>
                            <Field label="Order / shipment ref">
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={form.orderRef}
                                        onChange={e => setForm({ ...form, orderRef: e.target.value })}
                                        className={controlClass}
                                        placeholder="PO-12345"
                                    />
                                )}
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Driver name">
                                {props => (
                                    <input
                                        {...props}
                                        type="text"
                                        value={form.driverName}
                                        onChange={e => setForm({ ...form, driverName: e.target.value })}
                                        className={controlClass}
                                        placeholder="John Doe"
                                    />
                                )}
                            </Field>
                            <Field label="Driver phone">
                                {props => (
                                    <input
                                        {...props}
                                        type="tel"
                                        value={form.driverPhone}
                                        onChange={e => setForm({ ...form, driverPhone: e.target.value })}
                                        className={controlClass}
                                        placeholder="+371 ..."
                                    />
                                )}
                            </Field>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                        <Field label="Notes">
                            {props => (
                                <textarea
                                    {...props}
                                    value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                    rows={3}
                                    className={`${controlClass} resize-none`}
                                    placeholder="Any special instructions..."
                                />
                            )}
                        </Field>
                    </div>

                    {/* Submit */}
                    <div className="flex gap-4">
                        <button
                            type="submit"
                            disabled={mutation.isPending}
                            className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-cyan-600 transition disabled:opacity-50"
                        >
                            {mutation.isPending ? 'Registering...' : 'Register Truck'}
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
