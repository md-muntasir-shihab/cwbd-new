/**
 * Settings Validator Middleware
 *
 * Express middleware that validates the request body for PUT /api/admin/notification-settings.
 * - Rejects unknown keys with 400 + key list (Req 1.4)
 * - Validates numeric min/max constraints for all config fields (Req 1.5)
 * - Validates relational constraints: dailyCap ≤ weeklyCap ≤ monthlyCap (Req 4.6)
 * - Validates enum values for channels, reasons, metrics, statuses
 */

import { Request, Response, NextFunction } from 'express';

// ─── Known top-level keys ────────────────────────────────────────────────────
const KNOWN_TOP_LEVEL_KEYS = new Set([
    // Existing NotificationSettings fields
    'dailySmsLimit',
    'dailyEmailLimit',
    'monthlySmsBudgetBDT',
    'monthlyEmailBudgetBDT',
    'quietHours',
    'duplicatePreventionWindowMinutes',
    'maxRetryCount',
    'retryDelayMinutes',
    'triggers',
    'subscriptionReminderDays',
    'resultPublishAutoSend',
    'resultPublishChannels',
    'resultPublishGuardianIncluded',
    'autoSyncCostToFinance',
    // Advanced campaign settings fields
    'schemaVersion',
    'frequencyCap',
    'budgetGuardrails',
    'providerRouting',
    'approvalPolicy',
    'experiment',
    'sendTime',
    'contentLint',
    'observability',
    'dataGovernance',
]);

// ─── Enum value sets ─────────────────────────────────────────────────────────
const VALID_CHANNELS = new Set(['sms', 'email']);
const VALID_PRIMARY_METRICS = new Set(['open', 'click', 'conversion']);
const VALID_CHANNEL_FALLBACK_SMS = new Set(['email']);
const VALID_CHANNEL_FALLBACK_EMAIL = new Set(['sms']);

// ─── Validation error collector ──────────────────────────────────────────────
export interface ValidationError {
    path: string;
    message: string;
}

function addError(errors: ValidationError[], path: string, message: string): void {
    errors.push({ path, message });
}

// ─── Numeric range helper ────────────────────────────────────────────────────
function validateNumericRange(
    errors: ValidationError[],
    path: string,
    value: unknown,
    min?: number,
    max?: number,
): void {
    if (value === undefined) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        addError(errors, path, 'must be a finite number');
        return;
    }
    if (min !== undefined && value < min) {
        addError(errors, path, `must be >= ${min}`);
    }
    if (max !== undefined && value > max) {
        addError(errors, path, `must be <= ${max}`);
    }
}

function validateEnum(
    errors: ValidationError[],
    path: string,
    value: unknown,
    allowed: Set<string>,
): void {
    if (value === undefined) return;
    if (typeof value !== 'string' || !allowed.has(value)) {
        addError(errors, path, `must be one of: ${Array.from(allowed).join(', ')}`);
    }
}

function validateEnumArray(
    errors: ValidationError[],
    path: string,
    value: unknown,
    allowed: Set<string>,
): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
        addError(errors, path, 'must be an array');
        return;
    }
    for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string' || !allowed.has(value[i])) {
            addError(errors, path + `[${i}]`, `must be one of: ${Array.from(allowed).join(', ')}`);
        }
    }
}


// ─── Section validators ──────────────────────────────────────────────────────

function validateGeneralFields(body: Record<string, unknown>, errors: ValidationError[]): void {
    validateNumericRange(errors, 'dailySmsLimit', body.dailySmsLimit, 0);
    validateNumericRange(errors, 'dailyEmailLimit', body.dailyEmailLimit, 0);
    validateNumericRange(errors, 'monthlySmsBudgetBDT', body.monthlySmsBudgetBDT, 0);
    validateNumericRange(errors, 'monthlyEmailBudgetBDT', body.monthlyEmailBudgetBDT, 0);
    validateNumericRange(errors, 'duplicatePreventionWindowMinutes', body.duplicatePreventionWindowMinutes, 0);
    validateNumericRange(errors, 'maxRetryCount', body.maxRetryCount, 0);
    validateNumericRange(errors, 'retryDelayMinutes', body.retryDelayMinutes, 0);
    validateEnumArray(errors, 'resultPublishChannels', body.resultPublishChannels, VALID_CHANNELS);

    // Quiet hours sub-fields
    const qh = body.quietHours;
    if (qh !== undefined && typeof qh === 'object' && qh !== null) {
        const q = qh as Record<string, unknown>;
        validateNumericRange(errors, 'quietHours.startHour', q.startHour, 0, 23);
        validateNumericRange(errors, 'quietHours.endHour', q.endHour, 0, 23);
    }
}

