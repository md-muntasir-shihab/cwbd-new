// ─── Advanced Campaign Settings Type Definitions ─────────────────────────────
// Enterprise-grade campaign configuration sub-interfaces.
// Requirements: 1.1, 1.2, 1.3, 4.1, 5.1, 6.5, 8.1, 9.6, 10.1, 11.7, 13.8, 14.6

import { Types } from 'mongoose';

/** Frequency cap configuration for per-user send limits. Req 4.1 */
export interface FrequencyCapConfig {
    dailyCap: number;       // min: 1
    weeklyCap: number;      // min: 1, must be >= dailyCap
    monthlyCap: number;     // min: 1, must be >= weeklyCap
    cooldownMinutes: number; // min: 0
}

/** Budget guardrail configuration. Req 6.5 */
export interface BudgetGuardrailConfig {
    softLimitPercent: number;              // default 80, range 1-100
    hardLimitEnabled: boolean;             // default true
    anomalySpikeThresholdPercent: number;  // default 200, min 100
}

/** Provider routing configuration with circuit breaker. Req 8.1 */
export interface ProviderRoutingConfig {
    sms: { primary: Types.ObjectId | string; secondary?: Types.ObjectId | string };
    email: { primary: Types.ObjectId | string; secondary?: Types.ObjectId | string };
    channelFallback?: { sms?: 'email'; email?: 'sms' };
    circuitBreaker: {
        failureThreshold: number;     // percent, default 50
        rollingWindowMs: number;      // default 60000
        backoffIntervalMs: number;    // default 30000
    };
    retry: {
        baseDelayMs: number;          // default 1000
        maxAttempts: number;          // default 3
    };
}

/** Approval policy configuration. Req 5.1 */
export interface ApprovalPolicy {
    audienceSizeThreshold: number;    // default 1000
    estimatedCostThreshold: number;   // default 5000
    sensitiveSegmentIds: string[];    // default []
}

/** A/B experiment configuration. Req 9.6 */
export interface ExperimentConfig {
    variants: Array<{
        id: string;
        subject?: string;
        body?: string;
        templateId?: Types.ObjectId | string;
        splitPercent: number;
    }>;
    holdoutPercent: number;                          // default 0, range 0-50
    observationWindowHours: number;                  // default 24
    primaryMetric: 'open' | 'click' | 'conversion'; // default 'open'
}

/** Send-time intelligence configuration. Req 10.1 */
export interface SendTimeConfig {
    deliveryWindow?: { startHour: number; endHour: number };
    quietHourExceptions: string[];  // campaign type keys that bypass quiet hours
    bestTimeEnabled: boolean;       // default false
}

/** Content safety lint configuration. Req 11.7 */
export interface ContentLintConfig {
    restrictedTerms: string[];           // default []
    complianceFlagPatterns: string[];    // regex patterns, default []
    channelLengthLimits: {
        sms: number;                       // default 160
        emailSubject: number;              // default 200
    };
    warnThreshold: number;               // default 3
    blockThreshold: number;              // default 7
}

/** Observability and alerting configuration. Req 13.8 */
export interface ObservabilityConfig {
    sloTargetPercent: number;                // default 99
    queueLagThresholdMinutes: number;        // default 5
    failureSurgeThresholdPercent: number;    // default 10
    costAnomalyThresholdPercent: number;     // default 200
    rollingWindowMinutes: number;            // default 15
}

/** Data governance configuration. Req 14.6 */
export interface DataGovernanceConfig {
    retentionDays: number;           // default 365
    piiMaskingEnabled: boolean;      // default true
    exportPermissionRoles: string[]; // default ['admin', 'superadmin']
}
