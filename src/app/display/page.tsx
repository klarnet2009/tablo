'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Thermometer, Scale, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import { getTranslations, isValidLocale, type Locale } from '@/lib/translations';
import { shouldReloadForBuild } from '@/lib/build-id';
import { boardPlateText } from '@/lib/board-plate';
import { boardRowStatus, type BoardRowStatus } from '@/lib/board-status';

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

// Row colour per status: tint, leading stripe, label and badge share one hue.
const ROW_TONE: Record<BoardRowStatus['tone'], { row: string; label: string; badge: string }> = {
    called:  { row: 'bg-green-900/40 border-green-500 animate-pulse-slow', label: 'text-green-300', badge: 'bg-green-500' },
    docked:  { row: 'bg-blue-900/40 border-blue-500', label: 'text-blue-300', badge: 'bg-blue-300' },
    loading: { row: 'bg-indigo-900/40 border-indigo-500', label: 'text-indigo-300', badge: 'bg-indigo-300' },
    waiting: { row: 'bg-slate-900 border-slate-700', label: 'text-slate-300', badge: 'bg-slate-300' },
};

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
    // Single 1s tick. Drives the clock, the connection dot and the flash language.
    const [nowTs, setNowTs] = useState(() => Date.now());
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [showParkingWarning, setShowParkingWarning] = useState(false);

    // The pointer is hidden until it moves, and again 3s after it stops. After a
    // reboot the compositor parks it in the middle of the panel, over the rows. This
    // is done by the page because the kiosk's Chromium is a Wayland client, which
    // unclutter (an X tool) cannot reach.
    const [pointerVisible, setPointerVisible] = useState(false);
    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onMove = () => {
            setPointerVisible(true);
            clearTimeout(timer);
            timer = setTimeout(() => setPointerVisible(false), 3000);
        };
        window.addEventListener('pointermove', onMove);
        return () => {
            window.removeEventListener('pointermove', onMove);
            clearTimeout(timer);
        };
    }, []);
    // On the whole document, not the board: the pointer can rest outside the
    // 576x224 surface too.
    useEffect(() => {
        document.documentElement.style.cursor = pointerVisible ? '' : 'none';
        return () => { document.documentElement.style.cursor = ''; };
    }, [pointerVisible]);

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
            setNowTs(now.getTime());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch weather (Riga, Latvia as default - change coordinates as needed)
    useEffect(() => {
        const fetchWeather = async () => {
            try {
                // Using Open-Meteo free API (no API key needed) - Olaine, Latvia
                const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=56.7847&longitude=23.9378&current_weather=true', {
                    signal: AbortSignal.timeout(8000),
                });
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

    // Periodic parking warning: shown for 20 seconds every 30 minutes, blinking for the
    // first 5. A dispatcher can still raise it at any time from queue management.
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
        // Every 30 minutes, and not on load: the board reloads on every deploy and
        // reboot, and a red banner each time is what made it feel constant. At 10
        // minutes it covered the header a third of every hour a driver waited.
        const timer = setInterval(triggerWarning, 30 * 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    // Poll for a manual trigger from queue management. The endpoint reports the
    // timestamp of the last trigger and we react to it changing, so this screen —
    // which is unauthenticated — needs no write access to clear a flag, and several
    // boards react to one trigger.
    const lastTriggerRef = useRef<number | null>(null);
    useEffect(() => {
        const pollTrigger = async () => {
            try {
                const res = await fetch('/api/display/warning-trigger', {
                    signal: AbortSignal.timeout(3000),
                });
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

        // 10s, not 2s: that was 43,200 requests a day per screen to watch a flag a
        // dispatcher presses a few times a day.
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

    // Real-time feed via Server-Sent Events.
    //   - EventSource auto-reconnects on transport errors.
    //   - `visits` carries the active queue, and is sent only when it changes.
    //   - `ping` arrives every 15s carrying the server's current revision. It is a
    //     real event, not an SSE comment, so this client can actually observe it:
    //     that is what proves the stream is alive on a yard where nothing moves,
    //     and what lets us notice a stream that is open but no longer delivering.
    //   - The 90s watchdog is the last resort and forces a full reload.
    const [visits, setVisits] = useState<TruckVisit[]>([]);
    const [sseOpen, setSseOpen] = useState(false);
    const [lastSuccessTime, setLastSuccessTime] = useState<Date>(new Date());

    const HARD_RELOAD_AFTER_MS = 90000;
    // Two missed pings. Pings arrive every 15s, so 35s tolerates one lost ping
    // without turning the status dot red on a perfectly healthy screen.
    const STALE_THRESHOLD_SEC = 35;
    // If a ping says the server is ahead of us and the gap survives this long, the
    // stream is open but no longer delivering payloads: reconnect.
    const FRESHNESS_RECONNECT_AFTER_MS = 20000;

    // Held in a ref so it stays out of the connection effect's dependencies: the
    // pinned id cannot change without a full page load, and re-running that effect
    // would tear down and rebuild the SSE stream.
    const pinnedDeviceIdRef = useRef(searchParams.get('deviceId'));
    const deviceIdRef = useRef<string>('');
    const esRef = useRef<EventSource | null>(null);
    const connectRef = useRef<(() => void) | null>(null);
    const clientRevisionRef = useRef<number | null>(null);
    const staleSinceRef = useRef<number | null>(null);
    // The build the page was served by. A ping reporting a different one means a
    // deployment happened while this board sat here for weeks; the stream reconnects
    // in seconds after a restart, so the silence watchdog never notices.
    const buildRef = useRef<string | null>(null);

    // Fire-and-forget. keepalive lets it survive the page being closed.
    const sendAck = (revision: number) => {
        try {
            fetch('/api/display/ack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: deviceIdRef.current, revision }),
                keepalive: true,
            }).catch(() => { /* swallow */ });
        } catch { /* swallow */ }
    };

    useEffect(() => {
        // A kiosk started with ?deviceId=... pins its identity in the URL. Without
        // that, the id lives in localStorage — which a kiosk profile wipe or an
        // incognito launch resets, producing a fresh Display row on every boot and
        // filling the back office with dead screens.
        let deviceId: string | null = pinnedDeviceIdRef.current;
        try {
            deviceId = deviceId || localStorage.getItem('displayDeviceId');
            if (!deviceId) {
                deviceId = typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                localStorage.setItem('displayDeviceId', deviceId);
            }
        } catch {
            deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
        deviceIdRef.current = deviceId;

        const connect = () => {
            // Close any existing connection first (visibility resume path)
            esRef.current?.close();
            const url = `/api/display/stream?deviceId=${encodeURIComponent(deviceId!)}`;
            const es = new EventSource(url);
            esRef.current = es;

            es.onopen = () => setSseOpen(true);
            es.onerror = () => {
                setSseOpen(false);
                // Browser will auto-reconnect while readyState !== CLOSED.
                // If it actually closed (rare, e.g. server 4xx) we reconnect manually.
                if (es.readyState === EventSource.CLOSED) {
                    setTimeout(connect, 2000);
                }
            };
            es.addEventListener('visits', (ev) => {
                try {
                    const parsed = JSON.parse((ev as MessageEvent).data);
                    // Payload shape is { revision, visits }. Tolerate a bare array in
                    // case of a mixed deploy.
                    const visitsArray: TruckVisit[] = Array.isArray(parsed)
                        ? parsed
                        : Array.isArray(parsed?.visits) ? parsed.visits : [];
                    if (typeof parsed?.revision === 'number') {
                        clientRevisionRef.current = parsed.revision;
                        // Acknowledge immediately so the back office sees the screen
                        // caught up without waiting for the next ping.
                        sendAck(parsed.revision);
                    }
                    setVisits(visitsArray);
                    setLastSuccessTime(new Date());
                } catch (err) {
                    console.error('Failed to parse visits SSE payload:', err);
                }
            });

            // Liveness. Arrives every 15s whether or not the queue moved, which is
            // what makes it safe for the server to stay silent when nothing changes.
            es.addEventListener('ping', (ev) => {
                setLastSuccessTime(new Date());
                try {
                    const { revision, build } = JSON.parse((ev as MessageEvent).data);

                    if (shouldReloadForBuild(buildRef.current, build)) {
                        console.log(`[display] new build ${build} deployed, reloading`);
                        window.location.reload();
                        return;
                    }
                    if (typeof build === 'string' && build !== '') buildRef.current = build;

                    if (typeof revision !== 'number') return;

                    const clientRev = clientRevisionRef.current;
                    // Report where we are, so /settings/displays can tell a live screen
                    // from a connection object nobody is looking at.
                    sendAck(clientRev ?? revision);

                    if (clientRev === null || clientRev >= revision) {
                        staleSinceRef.current = null;
                        return;
                    }

                    // The server has newer data than we were given: the stream is open
                    // but payloads are not arriving.
                    if (staleSinceRef.current === null) {
                        staleSinceRef.current = Date.now();
                        console.log(`[display] freshness drift: client rev=${clientRev}, server rev=${revision}`);
                        return;
                    }
                    if (Date.now() - staleSinceRef.current > FRESHNESS_RECONNECT_AFTER_MS) {
                        console.log('[display] stale too long, forcing SSE reconnect');
                        staleSinceRef.current = null;
                        connectRef.current?.();
                    }
                } catch {
                    // A malformed ping is still proof of life; nothing else to do.
                }
            });
        };

        connectRef.current = connect;
        connect();

        const onVisibility = () => {
            if (document.visibilityState === 'visible') connect();
        };
        const onOnline = () => connect();
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('online', onOnline);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('online', onOnline);
            esRef.current?.close();
            esRef.current = null;
            connectRef.current = null;
        };
    }, []);

    const secondsSinceLastSuccess = Math.floor((nowTs - lastSuccessTime.getTime()) / 1000);

    // Last resort: the stream produced neither a payload nor a ping for 90s, so the
    // soft reconnect above has not helped either. Checked off the shared tick rather
    // than from a timer of its own.
    useEffect(() => {
        if (secondsSinceLastSuccess * 1000 > HARD_RELOAD_AFTER_MS) {
            console.log('Display watchdog: stream silent for 90s, reloading page...');
            window.location.reload();
        }
    }, [secondsSinceLastSuccess]);

    const isConnectionLost = !sseOpen || secondsSinceLastSuccess > STALE_THRESHOLD_SEC;

    // Filter for display:
    // 1. CALLED/DOCKED/IN_SERVICE (Active dock assignments) - Top priority
    // 2. WAITING (Next in queue)
    const activeVisits = visits.filter(v => ['CALLED', 'DOCKED', 'IN_SERVICE'].includes(v.status));
    const waitingVisits = visits
        .filter(v => v.status === 'WAITING')
        .sort((a, b) => (a.queuePosition || 999) - (b.queuePosition || 999));

    // Flash notification queue system
    const [flashQueue, setFlashQueue] = useState<TruckVisit[]>([]);
    const currentFlash = flashQueue[0] ?? null;
    const flashRow = currentFlash ? boardRowStatus({ ...currentFlash, status: 'CALLED' }) : null;
    const previousVisitsRef = useRef<TruckVisit[]>([]);
    const shownFlashIdsRef = useRef<Set<string>>(new Set()); // Track already shown flashes

    // Alternates once a second off the shared tick.
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

    // Each flash shows for 5 seconds, then the queue advances. Keyed on the id, not
    // the object: every payload brings fresh objects, and depending on those would
    // restart the timer before it ever fired.
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
            {/* Parking Warning Overlay - 20 sec every 30 min, blinks first 5 sec */}
            {showParkingWarning && !currentFlash && (
                <div className="absolute inset-x-0 top-0 z-30 bg-black h-12 flex items-center overflow-hidden">
                    <div className={`bg-red-600 w-full h-full flex items-center overflow-hidden ${warningBlinkPhase ? 'animate-blink-fast' : ''}`}>
                        {/* The sign travels with its message: pinned at the edge it read as
                            a stuck icon while the text ran past it. Six copies, so the
                            -50% scroll loops without a seam. */}
                        <div className="flex items-center whitespace-nowrap animate-scroll-warning text-white font-black text-xl uppercase tracking-wider">
                            {Array.from({ length: 6 }, (_, i) => (
                                <span key={i} className="flex items-center shrink-0">
                                    <TriangleAlert className="w-7 h-7 shrink-0 mx-3" aria-hidden="true" />
                                    <span className="pr-8">{warningT.parkingWarning}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Connection Lost Warning. A still strip in the board's language: it
                used to pulse and ping (competing with the call flash), use a glyph
                for an icon, speak English only, and count down to a reload a driver
                can do nothing about. */}
            {isConnectionLost && !currentFlash && (
                <div className="absolute inset-x-0 bottom-0 z-40 bg-red-900 py-2 px-4 flex items-center gap-2">
                    <TriangleAlert className="w-5 h-5 shrink-0 text-red-100" aria-hidden="true" />
                    <span className="text-red-100 font-bold text-sm uppercase tracking-wider">
                        {t.connectionLost}
                    </span>
                </div>
            )}

            {/* Flash Notification Overlay */}
            {currentFlash && (
                <>
                    {/* Black background to hide previous content */}
                    <div className="absolute inset-0 z-40 bg-black"></div>
                    {/* One flat green, not a three-stop gradient: a status colour is one
                        value, and the gradient made the plate's contrast depend on where
                        the glyph happened to sit — 2.22:1 over the middle stop, 3.22:1 at
                        the edge. The green is the signal you recognise from across the
                        yard; it is not the surface you read text off. */}
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-green-600">
                        <div className="flex flex-col items-center gap-1 w-full px-4">
                            {/* Everything readable sits on black, at 21:1. The plate used to
                                be white directly on the green — 2.22:1, the worst number on
                                a board whose own Distance Floor Rule is 14.1:1, on the one
                                frame the driver has been waiting for. */}
                            <div className="bg-black rounded-lg px-6 py-2 flex flex-col items-center">
                                {/* Destination label */}
                                <div className="text-lg text-white uppercase tracking-widest font-bold">
                                    {flashT[flashRow!.label]}
                                </div>

                                {/* MAIN: the plate. Largest thing in the product. */}
                                <div className="text-6xl font-mono font-black tracking-wider text-white">
                                    {boardPlateText(currentFlash).primary}
                                </div>
                            </div>

                            {/* Dock/Scales indicator - sharp blinking badge. Omitted when the
                                dock is gone rather than drawn as an empty white box. */}
                            {(flashRow!.scales || flashRow!.dockNumber !== null) && (
                                <div className={`font-black px-8 py-2 rounded-lg shadow-xl flex items-center justify-center animate-sharp-blink text-black ${flashRow!.scales ? 'bg-yellow-300' : 'bg-white'}`}>
                                    {flashRow!.scales
                                        ? <Scale className="w-16 h-16" aria-hidden="true" />
                                        : <span className="text-5xl">{flashRow!.dockNumber}</span>
                                    }
                                </div>
                            )}

                            {/* Action text. Black on the green reads at 6.52:1 where white
                                read at 2.22:1, and the pulse is gone: the blinking badge
                                above is the flash's one authored motion, and a second
                                animation inside the same five seconds only splits the
                                attention this frame exists to capture. */}
                            <div className="text-xl font-black text-black uppercase tracking-widest mt-1">
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
                    <div className="text-lg text-slate-300 uppercase tracking-wider">{t.queueStatus}</div>
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
                <div className="grid grid-cols-8 gap-2 text-sm text-slate-300 font-bold uppercase px-2">
                    <div className="col-span-6">{t.plateNumber}</div>
                    <div className="col-span-2 text-right">{t.dockStatus}</div>
                </div>

                {/* Rows */}
                {displayList.map((visit) => {
                    const row = boardRowStatus(visit);
                    const tone = ROW_TONE[row.tone];
                    const plate = boardPlateText(visit);

                    return (
                        <div
                            key={visit.id}
                            className={`grid grid-cols-8 gap-2 items-center px-2 py-1 rounded border-l-4 ${tone.row}`}
                        >
                            {/* Always white: 17-18:1 on every row tint. Status is the row's
                                job (background, leading stripe, label on the right), not the
                                plate's — tinting it cost 3x contrast on the one element that
                                has to be readable from a cab.

                                Pinned, never scrolled. The plate used to share an 8s marquee
                                with the carrier name, so the one fact the row exists to show
                                was off-screen for most of every cycle. With the carrier gone
                                a plate and a trailer plate fit the column outright, and the
                                driver can read the row at any instant rather than waiting for
                                the loop to come round. */}
                            <div className="col-span-6 flex items-baseline gap-3 overflow-hidden text-white">
                                <span className="font-mono text-2xl font-bold tracking-wider shrink-0">
                                    {plate.primary}
                                </span>
                                {plate.secondary && (
                                    // The trailer plate: how a driver with a swapped trailer
                                    // recognises themselves. Support, not identity.
                                    <span className="font-mono text-base font-bold tracking-wider text-slate-300 truncate">
                                        {plate.secondary}
                                    </span>
                                )}
                            </div>
                            {/* One size for every status, no smaller than the column header:
                                it used to be 12px for LOADING/AT DOCK and 20px for a call,
                                chosen by status rather than by importance. A call already
                                shouts through the blinking badge and the row's pulse. */}
                            <div className="col-span-2 text-right flex items-center justify-end gap-2 whitespace-nowrap">
                                <span className={`text-base font-bold uppercase ${row.scales ? 'text-yellow-300' : tone.label}`}>
                                    {t[row.label]}
                                </span>
                                {(row.scales || row.dockNumber !== null) && (
                                    // Black on the status hue: 9.5-15.8:1, where white on the
                                    // 600 steps read at 5.3-6.5:1 — the lowest contrast on the
                                    // board, on the one number that says where to drive.
                                    <div className={`text-black font-black text-xl rounded min-w-[2.5rem] h-7 px-2 flex items-center justify-center ${row.scales ? 'bg-yellow-300' : tone.badge} ${row.tone === 'called' ? 'animate-periodic-blink' : ''}`}>
                                        {row.scales ? <Scale className="w-5 h-5" aria-hidden="true" /> : row.dockNumber}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {displayList.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-white text-4xl font-semibold">
                        {t.noTrucks}
                    </div>
                )}
            </div>

            {/* Footer / Paginator dots */}
            <div className="absolute bottom-1 right-2 flex items-center gap-2">
                <div
                    // Same threshold as the strip: the dot used to turn red at 15s and the
                    // strip to appear at 35s, so for twenty seconds the board said both.
                    className={`w-1.5 h-1.5 rounded-full ${isConnectionLost ? 'bg-red-500' : 'bg-green-500'}`}
                    aria-hidden="true"
                />
                <div className="flex gap-1">
                    {Array.from({ length: Math.ceil((activeVisits.length + waitingVisits.length) / itemsPerPage) }).map((_, i) => (
                        <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${i === page ? 'bg-blue-500' : 'bg-slate-700'}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}

// Wrap in Suspense for Next.js 16 static generation compatibility
export default function DisplayPage() {
    return (
        <Suspense fallback={
            <div className="w-[576px] h-[224px] bg-black text-white flex items-center justify-center cursor-none">
                <div className="text-slate-300">Loading...</div>
            </div>
        }>
            <DisplayContent />
        </Suspense>
    );
}
