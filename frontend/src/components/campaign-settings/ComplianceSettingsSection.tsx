import { ShieldAlert } from 'lucide-react';
import type { ContentLintConfig, DataGovernanceConfig } from '../../types/campaignSettings';
import CyberToggle from '../ui/CyberToggle';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface ComplianceSettingsSectionProps {
    contentLint: ContentLintConfig;
    dataGovernance: DataGovernanceConfig;
    onContentLintChange: (patch: Partial<ContentLintConfig>) => void;
    onDataGovernanceChange: (patch: Partial<DataGovernanceConfig>) => void;
}

function validateLint(s: ContentLintConfig) {
    const errors: Record<string, string> = {};
    if (s.channelLengthLimits.sms < 1) errors.smsLimit = 'SMS length limit must be ≥ 1';
    if (s.channelLengthLimits.emailSubject < 1) errors.emailSubjectLimit = 'Email subject limit must be ≥ 1';
    if (s.warnThreshold < 0) errors.warnThreshold = 'Warn threshold cannot be negative';
    if (s.blockThreshold < s.warnThreshold) errors.blockThreshold = 'Block threshold must be ≥ warn threshold';
    return errors;
}

function validateGov(s: DataGovernanceConfig) {
    const errors: Record<string, string> = {};
    if (s.retentionDays < 1) errors.retentionDays = 'Retention must be ≥ 1 day';
    return errors;
}

export default function ComplianceSettingsSection({
    contentLint,
    dataGovernance,
    onContentLintChange,
    onDataGovernanceChange,
}: ComplianceSettingsSectionProps) {
    const lintErrors = validateLint(contentLint);
    const govErrors = validateGov(dataGovernance);

    return (
        <CollapsibleSection icon={ShieldAlert} title="Compliance & Data Governance">
            {/* Content Lint */}
            <div className="space-y-3">
                <span className="text-sm font-semibold cw-text">Content Lint</span>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text block">
                    <span className="font-medium">Restricted Terms</span>
                    <p className="text-xs cw-muted mt-1">Comma-separated terms to flag</p>
                    <input
                        type="text"
                        className="input-field mt-2"
                        value={contentLint.restrictedTerms.join(', ')}
                        onChange={(e) =>
                            onContentLintChange({
                                restrictedTerms: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                        }
                    />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text block">
                    <span className="font-medium">Compliance Flag Patterns</span>
                    <p className="text-xs cw-muted mt-1">Comma-separated regex patterns</p>
                    <input
                        type="text"
                        className="input-field mt-2"
                        value={contentLint.complianceFlagPatterns.join(', ')}
                        onChange={(e) =>
                            onContentLintChange({
                                complianceFlagPatterns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                        }
                    />
                </label>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                        <span className="font-medium">SMS Length Limit</span>
                        <input
                            type="number" min={1}
                            className="input-field mt-2"
                            value={contentLint.channelLengthLimits.sms}
                            onChange={(e) =>
                                onContentLintChange({
                                    channelLengthLimits: { ...contentLint.channelLengthLimits, sms: Number(e.target.value) },
                                })
                            }
                        />
                        <ValidationMessage message={lintErrors.smsLimit} />
                    </label>
                    <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                        <span className="font-medium">Email Subject Limit</span>
                        <input
                            type="number" min={1}
                            className="input-field mt-2"
                            value={contentLint.channelLengthLimits.emailSubject}
                            onChange={(e) =>
                                onContentLintChange({
                                    channelLengthLimits: { ...contentLint.channelLengthLimits, emailSubject: Number(e.target.value) },
                                })
                            }
                        />
                        <ValidationMessage message={lintErrors.emailSubjectLimit} />
                    </label>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                        <span className="font-medium">Warn Threshold</span>
                        <input
                            type="number" min={0}
                            className="input-field mt-2"
                            value={contentLint.warnThreshold}
                            onChange={(e) => onContentLintChange({ warnThreshold: Number(e.target.value) })}
                        />
                        <ValidationMessage message={lintErrors.warnThreshold} />
                    </label>
                    <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                        <span className="font-medium">Block Threshold</span>
                        <input
                            type="number" min={0}
                            className="input-field mt-2"
                            value={contentLint.blockThreshold}
                            onChange={(e) => onContentLintChange({ blockThreshold: Number(e.target.value) })}
                        />
                        <ValidationMessage message={lintErrors.blockThreshold} />
                    </label>
                </div>
            </div>

            {/* Data Governance */}
            <div className="space-y-3 pt-2 border-t cw-border">
                <span className="text-sm font-semibold cw-text">Data Governance</span>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                        <span className="font-medium">Retention (days)</span>
                        <input
                            type="number" min={1}
                            className="input-field mt-2"
                            value={dataGovernance.retentionDays}
                            onChange={(e) => onDataGovernanceChange({ retentionDays: Number(e.target.value) })}
                        />
                        <ValidationMessage message={govErrors.retentionDays} />
                    </label>
                    <div className="rounded-xl border cw-border cw-surface p-3 flex items-center justify-between">
                        <span className="text-sm font-medium cw-text">PII Masking</span>
                        <CyberToggle
                            checked={dataGovernance.piiMaskingEnabled}
                            onChange={(v) => onDataGovernanceChange({ piiMaskingEnabled: v })}
                        />
                    </div>
                </div>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text block">
                    <span className="font-medium">Export Permission Roles</span>
                    <p className="text-xs cw-muted mt-1">Comma-separated roles allowed to export data</p>
                    <input
                        type="text"
                        className="input-field mt-2"
                        value={dataGovernance.exportPermissionRoles.join(', ')}
                        onChange={(e) =>
                            onDataGovernanceChange({
                                exportPermissionRoles: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                            })
                        }
                    />
                </label>
            </div>
        </CollapsibleSection>
    );
}
