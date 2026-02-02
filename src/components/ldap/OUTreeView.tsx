'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Building2, Box, Check } from 'lucide-react';

interface DirectoryEntry {
    dn: string;
    name: string;
    type: 'ou' | 'container' | 'domain' | 'other';
    hasChildren: boolean;
}

interface ConnectionConfig {
    host: string;
    port: number;
    connectionMode: string;
    tlsRejectUnauthorized: boolean;
    tlsCaCert?: string | null;
    bindDn: string;
    bindPassword?: string;
}

interface OUTreeViewProps {
    baseDn: string;
    selectedOUs: string[];
    onSelectionChange: (ous: string[]) => void;
    disabled?: boolean;
    connectionConfig?: ConnectionConfig;
}

interface TreeNodeData extends DirectoryEntry {
    children?: TreeNodeData[];
    isLoading?: boolean;
    isExpanded?: boolean;
}

export function OUTreeView({ baseDn, selectedOUs, onSelectionChange, disabled, connectionConfig }: OUTreeViewProps) {
    const [nodes, setNodes] = useState<TreeNodeData[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [initialLoaded, setInitialLoaded] = useState(false);

    // Load root nodes
    const loadRootNodes = async () => {
        if (!baseDn) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/admin/auth/ldap/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dn: baseDn,
                    connectionConfig: connectionConfig
                }),
            });

            const data = await res.json();

            if (data.success) {
                setNodes(data.entries.map((e: DirectoryEntry) => ({ ...e, children: undefined, isExpanded: false })));
                setInitialLoaded(true);
            } else {
                setError(data.error || 'Failed to load directory');
            }
        } catch {
            setError('Failed to connect to server');
        } finally {
            setIsLoading(false);
        }
    };

    // Load children for a node
    const loadChildren = async (dn: string): Promise<TreeNodeData[]> => {
        try {
            const res = await fetch('/api/admin/auth/ldap/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dn,
                    connectionConfig: connectionConfig
                }),
            });

            const data = await res.json();

            if (data.success) {
                return data.entries.map((e: DirectoryEntry) => ({ ...e, children: undefined, isExpanded: false }));
            }
        } catch {
            // Ignore errors for child loads
        }
        return [];
    };

    // Toggle node expansion
    const toggleNode = async (nodeDn: string) => {
        const updateNodes = (items: TreeNodeData[]): TreeNodeData[] => {
            return items.map(node => {
                if (node.dn === nodeDn) {
                    if (!node.isExpanded && node.hasChildren && !node.children) {
                        // Need to load children
                        return { ...node, isLoading: true };
                    }
                    return { ...node, isExpanded: !node.isExpanded };
                }
                if (node.children) {
                    return { ...node, children: updateNodes(node.children) };
                }
                return node;
            });
        };

        setNodes(updateNodes(nodes));

        // Find node and load children if needed
        const findNode = (items: TreeNodeData[]): TreeNodeData | null => {
            for (const item of items) {
                if (item.dn === nodeDn) return item;
                if (item.children) {
                    const found = findNode(item.children);
                    if (found) return found;
                }
            }
            return null;
        };

        const node = findNode(nodes);
        if (node && !node.isExpanded && node.hasChildren && !node.children) {
            const children = await loadChildren(nodeDn);

            const updateWithChildren = (items: TreeNodeData[]): TreeNodeData[] => {
                return items.map(n => {
                    if (n.dn === nodeDn) {
                        return { ...n, children, isLoading: false, isExpanded: true };
                    }
                    if (n.children) {
                        return { ...n, children: updateWithChildren(n.children) };
                    }
                    return n;
                });
            };

            setNodes(updateWithChildren(nodes));
        }
    };

    // Toggle selection
    const toggleSelection = (dn: string) => {
        if (disabled) return;

        if (selectedOUs.includes(dn)) {
            onSelectionChange(selectedOUs.filter(o => o !== dn));
        } else {
            onSelectionChange([...selectedOUs, dn]);
        }
    };

    // Render a single node
    const renderNode = (node: TreeNodeData, level: number = 0) => {
        const isSelected = selectedOUs.includes(node.dn);
        const Icon = node.type === 'ou' ? (node.isExpanded ? FolderOpen : Folder) :
            node.type === 'container' ? Box :
                node.type === 'domain' ? Building2 : Folder;

        return (
            <div key={node.dn}>
                <div
                    className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition
                        ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-slate-700/50 text-slate-300'}
                        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ paddingLeft: `${level * 20 + 8}px` }}
                >
                    {/* Expand/Collapse button */}
                    {node.hasChildren ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleNode(node.dn); }}
                            className="p-0.5 hover:bg-slate-600 rounded"
                            disabled={disabled}
                        >
                            {node.isLoading ? (
                                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            ) : node.isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                        </button>
                    ) : (
                        <div className="w-5" />
                    )}

                    {/* Checkbox */}
                    <button
                        onClick={() => toggleSelection(node.dn)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition
                            ${isSelected
                                ? 'bg-blue-500 border-blue-500'
                                : 'border-slate-500 hover:border-blue-400'}`}
                        disabled={disabled}
                    >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                    </button>

                    {/* Icon and name */}
                    <Icon className={`w-4 h-4 ${isSelected ? 'text-blue-400' : 'text-slate-400'}`} />
                    <span className="text-sm truncate flex-1" title={node.dn}>
                        {node.name}
                    </span>
                </div>

                {/* Children */}
                {node.isExpanded && node.children && (
                    <div>
                        {node.children.map(child => renderNode(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-3">
            {!initialLoaded && (
                <button
                    onClick={loadRootNodes}
                    disabled={!baseDn || isLoading || disabled}
                    className="w-full px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 
                        disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                >
                    {isLoading ? (
                        <>
                            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            Loading...
                        </>
                    ) : (
                        <>
                            <Folder className="w-4 h-4" />
                            Browse Directory
                        </>
                    )}
                </button>
            )}

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {error}
                </div>
            )}

            {initialLoaded && nodes.length === 0 && (
                <div className="p-4 text-center text-slate-400 text-sm">
                    No organizational units found
                </div>
            )}

            {nodes.length > 0 && (
                <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-2 max-h-80 overflow-auto">
                    {nodes.map(node => renderNode(node))}
                </div>
            )}

            {selectedOUs.length > 0 && (
                <div className="text-sm text-slate-400">
                    Selected: {selectedOUs.length} OU(s)
                </div>
            )}
        </div>
    );
}
