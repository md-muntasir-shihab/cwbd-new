import { Settings } from 'lucide-react';
import type { AdvancedNotificationSettings } from '../../types/campaignSettings';
import CyberToggle from '../ui/CyberToggle';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface GeneralSettingsSectionProps {
    settings: AdvancedNotificationSettings;
    onChange: (patch: Partial<AdvancedNotificationSettings>) => void;
}

function validateGeneral(s: AdvancedNotificationSettings) {
    const errors: Record<string, string> = {};
    if (s.dailySmsLimit < 1) errors.dailySmsLimit = 'Daily SMS limit must be at least 1';
    if (s.dailyEmailLimit < 1) errors.dailyEmailLimit = 'Daily email limit must be at least 1';
    if (s.monthlySmsBudgetBDT < 0) errors.monthlySmsBudgetBDT = 'Monthly SMS budget cannot be negative';
    if (s.monthlyEmailBudgetBDT < 0) errors.monthlyEmailBudgetBDT = 'Monthly email budget cannot be negative';
    if (s.quietHours.enabled) {
        if (s.quietHours.startHour < 0 || s.quietHours.startHour > 23) errors.quietStart = 'Start hour must be 0–23';
        if (s.quietHours.endHour < 0 || s.quietHours.endHour > 23) errors.quietEnd = 'End hour must be 0–23';
    }
    if (s.maxRetryCount < 0) errors.maxRetryCount = 'Retry count cannot be negative';
    if (s.retryDelayMinutes < 0) errors.retryDelayMinutes = 'Retry delay cannot be negative';
    if (s.duplicatePreventionWindowMinutes < 0) errors.duplicateWindow = 'Duplicate window cannot be negative';
    return errors;
}

export default function GeneralSettingsSection({ settings, onChange }: GeneralSettingsSectionProps) {
    const errors = validateGeneral(settings);

    return (
        <CollapsibleSection icon={Settings} title="General Settings" defaultOpen>
            {/* Daily Limits */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Daily SMS Limit</span>
                    <input
                        type="number"
                        min={1}
                        className="input-field mt-2"
                        value={settings.dailySmsLimit}
                        onChange={(e) => onChange({ dailySmsLimit: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.dailySmsLimit} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Daily Email Limit</span>
                    <input
                        type="number"
                        min={1}
                        className="input-field mt-2"
                        value={settings.dailyEmailLimit}
                        onChange={(e) => onChange({ dailyEmailLimit: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.dailyEmailLimit} />
                </label>
            </div>

            {/* Monthly Budgets */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Monthly SMS Budget (BDT)</span>
                    <input
                        type="number"
                        min={0}
                        className="input-field mt-2"
                        value={settings.monthlySmsBudgetBDT}
                        onChange={(e) => onChange({ monthlySmsBudgetBDT: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.monthlySmsBudgetBDT} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Monthly Email Budget (BDT)</span>
                    <input
                        type="number"
                        min={0}
                        className="input-field mt-2"
                        value={settings.monthlyEmailBudgetBDT}
                        onChange={(e) => onChange({ monthlyEmailBudgetBDT: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.monthlyEmailBudgetBDT} />
                </label>
            </div>

            {/* Quiet Hours */}
            <div className="rounded-xl border cw-border cw-surface p-3 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-medium cw-text">Quiet Hours</span>
                    <CyberToggle
                        checked={settings.quietHours.enabled}
                        onChange={(v) => onChange({ quietHours: { ...settings.quietHours, enabled: v } })}
                    />
                </div>
                {settings.quietHours.enabled && (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <label className="text-sm cw-text">
                            Start Hour
                            <input
                                type="number" min={0} max={23}
                                className="input-field mt-1"
                                value={settings.quietHours.startHour}
                                onChange={(e) => onChange({ quietHours: { ...settings.quietHours, startHour: Number(e.target.value) } })}
                            />
                            <ValidationMessage message={errors.quietStart} />
                        </label>
                        <label className="text-sm cw-text">
                            End Hour
                            <input
                                type="number" min={0} max={23}
                                className="input-field mt-1"
                                value={settings.quietHours.endHour}
                                onChange={(e) => onChange({ quietHours: { ...settings.quietHours, endHour: Number(e.target.value) } })}
                            />
                            <ValidationMessage message={errors.quietEnd} />
                        </label>
                        <label className="text-sm cw-text">
                            Timezone
                            <input
                                type="text"
                                className="input-field mt-1"
                                value={settings.quietHours.timezone}
                                onChange={(e) => onChange({ quietHours: { ...settings.quietHours, timezone: e.target.value } })}
                            />
                        </label>
                    </div>
                )}
            </div>

            {/* Retry & Duplicate Prevention */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Max Retry Count</span>
                    <input
                        type="number" min={0}
                        className="input-field mt-2"
                        value={settings.maxRetryCount}
                        onChange={(e) => onChange({ maxRetryCount: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.maxRetryCount} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Retry Delay (min)</span>
                    <input
                        type="number" min={0}
                        className="input-field mt-2"
                        value={settings.retryDelayMinutes}
                        onChange={(e) => onChange({ retryDelayMinutes: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.retryDelayMinutes} />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Duplicate Window (min)</span>
                    <input
                        type="number" min={0}
                        className="input-field mt-2"
                        value={settings.duplicatePreventionWindowMinutes}
                        onChange={(e) => onChange({ duplicatePreventionWindowMinutes: Number(e.target.value) })}
                    />
                    <ValidationMessage message={errors.duplicateWindow} />
                </label>
            </div>

            {/* Automation Toggles */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border cw-border cw-surface p-3 flex items-center justify-between">
                    <span className="text-sm font-medium cw-text">Auto-Send Result Publish</span>
                    <CyberToggle
                        checked={settings.resultPublishAutoSend}
                        onChange={(v) => onChange({ resultPublishAutoSend: v })}
                    />
                </div>
                <div className="rounded-xl border cw-border cw-surface p-3 flex items-center justify-between">
                    <span className="text-sm font-medium cw-text">Auto-Sync Cost to Finance</span>
                    <CyberToggle
                        checked={settings.autoSyncCostToFinance}
                        onChange={(v) => onChange({ autoSyncCostToFinance: v })}
                    />
                </div>
            </div>
        </CollapsibleSection>
    );
}
