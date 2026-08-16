'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Thermometer, Scale } from 'lucide-react';
import Image from 'next/image';
import { getTranslations, isValidLocale, type Locale } from '@/lib/translations';

interface TruckVisit {
    id: string;
    truckPlate: string;
    trailerPlate?: string;
    carrier?: string;
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
    const [showParkingWarning, setShowParkingWarning] = useState(false);

    // Ticks once a second. Drives the clock and, below, how stale the queue data is.
    const [nowTs, setNowTs] = useState(() => Date.now());
    const [mountedAt] = useState(() => Date.now());

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
            setNowTs(now.getTime());
        };
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch weather (Riga, Latvia as default - change coordinates as needed)
    useEffect(() => {
        const fetchWeather = async () => {
            try {
                // Using Open-Meteo free API (no API key needed) - Olaine, Latvia
                const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=56.7847&longitude=23.9378&current_weather=true');
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

    // Periodic parking warning: show for 20 seconds every 10 minutes, blink first 5 seconds
    const [warningBlinkPhase, setWarningBlinkPhase] = useState(true);
    const [warningLocaleIndex, setWarningLocaleIndex] = useState(0);

    const triggerWarning = () => {
        setShowParkingWarning(true);
        setWarningBlinkPhase(true);
        setWarningLocaleIndex(0);

        // Stop blinking after 5 seconds
        setTimeout(() => setWarningBlinkPhase(false), 5000);
        // Hide after 20 seconds
        setTimeout(() => setShowParkingWarning(false), 20000);
    };

    useEffect(() => {
        const cycleTime = 600000; // 10 minutes cycle

        // Shortly after load, then every 10 minutes. The initial call is deferred
        // so the first paint is not a full-width red banner.
        const firstRun = setTimeout(triggerWarning, 2000);
        const timer = setInterval(triggerWarning, cycleTime);
        return () => {
            clearTimeout(firstRun);
            clearInterval(timer);
        };
    }, []);

    // Poll for a manual trigger from queue management. The endpoint returns the
    // timestamp of the last trigger and we react to it changing, so the display
    // needs no write access to clear it (it is an unauthenticated screen) and
    // several screens can react to the same trigger.
    const lastTriggerRef = useRef<number | null>(null);
    useEffect(() => {
        const pollTrigger = async () => {
            try {
                const res = await fetch('/api/display/warning-trigger');
                const { triggeredAt } = await res.json();

                // First poll only records the current value: a trigger fired before
                // this screen was opened must not replay on load.
                if (lastTriggerRef.current === null) {
                    lastTriggerRef.current = triggeredAt;
                    return;
                }
                if (triggeredAt !== lastTriggerRef.current) {
                    lastTriggerRef.current = triggeredAt;
                    if (triggeredAt > 0 && !showParkingWarning) triggerWarning();
                }
            } catch {
                // Ignore errors
            }
        };

        // 10s, not the 2s this used to run at: that was 30 requests a minute —
        // 43,200 a day per screen — to watch a flag a dispatcher touches a few
        // times a day. Ten seconds is still well inside "press the button, look up
        // at the board".
        const timer = setInterval(pollTrigger, 10000);
        return () => clearInterval(timer);
    }, [showParkingWarning]);

    // Language rotation for warning (every 10 seconds)
    useEffect(() => {
        if (!showParkingWarning) return;
        const timer = setInterval(() => {
            setWarningLocaleIndex(i => (i + 1) % locales.length);
        }, 10000);
        return () => clearInterval(timer);
    }, [showParkingWarning, locales.length]);

    const warningT = getTranslations(locales[warningLocaleIndex]);

    // Connection health: measured as "how long since the last successful fetch"
    // rather than by counting error events, so a query that stops firing at all
    // (paused, suspended tab, stalled event loop) is caught the same way.
    const STALE_WARNING_MS = 15000;
    const STALE_RELOAD_MS = 60000;

    const { data: visits = [], dataUpdatedAt } = useQuery<TruckVisit[]>({
        queryKey: ['visits', 'display'],
        queryFn: async () => {
            const res = await fetch('/api/display', {
                signal: AbortSignal.timeout(4000)
            });
            if (!res.ok) throw new Error('API error');
            return await res.json();
        },
        refetchInterval: 5000,
        // KEY FIX: continue polling even when the browser tab loses focus.
        // Without this, React Query pauses refetchInterval on backgrounded/unfocused tabs,
        // which is exactly what happens on TV kiosk browsers.
        refetchIntervalInBackground: true,
        // Never pause on `navigator.onLine === false`: a paused query produces neither
        // success nor error, so connectionErrors would stay 0 and the auto-reload below
        // would never fire. This is what the removed stall watchdog used to cover.
        networkMode: 'always',
        retry: 1,
    });

    // Age of the newest data we managed to fetch. Before the first success we
    // measure from mount, so a display that never reaches the API still warns
    // and still reloads.
    const staleMs = nowTs - (dataUpdatedAt > 0 ? dataUpdatedAt : mountedAt);
    const isConnectionLost = staleMs >= STALE_WARNING_MS;
    const secondsUntilReload = Math.max(0, Math.ceil((STALE_RELOAD_MS - staleMs) / 1000));

    useEffect(() => {
        if (staleMs >= STALE_RELOAD_MS) {
            console.log('Connection lost for too long, reloading page...');
            window.location.reload();
        }
    }, [staleMs]);

    // Filter for display:
    // 1. CALLED/DOCKED/IN_SERVICE (Active dock assignments) - Top priority
    // 2. WAITING (Next in queue)
    // /api/display already returns the queue in order (see lib/queue-order.ts), so
    // these only split it, they do not re-sort it.
    const activeVisits = visits.filter(v => ['CALLED', 'DOCKED', 'IN_SERVICE'].includes(v.status));
    const waitingVisits = visits.filter(v => v.status === 'WAITING');

    // Flash notification queue. The head of the queue *is* the flash currently on
    // screen — deriving it instead of mirroring it into a second state variable
    // removes the pop/show round-trip that needed a cascading render.
    const [flashQueue, setFlashQueue] = useState<TruckVisit[]>([]);
    const currentFlash = flashQueue[0] ?? null;
    const previousVisitsRef = useRef<TruckVisit[]>([]);
    const shownFlashIdsRef = useRef<Set<string>>(new Set()); // Track already shown flashes

    // Language of the flash alternates once a second, off the shared 1s tick.
    const flashT = getTranslations(locales[Math.floor(nowTs / 1000) % locales.length]);

    // Detect new CALLED trucks and add to queue
    useEffect(() => {
        // Skip if no previous data (initial load)
        if (previousVisitsRef.current.length === 0) {
            previousVisitsRef.current = visits;
            return;
        }

        const prevCalled = previousVisitsRef.current.filter(v => v.status === 'CALLED');
        const currCalled = visits.filter(v => v.status === 'CALLED');

        // Find trucks that LEFT the CALLED status - clear them from shown set so they can be re-notified
        const leftCalledList = prevCalled.filter(v => !currCalled.some(c => c.id === v.id));
        leftCalledList.forEach(v => shownFlashIdsRef.current.delete(v.id));

        // Find ALL newly CALLED trucks (not just one)
        const newCalledList = currCalled.filter(v =>
            !prevCalled.some(p => p.id === v.id) &&
            !shownFlashIdsRef.current.has(v.id)
        );

        // Update ref
        previousVisitsRef.current = visits;

        // Add new items to queue
        if (newCalledList.length > 0) {
            newCalledList.forEach(v => shownFlashIdsRef.current.add(v.id));
            setFlashQueue(prev => [...prev, ...newCalledList]);
        }
    }, [visits]);

    // Each flash shows for 5 seconds, then the queue advances to the next one.
    // Keyed on the id, not the object: every poll produces fresh objects, and
    // depending on those would restart the timer before it ever fired.
    const currentFlashId = currentFlash?.id;
    useEffect(() => {
        if (!currentFlashId) return;
        const timer = setTimeout(() => setFlashQueue(queue => queue.slice(1)), 5000);
        return () => clearTimeout(timer);
    }, [currentFlashId]);

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
            {/* Parking Warning Overlay - Shows for 20 sec every 40 sec, blinks first 5 sec */}
            {showParkingWarning && !currentFlash && (
                <div className="absolute inset-x-0 top-0 z-30 bg-black h-12 flex items-center overflow-hidden">
                    <div className={`bg-red-600 w-full h-full flex items-center overflow-hidden ${warningBlinkPhase ? 'animate-blink-fast' : ''}`}>
                        <div className="whitespace-nowrap animate-scroll-warning text-white font-black text-xl uppercase tracking-wider">
                            ⚠️ {warningT.parkingWarning} ⚠️ {warningT.parkingWarning} ⚠️ {warningT.parkingWarning} ⚠️ {warningT.parkingWarning} ⚠️ {warningT.parkingWarning} ⚠️
                        </div>
                    </div>
                </div>
            )}

            {/* Connection Lost Warning */}
            {isConnectionLost && !currentFlash && (
                <div className="absolute inset-x-0 bottom-0 z-40 bg-red-900/95 py-2 px-4 flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-ping" />
                        <span className="text-red-100 font-bold text-sm uppercase tracking-wider">
                            ⚠ Connection Lost — Reconnecting...
                        </span>
                    </div>
                    <span className="text-red-300 text-xs">
                        Auto-reload in {secondsUntilReload}s
                    </span>
                </div>
            )}

            {/* Flash Notification Overlay */}
            {currentFlash && (
                <>
                    {/* Black background to hide previous content */}
                    <div className="absolute inset-0 z-40 bg-black"></div>
                    {/* Solid green overlay - no animation */}
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-green-600 via-green-500 to-green-700">
                        <div className="flex flex-col items-center gap-1 w-full px-4">
                            {/* MAIN: Plate Number - Large and prominent */}
                            {/* Fallback: truck plate -> trailer plate -> carrier */}
                            <div className="text-6xl font-mono font-black tracking-wider text-white drop-shadow-2xl">
                                {(() => {
                                    const isValid = (val?: string) => val && val.trim() && val.trim() !== '-' && val.trim() !== '—' && val.trim() !== 'N/A';
                                    if (isValid(currentFlash.truckPlate)) return currentFlash.truckPlate;
                                    if (isValid(currentFlash.trailerPlate)) return currentFlash.trailerPlate;
                                    if (isValid(currentFlash.carrier)) return currentFlash.carrier;
                                    return 'TRUCK';
                                })()}
                            </div>

                            {/* Destination label */}
                            <div className="text-lg text-green-100 uppercase tracking-widest font-bold mt-2">
                                {currentFlash.assignedDock?.dockType === 'SCALES' ? flashT.goToScales : flashT.proceedTo}
                            </div>

                            {/* Dock/Scales indicator - sharp blinking badge */}
                            <div className={`font-black px-8 py-2 rounded-lg shadow-xl flex items-center justify-center animate-sharp-blink ${currentFlash.assignedDock?.dockType === 'SCALES'
                                ? 'bg-yellow-300 text-black'
                                : 'bg-white text-black'
                                }`}>
                                {currentFlash.assignedDock?.dockType === 'SCALES'
                                    ? <Scale className="w-16 h-16" />
                                    : <span className="text-5xl">{currentFlash.assignedDock?.dockNumber}</span>
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
                    <div className="px-2 py-1.5 rounded" style={{ backgroundColor: '#7CBD6E' }}>
                        <Image src="/logo.png" alt="Company Logo" width={100} height={40} className="h-6 w-auto" unoptimized />
                    </div>
                    <div className="text-base md:text-lg text-slate-400 uppercase tracking-wider">{t.queueStatus}</div>
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
                <div className="grid grid-cols-8 gap-2 text-xs text-slate-400 font-bold uppercase px-2">
                    <div className="col-span-6">{t.plateNumber}</div>
                    <div className="col-span-2 text-right">{t.dockStatus}</div>
                </div>

                {/* Rows */}
                {displayList.map((visit, idx) => {
                    const isCalled = visit.status === 'CALLED';
                    const isDocked = visit.status === 'DOCKED';
                    const isLoading = visit.status === 'IN_SERVICE';
                    const isActive = isCalled || isDocked || isLoading;

                    return (
                        <div
                            key={visit.id}
                            className={`grid grid-cols-8 gap-2 items-center px-2 py-1 rounded ${isActive
                                ? isLoading
                                    ? 'bg-indigo-900/40 border-l-4 border-indigo-500'
                                    : isDocked
                                        ? 'bg-blue-900/40 border-l-4 border-blue-500'
                                        : 'bg-green-900/40 border-l-4 border-green-500 animate-pulse-slow'
                                : 'bg-slate-900 border-l-4 border-slate-700'
                                }`}
                        >
                            <div className={`col-span-6 font-mono text-2xl font-bold tracking-wider overflow-hidden ${isLoading ? 'text-indigo-400' : isDocked ? 'text-blue-400' : isCalled ? 'text-green-400' : 'text-white'}`}>
                                {/* Marquee scrolling text for truck/trailer/carrier */}
                                {(() => {
                                    // Helper to check if value is valid (not empty, -, or whitespace)
                                    const isValid = (val?: string) => val && val.trim() && val.trim() !== '-' && val.trim() !== '—' && val.trim() !== 'N/A';

                                    const parts = [
                                        isValid(visit.truckPlate) ? visit.truckPlate : null,
                                        isValid(visit.trailerPlate) ? visit.trailerPlate : null,
                                        isValid(visit.carrier) ? visit.carrier : null,
                                    ].filter(Boolean);

                                    // If no truck plate, just show carrier or "UNKNOWN"
                                    const text = parts.length > 0 ? parts.join(' | ') : 'UNKNOWN';
                                    const needsScroll = text.length > (isActive ? 12 : 16);

                                    return needsScroll ? (
                                        <div key={`marquee-${visit.id}`} className="marquee-container">
                                            <span className="marquee-text" style={{ animationDelay: `${idx * 0.5}s` }}>
                                                {text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{text}
                                            </span>
                                        </div>
                                    ) : (
                                        <span>{text}</span>
                                    );
                                })()}
                            </div>
                            <div className="col-span-2 text-right flex items-center justify-end gap-2 whitespace-nowrap">
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
                                            <span className="text-xl text-yellow-300 uppercase">{t.goToScales}</span>
                                            <div className="bg-yellow-300 text-black font-bold text-xl rounded animate-periodic-blink flex items-center justify-center w-[2.5rem] h-[1.75rem]">
                                                <Scale className="w-5 h-5" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-xl text-green-300 uppercase">{t.proceedTo}</span>
                                            <div className="bg-green-600 text-black font-bold px-3 py-0 text-xl rounded animate-periodic-blink min-w-[2.5rem] text-center">
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
                    <div className="flex-1 flex items-center justify-center text-slate-400 text-2xl md:text-4xl font-semibold">
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
