'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Server, Key, FolderTree, UserSearch, Shield, CheckCircle,
    ChevronLeft, ChevronRight, Save, AlertCircle, Loader2, RefreshCw
} from 'lucide-react';
import { OUTreeView } from './OUTreeView';
import { RoleMappingEditor } from './RoleMappingEditor';
import { UserAccessPreview } from './UserAccessPreview';

// Types
interface LdapConfig {
    id: string;
    enabled: boolean;
    host: string;
    port: number;
    connectionMode: 'LDAP' | 'LDAPS' | 'STARTTLS';
    tlsRejectUnauthorized: boolean;
    tlsCaCert: string | null;
    baseDn: string;
    bindDn: string;
    bindPasswordEnc: string;
    hasPassword?: boolean;
    userSearchFilter: string;
    userAttributes: string;
    selectedOUs: string;
    groupAuthEnabled: boolean;
    groupAuthMode: 'highest_role_wins' | 'merge_permissions';
    groupAuthDefaultRole: string;
    groupMappingRules: string;
    groupAllowList: string;
    groupDenyList: string;
    connectTimeout: number;
    searchTimeout: number;
    disableLocalFallback: boolean;
    // UI-only fields for bind format handling (not persisted)
    _bindFormat?: 'upn' | 'sam' | 'dn';
    _bindDomain?: string;
    _bindUser?: string;
}

interface GroupMappingRule {
    groupDn: string;
    role: string;
    priority?: number;
}

const STEPS = [
    { id: 'connection', label: 'Connection', icon: Server },
    { id: 'service-account', label: 'Service Account', icon: Key },
    { id: 'directory', label: 'Directory Scope', icon: FolderTree },
    { id: 'user-matching', label: 'User Matching', icon: UserSearch },
    { id: 'access-control', label: 'Access Control', icon: Shield },
    { id: 'summary', label: 'Summary', icon: CheckCircle },
];

const AVAILABLE_ROLES = [
    { value: 'SECURITY', label: 'Security' },
    { value: 'DISPATCHER', label: 'Dispatcher' },
    { value: 'SUPERVISOR', label: 'Supervisor' },
    { value: 'ADMIN', label: 'Administrator' },
];

const CONNECTION_MODES = [
    { value: 'LDAP', label: 'LDAP (389)', port: 389 },
    { value: 'LDAPS', label: 'LDAPS (636)', port: 636 },
    { value: 'STARTTLS', label: 'STARTTLS (389)', port: 389 },
];

const FILTER_PRESETS = [
    { label: 'AD: sAMAccountName', value: '(sAMAccountName={{username}})' },
    { label: 'AD: userPrincipalName', value: '(userPrincipalName={{username}})' },
    { label: 'OpenLDAP: uid', value: '(uid={{username}})' },
    { label: 'OpenLDAP: cn', value: '(cn={{username}})' },
    { label: 'Email', value: '(mail={{username}})' },
];

