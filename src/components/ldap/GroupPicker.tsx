'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Users } from 'lucide-react';

interface LdapGroup {
    cn: string;
    dn: string;
    displayName?: string;
    description?: string;
}

interface GroupPickerProps {
    value: string;
    onChange: (groupDn: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function GroupPicker({ value, onChange, placeholder = 'Search for a group...', disabled }: GroupPickerProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LdapGroup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<LdapGroup | null>(null);
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

    // If value is set but no selectedGroup, extract CN from DN
    useEffect(() => {
        if (value && !selectedGroup) {
            const cnMatch = value.match(/^CN=([^,]+)/i);
            if (cnMatch) {
                setSelectedGroup({ cn: cnMatch[1], dn: value });
            }
        }
    }, [value, selectedGroup]);

    // Search groups with debounce
    const searchGroups = async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/auth/ldap/search-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: searchQuery }),
            });

            const data = await res.json();

            if (data.success) {
                setResults(data.groups);
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
            searchGroups(newQuery);
        }, 300);
    };

    const handleSelect = (group: LdapGroup) => {
        setSelectedGroup(group);
        onChange(group.dn);
        setQuery('');
        setResults([]);
        setIsOpen(false);
    };

    const handleClear = () => {
        setSelectedGroup(null);
        onChange('');
        setQuery('');
    };

    return (
        <div ref={containerRef} className="relative">
            {selectedGroup ? (
                // Selected group display
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg">
                    <Users className="w-4 h-4 text-blue-400" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">
                            {selectedGroup.cn}
                        </div>
                        <div className="text-xs text-slate-400 truncate" title={selectedGroup.dn}>
                            {selectedGroup.dn}
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
                            focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    {isLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                </div>
            )}

            {/* Results dropdown */}
            {isOpen && !selectedGroup && (
                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-auto">
                    {results.length === 0 && query.length >= 2 && !isLoading && (
                        <div className="p-3 text-sm text-slate-400 text-center">
                            No groups found
                        </div>
                    )}
                    {results.length === 0 && query.length < 2 && (
                        <div className="p-3 text-sm text-slate-400 text-center">
                            Type at least 2 characters to search
                        </div>
                    )}
                    {results.map((group) => (
                        <button
                            key={group.dn}
                            onClick={() => handleSelect(group)}
                            className="w-full px-3 py-2 text-left hover:bg-slate-700/50 flex items-start gap-2"
                        >
                            <Users className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-white">
                                    {group.displayName || group.cn}
                                </div>
                                <div className="text-xs text-slate-400 truncate" title={group.dn}>
                                    {group.dn}
                                </div>
                                {group.description && (
                                    <div className="text-xs text-slate-500 truncate">
                                        {group.description}
                                    </div>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
