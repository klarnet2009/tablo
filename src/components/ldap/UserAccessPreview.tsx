'use client';

import { useState } from 'react';
import { UserCheck, AlertCircle, CheckCircle, XCircle, Shield, Users } from 'lucide-react';

interface AccessPreviewResult {
    found: boolean;
    user?: {
        dn: string;
        displayName: string;
        mail?: string;
    };
    groups: string[];
    matchedRules: Array<{ groupDn: string; role: string; priority?: number }>;
    effectiveRole: string;
    disabled?: boolean;
    disabledReason?: string;
    deniedByGroupList?: boolean;
    allowedByGroupList?: boolean;
    error?: string;
}

interface UserAccessPreviewProps {
    disabled?: boolean;
}

export function UserAccessPreview({ disabled }: UserAccessPreviewProps) {
    const [username, setUsername] = useState('');
    const [result, setResult] = useState<AccessPreviewResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePreview = async () => {
        if (!username.trim()) return;

        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await fetch('/api/admin/auth/ldap/preview-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: username.trim() }),
            });

            const data = await res.json();
            setResult(data);

            if (data.error) {
                setError(data.error);
            }
        } catch {
            setError('Failed to preview access');
        } finally {
            setIsLoading(false);
        }
    };

    // Extract CN from DN for display
    const extractCN = (dn: string): string => {
        const match = dn.match(/^CN=([^,]+)/i);
        return match ? match[1] : dn;
    };

    const getRoleColor = (role: string): string => {
        switch (role) {
            case 'ADMIN': return 'text-red-400 bg-red-500/20';
            case 'SUPERVISOR': return 'text-purple-400 bg-purple-500/20';
            case 'DISPATCHER': return 'text-blue-400 bg-blue-500/20';
            case 'SECURITY': return 'text-green-400 bg-green-500/20';
            default: return 'text-slate-400 bg-slate-500/20';
        }
    };

    return (
        <div className="space-y-4">
            <div className="text-sm font-medium text-slate-300">Test User Access</div>

            {/* Search input */}
            <div className="flex gap-2">
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                    placeholder="Enter username to test..."
                    disabled={disabled || isLoading}
                    className="flex-1 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                        text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 
                        disabled:opacity-50"
                />
                <button
                    onClick={handlePreview}
                    disabled={disabled || isLoading || !username.trim()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                        disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <UserCheck className="w-4 h-4" />
                    )}
                    Preview
                </button>
            </div>

            {/* Error */}
            {error && !result?.found && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
            )}

            {/* Results */}
            {result && (
                <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-4">
                    {/* User info */}
                    {result.found && result.user ? (
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center">
                                <UserCheck className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <div className="font-medium text-white">{result.user.displayName}</div>
                                {result.user.mail && (
                                    <div className="text-sm text-slate-400">{result.user.mail}</div>
                                )}
                                <div className="text-xs text-slate-500 truncate" title={result.user.dn}>
                                    {result.user.dn}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-red-400">
                            <XCircle className="w-5 h-5" />
                            <span>User not found in directory</span>
                        </div>
                    )}

                    {/* Status indicators */}
                    {result.found && (
                        <>
                            {/* Disabled status */}
                            {result.disabled && (
                                <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                                    <XCircle className="w-4 h-4" />
                                    <span className="text-sm">
                                        Account is {result.disabledReason === 'account_expired' ? 'expired' :
                                            result.disabledReason === 'account_locked' ? 'locked' : 'disabled'}
                                    </span>
                                </div>
                            )}

                            {/* Group list status */}
                            {result.deniedByGroupList && (
                                <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                                    <XCircle className="w-4 h-4" />
                                    <span className="text-sm">Denied by group policy</span>
                                </div>
                            )}

                            {/* Effective role */}
                            <div className="flex items-center gap-3">
                                <Shield className="w-5 h-5 text-slate-400" />
                                <div>
                                    <div className="text-sm text-slate-400">Effective Role</div>
                                    <span className={`inline-flex px-2 py-0.5 rounded text-sm font-medium ${getRoleColor(result.effectiveRole)}`}>
                                        {result.effectiveRole}
                                    </span>
                                </div>
                            </div>

                            {/* Groups */}
                            {result.groups.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Users className="w-4 h-4 text-slate-400" />
                                        <span className="text-sm text-slate-400">Groups ({result.groups.length})</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
                                        {result.groups.map((group, i) => {
                                            const isMatched = result.matchedRules.some(
                                                r => r.groupDn.toLowerCase() === group.toLowerCase()
                                            );
                                            return (
                                                <span
                                                    key={i}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs
                                                        ${isMatched
                                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            : 'bg-slate-700/50 text-slate-400'}`}
                                                    title={group}
                                                >
                                                    {isMatched && <CheckCircle className="w-3 h-3" />}
                                                    {extractCN(group)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Matched rules */}
                            {result.matchedRules.length > 0 && (
                                <div>
                                    <div className="text-sm text-slate-400 mb-2">Matched Rules</div>
                                    <div className="space-y-1">
                                        {result.matchedRules.map((rule, i) => (
                                            <div key={i} className="flex items-center gap-2 text-sm">
                                                <CheckCircle className="w-4 h-4 text-green-400" />
                                                <span className="text-slate-300">{extractCN(rule.groupDn)}</span>
                                                <span className="text-slate-500">→</span>
                                                <span className={`px-1.5 py-0.5 rounded text-xs ${getRoleColor(rule.role)}`}>
                                                    {rule.role}
                                                </span>
                                                {rule.priority !== undefined && rule.priority > 0 && (
                                                    <span className="text-xs text-slate-500">(priority: {rule.priority})</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Final verdict */}
                            <div className={`flex items-center gap-2 p-2 rounded-lg ${result.disabled || result.deniedByGroupList
                                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                                    : 'bg-green-500/10 border border-green-500/30 text-green-400'
                                }`}>
                                {result.disabled || result.deniedByGroupList ? (
                                    <>
                                        <XCircle className="w-4 h-4" />
                                        <span className="text-sm font-medium">Login would be DENIED</span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-4 h-4" />
                                        <span className="text-sm font-medium">
                                            Login would be ALLOWED as {result.effectiveRole}
                                        </span>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
