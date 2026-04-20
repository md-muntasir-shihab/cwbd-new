import { CheckCircle } from 'lucide-react';
import type { ApprovalPolicy } from '../../types/campaignSettings';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface ApprovalSettingsSectionProps {
    settings: ApprovalPolicy;
    onChange: (patch: Partial<ApprovalPolicy>) => void;
}

function validate(s: ApprovalPolicy) {
    const errors: Record<string, string> = {};
    if (s.audienceSizeThreshold < 1)
        errors.audienceSizeThreshold = 'Audience size threshold must be ≥ 1';
    if (s.estimatedCostThreshold < 0)
        errors.estimatedCostThreshold = 'Estimated cost threshold cannot be negative';
    return errors;
}

export default function ApprovalSettingsSection({ settings, onChange }: ApprovalSettingsSectionProps) {
    const errors = validate(settings);

    return (
        <CollapsibleSection icon={CheckCircle} title="Approval Workflow">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Audience Size Threshold</span>
                    <input
                        type="number" min={1}
                        className="input-field mt-2"
                        value={settings.audienceSizeThreshold}
                        onChange={(e) => onChange({ audienceSizeThreshold: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.audienceSizeThreshold} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Estimated Cost Threshold (BDT)</span>
                    <input
                        type="number" min={0}
                        className="input-field mt-2"
                        value={settings.estimatedCostThreshold}
                        onChange={(e) => onChange({ estimatedCostThreshold: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.estimatedCostThreshold} />
                </label>
            </div>
            <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text block">
                <span className="font-medium">Sensitive Segment IDs</span>
                <p className="text-xs cw-muted mt-1">Comma-separated segment IDs that require approval</p>
                <input
                    type="text"
                    className="input-field mt-2"
                    value={settings.sensitiveSegmentIds.join(', ')}
                    onChange={(e) =>
                        onChange({
                            sensitiveSegmentIds: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                        })
                    }
                />
            </label>
        </CollapsibleSection>
    );
}
