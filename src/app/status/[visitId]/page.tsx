'use client';

import { useQuery } from '@tanstack/react-query';
import { Truck, MapPin, Clock, AlertCircle } from 'lucide-react';
import { use, useState, useEffect } from 'react';

// Status mapping for driver messaging
const statusMessages: Record<string, { title: string; desc: string; color: string; bg: string }> = {
    NEW: { title: 'Registered', desc: 'Please proceed to waiting area', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    ARRIVED: { title: 'Checked In', desc: 'You are in the queue', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    WAITING: { title: 'Waiting', desc: 'Please wait for your turn', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    CALLED: { title: 'GO TO DOCK!', desc: 'Proceed immediately to dock', color: 'text-green-400', bg: 'bg-green-500/20' },
    DOCKED: { title: 'At Dock', desc: 'Prepare for loading/unloading', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    IN_SERVICE: { title: 'Loading...', desc: 'Operations in progress', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    DONE: { title: 'Finished', desc: 'Please proceed to exit', color: 'text-green-400', bg: 'bg-green-500/10' },
    LEFT: { title: 'Departed', desc: 'Have a safe trip!', color: 'text-slate-400', bg: 'bg-slate-800' },
    HOLD: { title: 'On Hold', desc: 'Please contact dispatcher', color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

export default function DriverStatusPage({ params }: { params: Promise<{ visitId: string }> }) {
    const { visitId } = use(params);

    const { data: visit, isLoading, error } = useQuery({
        queryKey: ['visit', visitId],
        queryFn: async () => {
            const res = await fetch(`/api/visits/${visitId}/status`); // Create specialized public endpoint later if needed, reuse status endpoint for now assuming basic auth or public wrapper
            // For MVP, we might need a public endpoint. Let's assume we use the main visits API.
            // NOTE: In real prod, this requires a public secure token. 
            // For MVP, we will try to handle this gracefully or assume logged in/public access pattern.
            // Actually, let's make a mock data fetch for now or use the public display logic if auth fails.
            return null;
        },
        enabled: false // Disable direct fetch for now as we don't have a public endpoint structured yet
    });

    // Since we don't have a public API endpoint for single visit details without auth in the plan,
    // I will create a simple placeholder UI that would be hydrated by real data.
    // In a real app we'd need a public generic endpoint like /api/public/status/[token]

    return (
        <div className="min-h-screen bg-slate-900 text-white p-6 flex flex-col items-center justify-center text-center">
            <div className="w-full max-w-md space-y-8">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto border-4 border-slate-700">
                    <Truck className="w-10 h-10 text-blue-400" />
                </div>

                <div>
                    <h1 className="text-3xl font-bold mb-2">Truck Status</h1>
                    <p className="text-slate-400">Scan QR or check display board</p>
                </div>

                <div className="p-6 rounded-2xl bg-slate-800 border border-slate-700">
                    <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Driver Portal</h2>
                    <p className="text-slate-400 text-sm">
                        This feature requires a unique secure token for each visit.
                        In this MVP, please refer to the <span className="text-white font-bold">Public Display Board</span>.
                    </p>
                </div>

                <div className="text-xs text-slate-500 mt-8">
                    Tablo Queue Management System
                </div>
            </div>
        </div>
    );
}