function validateFrequencyCap(body: Record<string, unknown>, errors: ValidationError[]): void {
    const fc = body.frequencyCap;
    if (fc === undefined) return;
    if (typeof fc !== 'object' || fc === null) {
        addError(errors, 'frequencyCap', 'must be an object');
        return;
    }
    const f = fc as Record<string, unknown>;
    validateNumericRange(errors, 'frequencyCap.dailyCap', f.dailyCap, 1);
    validateNumericRange(errors, 'frequencyCap.weeklyCap', f.weeklyCap, 1);
    validateNumericRange(errors, 'frequencyCap.monthlyCap', f.monthlyCap, 1);
    validateNumericRange(errors, 'frequencyCap.cooldownMinutes', f.cooldownMinutes, 0);

    // Relational constraint: dailyCap ≤ weeklyCap ≤ monthlyCap (Req 4.6)
    const daily = f.dailyCap;
    const weekly = f.weeklyCap;
    const monthly = f.monthlyCap;
    if (typeof daily === 'number' && typeof weekly === 'number' && daily > weekly) {
        addError(errors, 'frequencyCap.dailyCap', 'dailyCap must be <= weeklyCap');
    }
    if (typeof weekly === 'number' && typeof monthly === 'number' && weekly > monthly) {
        addError(errors, 'frequencyCap.weeklyCap', 'weeklyCap must be <= monthlyCap');
    }
}

function validateBudgetGuardrails(body: Record<string, unknown>, errors: ValidationError[]): void {
    const bg = body.budgetGuardrails;
    if (bg === undefined) return;
    if (typeof bg !== 'object' || bg === null) {
        addError(errors, 'budgetGuardrails', 'must be an object');
        return;
    }
    const b = bg as Record<string, unknown>;
    validateNumericRange(errors, 'budgetGuardrails.softLimitPercent', b.softLimitPercent, 1, 100);
    validateNumericRange(errors, 'budgetGuardrails.anomalySpikeThresholdPercent', b.anomalySpikeThresholdPercent, 100);
}


function validateProviderRouting(body: Record<string, unknown>, errors: ValidationError[]): void {
    const pr = body.providerRouting;
    if (pr === undefined) return;
    if (typeof pr !== 'object' || pr === null) {
        addError(errors, 'providerRouting', 'must be an object');
        return;
    }
    const p = pr as Record<string, unknown>;

    // Circuit breaker sub-fields
    const cb = p.circuitBreaker;
    if (cb !== undefined && typeof cb === 'object' && cb !== null) {
        const c = cb as Record<string, unknown>;
        validateNumericRange(errors, 'providerRouting.circuitBreaker.failureThreshold', c.failureThreshold, 0, 100);
        validateNumericRange(errors, 'providerRouting.circuitBreaker.rollingWindowMs', c.rollingWindowMs, 1);
        validateNumericRange(errors, 'providerRouting.circuitBreaker.backoffIntervalMs', c.backoffIntervalMs, 1);
    }

    // Retry sub-fields
    const rt = p.retry;
    if (rt !== undefined && typeof rt === 'object' && rt !== null) {
        const r = rt as Record<string, unknown>;
        validateNumericRange(errors, 'providerRouting.retry.baseDelayMs', r.baseDelayMs, 1);
        validateNumericRange(errors, 'providerRouting.retry.maxAttempts', r.maxAttempts, 1);
    }

    // Channel fallback enum validation
    const cf = p.channelFallback;
    if (cf !== undefined && typeof cf === 'object' && cf !== null) {
        const fallback = cf as Record<string, unknown>;
        if (fallback.sms !== undefined) {
            validateEnum(errors, 'providerRouting.channelFallback.sms', fallback.sms, VALID_CHANNEL_FALLBACK_SMS);
        }
        if (fallback.email !== undefined) {
            validateEnum(errors, 'providerRouting.channelFallback.email', fallback.email, VALID_CHANNEL_FALLBACK_EMAIL);
        }
    }
}

function validateApprovalPolicy(body: Record<string, unknown>, errors: ValidationError[]): void {
    const ap = body.approvalPolicy;
    if (ap === undefined) return;
    if (typeof ap !== 'object' || ap === null) {
        addError(errors, 'approvalPolicy', 'must be an object');
        return;
    }
    const a = ap as Record<string, unknown>;
    validateNumericRange(errors, 'approvalPolicy.audienceSizeThreshold', a.audienceSizeThreshold, 0);
    validateNumericRange(errors, 'approvalPolicy.estimatedCostThreshold', a.estimatedCostThreshold, 0);
}

function validateExperiment(body: Record<string, unknown>, errors: ValidationError[]): void {
    const exp = body.experiment;
    if (exp === undefined) return;
    if (typeof exp !== 'object' || exp === null) {
        addError(errors, 'experiment', 'must be an object');
        return;
    }
    const e = exp as Record<string, unknown>;
    validateNumericRange(errors, 'experiment.holdoutPercent', e.holdoutPercent, 0, 50);
    validateNumericRange(errors, 'experiment.observationWindowHours', e.observationWindowHours, 1);
    validateEnum(errors, 'experiment.primaryMetric', e.primaryMetric, VALID_PRIMARY_METRICS);

    // Validate variant split percentages
    const variants = e.variants;
    if (variants !== undefined) {
        if (!Array.isArray(variants)) {
            addError(errors, 'experiment.variants', 'must be an array');
        } else {
            for (let i = 0; i < variants.length; i++) {
                const v = variants[i];
                if (typeof v === 'object' && v !== null) {
                    validateNumericRange(errors, `experiment.variants[${i}].splitPercent`, v.splitPercent, 0, 100);
                }
            }
        }
    }
}