export function LdapWizard() {
    const [currentStep, setCurrentStep] = useState(0);
    const [config, setConfig] = useState<Partial<LdapConfig>>({
        enabled: false,
        host: '',
        port: 389,
        connectionMode: 'LDAP',
        tlsRejectUnauthorized: true,
        baseDn: '',
        bindDn: '',
        userSearchFilter: '(sAMAccountName={{username}})',
        userAttributes: 'cn,mail,memberOf,userAccountControl,accountExpires',
        selectedOUs: '[]',
        groupAuthEnabled: false,
        groupAuthMode: 'highest_role_wins',
        groupAuthDefaultRole: 'SECURITY',
        groupMappingRules: '[]',
        groupAllowList: '[]',
        groupDenyList: '[]',
        connectTimeout: 5000,
        searchTimeout: 10000,
        disableLocalFallback: false,
    });
    const [bindPassword, setBindPassword] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Test states
    const [connectionTest, setConnectionTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string }>({ status: 'idle' });
    const [bindTest, setBindTest] = useState<{
        status: 'idle' | 'testing' | 'success' | 'error';
        message?: string;
        accountInfo?: {
            dn: string;
            cn?: string;
            displayName?: string;
            sAMAccountName?: string;
            userPrincipalName?: string;
        };
    }>({ status: 'idle' });
    const [userTest, setUserTest] = useState<{ status: 'idle' | 'testing' | 'success' | 'error'; message?: string; username?: string; password?: string }>({ status: 'idle' });

    // LocalStorage key for wizard state persistence
    const WIZARD_STORAGE_KEY = 'ldap-wizard-draft';

    // Load config on mount (from server or localStorage draft)
    useEffect(() => {
        loadConfig();
    }, []);

    // Save draft to localStorage on config changes
    useEffect(() => {
        if (!isLoading && config.host) {
            const draft = {
                config,
                currentStep,
                savedAt: new Date().toISOString(),
            };
            localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(draft));
        }
    }, [config, currentStep, isLoading]);

    const loadConfig = async () => {
        try {
            // First try to load from server
            const res = await fetch('/api/admin/auth/ldap/config');
            if (res.ok) {
                const data = await res.json();
                // Only use server data if it has meaningful config
                if (data.host) {
                    setConfig(data);
                    setIsLoading(false);
                    return;
                }
            }
        } catch (err) {
            console.error('Failed to load LDAP config from server:', err);
        }

        // If no server config, try localStorage draft
        try {
            const draft = localStorage.getItem(WIZARD_STORAGE_KEY);
            if (draft) {
                const parsed = JSON.parse(draft);
                if (parsed.config) {
                    setConfig(parsed.config);
                    if (parsed.currentStep) {
                        setCurrentStep(parsed.currentStep);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to load LDAP draft from localStorage:', err);
        }

        setIsLoading(false);
    };

    const clearDraft = () => {
        localStorage.removeItem(WIZARD_STORAGE_KEY);
    };

    const updateConfig = useCallback((updates: Partial<LdapConfig>) => {
        setConfig(prev => ({ ...prev, ...updates }));
    }, []);

    const handleConnectionModeChange = (mode: string) => {
        const modeConfig = CONNECTION_MODES.find(m => m.value === mode);
        updateConfig({
            connectionMode: mode as LdapConfig['connectionMode'],
            port: modeConfig?.port ?? 389,
        });
    };

    // Step 1: Test connectivity only (no credentials needed)
    const testConnectivity = async () => {
        setConnectionTest({ status: 'testing' });

        try {
            const res = await fetch('/api/admin/auth/ldap/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    testMode: 'connectivity',
                    host: config.host,
                    port: config.port,
                    connectionMode: config.connectionMode,
                    tlsRejectUnauthorized: config.tlsRejectUnauthorized,
                    tlsCaCert: config.tlsCaCert,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setConnectionTest({ status: 'success', message: data.message });
            } else {
                setConnectionTest({ status: 'error', message: data.message || data.details });
            }
        } catch {
            setConnectionTest({ status: 'error', message: 'Connection test failed' });
        }
    };

    // Step 2: Test bind with credentials
    const testBind = async () => {
        setBindTest({ status: 'testing' });

        try {
            const res = await fetch('/api/admin/auth/ldap/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    testMode: 'bind',
                    host: config.host,
                    port: config.port,
                    connectionMode: config.connectionMode,
                    tlsRejectUnauthorized: config.tlsRejectUnauthorized,
                    tlsCaCert: config.tlsCaCert,
                    bindDn: config.bindDn,
                    bindPassword: bindPassword || undefined,
                    baseDn: config.baseDn,
                }),
            });

            const data = await res.json();

            if (data.success) {
                const displayName = data.accountInfo?.displayName || data.accountInfo?.cn;
                setBindTest({
                    status: 'success',
                    message: displayName
                        ? `Authenticated as: ${displayName}`
                        : 'Credentials validated successfully',
                    accountInfo: data.accountInfo,
                });
            } else {
                setBindTest({ status: 'error', message: data.message || data.details });
            }
        } catch {
            setBindTest({ status: 'error', message: 'Bind test failed' });
        }
    };

    const detectBaseDN = async () => {
        // Need host, bindDn, and password to detect
        if (!config.host || !config.bindDn || (!bindPassword && !config.hasPassword)) {
            return;
        }

        try {
            const res = await fetch('/api/admin/auth/ldap/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    detectBase: true,
                    // Pass connection config inline for wizard mode (before config is saved)
                    connectionConfig: {
                        host: config.host,
                        port: config.port,
                        connectionMode: config.connectionMode,
                        tlsRejectUnauthorized: config.tlsRejectUnauthorized,
                        tlsCaCert: config.tlsCaCert,
                        bindDn: config.bindDn,
                        bindPassword: bindPassword || undefined,
                    }
                }),
            });

            const data = await res.json();

            if (data.success && data.defaultBaseDN) {
                updateConfig({ baseDn: data.defaultBaseDN });
            }
        } catch {
            // Ignore errors
        }
    };

    const testUserLookup = async () => {
        if (!userTest.username) return;

        setUserTest(prev => ({ ...prev, status: 'testing' }));

        try {
            const res = await fetch('/api/admin/auth/ldap/test-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: userTest.username,
                    password: userTest.password || 'testpassword',
                }),
            });

            const data = await res.json();

            if (data.success || data.user) {
                setUserTest(prev => ({
                    ...prev,
                    status: 'success',
                    message: `Found: ${data.user?.displayName || data.user?.cn}`
                }));
            } else {
                setUserTest(prev => ({
                    ...prev,
                    status: 'error',
                    message: data.error || 'User not found'
                }));
            }
        } catch {
            setUserTest(prev => ({ ...prev, status: 'error', message: 'Test failed' }));
        }
    };

    const saveConfig = async () => {
        setIsSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const payload = {
                ...config,
                bindPassword: bindPassword || undefined,
            };

            const res = await fetch('/api/admin/auth/ldap/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                const data = await res.json();
                setConfig(data);
                setSuccess('Configuration saved successfully');
                setBindPassword(''); // Clear password after save
                clearDraft(); // Clear localStorage draft
            } else {
                const data = await res.json();
                setError(data.message || 'Failed to save configuration');
            }
        } catch {
            setError('Failed to save configuration');
        } finally {
            setIsSaving(false);
        }
    };

    // Parsed values for nested components
    const selectedOUs: string[] = (() => {
        try {
            return JSON.parse(config.selectedOUs || '[]');
        } catch {
            return [];
        }
    })();

    const groupMappingRules: GroupMappingRule[] = (() => {
        try {
            return JSON.parse(config.groupMappingRules || '[]');
        } catch {
            return [];
        }
    })();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    // Render step content
    const renderStep = () => {
        switch (STEPS[currentStep].id) {
            case 'connection':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Host */}
                            <div>
                                <label htmlFor="ldap-host" className="block text-sm font-medium text-slate-300 mb-2">
                                    LDAP Server Host
                                </label>
                                <input
                                    type="text"
                                    id="ldap-host"
                                    value={config.host || ''}
                                    onChange={(e) => updateConfig({ host: e.target.value })}
                                    placeholder="ldap.example.com"
                                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                        text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* Connection Mode */}
                            <div>
                                <label htmlFor="ldap-mode" className="block text-sm font-medium text-slate-300 mb-2">
                                    Connection Mode
                                </label>
                                <select
                                    id="ldap-mode"
                                    value={config.connectionMode || 'LDAP'}
                                    onChange={(e) => handleConnectionModeChange(e.target.value)}
                                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                        text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    {CONNECTION_MODES.map(mode => (
                                        <option key={mode.value} value={mode.value}>{mode.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Port */}
                            <div>
                                <label htmlFor="ldap-port" className="block text-sm font-medium text-slate-300 mb-2">
                                    Port
                                </label>
                                <input
                                    type="number"
                                    id="ldap-port"
                                    value={config.port || 389}
                                    onChange={(e) => updateConfig({ port: parseInt(e.target.value) || 389 })}
                                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                        text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* TLS Verification */}
                            {config.connectionMode !== 'LDAP' && (
                                <div className="flex items-center gap-3">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config.tlsRejectUnauthorized ?? true}
                                            onChange={(e) => updateConfig({ tlsRejectUnauthorized: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-600 peer-focus:ring-2 peer-focus:ring-blue-500 
                                            rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500
                                            after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                            after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                                    </label>
                                    <span className="text-sm text-slate-300">Verify TLS Certificate</span>
                                </div>
                            )}
                        </div>

                        {/* Test Connection */}
                        <div className="pt-4 border-t border-slate-700">
                            <button
                                onClick={testConnectivity}
                                disabled={!config.host || connectionTest.status === 'testing'}
                                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                                    disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {connectionTest.status === 'testing' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4" />
                                )}
                                Test Connection
                            </button>

                            {connectionTest.status !== 'idle' && connectionTest.status !== 'testing' && (
                                <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 text-sm
                                    ${connectionTest.status === 'success'
                                        ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                                        : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}
                                >
                                    {connectionTest.status === 'success' ? (
                                        <CheckCircle className="w-4 h-4" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4" />
                                    )}
                                    {connectionTest.message}
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'service-account':
                return (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-4">
                            {/* Bind Account - Flexible Input */}
                            <div>
                                <label htmlFor="ldap-bind-dn" className="block text-sm font-medium text-slate-300 mb-2">
                                    Service Account
                                </label>
                                <p className="text-xs text-slate-400 mb-3">
                                    Enter the account that will be used to query the directory. You can use any of these formats:
                                </p>

                                {/* Simple format tabs */}
                                <div className="flex gap-1 mb-3">
                                    <button
                                        onClick={() => updateConfig({ _bindFormat: 'upn' })}
                                        className={`px-3 py-1.5 text-xs rounded-lg transition ${config._bindFormat !== 'dn' && config._bindFormat !== 'sam'
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                            }`}
                                    >
                                        user@domain.com
                                    </button>
                                    <button
                                        onClick={() => updateConfig({ _bindFormat: 'sam' })}
                                        className={`px-3 py-1.5 text-xs rounded-lg transition ${config._bindFormat === 'sam'
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                            }`}
                                    >
                                        DOMAIN\user
                                    </button>
                                    <button
                                        onClick={() => updateConfig({ _bindFormat: 'dn' })}
                                        className={`px-3 py-1.5 text-xs rounded-lg transition ${config._bindFormat === 'dn'
                                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                            : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'
                                            }`}
                                    >
                                        Full DN
                                    </button>
                                </div>

                                {/* Input based on format */}
                                {config._bindFormat === 'dn' ? (
                                    <input
                                        type="text"
                                        value={config.bindDn || ''}
                                        onChange={(e) => updateConfig({ bindDn: e.target.value })}
                                        id="ldap-bind-dn"
                                        placeholder="CN=svc-ldap,OU=Service Accounts,DC=corp,DC=local"
                                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                            text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    />
                                ) : config._bindFormat === 'sam' ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            aria-label="Bind domain"
                                value={config._bindDomain || ''}
                                            onChange={(e) => {
                                                const domain = e.target.value.toUpperCase();
                                                updateConfig({
                                                    _bindDomain: domain,
                                                    bindDn: domain && config._bindUser
                                                        ? `${domain}\\${config._bindUser}`
                                                        : ''
                                                });
                                            }}
                                            placeholder="DOMAIN"
                                            className="w-32 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                                text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                                        />
                                        <span className="self-center text-slate-400 text-lg">\</span>
                                        <input
                                            type="text"
                                            aria-label="Bind username"
                                value={config._bindUser || ''}
                                            onChange={(e) => {
                                                const user = e.target.value;
                                                updateConfig({
                                                    _bindUser: user,
                                                    bindDn: config._bindDomain && user
                                                        ? `${config._bindDomain}\\${user}`
                                                        : ''
                                                });
                                            }}
                                            placeholder="username"
                                            className="flex-1 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                                text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        value={config.bindDn || ''}
                                        onChange={(e) => updateConfig({ bindDn: e.target.value })}
                                        id="ldap-bind-dn"
                                        placeholder="svc-ldap@corp.local"
                                        className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                            text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                )}

                                {config.bindDn && (
                                    <p className="mt-2 text-xs text-slate-400">
                                        Will bind as: <code className="text-blue-400">{config.bindDn}</code>
                                    </p>
                                )}
                            </div>

                            {/* Bind Password */}
                            <div>
                                <label htmlFor="ldap-bind-password" className="block text-sm font-medium text-slate-300 mb-2">
                                    Password
                                    {config.hasPassword && (
                                        <span className="ml-2 text-xs text-green-400">(already set)</span>
                                    )}
                                </label>
                                <input
                                    type="password"
                                    id="ldap-bind-password"
                                    value={bindPassword}
                                    onChange={(e) => setBindPassword(e.target.value)}
                                    placeholder={config.hasPassword ? '••••••••' : 'Enter password'}
                                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                        text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>

                        {/* Validate Bind */}
                        <div className="pt-4 border-t border-slate-700">
                            <button
                                onClick={testBind}
                                disabled={!config.bindDn || (!bindPassword && !config.hasPassword) || bindTest.status === 'testing'}
                                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                                    disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {bindTest.status === 'testing' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Key className="w-4 h-4" />
                                )}
                                Validate Credentials
                            </button>

                            {bindTest.status !== 'idle' && bindTest.status !== 'testing' && (
                                <div className={`mt-3 p-3 rounded-lg text-sm
                                    ${bindTest.status === 'success'
                                        ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                                        : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        {bindTest.status === 'success' ? (
                                            <CheckCircle className="w-4 h-4" />
                                        ) : (
                                            <AlertCircle className="w-4 h-4" />
                                        )}
                                        <span className="font-medium">{bindTest.message}</span>
                                    </div>
                                    {bindTest.status === 'success' && bindTest.accountInfo && (
                                        <div className="mt-2 pl-6 space-y-1 text-xs text-slate-400">
                                            {bindTest.accountInfo.displayName && (
                                                <div><span className="text-slate-400">Display Name:</span> {bindTest.accountInfo.displayName}</div>
                                            )}
                                            {bindTest.accountInfo.sAMAccountName && (
                                                <div><span className="text-slate-400">sAMAccountName:</span> {bindTest.accountInfo.sAMAccountName}</div>
                                            )}
                                            {bindTest.accountInfo.userPrincipalName && (
                                                <div><span className="text-slate-400">UPN:</span> {bindTest.accountInfo.userPrincipalName}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'directory':
                return (
                    <div className="space-y-6">
                        {/* Base DN */}
                        <div>
                            <label htmlFor="ldap-base-dn" className="block text-sm font-medium text-slate-300 mb-2">
                                Base DN
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    id="ldap-base-dn"
                                    value={config.baseDn || ''}
                                    onChange={(e) => updateConfig({ baseDn: e.target.value })}
                                    placeholder="DC=example,DC=com"
                                    className="flex-1 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                        text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    onClick={detectBaseDN}
                                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                                        flex items-center gap-2"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Detect
                                </button>
                            </div>
                        </div>

                        {/* OU Selection */}
                        <div>
                            <h3 className="block text-sm font-medium text-slate-300 mb-2">
                                Select Organizational Units
                            </h3>
                            <p className="text-xs text-slate-400 mb-3">
                                Choose which OUs to search for users. Leave empty to search entire Base DN.
                            </p>
                            <OUTreeView
                                baseDn={config.baseDn || ''}
                                selectedOUs={selectedOUs}
                                onSelectionChange={(ous) => updateConfig({ selectedOUs: JSON.stringify(ous) })}
                                connectionConfig={
                                    (bindPassword || config.hasPassword) ? {
                                        host: config.host || '',
                                        port: config.port || 389,
                                        connectionMode: config.connectionMode || 'LDAP',
                                        tlsRejectUnauthorized: config.tlsRejectUnauthorized ?? true,
                                        tlsCaCert: config.tlsCaCert,
                                        bindDn: config.bindDn || '',
                                        bindPassword: bindPassword || undefined,
                                    } : undefined
                                }
                            />
                        </div>
                    </div>
                );

            case 'user-matching':
                return (
                    <div className="space-y-6">
                        {/* Filter Template */}
                        <div>
                            <label htmlFor="ldap-user-filter" className="block text-sm font-medium text-slate-300 mb-2">
                                User Search Filter
                            </label>
                            <select
                                aria-label="User search filter preset"
                                value={config.userSearchFilter || ''}
                                onChange={(e) => updateConfig({ userSearchFilter: e.target.value })}
                                className="w-full px-4 py-2 mb-2 bg-slate-700/50 border border-slate-600 rounded-lg
                                    text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select a preset or enter custom...</option>
                                {FILTER_PRESETS.map(preset => (
                                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                                ))}
                            </select>
                            <input
                                id="ldap-user-filter"
                                type="text"
                                value={config.userSearchFilter || ''}
                                onChange={(e) => updateConfig({ userSearchFilter: e.target.value })}
                                placeholder="(sAMAccountName={{username}})"
                                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                    text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                            />
                            <p className="mt-2 text-xs text-slate-400">
                                Preview for &quot;alex&quot;: <code className="text-blue-400">
                                    {(config.userSearchFilter || '').replace('{{username}}', 'alex')}
                                </code>
                            </p>
                        </div>

                        {/* Test User Lookup */}
                        <div className="pt-4 border-t border-slate-700">
                            <h3 className="block text-sm font-medium text-slate-300 mb-2">
                                Test User Lookup
                            </h3>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    aria-label="Test username"
                                value={userTest.username || ''}
                                    onChange={(e) => setUserTest(prev => ({ ...prev, username: e.target.value }))}
                                    placeholder="Enter username to test"
                                    className="flex-1 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                        text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <input
                                    type="password"
                                    aria-label="Test password"
                                value={userTest.password || ''}
                                    onChange={(e) => setUserTest(prev => ({ ...prev, password: e.target.value }))}
                                    placeholder="Password (optional)"
                                    className="w-40 px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                        text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    onClick={testUserLookup}
                                    disabled={!userTest.username || userTest.status === 'testing'}
                                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                                        disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {userTest.status === 'testing' ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <UserSearch className="w-4 h-4" />
                                    )}
                                    Test
                                </button>
                            </div>

                            {userTest.status !== 'idle' && userTest.status !== 'testing' && (
                                <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 text-sm
                                    ${userTest.status === 'success'
                                        ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                                        : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}
                                >
                                    {userTest.status === 'success' ? (
                                        <CheckCircle className="w-4 h-4" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4" />
                                    )}
                                    {userTest.message}
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'access-control':
                return (
                    <div className="space-y-6">
                        {/* Enable Group Auth */}
                        <div className="flex items-center gap-3">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.groupAuthEnabled ?? false}
                                    onChange={(e) => updateConfig({ groupAuthEnabled: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-600 peer-focus:ring-2 peer-focus:ring-blue-500 
                                    rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500
                                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                    after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                            </label>
                            <span className="text-sm text-slate-300">Enable group-based access control</span>
                        </div>

                        {config.groupAuthEnabled && (
                            <>
                                {/* Mode and Default Role */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="ldap-group-mode" className="block text-sm font-medium text-slate-300 mb-2">
                                            Resolution Mode
                                        </label>
                                        <select
                                            id="ldap-group-mode"
                                    value={config.groupAuthMode || 'highest_role_wins'}
                                            onChange={(e) => updateConfig({ groupAuthMode: e.target.value as LdapConfig['groupAuthMode'] })}
                                            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                                text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="highest_role_wins">Highest role wins</option>
                                            <option value="merge_permissions">Merge permissions</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="ldap-default-role" className="block text-sm font-medium text-slate-300 mb-2">
                                            Default Role (if no match)
                                        </label>
                                        <select
                                            id="ldap-default-role"
                                    value={config.groupAuthDefaultRole || 'SECURITY'}
                                            onChange={(e) => updateConfig({ groupAuthDefaultRole: e.target.value })}
                                            className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg 
                                                text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        >
                                            {AVAILABLE_ROLES.map(role => (
                                                <option key={role.value} value={role.value}>{role.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Role Mapping Editor */}
                                <div>
                                    <h3 className="block text-sm font-medium text-slate-300 mb-3">
                                        Group → Role Mappings
                                    </h3>
                                    <RoleMappingEditor
                                        rules={groupMappingRules}
                                        onChange={(rules) => updateConfig({ groupMappingRules: JSON.stringify(rules) })}
                                        availableRoles={AVAILABLE_ROLES}
                                    />
                                </div>

                                {/* Test User Access */}
                                <div className="pt-4 border-t border-slate-700">
                                    <UserAccessPreview />
                                </div>
                            </>
                        )}
                    </div>
                );

            case 'summary':
                return (
                    <div className="space-y-6">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <div className="text-sm font-medium text-slate-400 mb-2">Connection</div>
                                <div className="text-white">{config.host}:{config.port}</div>
                                <div className="text-xs text-slate-400">{config.connectionMode}</div>
                            </div>

                            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <div className="text-sm font-medium text-slate-400 mb-2">Service Account</div>
                                <div className="text-white truncate" title={config.bindDn}>{config.bindDn || 'Not set'}</div>
                            </div>

                            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <div className="text-sm font-medium text-slate-400 mb-2">Base DN</div>
                                <div className="text-white">{config.baseDn || 'Not set'}</div>
                                <div className="text-xs text-slate-400">
                                    {selectedOUs.length > 0 ? `${selectedOUs.length} OU(s) selected` : 'All OUs'}
                                </div>
                            </div>

                            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                <div className="text-sm font-medium text-slate-400 mb-2">Access Control</div>
                                <div className="text-white">
                                    {config.groupAuthEnabled ? 'Group-based' : 'Disabled'}
                                </div>
                                <div className="text-xs text-slate-400">
                                    {config.groupAuthEnabled
                                        ? `${groupMappingRules.length} rule(s), default: ${config.groupAuthDefaultRole}`
                                        : `All users get: ${config.groupAuthDefaultRole || 'SECURITY'}`}
                                </div>
                            </div>
                        </div>

                        {/* Enable Toggle */}
                        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-white">Enable LDAP Login</div>
                                    <div className="text-sm text-slate-400">
                                        Allow users to authenticate via LDAP
                                    </div>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={config.enabled ?? false}
                                        onChange={(e) => updateConfig({ enabled: e.target.checked })}
                                        className="sr-only peer"
                                    />
                                    <div className="w-14 h-7 bg-slate-600 peer-focus:ring-2 peer-focus:ring-blue-500 
                                        rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-green-500
                                        after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                        after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all" />
                                </label>
                            </div>
                        </div>

                        {/* Fallback Option */}
                        <div className="flex items-center gap-3">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.disableLocalFallback ?? false}
                                    onChange={(e) => updateConfig({ disableLocalFallback: e.target.checked })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-600 peer-focus:ring-2 peer-focus:ring-blue-500 
                                    rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-orange-500
                                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                                    after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                            </label>
                            <div>
                                <span className="text-sm text-slate-300">Disable local login fallback</span>
                                <p className="text-xs text-slate-400">
                                    Warning: If disabled, users cannot log in if LDAP is unreachable
                                </p>
                            </div>
                        </div>

                        {/* Save */}
                        <div className="pt-4 border-t border-slate-700">
                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}
                            {success && (
                                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" />
                                    {success}
                                </div>
                            )}

                            <button
                                onClick={saveConfig}
                                disabled={isSaving}
                                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white 
                                    font-semibold rounded-lg hover:from-blue-600 hover:to-cyan-600 
                                    disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSaving ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Save className="w-5 h-5" />
                                )}
                                Save Configuration
                            </button>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Progress Steps */}
            <div className="flex items-center justify-between overflow-x-auto pb-2">
                {STEPS.map((step, index) => {
                    const StepIcon = step.icon;
                    const isActive = index === currentStep;
                    const isCompleted = index < currentStep;

                    return (
                        <button
                            key={step.id}
                            onClick={() => setCurrentStep(index)}
                            className={`flex flex-col items-center gap-1 min-w-[80px] p-2 rounded-lg transition
                                ${isActive
                                    ? 'text-blue-400'
                                    : isCompleted
                                        ? 'text-green-400 hover:bg-slate-700/50'
                                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'}`}
                        >
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center
                                ${isActive
                                    ? 'bg-blue-500/20 ring-2 ring-blue-500'
                                    : isCompleted
                                        ? 'bg-green-500/20'
                                        : 'bg-slate-700'}`}
                            >
                                {isCompleted ? (
                                    <CheckCircle className="w-5 h-5" />
                                ) : (
                                    <StepIcon className="w-5 h-5" />
                                )}
                            </div>
                            <span className="text-xs font-medium">{step.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Step Content */}
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
                <h2 className="text-lg font-semibold text-white mb-6">
                    {STEPS[currentStep].label}
                </h2>
                {renderStep()}
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
                <button
                    onClick={() => setCurrentStep(s => s - 1)}
                    disabled={currentStep === 0}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                        disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                </button>

                {currentStep < STEPS.length - 1 ? (
                    <button
                        onClick={() => setCurrentStep(s => s + 1)}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                            flex items-center gap-2"
                    >
                        Next
                        <ChevronRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button
                        onClick={saveConfig}
                        disabled={isSaving}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white 
                            rounded-lg hover:from-blue-600 hover:to-cyan-600 
                            disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Save Configuration
                    </button>
                )}
            </div>
        </div>
    );
}
