'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Monitor, Pencil, Trash2, ChevronRight, Check, X } from 'lucide-react';

type DataStatus = 'synced' | 'lagging' | 'stale' | 'unknown';

interface DisplayItem {
    id: string;
    deviceId: string;
    name: string | null;
    online: boolean;
    connectedAt: string | null;
    lastHeartbeat: string | null;
    lastPayloadAt: string | null;
    ip: string | null;
    userAgent: string | null;
    clientRevision: number | null;
    clientRevisionAt: string | null;
    dataStatus: DataStatus;
    createdAt: string;
    updatedAt: string;
}

interface DisplaysResponse {
    serverRevision: number;
    items: DisplayItem[];
}

const POLL_INTERVAL_MS = 3000;

function formatRelative(iso: string | null): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0) return 'just now';
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function DisplaysSettingsPage() {
    const { data: session, status } = useSession();
    const [items, setItems] = useState<DisplayItem[] | null>(null);
    const [serverRevision, setServerRevision] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status !== 'authenticated' || session?.user.role !== 'ADMIN') return;

        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch('/api/admin/displays', { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data: DisplaysResponse = await res.json();
                if (!cancelled) {
                    setItems(data.items ?? []);
                    setServerRevision(
                        typeof data.serverRevision === 'number' ? data.serverRevision : null
                    );
                    setError(null);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
            }
        };
        load();
        const id = setInterval(load, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [status, session?.user.role]);

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!session) {
        redirect('/login');
    }

    if (session.user.role !== 'ADMIN') {
        redirect('/queue');
    }

    const handleRenamed = (id: string, name: string | null) => {
        setItems(prev => prev?.map(it => (it.id === id ? { ...it, name } : it)) ?? null);
    };

    const handleDeleted = (id: string) => {
        setItems(prev => prev?.filter(it => it.id !== id) ?? null);
    };

    return (
        <div className="flex min-h-screen bg-slate-900">
            <Sidebar />
            <main className="flex-1 overflow-auto p-4 md:p-6 pb-20 md:pb-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                            <Link href="/settings" className="hover:text-white">Settings</Link>
                            <ChevronRight className="w-4 h-4" />
                            <span>Displays</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="text-xl md:text-2xl font-bold text-white">Displays</h1>
                            {serverRevision !== null && (
                                <span
                                    className="text-xs text-slate-400 bg-slate-800/80 border border-slate-700/50 rounded-full px-2 py-0.5 font-mono"
                                    title="Server visits-payload revision"
                                >
                                    server rev {serverRevision}
                                </span>
                            )}
                        </div>
                        <p className="text-slate-400 text-sm md:text-base">
                            Public board monitors currently registered in the system.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                            {error}
                        </div>
                    )}

                    {items === null && !error && (
                        <div className="flex items-center justify-center py-16">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                        </div>
                    )}

                    {items !== null && items.length === 0 && (
                        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-8 text-center">
                            <Monitor className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                            <h3 className="text-white font-medium mb-1">No displays registered yet</h3>
                            <p className="text-slate-400 text-sm">
                                Open <code className="px-1.5 py-0.5 bg-slate-700/50 rounded text-slate-300">/display</code>{' '}
                                on a monitor — it will appear here automatically.
                            </p>
                        </div>
                    )}

                    {items !== null && items.length > 0 && (
                        <div className="space-y-3">
                            {items.map(item => (
                                <DisplayRow
                                    key={item.id}
                                    item={item}
                                    serverRevision={serverRevision}
                                    onRenamed={handleRenamed}
                                    onDeleted={handleDeleted}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>
            <MobileNav />
        </div>
    );
}

interface RowProps {
    item: DisplayItem;
    serverRevision: number | null;
    onRenamed: (id: string, name: string | null) => void;
    onDeleted: (id: string) => void;
}

function FreshnessBadge({
    item,
    serverRevision,
}: {
    item: DisplayItem;
    serverRevision: number | null;
}) {
    if (!item.online) return null;

    const clientRev = item.clientRevision;
    const ackAgeSec = item.clientRevisionAt
        ? Math.max(0, Math.floor((Date.now() - new Date(item.clientRevisionAt).getTime()) / 1000))
        : null;

    const tooltip = [
        `client rev ${clientRev ?? '—'}`,
        `server rev ${serverRevision ?? '—'}`,
        ackAgeSec !== null ? `last ack ${ackAgeSec}s ago` : 'no ack yet',
    ].join(' · ');

    let label: string;
    let cls: string;
    switch (item.dataStatus) {
        case 'synced':
            label = clientRev !== null ? `✓ Fresh (rev ${clientRev})` : '✓ Fresh';
            cls = 'bg-green-500/15 text-green-300 border-green-500/30';
            break;
        case 'lagging':
            label = ackAgeSec !== null ? `⋯ Lagging (${ackAgeSec}s)` : '⋯ Lagging';
            cls = 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
            break;
        case 'stale':
            label = ackAgeSec !== null ? `⚠ Stale (${ackAgeSec}s)` : '⚠ Stale';
            cls = 'bg-red-500/15 text-red-300 border-red-500/30';
            break;
        case 'unknown':
        default:
            label = '— syncing';
            cls = 'bg-slate-500/15 text-slate-400 border-slate-500/30';
            break;
    }

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}
            title={tooltip}
        >
            {label}
        </span>
    );
}

function DisplayRow({ item, serverRevision, onRenamed, onDeleted }: RowProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(item.name ?? '');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing) {
            setDraft(item.name ?? '');
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [editing, item.name]);

    const save = async () => {
        const next = draft.trim();
        const newName = next.length ? next : null;
        if (newName === (item.name ?? null)) {
            setEditing(false);
            return;
        }
        setSaving(true);
        setLocalError(null);
        try {
            const res = await fetch(`/api/admin/displays/${item.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message ?? `HTTP ${res.status}`);
            }
            onRenamed(item.id, newName);
            setEditing(false);
        } catch (e) {
            setLocalError(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const cancel = () => {
        setDraft(item.name ?? '');
        setEditing(false);
        setLocalError(null);
    };

    const remove = async () => {
        const label = item.name ?? `device ${item.deviceId.slice(0, 8)}`;
        if (!window.confirm(`Delete display "${label}"? If it's still streaming it will reconnect as a new entry.`)) {
            return;
        }
        setDeleting(true);
        setLocalError(null);
        try {
            const res = await fetch(`/api/admin/displays/${item.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message ?? `HTTP ${res.status}`);
            }
            onDeleted(item.id);
        } catch (e) {
            setLocalError(e instanceof Error ? e.message : 'Delete failed');
            setDeleting(false);
        }
    };

    const shortId = `${item.deviceId.slice(0, 8)}…`;
    const statusClass = item.online ? 'bg-green-500' : 'bg-red-500';
    const statusTitle = item.online
        ? `Online — heartbeat ${formatRelative(item.lastHeartbeat)}; payload ${formatRelative(item.lastPayloadAt)}`
        : 'Offline';

    return (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 md:p-5">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                        className={`${statusClass} w-2.5 h-2.5 rounded-full mt-2 shrink-0`}
                        title={statusTitle}
                        aria-label={item.online ? 'online' : 'offline'}
                    />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            {editing ? (
                                <>
                                    <input
                                        ref={inputRef}
                                        value={draft}
                                        onChange={e => setDraft(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') save();
                                            if (e.key === 'Escape') cancel();
                                        }}
                                        maxLength={80}
                                        disabled={saving}
                                        placeholder="Display name"
                                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm
                                            focus:outline-none focus:border-blue-500 min-w-0 flex-1"
                                    />
                                    <button
                                        type="button"
                                        onClick={save}
                                        disabled={saving}
                                        className="p-1 text-green-400 hover:bg-slate-700/60 rounded disabled:opacity-50"
                                        title="Save"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={cancel}
                                        disabled={saving}
                                        className="p-1 text-slate-400 hover:bg-slate-700/60 rounded disabled:opacity-50"
                                        title="Cancel"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <h3 className={`font-semibold truncate ${item.name ? 'text-white' : 'text-slate-500 italic'}`}>
                                        {item.name ?? '(unnamed)'}
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={() => setEditing(true)}
                                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded"
                                        title="Rename"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="mt-1 text-xs text-slate-500 font-mono" title={item.deviceId}>
                            {shortId}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                            {item.online && (
                                <FreshnessBadge item={item} serverRevision={serverRevision} />
                            )}
                            {item.online ? (
                                <>
                                    <span>
                                        Connected <span className="text-slate-300">{formatRelative(item.connectedAt)}</span>
                                    </span>
                                    <span>
                                        Last update <span className="text-slate-300">{formatRelative(item.lastPayloadAt)}</span>
                                    </span>
                                </>
                            ) : (
                                <span className="text-slate-500">
                                    Last seen {formatRelative(item.updatedAt)}
                                </span>
                            )}
                            {item.ip && <span>IP: <span className="text-slate-300">{item.ip}</span></span>}
                            {item.userAgent && (
                                <span className="truncate max-w-xs" title={item.userAgent}>
                                    UA: <span className="text-slate-300">{item.userAgent}</span>
                                </span>
                            )}
                        </div>

                        {localError && (
                            <div className="mt-2 text-xs text-red-400">{localError}</div>
                        )}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={remove}
                    disabled={deleting}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded disabled:opacity-50 shrink-0"
                    title="Delete"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
