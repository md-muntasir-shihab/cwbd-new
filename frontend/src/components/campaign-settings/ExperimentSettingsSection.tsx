import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import type { ExperimentConfig } from '../../types/campaignSettings';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface ExperimentSettingsSectionProps {
    settings: ExperimentConfig;
    onChange: (patch: Partial<ExperimentConfig>) => void;
}

function validate(s: ExperimentConfig) {
    const errors: Record<string, string> = {};
    if (s.holdoutPercent < 0 || s.holdoutPercent > 50)
        errors.holdoutPercent = 'Holdout must be 0–50%';
    if (s.observationWindowHours < 1)
        errors.observationWindowHours = 'Observation window must be ≥ 1 hour';
    const splitSum = s.variants.reduce((sum, v) => sum + v.splitPercent, 0);
    if (s.variants.length > 0 && splitSum !== 100)
        errors.splitPercent = `Variant splits must total 100% (currently ${splitSum}%)`;
    return errors;
}

export default function ExperimentSettingsSection({ settings, onChange }: ExperimentSettingsSectionProps) {
    const errors = validate(settings);

    const updateVariant = (index: number, patch: Partial<ExperimentConfig['variants'][0]>) => {
        const variants = settings.variants.map((v, i) => (i === index ? { ...v, ...patch } : v));
        onChange({ variants });
    };

    const addVariant = () => {
        onChange({
            variants: [
                ...settings.variants,
                { id: `variant-${settings.variants.length + 1}`, splitPercent: 0 },
            ],
        });
    };

    const removeVariant = (index: number) => {
        onChange({ variants: settings.variants.filter((_, i) => i !== index) });
    };

    return (
        <CollapsibleSection icon={FlaskConical} title="A/B Experiment">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Holdout (%)</span>
                    <input
                        type="number" min={0} max={50}
                        className="input-field mt-2"
                        value={settings.holdoutPercent}
                        onChange={(e) => onChange({ holdoutPercent: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.holdoutPercent} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Observation Window (hrs)</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.observationWindowHours}
                        onChange={(e) => onChange({ observationWindowHours: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.observationWindowHours} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Primary Metric</span>
                    <select
                        className="input-field mt-2"
                        value={settings.primaryMetric}
                        onChange={(e) => onChange({ primaryMetric: e.target.value as ExperimentConfig['primaryMetric'] })}
                    >
                        <option value="open">Open</option>
                        <option value="click">Click</option>
                        <option value="conversion">Conversion</option>
                    </select>
                </label>
            </div>

            {/* Variants */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium cw-text">Variants</span>
                    <button
                        type="button"
                        onClick={addVariant}
                        className="btn-outline inline-flex items-center gap-1 text-xs px-2 py-1"
                    >
                        <Plus className="h-3 w-3" /> Add
                    </button>
                </div>
                <ValidationMessage message={errors.splitPercent} />
                {settings.variants.map((variant, i) => (
                    <div key={variant.id} className="rounded-xl border cw-border cw-surface p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium cw-muted">{variant.id}</span>
                            <button
                                type="button"
                                onClick={() => removeVariant(i)}
                                className="text-rose-400 hover:text-rose-300"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            <label className="text-sm cw-text">
                                Split %
                                <input
                                    type="number" min={0} max={100}
                                    className="input-field mt-1"
                                    value={variant.splitPercent}
                                    onChange={(e) => updateVariant(i, { splitPercent: Number(e.target.value) })}
                                />
                            </label>
                            <label className="text-sm cw-text">
                                Subject
                                <input
                                    type="text"
                                    className="input-field mt-1"
                                    value={variant.subject ?? ''}
                                    onChange={(e) => updateVariant(i, { subject: e.target.value || undefined })}
                                />
                            </label>
                            <label className="text-sm cw-text">
                                Template ID
                                <input
                                    type="text"
                                    className="input-field mt-1"
                                    value={variant.templateId ?? ''}
                                    onChange={(e) => updateVariant(i, { templateId: e.target.value || undefined })}
                                />
                            </label>
                        </div>
                    </div>
                ))}
            </div>
        </CollapsibleSection>
    );
}
