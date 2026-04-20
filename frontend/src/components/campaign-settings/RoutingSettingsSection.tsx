import { Route } from 'lucide-react';
import type { ProviderRoutingConfig } from '../../types/campaignSettings';
import CollapsibleSection from './CollapsibleSection';
import ValidationMessage from './ValidationMessage';

interface RoutingSettingsSectionProps {
    settings: ProviderRoutingConfig;
    onChange: (patch: Partial<ProviderRoutingConfig>) => void;
}

function validate(s: ProviderRoutingConfig) {
    const errors: Record<string, string> = {};
    if (s.circuitBreaker.failureThreshold < 1 || s.circuitBreaker.failureThreshold > 100)
        errors.failureThreshold = 'Failure threshold must be 1–100';
    if (s.circuitBreaker.rollingWindowMs <= 0)
        errors.rollingWindowMs = 'Rolling window must be > 0';
    if (s.circuitBreaker.backoffIntervalMs <= 0)
        errors.backoffIntervalMs = 'Backoff interval must be > 0';
    if (s.retry.baseDelayMs <= 0)
        errors.baseDelayMs = 'Base delay must be > 0';
    if (s.retry.maxAttempts < 1)
        errors.maxAttempts = 'Max attempts must be ≥ 1';
    return errors;
}

export default function RoutingSettingsSection({ settings, onChange }: RoutingSettingsSectionProps) {
    const errors = validate(settings);

    return (
        <CollapsibleSection icon={Route} title="Provider Routing">
            {/* Provider Selection */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">SMS Primary Provider</span>
                    <input
                        type="text"
                        className="input-field mt-2"
                        value={settings.sms.primary}
                        onChange={(e) => onChange({ sms: { ...settings.sms, primary: e.target.value } })}
                    />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">SMS Secondary Provider</span>
                    <input
                        type="text"
                        className="input-field mt-2"
                        value={settings.sms.secondary ?? ''}
                        onChange={(e) => onChange({ sms: { ...settings.sms, secondary: e.target.value || undefined } })}
                    />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Email Primary Provider</span>
                    <input
                        type="text"
                        className="input-field mt-2"
                        value={settings.email.primary}
                        onChange={(e) => onChange({ email: { ...settings.email, primary: e.target.value } })}
                    />
                </label>
                <label className="rounded-xl border cw-border cw-surface p-3 text-sm cw-text">
                    <span className="font-medium">Email Secondary Provider</span>
                    <input
                        type="text"
                        className="input-field mt-2"
                        value={settings.email.secondary ?? ''}
                        onChange={(e) => onChange({ email: { ...settings.email, secondary: e.target.value || undefined } })}
                    />
                </label>
            </div>

            {/* Circuit Breaker */}
            <div className="rounded-xl border cw-border cw-surface p-3 space-y-3">
                <span className="text-sm font-medium cw-text">Circuit Breaker</span>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <label className="text-sm cw-text">
                        Failure Threshold
                        <input
                            type="number" min={1} max={100}
                            className="input-field mt-1"
                            value={settings.circuitBreaker.failureThreshold}
                            onChange={(e) =>
                                onChange({ circuitBreaker: { ...settings.circuitBreaker, failureThreshold: Number(e.target.value) } })
                            }
                        />
                        <ValidationMessage message={errors.failureThreshold} />
                    </label>
                    <label className="text-sm cw-text">
                        Rolling Window (ms)
                        <input
                            type="number" min={1}
                            className="input-field mt-1"
                            value={settings.circuitBreaker.rollingWindowMs}
                            onChange={(e) =>
                                onChange({ circuitBreaker: { ...settings.circuitBreaker, rollingWindowMs: Number(e.target.value) } })
                            }
                        />
                        <ValidationMessage message={errors.rollingWindowMs} />
                    </label>
                    <label className="text-sm cw-text">
                        Backoff Interval (ms)
                        <input
                            type="number" min={1}
                            className="input-field mt-1"
                            value={settings.circuitBreaker.backoffIntervalMs}
                            onChange={(e) =>
                                onChange({ circuitBreaker: { ...settings.circuitBreaker, backoffIntervalMs: Number(e.target.value) } })
                            }
                        />
                        <ValidationMessage message={errors.backoffIntervalMs} />
                    </label>
                </div>
            </div>

            {/* Retry */}
            <div className="rounded-xl border cw-border cw-surface p-3 space-y-3">
                <span className="text-sm font-medium cw-text">Retry Policy</span>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="text-sm cw-text">
                        Base Delay (ms)
                        <input
                            type="number" min={1}
                            className="input-field mt-1"
                            value={settings.retry.baseDelayMs}
                            onChange={(e) =>
                                onChange({ retry: { ...settings.retry, baseDelayMs: Number(e.target.value) } })
                            }
                        />
                        <ValidationMessage message={errors.baseDelayMs} />
                    </label>
                    <label className="text-sm cw-text">
                        Max Attempts
                        <input
                            type="number" min={1}
                            className="input-field mt-1"
                            value={settings.retry.maxAttempts}
                            onChange={(e) =>
                                onChange({ retry: { ...settings.retry, maxAttempts: Number(e.target.value) } })
                            }
                        />
                        <ValidationMessage message={errors.maxAttempts} />
                    </label>
                </div>
            </div>
        </CollapsibleSection>
    );
}
