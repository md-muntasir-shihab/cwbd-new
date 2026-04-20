import { ShieldCheck } from 'lucide-react';
import type { SendTimeConfig } from '../../types/campaignSettings';
import CyberToggle from '../ui/CyberToggle';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface ConsentSettingsSectionProps {
    settings: SendTimeConfig;
    onChange: (patch: Partial<SendTimeConfig>) => void;
}

function validate(s: SendTimeConfig) {
    const errors: Record<string, string> = {};
    if (s.deliveryWindow) {
        if (s.deliveryWindow.startHour < 0 || s.deliveryWindow.startHour > 23)
            errors.startHour = 'Start hour must be 0–23';
        if (s.deliveryWindow.endHour < 0 || s.deliveryWindow.endHour > 23)
            errors.endHour = 'End hour must be 0–23';
        if (s.deliveryWindow.startHour >= s.deliveryWindow.endHour)
            errors.window = 'Start hour must be before end hour';
    }
    return errors;
}

export default function ConsentSettingsSection({ settings, onChange }: ConsentSettingsSectionProps) {
    const errors = validate(settings);

    return (
        <CollapsibleSection icon={ShieldCheck} title="Consent & Send-Time">
            {/* Delivery Window */}
            <div className="rounded-xl border cw-border cw-surface p-3 space-y-3">
                <span className="text-sm font-medium cw-text">Delivery Window</span>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm cw-text">
                        Start Hour
                        <input
                            type="number" min={0} max={23}
                            className="input-field mt-1"
                            value={settings.deliveryWindow?.startHour ?? 8}
                            onChange={(e) =>
                                onChange({
                                    deliveryWindow: {
                                        startHour: Number(e.target.value),
                                        endHour: settings.deliveryWindow?.endHour ?? 20,
                                    },
                                })
                            }
                        />
                        <ValidationMessage message={errors.startHour || errors.window} />
                    </label>
                    <label className="text-sm cw-text">
                        End Hour
                        <input
                            type="number" min={0} max={23}
                            className="input-field mt-1"
                            value={settings.deliveryWindow?.endHour ?? 20}
                            onChange={(e) =>
                                onChange({
                                    deliveryWindow: {
                                        startHour: settings.deliveryWindow?.startHour ?? 8,
                                        endHour: Number(e.target.value),
                                    },
                                })
                            }
                        />
                        <ValidationMessage message={errors.endHour} />
                    </label>
                </div>
            </div>

            {/* Quiet Hour Exceptions */}
            <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text block">
                <span className="font-medium">Quiet Hour Exceptions</span>
                <p className="text-xs cw-muted mt-1">Comma-separated campaign types that bypass quiet hours</p>
                <input
                    type="text"
                    className="input-field mt-2"
                    value={settings.quietHourExceptions.join(', ')}
                    onChange={(e) =>
                        onChange({
                            quietHourExceptions: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                        })
                    }
                />
            </label>

            {/* Best Time */}
            <div className="rounded-xl border cw-border cw-surface p-3 flex items-center justify-between">
                <div>
                    <span className="text-sm font-medium cw-text">Best-Time Optimization</span>
                    <p className="text-xs cw-muted">Use ML-based send-time scoring per recipient</p>
                </div>
                <CyberToggle
                    checked={settings.bestTimeEnabled}
                    onChange={(v) => onChange({ bestTimeEnabled: v })}
                />
            </div>
        </CollapsibleSection>
    );
}