function validateSendTime(body: Record<string, unknown>, errors: ValidationError[]): void {
    const st = body.sendTime;
    if (st === undefined) return;
    if (typeof st !== 'object' || st === null) {
        addError(errors, 'sendTime', 'must be an object');
        return;
    }
    const s = st as Record<string, unknown>;

    // Delivery window sub-fields
    const dw = s.deliveryWindow;
    if (dw !== undefined && typeof dw === 'object' && dw !== null) {
        const d = dw as Record<string, unknown>;
        validateNumericRange(errors, 'sendTime.deliveryWindow.startHour', d.startHour, 0, 23);
        validateNumericRange(errors, 'sendTime.deliveryWindow.endHour', d.endHour, 0, 23);
    }
}

function validateContentLint(body: Record<string, unknown>, errors: ValidationError[]): void {
    const cl = body.contentLint;
    if (cl === undefined) return;
    if (typeof cl !== 'object' || cl === null) {
        addError(errors, 'contentLint', 'must be an object');
        return;
    }
    const c = cl as Record<string, unknown>;
    validateNumericRange(errors, 'contentLint.warnThreshold', c.warnThreshold, 0);
    validateNumericRange(errors, 'contentLint.blockThreshold', c.blockThreshold, 0);

    // Channel length limits sub-fields
    const cll = c.channelLengthLimits;
    if (cll !== undefined && typeof cll === 'object' && cll !== null) {
        const limits = cll as Record<string, unknown>;
        validateNumericRange(errors, 'contentLint.channelLengthLimits.sms', limits.sms, 1);
        validateNumericRange(errors, 'contentLint.channelLengthLimits.emailSubject', limits.emailSubject, 1);
    }
}

function validateObservability(body: Record<string, unknown>, errors: ValidationError[]): void {
    const obs = body.observability;
    if (obs === undefined) return;
    if (typeof obs !== 'object' || obs === null) {
        addError(errors, 'observability', 'must be an object');
        return;
    }
    const o = obs as Record<string, unknown>;
    validateNumericRange(errors, 'observability.sloTargetPercent', o.sloTargetPercent, 0, 100);
    validateNumericRange(errors, 'observability.queueLagThresholdMinutes', o.queueLagThresholdMinutes, 1);
    validateNumericRange(errors, 'observability.failureSurgeThresholdPercent', o.failureSurgeThresholdPercent, 0);
    validateNumericRange(errors, 'observability.costAnomalyThresholdPercent', o.costAnomalyThresholdPercent, 100);
    validateNumericRange(errors, 'observability.rollingWindowMinutes', o.rollingWindowMinutes, 1);
}

function validateDataGovernance(body: Record<string, unknown>, errors: ValidationError[]): void {
    const dg = body.dataGovernance;
    if (dg === undefined) return;
    if (typeof dg !== 'object' || dg === null) {
        addError(errors, 'dataGovernance', 'must be an object');
        return;
    }
    const d = dg as Record<string, unknown>;
    validateNumericRange(errors, 'dataGovernance.retentionDays', d.retentionDays, 1);
}


// ─── Core validation function (exported for testing) ─────────────────────────

/**
 * Validates a settings update body and returns an array of validation errors.
 * Returns an empty array if the body is valid.
 */
export function validateSettingsBody(body: Record<string, unknown>): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Reject unknown top-level keys (Req 1.4)
    const unknownKeys = Object.keys(body).filter((k) => !KNOWN_TOP_LEVEL_KEYS.has(k));
    if (unknownKeys.length > 0) {
        addError(
            errors,
            '_unknown',
            `Unknown keys: ${unknownKeys.join(', ')}`,
        );
        // Return early — no point validating values if keys are unknown
        return errors;
    }

    // 2. Validate general / existing fields (Req 1.5)
    validateGeneralFields(body, errors);

    // 3. Validate advanced section fields
    validateFrequencyCap(body, errors);
    validateBudgetGuardrails(body, errors);
    validateProviderRouting(body, errors);
    validateApprovalPolicy(body, errors);
    validateExperiment(body, errors);
    validateSendTime(body, errors);
    validateContentLint(body, errors);
    validateObservability(body, errors);
    validateDataGovernance(body, errors);

    return errors;
}

// ─── Express middleware ──────────────────────────────────────────────────────

/**
 * Express middleware that validates the request body for settings updates.
 * Returns 400 with structured errors on validation failure, otherwise calls next().
 */
export function settingsValidator(req: Request, res: Response, next: NextFunction): void {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ message: 'Validation failed', errors: [{ path: '_body', message: 'Request body must be a JSON object' }] });
        return;
    }

    const errors = validateSettingsBody(body as Record<string, unknown>);
    if (errors.length > 0) {
        res.status(400).json({ message: 'Validation failed', errors });
        return;
    }

    next();
}
