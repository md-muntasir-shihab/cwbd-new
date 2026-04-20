import { Wallet } from 'lucide-react';
import type { BudgetGuardrailConfig } from '../../types/campaignSettings';
import CyberToggle from '../ui/CyberToggle';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface BudgetSettingsSectionProps {
    settings: BudgetGuardrailConfig;
    onChange: (patch: Partial<BudgetGuardrailConfig>) => void;
}

function validate(s: BudgetGuardrailConfig) {
    const errors: Record<string, string> = {};
    if (s.softLimitPercent < 1 || s.softLimitPercent > 100)
        errors.softLimitPercent = 'Soft limit must be 1–100%';
    if (s.anomalySpikeThresholdPercent < 100)
        errors.anomalySpikeThresholdPercent = 'Anomaly spike threshold must be ≥ 100%';
    return errors;
}

export default function BudgetSettingsSection({ settings, onChange }: BudgetSettingsSectionProps) {
    const errors = validate(settings);

    return (
        <CollapsibleSection icon={Wallet} title="Budget Guardrails">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Soft Limit (%)</span>
                    <input
                        type="number" min={1} max={100}
                        className="input-field mt-2"
                        value={settings.softLimitPercent}
                        onChange={(e) => onChange({ softLimitPercent: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.softLimitPercent} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Anomaly Spike Threshold (%)</span>
                    <input
                        type="number" min={100}
                        className="input-field mt-2"
                        value={settings.anomalySpikeThresholdPercent}
                        onChange={(e) => onChange({ anomalySpikeThresholdPercent: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.anomalySpikeThresholdPercent} />
                </label>
            </div>
            <div className="rounded-xl border cw-border cw-surface p-3 flex items-center justify-between">
                <span className="text-sm font-medium cw-text">Hard Limit Enabled</span>
                <CyberToggle
                    checked={settings.hardLimitEnabled}
                    onChange={(v) => onChange({ hardLimitEnabled: v })}
                />
            </div>
        </CollapsibleSection>
    );
}
