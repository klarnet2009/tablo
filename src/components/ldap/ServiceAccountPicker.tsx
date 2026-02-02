'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, User, Key } from 'lucide-react';

interface DirectoryUser {
    dn: string;
    cn: string;
    displayName?: string;
    sAMAccountName?: string;
}

interface ServiceAccountPickerProps {
    value: string;
    onChange: (dn: string) => void;
    placeholder?: string;
    disabled?: boolean;
    // For initial search without stored config
    connectionConfig?: {
        host: string;
        port: number;
        connectionMode: string;
        baseDn: string;
        bindDn: string;
        bindPassword: string;
    };
}

export function ServiceAccountPicker({
    value,
    onChange,
    placeholder = 'Search for a service account...',
    disabled,
    connectionConfig
}: ServiceAccountPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DirectoryUser[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedAccount, setSelectedAccount] = useState<DirectoryUser | null>(null);
    const [manualMode, setManualMode] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // If value is set but no selectedAccount, extract CN from DN
    useEffect(() => {
        if (value && !selectedAccount && !manualMode) {
            const cnMatch = value.match(/^CN=([^,]+)/i);
            if (cnMatch) {
                setSelectedAccount({ dn: value, cn: cnMatch[1] });
            } else if (value) {
                // Has a value but doesn't look like a DN - switch to manual mode
                setManualMode(true);
            }
        }
    }, [value, selectedAccount, manualMode]);

    // Search for users/service accounts with debounce
    const searchUsers = async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        try {
            // Use a special endpoint or the browse endpoint with user search
            const res = await fetch('/api/admin/auth/ldap/search-service-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    query: searchQuery,
                    connectionConfig
                }),
            });

            const data = await res.json();

            if (data.success) {
                setResults(data.users || []);
            } else {
                setResults([]);
            }
        } catch {
            setResults([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        setIsOpen(true);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            searchUsers(newQuery);
        }, 300);
    };

    const handleSelect = (user: DirectoryUser) => {
        setSelectedAccount(user);
        onChange(user.dn);
        setQuery('');
        setResults([]);
        setIsOpen(false);
        setManualMode(false);
    };

    const handleClear = () => {
        setSelectedAccount(null);
        onChange('');
        setQuery('');
        setManualMode(false);
    };

    const handleManualInput = (dn: string) => {
        onChange(dn);
    };

    const toggleManualMode = () => {
        setManualMode(!manualMode);
        if (!manualMode) {
            setSelectedAccount(null);
        }
    };

    // Extract readable name from DN
    const extractName = (dn: string): string => {
        const match = dn.match(/^CN=([^,]+)/i);
        return match ? match[1] : dn;
    };

    return (
        <div ref={containerRef} className="space-y-2">
            {/* Mode toggle */}
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={toggleManualMode}
                    className="text-xs text-slate-400 hover:text-blue-400 transition"
                >
                    {manualMode ? '← Search directory' : 'Enter manually →'}
                </button>
            </div>

            {manualMode ? (
                // Manual input mode
                <div className="space-y-1">
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => handleManualInput(e.target.value)}
                        placeholder="CN=svc-ldap,OU=Service Accounts,DC=corp,DC=local"
                        disabled={disabled}
                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                            text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 
                            disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500">
                        Enter the full Distinguished Name of the service account
                    </p>
                </div>
            ) : selectedAccount ? (
                // Selected account display
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg">
                    <Key className="w-4 h-4 text-amber-400" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                            {selectedAccount.displayName || selectedAccount.sAMAccountName || selectedAccount.cn}
                        </div>
                        <div className="text-xs text-slate-400 truncate" title={selectedAccount.dn}>
                            {selectedAccount.dn}
                        </div>
                    </div>
                    {!disabled && (
                        <button
                            onClick={handleClear}
                            className="p-1 hover:bg-slate-600 rounded text-slate-400 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ) : (
                // Search input
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        onFocus={() => setIsOpen(true)}
                        placeholder={placeholder}
                        disabled={disabled}
                        className="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                            text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 
                            disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {isLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>
            )}

            {/* Results dropdown */}
            {isOpen && !selectedAccount && !manualMode && (
                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-auto">
                    {results.length === 0 && query.length >= 2 && !isLoading && (
                        <div className="p-3 text-sm text-slate-400 text-center">
                            No accounts found. <button
                                onClick={toggleManualMode}
                                className="text-blue-400 hover:underline"
                            >
                                Enter manually
                            </button>
                        </div>
                    )}
                    {results.length === 0 && query.length < 2 && (
                        <div className="p-3 text-sm text-slate-400 text-center">
                            Type at least 2 characters to search
                        </div>
                    )}
                    {results.map((user) => (
                        <button
                            key={user.dn}
                            onClick={() => handleSelect(user)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-700/50 flex items-start gap-2"
                        >
                            <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-white">
                                    {user.displayName || user.sAMAccountName || user.cn}
                                </div>
                                <div className="text-xs text-slate-400 truncate" title={user.dn}>
                                    {user.dn}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* Helper text */}
            {!manualMode && !selectedAccount && (
                <p className="text-xs text-slate-500">
                    Search for a service account in your directory, or <button
                        onClick={toggleManualMode}
                        className="text-blue-400 hover:underline"
                    >enter the DN manually</button>
                </p>
            )}
        </div>
    );
}
