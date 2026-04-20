import { Gauge } from 'lucide-react';
import type { FrequencyCapConfig } from '../../types/campaignSettings';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface CapsSettingsSectionProps {
    settings: FrequencyCapConfig;
    onChange: (patch: Partial<FrequencyCapConfig>) => void;
}

function validate(s: FrequencyCapConfig) {
    const errors: Record<string, string> = {};
    if (s.dailyCap < 1) errors.dailyCap = 'Daily cap must be at least 1';
    if (s.weeklyCap < s.dailyCap) errors.weeklyCap = 'Weekly cap must be ≥ daily cap';
    if (s.monthlyCap < s.weeklyCap) errors.monthlyCap = 'Monthly cap must be ≥ weekly cap';
    if (s.cooldownMinutes < 0) errors.cooldownMinutes = 'Cooldown cannot be negative';
    return errors;
}

export default function CapsSettingsSection({ settings, onChange }: CapsSettingsSectionProps) {
    const errors = validate(settings);

    return (
        <CollapsibleSection icon={Gauge} title="Frequency Caps">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Daily Cap</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.dailyCap}
                        onChange={(e) => onChange({ dailyCap: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.dailyCap} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Weekly Cap</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.weeklyCap}
                        onChange={(e) => onChange({ weeklyCap: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.weeklyCap} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Monthly Cap</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.monthlyCap}
                        onChange={(e) => onChange({ monthlyCap: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.monthlyCap} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Cooldown (min)</span>
                    <input
                        type="number" min={0}
                        className="input-field mt-2"
                        value={settings.cooldownMinutes}
                        onChange={(e) => onChange({ cooldownMinutes: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.cooldownMinutes} />
                </label>
            </div>
        </CollapsibleSection>
    );
}
