'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Thermometer, Scale } from 'lucide-react';
import { getTranslations, isValidLocale, type Locale } from '@/lib/translations';

interface TruckVisit {
    id: string;
    truckPlate: string;
    status: string;
    queuePosition?: number;
    assignedDock?: { name: string; dockNumber: number; dockType: string };
}

interface WeatherData {
    temp: number;
}

// Main display content component
function DisplayContent() {
    const searchParams = useSearchParams();
    const langParam = searchParams.get('lang');

    // Supported languages for rotation
    const locales: Locale[] = ['en', 'pl'];
    const [localeIndex, setLocaleIndex] = useState(0);

    // Auto-rotate language every 10 seconds (like train stations)
    // URL param ?lang=xx overrides and locks to specific language
    useEffect(() => {
        if (isValidLocale(langParam)) return; // Don't rotate if locked via URL

        const timer = setInterval(() => {
            setLocaleIndex(i => (i + 1) % locales.length);
        }, 7000); // 7 seconds per language

        return () => clearInterval(timer);
    }, [langParam, locales.length]);

    const locale: Locale = isValidLocale(langParam) ? langParam : locales[localeIndex];
    const t = getTranslations(locale);

    const [currentTime, setCurrentTime] = useState<string>('');
    const [weather, setWeather] = useState<WeatherData | null>(null);

    useEffect(() => {
        // Update clock every second
        const timer = setInterval(() => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch weather (Riga, Latvia as default - change coordinates as needed)
    useEffect(() => {
        const fetchWeather = async () => {
            try {
                // Using Open-Meteo free API (no API key needed)
                const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=56.9496&longitude=24.1052&current_weather=true');
                const data = await res.json();
                if (data.current_weather) {
                    setWeather({ temp: Math.round(data.current_weather.temperature) });
                }
            } catch (e) {
                console.error('Failed to fetch weather:', e);
            }
        };
        fetchWeather();
        // Refresh weather every 15 minutes
        const timer = setInterval(fetchWeather, 15 * 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    const { data: visits = [] } = useQuery<TruckVisit[]>({
        queryKey: ['visits', 'display'],
        queryFn: async () => {
            // Fetch active visits (CALLED, DOCKED) + waiting
            const res = await fetch('/api/visits?active=true');
            const data = await res.json();
            return data;
        },
        refetchInterval: 5000, // Fast refresh for display
    });

    // Filter for display:
    // 1. CALLED/DOCKED/IN_SERVICE (Active dock assignments) - Top priority
    // 2. WAITING (Next in queue)
    const activeVisits = visits.filter(v => ['CALLED', 'DOCKED', 'IN_SERVICE'].includes(v.status));
    const waitingVisits = visits
        .filter(v => v.status === 'WAITING')
        .sort((a, b) => (a.queuePosition || 999) - (b.queuePosition || 999));

    // Flash notification system
    const [currentFlash, setCurrentFlash] = useState<TruckVisit | null>(null);
    const previousVisitsRef = useRef<TruckVisit[]>([]);

    // Fast language rotation for flash notification (1 second)
    const [flashLocaleIndex, setFlashLocaleIndex] = useState(0);
    useEffect(() => {
        if (!currentFlash) return;
        const timer = setInterval(() => {
            setFlashLocaleIndex(i => (i + 1) % locales.length);
        }, 1000); // 1 second rotation during flash
        return () => clearInterval(timer);
    }, [currentFlash, locales.length]);

    // Use fast-rotating locale for flash, normal for rest
    const flashT = getTranslations(locales[flashLocaleIndex]);

    useEffect(() => {
        const prevCalled = previousVisitsRef.current.filter(v => v.status === 'CALLED');
        const currCalled = visits.filter(v => v.status === 'CALLED');

        // Find newly CALLED truck (exists in current but not in previous)
        const newCalled = currCalled.find(v =>
            !prevCalled.some(p => p.id === v.id)
        );

        if (newCalled && previousVisitsRef.current.length > 0) {
            setCurrentFlash(newCalled);
            setFlashLocaleIndex(0); // Reset to first language
            const timer = setTimeout(() => setCurrentFlash(null), 5000);
            return () => clearTimeout(timer);
        }

        previousVisitsRef.current = visits;
    }, [visits]);

    // Pagination for small screen if too many items
    const [page, setPage] = useState(0);
    const itemsPerPage = 3; // Fits vertically on 224px height

    useEffect(() => {
        const totalItems = activeVisits.length + waitingVisits.length;
        if (totalItems > itemsPerPage) {
            const timer = setInterval(() => {
                setPage(p => {
                    const maxPage = Math.ceil(totalItems / itemsPerPage) - 1;
                    return p >= maxPage ? 0 : p + 1;
                });
            }, 10000); // Change page every 10s
            return () => clearInterval(timer);
        }
    }, [activeVisits.length, waitingVisits.length]);

    // Combine lists for display
    const displayList = [...activeVisits, ...waitingVisits].slice(page * itemsPerPage, (page + 1) * itemsPerPage);

    return (
        <div className="w-[576px] h-[224px] bg-black text-white overflow-hidden p-2 flex flex-col relative">
            {/* Flash Notification Overlay */}
            {currentFlash && (
                <>
                    {/* Black background to hide previous content */}
                    <div className="absolute inset-0 z-40 bg-black"></div>
                    {/* Pulsing green overlay on top */}
                    <div className="absolute inset-0 z-50 flex items-center justify-center animate-pulse bg-gradient-to-br from-green-600 via-green-500 to-green-700">
                        <div className="flex flex-col items-center gap-1 w-full px-4">
                            {/* MAIN: Plate Number - Large and prominent */}
                            <div className="text-6xl font-mono font-black tracking-wider text-white drop-shadow-2xl animate-bounce">
                                {currentFlash.truckPlate}
                            </div>

                            {/* Destination label */}
                            <div className="text-lg text-green-100 uppercase tracking-widest font-bold mt-2">
                                {currentFlash.assignedDock?.dockType === 'SCALES' ? flashT.goToScales : flashT.proceedTo}
                            </div>

                            {/* Dock/Scales indicator - smaller, secondary */}
                            <div className={`text-5xl font-black px-8 py-1 rounded-lg shadow-xl ${currentFlash.assignedDock?.dockType === 'SCALES'
                                ? 'bg-yellow-400 text-black'
                                : 'bg-white text-black'
                                }`}>
                                {currentFlash.assignedDock?.dockType === 'SCALES'
                                    ? '⚖'
                                    : currentFlash.assignedDock?.dockNumber
                                }
                            </div>

                            {/* Action Text */}
                            <div className="text-xl font-black text-white uppercase tracking-widest animate-pulse drop-shadow-lg mt-1">
                                {flashT.proceedNow}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Header Bar */}
            <div className="flex items-center justify-between border-b-2 border-slate-700 pb-1 mb-1">
                <div className="flex items-center gap-2">
                    <div className="bg-blue-600 px-2 py-0.5 rounded text-lg font-bold">ITERUM</div>
                    <div className="text-sm text-slate-400 uppercase tracking-wider">{t.queueStatus}</div>
                </div>
                <div className="flex items-center gap-3">
                    {weather && (
                        <div className="flex items-center gap-1 text-lg text-cyan-400">
                            <Thermometer className="w-5 h-5" />
                            <span className="font-bold">{weather.temp}°C</span>
                        </div>
                    )}
                    <div className="text-2xl font-mono font-bold text-yellow-500">{currentTime}</div>
                </div>
            </div>

            {/* Main Content Table - Optimized for readability from distance */}
            <div className="flex-1 flex flex-col gap-1">
                {/* Table Header */}
                <div className="grid grid-cols-6 gap-2 text-xs text-slate-500 font-bold uppercase px-2">
                    <div className="col-span-1">{t.pos}</div>
                    <div className="col-span-2">{t.plateNumber}</div>
                    <div className="col-span-3 text-right">{t.dockStatus}</div>
                </div>

                {/* Rows */}
                {displayList.map((visit, idx) => {
                    const isCalled = visit.status === 'CALLED';
                    const isDocked = visit.status === 'DOCKED';
                    const isLoading = visit.status === 'IN_SERVICE';
                    const isActive = isCalled || isDocked || isLoading;
                    const globalIdx = (page * itemsPerPage) + idx + 1;

                    return (
                        <div
                            key={visit.id}
                            className={`grid grid-cols-6 gap-2 items-center px-2 py-1 rounded ${isActive
                                ? isLoading
                                    ? 'bg-indigo-900/40 border-l-4 border-indigo-500'
                                    : isDocked
                                        ? 'bg-blue-900/40 border-l-4 border-blue-500'
                                        : 'bg-green-900/40 border-l-4 border-green-500 animate-pulse-slow'
                                : 'bg-slate-900 border-l-4 border-slate-700'
                                }`}
                        >
                            <div className="col-span-1 font-mono text-xl text-slate-400">
                                #{isActive ? '' : visit.queuePosition || globalIdx}
                            </div>
                            <div className={`col-span-2 font-mono text-2xl font-bold tracking-wider ${isLoading ? 'text-indigo-400' : isDocked ? 'text-blue-400' : isCalled ? 'text-green-400' : 'text-white'
                                }`}>
                                {visit.truckPlate}
                            </div>
                            <div className="col-span-3 text-right flex items-center justify-end gap-2">
                                {isLoading && visit.assignedDock ? (
                                    visit.assignedDock.dockType === 'SCALES' ? (
                                        <>
                                            <span className="text-xs text-yellow-300 uppercase font-bold">{t.weighing}</span>
                                            <div className="bg-yellow-300 text-black font-black px-3 py-1 rounded flex items-center justify-center">
                                                <Scale className="w-6 h-6" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xs text-indigo-300 uppercase">{t.loading}</span>
                                            <div className="bg-indigo-600 text-white font-bold px-3 py-0 text-xl rounded">
                                                {visit.assignedDock.dockNumber}
                                            </div>
                                        </>
                                    )
                                ) : isDocked && visit.assignedDock ? (
                                    visit.assignedDock.dockType === 'SCALES' ? (
                                        <>
                                            <span className="text-xs text-yellow-300 uppercase font-bold">{t.atScales}</span>
                                            <div className="bg-yellow-300 text-black font-black px-3 py-1 rounded flex items-center justify-center">
                                                <Scale className="w-6 h-6" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xs text-blue-300 uppercase">{t.atDock}</span>
                                            <div className="bg-blue-600 text-white font-bold px-3 py-0 text-xl rounded">
                                                {visit.assignedDock.dockNumber}
                                            </div>
                                        </>
                                    )
                                ) : isCalled && visit.assignedDock ? (
                                    visit.assignedDock.dockType === 'SCALES' ? (
                                        <>
                                            <span className="text-base text-yellow-300 uppercase font-black">{t.goToScales}</span>
                                            <div className="bg-yellow-300 text-black font-black px-3 py-1 rounded flex items-center justify-center animate-pulse">
                                                <Scale className="w-6 h-6" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-base text-green-300 uppercase font-black">{t.proceedTo}</span>
                                            <div className="bg-green-600 text-black font-bold px-3 py-0 text-xl rounded">
                                                {visit.assignedDock.dockNumber}
                                            </div>
                                        </>
                                    )
                                ) : (
                                    <span className="text-slate-400 font-medium">{t.waiting}</span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {displayList.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-slate-500 text-lg">
                        {t.noTrucks}
                    </div>
                )}
            </div>

            {/* Footer / Paginator dots */}
            <div className="absolute bottom-1 right-2 flex gap-1">
                {Array.from({ length: Math.ceil((activeVisits.length + waitingVisits.length) / itemsPerPage) }).map((_, i) => (
                    <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full ${i === page ? 'bg-blue-500' : 'bg-slate-700'}`}
                    />
                ))}
            </div>
        </div>
    );
}

// Wrap in Suspense for Next.js 16 static generation compatibility
export default function DisplayPage() {
    return (
        <Suspense fallback={
            <div className="w-[576px] h-[224px] bg-black text-white flex items-center justify-center">
                <div className="text-slate-400">Loading...</div>
            </div>
        }>
            <DisplayContent />
        </Suspense>
    );
}
