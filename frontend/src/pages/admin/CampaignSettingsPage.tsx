import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Save, FlaskConical, AlertTriangle, CheckCircle2, XCircle, Info } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { showConfirmDialog } from '../../lib/appDialog';
import {
    getAdvancedSettings,
    updateAdvancedSettings,
    simulateSettings,
} from '../../api/campaignSettingsApi';
import type {
    AdvancedNotificationSettings,
    SimulationResult,
} from '../../types/campaignSettings';
import {
    GeneralSettingsSection,
    ConsentSettingsSection,
    CapsSettingsSection,
    BudgetSettingsSection,
    RoutingSettingsSection,
    ApprovalSettingsSection,
    ExperimentSettingsSection,
    ComplianceSettingsSection,
    ObservabilitySettingsSection,
} from '../../components/campaign-settings';

// ─── RBAC permission matrix (mirrors backend settingsRbac.ts) ────────────────

type SettingsSection =
    | 'General'
    | 'Consent'
    | 'Caps'
    | 'Budget'
    | 'Routing'
    | 'Approval'
    | 'Experiment'
    | 'Compliance'
    | 'Observability';

type UserRole = string;

const PERMISSION_MATRIX: Record<SettingsSection, UserRole[]> = {
    General: ['superadmin', 'admin', 'moderator'],
    Consent: ['superadmin', 'admin'],
    Caps: ['superadmin', 'admin', 'moderator'],
    Budget: ['superadmin', 'admin'],
    Routing: ['superadmin', 'admin'],
    Approval: ['superadmin', 'admin'],
    Experiment: ['superadmin', 'admin', 'moderator'],
    Compliance: ['superadmin', 'admin'],
    Observability: ['superadmin', 'admin', 'moderator'],
};

/** Sensitive top-level keys that require elevated confirmation before save. */
const SENSITIVE_KEYS = new Set(['budgetGuardrail', 'approvalPolicy']);

function canEditSection(role: UserRole, section: SettingsSection): boolean {
    return PERMISSION_MATRIX[section]?.includes(role) ?? false;
}

// ─── Preview Panel ───────────────────────────────────────────────────────────

