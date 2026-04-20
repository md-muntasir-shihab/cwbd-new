import { Activity } from 'lucide-react';
import type { ObservabilityConfig } from '../../types/campaignSettings';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface ObservabilitySettingsSectionProps {
    settings: ObservabilityConfig;
    onChange: (patch: Partial<ObservabilityConfig>) => void;
}

function validate(s: ObservabilityConfig) {
    const errors: Record<string, string> = {};
    if (s.sloTargetPercent < 1 || s.sloTargetPercent > 100)
        errors.sloTargetPercent = 'SLO target must be 1–100%';
    if (s.queueLagThresholdMinutes <= 0)
        errors.queueLagThresholdMinutes = 'Queue lag threshold must be > 0';
    if (s.failureSurgeThresholdPercent <= 0)
        errors.failureSurgeThresholdPercent = 'Failure surge threshold must be > 0';
    if (s.costAnomalyThresholdPercent <= 0)
        errors.costAnomalyThresholdPercent = 'Cost anomaly threshold must be > 0';
    if (s.rollingWindowMinutes <= 0)
        errors.rollingWindowMinutes = 'Rolling window must be > 0';
    return errors;
}

export default function ObservabilitySettingsSection({ settings, onChange }: ObservabilitySettingsSectionProps) {
    const errors = validate(settings);

    return (
        <CollapsibleSection icon={Activity} title="Observability">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">SLO Target (%)</span>
                    <input
                        type="number" min={1} max={100}
                        className="input-field mt-2"
                        value={settings.sloTargetPercent}
                        onChange={(e) => onChange({ sloTargetPercent: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.sloTargetPercent} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Queue Lag Threshold (min)</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.queueLagThresholdMinutes}
                        onChange={(e) => onChange({ queueLagThresholdMinutes: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.queueLagThresholdMinutes} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Failure Surge Threshold (%)</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.failureSurgeThresholdPercent}
                        onChange={(e) => onChange({ failureSurgeThresholdPercent: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.failureSurgeThresholdPercent} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Cost Anomaly Threshold (%)</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.costAnomalyThresholdPercent}
                        onChange={(e) => onChange({ costAnomalyThresholdPercent: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.costAnomalyThresholdPercent} />
                </label>
            </div>
            <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text block">
                <span className="font-medium">Rolling Window (min)</span>
                <input
                    type="number" min={1}
                    className="input-field mt-2"
                    value={settings.rollingWindowMinutes}
                    onChange={(e) => onChange({ rollingWindowMinutes: Number(e.target.value) })}
                />
                <ValidationMessage message={errors.rollingWindowMinutes} />
            </label>
        </CollapsibleSection>
    );
}
