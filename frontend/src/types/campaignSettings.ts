// ─── Advanced Campaign Settings Frontend Types ──────────────────────────────
// Mirrors backend types from backend/src/types/campaignSettings.ts
// Requirements: 16.1

/** Frequency cap configuration for per-user send limits. Req 4.1 */
export interface FrequencyCapConfig {
    dailyCap: number;
    weeklyCap: number;
    monthlyCap: number;
    cooldownMinutes: number;
}

/** Budget guardrail configuration. Req 6.5 */
export interface BudgetGuardrailConfig {
    softLimitPercent: number;
    hardLimitEnabled: boolean;
    anomalySpikeThresholdPercent: number;
}

/** Provider routing configuration with circuit breaker. Req 8.1 */
export interface ProviderRoutingConfig {
    sms: { primary: string; secondary?: string };
    email: { primary: string; secondary?: string };
    channelFallback?: { sms?: 'email'; email?: 'sms' };
    circuitBreaker: {
        failureThreshold: number;
        rollingWindowMs: number;
        backoffIntervalMs: number;
    };
    retry: {
        baseDelayMs: number;
        maxAttempts: number;
    };
}

/** Approval policy configuration. Req 5.1 */
export interface ApprovalPolicy {
    audienceSizeThreshold: number;
    estimatedCostThreshold: number;
    sensitiveSegmentIds: string[];
}

/** A/B experiment configuration. Req 9.6 */
export interface ExperimentConfig {
    variants: Array<{
        id: string;
        subject?: string;
        body?: string;
        templateId?: string;
        splitPercent: number;
    }>;
    holdoutPercent: number;
    observationWindowHours: number;
    primaryMetric: 'open' | 'click' | 'conversion';
}

/** Send-time intelligence configuration. Req 10.1 */
export interface SendTimeConfig {
    deliveryWindow?: { startHour: number; endHour: number };
    quietHourExceptions: string[];
    bestTimeEnabled: boolean;
}

/** Content safety lint configuration. Req 11.7 */
export interface ContentLintConfig {
    restrictedTerms: string[];
    complianceFlagPatterns: string[];
    channelLengthLimits: {
        sms: number;
        emailSubject: number;
    };
    warnThreshold: number;
    blockThreshold: number;
}

/** Observability and alerting configuration. Req 13.8 */
export interface ObservabilityConfig {
    sloTargetPercent: number;
    queueLagThresholdMinutes: number;
    failureSurgeThresholdPercent: number;
    costAnomalyThresholdPercent: number;
    rollingWindowMinutes: number;
}

/** Data governance configuration. Req 14.6 */
export interface DataGovernanceConfig {
    retentionDays: number;
    piiMaskingEnabled: boolean;
    exportPermissionRoles: string[];
}

/** Full advanced notification settings object */
export interface AdvancedNotificationSettings {
    _id?: string;
    schemaVersion: number;

    // Existing general fields
    dailySmsLimit: number;
    dailyEmailLimit: number;
    monthlySmsBudgetBDT: number;
    monthlyEmailBudgetBDT: number;
    quietHours: { enabled: boolean; startHour: number; endHour: number; timezone: string };
    duplicatePreventionWindowMinutes: number;
    maxRetryCount: number;
    retryDelayMinutes: number;
    triggerToggles: { triggerKey: string; enabled: boolean; channels: string[]; guardianIncluded: boolean }[];
    subscriptionReminderDays: number[];
    resultPublishAutoSend: boolean;
    autoSyncCostToFinance: boolean;

    // Advanced fields
    frequencyCap: FrequencyCapConfig;
    budgetGuardrail: BudgetGuardrailConfig;
    providerRouting: ProviderRoutingConfig;
    approvalPolicy: ApprovalPolicy;
    experiment: ExperimentConfig;
    sendTime: SendTimeConfig;
    contentLint: ContentLintConfig;
    observability: ObservabilityConfig;
    dataGovernance: DataGovernanceConfig;
}

/** Individual policy evaluation result in a simulation */
export interface PolicyResult {
    policy: string;
    status: 'pass' | 'fail' | 'warn';
    reason: string;
}

/** Simulation result from the test configuration endpoint */
export interface SimulationResult {
    decisionPath: PolicyResult[];
    estimatedCost: number;
    eligibleCount: number;
    suppressedCount: number;
    cappedCount: number;
    selectedProviderRoute: string;
    blocked: boolean;
    blockingPolicy?: string;
    blockingReason?: string;
}

/** Settings audit trail entry */
export interface SettingsAuditEntry {
    _id?: string;
    actorId: string;
    actorRole: string;
    timestamp: string;
    ipAddress: string;
    section: string;
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot: Record<string, unknown>;
    diff: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
}

/** Paginated audit trail response */
export interface AuditTrailResponse {
    items: SettingsAuditEntry[];
    total: number;
}
