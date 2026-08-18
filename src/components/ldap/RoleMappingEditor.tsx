'use client';

import { useState } from 'react';
import { GroupPicker } from './GroupPicker';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface GroupMappingRule {
    groupDn: string;
    role: string;
    priority?: number;
}

interface RoleMappingEditorProps {
    rules: GroupMappingRule[];
    onChange: (rules: GroupMappingRule[]) => void;
    availableRoles: { value: string; label: string }[];
    disabled?: boolean;
}

export function RoleMappingEditor({ rules, onChange, availableRoles, disabled }: RoleMappingEditorProps) {
    const [newRule, setNewRule] = useState<Partial<GroupMappingRule>>({ role: 'SECURITY', priority: 0 });

    const handleAddRule = () => {
        if (!newRule.groupDn || !newRule.role) return;

        onChange([
            ...rules,
            {
                groupDn: newRule.groupDn,
                role: newRule.role,
                priority: newRule.priority ?? 0,
            },
        ]);

        setNewRule({ role: 'SECURITY', priority: 0 });
    };

    const handleRemoveRule = (index: number) => {
        onChange(rules.filter((_, i) => i !== index));
    };

    const handleUpdateRule = (index: number, updates: Partial<GroupMappingRule>) => {
        onChange(rules.map((rule, i) => (i === index ? { ...rule, ...updates } : rule)));
    };

    // Extract CN from DN for display
    const extractCN = (dn: string): string => {
        const match = dn.match(/^CN=([^,]+)/i);
        return match ? match[1] : dn;
    };

    return (
        <div className="space-y-4">
            {/* Existing rules */}
            {rules.length > 0 && (
                <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-300 mb-2">Current Mappings</div>
                    {rules.map((rule, index) => (
                        <div
                            key={index}
                            className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
                        >
                            <GripVertical className="w-4 h-4 text-slate-400" />

                            {/* Group */}
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                    {extractCN(rule.groupDn)}
                                </div>
                                <div className="text-xs text-slate-400 truncate" title={rule.groupDn}>
                                    {rule.groupDn}
                                </div>
                            </div>

                            {/* Arrow */}
                            <div className="text-slate-400">→</div>

                            {/* Role select */}
                            <select
                                value={rule.role}
                                onChange={(e) => handleUpdateRule(index, { role: e.target.value })}
                                disabled={disabled}
                                className="px-3 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white 
                                    focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                {availableRoles.map((role) => (
                                    <option key={role.value} value={role.value}>
                                        {role.label}
                                    </option>
                                ))}
                            </select>

                            {/* Priority */}
                            <input
                                type="number"
                                value={rule.priority ?? 0}
                                onChange={(e) => handleUpdateRule(index, { priority: parseInt(e.target.value) || 0 })}
                                disabled={disabled}
                                className="w-16 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded-lg text-white 
                                    focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                                title="Priority (higher wins)"
                            />

                            {/* Remove button */}
                            <button
                                onClick={() => handleRemoveRule(index)}
                                disabled={disabled}
                                className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded
                                    disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Add new rule */}
            <div className="p-4 bg-slate-800/30 rounded-lg border border-dashed border-slate-700">
                <div className="text-sm font-medium text-slate-300 mb-3">Add New Mapping</div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <GroupPicker
                            value={newRule.groupDn || ''}
                            onChange={(groupDn) => setNewRule({ ...newRule, groupDn })}
                            placeholder="Search for a group..."
                            disabled={disabled}
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-slate-400">→</span>

                        <select
                            value={newRule.role}
                            onChange={(e) => setNewRule({ ...newRule, role: e.target.value })}
                            disabled={disabled}
                            className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white 
                                focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {availableRoles.map((role) => (
                                <option key={role.value} value={role.value}>
                                    {role.label}
                                </option>
                            ))}
                        </select>

                        <input
                            type="number"
                            value={newRule.priority ?? 0}
                            onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) || 0 })}
                            disabled={disabled}
                            className="w-16 px-2 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white 
                                focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                            placeholder="Priority"
                            title="Priority (higher wins)"
                        />

                        <button
                            onClick={handleAddRule}
                            disabled={disabled || !newRule.groupDn}
                            className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                                disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                            <Plus className="w-4 h-4" />
                            Add
                        </button>
                    </div>
                </div>
            </div>

            {/* Help text */}
            <div className="text-xs text-slate-400">
                Priority determines which rule wins when a user is in multiple groups (higher number = higher priority).
            </div>
        </div>
    );
}