function PreviewPanel({
    simulation,
    loading,
    error,
    onSimulate,
}: {
    simulation: SimulationResult | null;
    loading: boolean;
    error: string | null;
    onSimulate: () => void;
}) {
    return (
        <div className="card-flat p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold cw-text">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    Configuration Preview
                </h3>
                <button
                    type="button"
                    onClick={onSimulate}
                    disabled={loading}
                    className="btn-outline inline-flex items-center gap-1.5 text-xs px-3 py-1.5"
                >
                    {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
                    Test Config
                </button>
            </div>

            {error && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    {error}
                </div>
            )}

            {simulation && (
                <div className="space-y-3">
                    {/* Summary stats */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <StatCard label="Est. Cost" value={`৳${simulation.estimatedCost.toLocaleString()}`} />
                        <StatCard label="Eligible" value={String(simulation.eligibleCount)} />
                        <StatCard label="Suppressed" value={String(simulation.suppressedCount)} />
                        <StatCard label="Capped" value={String(simulation.cappedCount)} />
                    </div>

                    {/* Provider route */}
                    <div className="rounded-xl border cw-border cw-surface px-3 py-2 text-xs cw-text">
                        <span className="font-medium">Provider Route:</span>{' '}
                        <span className="cw-muted">{simulation.selectedProviderRoute}</span>
                    </div>

                    {/* Blocked indicator */}
                    {simulation.blocked && (
                        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 flex items-start gap-2">
                            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>
                                Blocked by <span className="font-semibold">{simulation.blockingPolicy}</span>
                                {simulation.blockingReason && `: ${simulation.blockingReason}`}
                            </span>
                        </div>
                    )}

                    {/* Decision path */}
                    <div className="space-y-1">
                        <span className="text-xs font-medium cw-muted">Decision Path</span>
                        {simulation.decisionPath.map((step) => (
                            <div
                                key={step.policy}
                                className="flex items-center gap-2 rounded-lg border cw-border cw-surface px-3 py-1.5 text-xs"
                            >
                                <PolicyStatusIcon status={step.status} />
                                <span className="font-medium cw-text">{step.policy}</span>
                                <span className="cw-muted ml-auto truncate max-w-[200px]">{step.reason}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!simulation && !error && !loading && (
                <p className="text-xs cw-muted flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    Click "Test Config" to simulate a send with current settings.
                </p>
            )}
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border cw-border cw-surface px-3 py-2 text-center">
            <div className="text-xs cw-muted">{label}</div>
            <div className="text-sm font-semibold cw-text mt-0.5">{value}</div>
        </div>
    );
}

function PolicyStatusIcon({ status }: { status: 'pass' | 'fail' | 'warn' }) {
    if (status === 'pass') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    if (status === 'fail') return <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
}

// ─── Main Page Component ─────────────────────────────────────────────────────

export default function CampaignSettingsPage() {
    const { user } = useAuth();
    const userRole = user?.role ?? 'viewer';

    const [settings, setSettings] = useState<AdvancedNotificationSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    // Track which top-level keys have been modified for sensitive-change detection
    const dirtyKeysRef = useRef<Set<string>>(new Set());

    // Simulation state
    const [simulation, setSimulation] = useState<SimulationResult | null>(null);
    const [simLoading, setSimLoading] = useState(false);
    const [simError, setSimError] = useState<string | null>(null);

    // ─── Load settings ───────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        getAdvancedSettings()
            .then((data) => {
                if (!cancelled) setSettings(data);
            })
            .catch(() => {
                if (!cancelled) setSaveError('Failed to load settings.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    // ─── Patch helper ────────────────────────────────────────────────────────
    const patchSettings = useCallback(
        (patch: Partial<AdvancedNotificationSettings>) => {
            setSettings((prev) => {
                if (!prev) return prev;
                // Track dirty keys for sensitive-change detection
                for (const key of Object.keys(patch)) {
                    dirtyKeysRef.current.add(key);
                }
                return { ...prev, ...patch };
            });
            setSaveSuccess(false);
        },
        [],
    );

    // ─── Detect sensitive changes ────────────────────────────────────────────
    const hasSensitiveChanges = useMemo(() => {
        for (const key of dirtyKeysRef.current) {
            if (SENSITIVE_KEYS.has(key)) return true;
        }
        return false;
    }, // eslint-disable-next-line react-hooks/exhaustive-deps
        [settings]);

    // ─── Save handler ────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (!settings) return;

        // Elevated confirmation for sensitive fields (Req 16.5)
        if (hasSensitiveChanges) {
            const confirmed = await showConfirmDialog({
                title: 'Sensitive Settings Change',
                message:
                    'You are modifying sensitive settings (budget guardrails or approval thresholds). These changes can significantly impact campaign delivery. Are you sure you want to proceed?',
                description: 'This action requires elevated confirmation.',
                confirmLabel: 'Save Changes',
                cancelLabel: 'Cancel',
                tone: 'danger',
            });
            if (!confirmed) return;
        }

        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        try {
            const headers: Record<string, string> = {};
            if (hasSensitiveChanges) {
                headers['x-elevated-confirmation'] = 'confirmed';
            }

            const updated = await updateAdvancedSettings(settings);
            setSettings(updated);
            dirtyKeysRef.current.clear();
            setSaveSuccess(true);
            // Auto-dismiss success after 3s
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ||
                err?.message ||
                'Failed to save settings.';
            setSaveError(msg);
        } finally {
            setSaving(false);
        }
    }, [settings, hasSensitiveChanges]);

    // ─── Simulate handler ────────────────────────────────────────────────────
    const handleSimulate = useCallback(async () => {
        setSimLoading(true);
        setSimError(null);
        try {
            const result = await simulateSettings({
                recipientId: 'sample-recipient',
                campaignType: 'promotional',
                channel: 'email',
            });
            setSimulation(result);
        } catch (err: any) {
            setSimError(
                err?.response?.data?.message || err?.message || 'Simulation failed.',
            );
        } finally {
            setSimLoading(false);
        }
    }, []);

    // ─── Section visibility based on RBAC (Req 16.4) ────────────────────────
    const sectionAccess = useMemo(() => ({
        General: canEditSection(userRole, 'General'),
        Consent: canEditSection(userRole, 'Consent'),
        Caps: canEditSection(userRole, 'Caps'),
        Budget: canEditSection(userRole, 'Budget'),
        Routing: canEditSection(userRole, 'Routing'),
        Approval: canEditSection(userRole, 'Approval'),
        Experiment: canEditSection(userRole, 'Experiment'),
        Compliance: canEditSection(userRole, 'Compliance'),
        Observability: canEditSection(userRole, 'Observability'),
    }), [userRole]);

    // ─── Loading state ───────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
                <AlertTriangle className="h-6 w-6 text-rose-400" />
                <p className="text-sm cw-muted">Unable to load campaign settings.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
            {/* Page header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold cw-text">Campaign Settings</h1>
                    <p className="text-sm cw-muted mt-1">
                        Configure advanced campaign policies, routing, and compliance.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
                >
                    {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Save className="h-4 w-4" />
                    )}
                    {saving ? 'Saving…' : 'Save Settings'}
                </button>
            </div>

            {/* Save feedback */}
            {saveError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    {saveError}
                </div>
            )}
            {saveSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Settings saved successfully.
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
                {/* Left column: settings sections */}
                <div className="space-y-4">
                    {sectionAccess.General && (
                        <GeneralSettingsSection
                            settings={settings}
                            onChange={patchSettings}
                        />
                    )}

                    {sectionAccess.Consent && (
                        <ConsentSettingsSection
                            settings={settings.sendTime}
                            onChange={(patch) =>
                                patchSettings({ sendTime: { ...settings.sendTime, ...patch } })
                            }
                        />
                    )}

                    {sectionAccess.Caps && (
                        <CapsSettingsSection
                            settings={settings.frequencyCap}
                            onChange={(patch) =>
                                patchSettings({ frequencyCap: { ...settings.frequencyCap, ...patch } })
                            }
                        />
                    )}

                    {sectionAccess.Budget && (
                        <BudgetSettingsSection
                            settings={settings.budgetGuardrail}
                            onChange={(patch) =>
                                patchSettings({ budgetGuardrail: { ...settings.budgetGuardrail, ...patch } })
                            }
                        />
                    )}

                    {sectionAccess.Routing && (
                        <RoutingSettingsSection
                            settings={settings.providerRouting}
                            onChange={(patch) =>
                                patchSettings({ providerRouting: { ...settings.providerRouting, ...patch } })
                            }
                        />
                    )}

                    {sectionAccess.Approval && (
                        <ApprovalSettingsSection
                            settings={settings.approvalPolicy}
                            onChange={(patch) =>
                                patchSettings({ approvalPolicy: { ...settings.approvalPolicy, ...patch } })
                            }
                        />
                    )}

                    {sectionAccess.Experiment && (
                        <ExperimentSettingsSection
                            settings={settings.experiment}
                            onChange={(patch) =>
                                patchSettings({ experiment: { ...settings.experiment, ...patch } })
                            }
                        />
                    )}

                    {sectionAccess.Compliance && (
                        <ComplianceSettingsSection
                            contentLint={settings.contentLint}
                            dataGovernance={settings.dataGovernance}
                            onContentLintChange={(patch) =>
                                patchSettings({ contentLint: { ...settings.contentLint, ...patch } })
                            }
                            onDataGovernanceChange={(patch) =>
                                patchSettings({ dataGovernance: { ...settings.dataGovernance, ...patch } })
                            }
                        />
                    )}

                    {sectionAccess.Observability && (
                        <ObservabilitySettingsSection
                            settings={settings.observability}
                            onChange={(patch) =>
                                patchSettings({ observability: { ...settings.observability, ...patch } })
                            }
                        />
                    )}
                </div>

                {/* Right column: preview panel (sticky) */}
                <div className="lg:sticky lg:top-6 lg:self-start">
                    <PreviewPanel
                        simulation={simulation}
                        loading={simLoading}
                        error={simError}
                        onSimulate={handleSimulate}
                    />
                </div>
            </div>
        </div>
    );
}
