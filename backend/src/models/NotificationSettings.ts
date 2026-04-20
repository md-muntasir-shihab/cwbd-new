import mongoose, { Document, Schema } from 'mongoose';
import type {
    FrequencyCapConfig,
    BudgetGuardrailConfig,
    ProviderRoutingConfig,
    ApprovalPolicy,
    ExperimentConfig,
    SendTimeConfig,
    ContentLintConfig,
    ObservabilityConfig,
    DataGovernanceConfig,
} from '../types/campaignSettings';

export interface IQuietHours {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number;   // 0-23
    timezone: string;
}

export interface ITriggerToggle {
    triggerKey: string;
    enabled: boolean;
    channels: ('sms' | 'email')[];
    guardianIncluded: boolean;
    templateKey?: string;
    delayMinutes?: number;
    batchSize?: number;
    retryEnabled?: boolean;
    quietHoursMode?: 'respect' | 'bypass';
    audienceMode?: 'affected' | 'subscription_active' | 'subscription_renewal_due' | 'custom';
}

export interface INotificationSettings extends Document {
    /* ---- global send limits ---- */
    dailySmsLimit: number;
    dailyEmailLimit: number;
    monthlySmsBudgetBDT: number;
    monthlyEmailBudgetBDT: number;

    /* ---- quiet hours ---- */
    quietHours: IQuietHours;

    /* ---- duplicate prevention ---- */
    duplicatePreventionWindowMinutes: number;

    /* ---- retry policy ---- */
    maxRetryCount: number;
    retryDelayMinutes: number;

    /* ---- automatic trigger toggles ---- */
    triggers: ITriggerToggle[];

    /* ---- reminder config ---- */
    subscriptionReminderDays: number[];   // e.g. [7,3,1]
    resultPublishAutoSend: boolean;
    resultPublishChannels: ('sms' | 'email')[];
    resultPublishGuardianIncluded: boolean;

    /* ---- finance sync toggle ---- */
    autoSyncCostToFinance: boolean;

    /* ---- schema version (Req 1.3, 18.3) ---- */
    schemaVersion: number;

    /* ---- advanced campaign settings (Req 1.1, 1.2) ---- */
    frequencyCap: FrequencyCapConfig;
    budgetGuardrails: BudgetGuardrailConfig;
    providerRouting: ProviderRoutingConfig;
    approvalPolicy: ApprovalPolicy;
    experiment: ExperimentConfig;
    sendTime: SendTimeConfig;
    contentLint: ContentLintConfig;
    observability: ObservabilityConfig;
    dataGovernance: DataGovernanceConfig;

    createdAt: Date;
    updatedAt: Date;
}

const QuietHoursSchema = new Schema<IQuietHours>(
    {
        enabled: { type: Boolean, default: false },
        startHour: { type: Number, default: 22, min: 0, max: 23 },
        endHour: { type: Number, default: 7, min: 0, max: 23 },
        timezone: { type: String, default: 'Asia/Dhaka' },
    },
    { _id: false },
);

const TriggerToggleSchema = new Schema<ITriggerToggle>(
    {
        triggerKey: { type: String, required: true, trim: true },
        enabled: { type: Boolean, default: true },
        channels: [{ type: String, enum: ['sms', 'email'] }],
        guardianIncluded: { type: Boolean, default: false },
        templateKey: { type: String, trim: true, uppercase: true, default: '' },
        delayMinutes: { type: Number, default: 0, min: 0, max: 10080 },
        batchSize: { type: Number, default: 0, min: 0, max: 10000 },
        retryEnabled: { type: Boolean, default: true },
        quietHoursMode: { type: String, enum: ['respect', 'bypass'], default: 'respect' },
        audienceMode: {
            type: String,
            enum: ['affected', 'subscription_active', 'subscription_renewal_due', 'custom'],
            default: 'affected',
        },
    },
    { _id: false },
);

// ─── Migration-safe defaults for advanced fields (Req 1.2, 18.3) ─────────────
// Merged on read when schemaVersion is absent or < 2.
export const ADVANCED_SETTINGS_DEFAULTS: {
    schemaVersion: number;
    frequencyCap: FrequencyCapConfig;
    budgetGuardrails: BudgetGuardrailConfig;
    providerRouting: ProviderRoutingConfig;
    approvalPolicy: ApprovalPolicy;
    experiment: ExperimentConfig;
    sendTime: SendTimeConfig;
    contentLint: ContentLintConfig;
    observability: ObservabilityConfig;
    dataGovernance: DataGovernanceConfig;
} = {
    schemaVersion: 2,
    frequencyCap: {
        dailyCap: 5,
        weeklyCap: 20,
        monthlyCap: 60,
        cooldownMinutes: 0,
    },
    budgetGuardrails: {
        softLimitPercent: 80,
        hardLimitEnabled: true,
        anomalySpikeThresholdPercent: 200,
    },
    providerRouting: {
        sms: { primary: '' },
        email: { primary: '' },
        circuitBreaker: {
            failureThreshold: 50,
            rollingWindowMs: 60_000,
            backoffIntervalMs: 30_000,
        },
        retry: {
            baseDelayMs: 1_000,
            maxAttempts: 3,
        },
    },
    approvalPolicy: {
        audienceSizeThreshold: 1000,
        estimatedCostThreshold: 5000,
        sensitiveSegmentIds: [],
    },
    experiment: {
        variants: [],
        holdoutPercent: 0,
        observationWindowHours: 24,
        primaryMetric: 'open',
    },
    sendTime: {
        quietHourExceptions: [],
        bestTimeEnabled: false,
    },
    contentLint: {
        restrictedTerms: [],
        complianceFlagPatterns: [],
        channelLengthLimits: { sms: 160, emailSubject: 200 },
        warnThreshold: 3,
        blockThreshold: 7,
    },
    observability: {
        sloTargetPercent: 99,
        queueLagThresholdMinutes: 5,
        failureSurgeThresholdPercent: 10,
        costAnomalyThresholdPercent: 200,
        rollingWindowMinutes: 15,
    },
    dataGovernance: {
        retentionDays: 365,
        piiMaskingEnabled: true,
        exportPermissionRoles: ['admin', 'superadmin'],
    },
};

/**
 * Merges migration-safe defaults into a legacy settings document.
 * Only fills in fields that are missing; never overwrites existing values.
 * Req 1.2, 18.3
 */
export function applyMigrationDefaults(
    doc: Record<string, unknown>,
): Record<string, unknown> {
    const version = (doc.schemaVersion as number | undefined) ?? 0;
    if (version >= 2) return doc;

    const merged = { ...doc };
    for (const [key, defaultVal] of Object.entries(ADVANCED_SETTINGS_DEFAULTS)) {
        if (merged[key] === undefined || merged[key] === null) {
            merged[key] = defaultVal;
        }
    }
    return merged;
}

// ─── Mongoose sub-schemas for advanced fields ────────────────────────────────

const FrequencyCapSchema = new Schema(
    {
        dailyCap: { type: Number, default: 5, min: 1 },
        weeklyCap: { type: Number, default: 20, min: 1 },
        monthlyCap: { type: Number, default: 60, min: 1 },
        cooldownMinutes: { type: Number, default: 0, min: 0 },
    },
    { _id: false },
);

const BudgetGuardrailSchema = new Schema(
    {
        softLimitPercent: { type: Number, default: 80, min: 1, max: 100 },
        hardLimitEnabled: { type: Boolean, default: true },
        anomalySpikeThresholdPercent: { type: Number, default: 200, min: 100 },
    },
    { _id: false },
);

const ProviderChannelSchema = new Schema(
    {
        primary: { type: Schema.Types.Mixed, default: '' },
        secondary: { type: Schema.Types.Mixed },
    },
    { _id: false },
);

const CircuitBreakerSchema = new Schema(
    {
        failureThreshold: { type: Number, default: 50 },
        rollingWindowMs: { type: Number, default: 60_000 },
        backoffIntervalMs: { type: Number, default: 30_000 },
    },
    { _id: false },
);

const RetrySchema = new Schema(
    {
        baseDelayMs: { type: Number, default: 1_000 },
        maxAttempts: { type: Number, default: 3 },
    },
    { _id: false },
);

const ChannelFallbackSchema = new Schema(
    {
        sms: { type: String, enum: ['email'] },
        email: { type: String, enum: ['sms'] },
    },
    { _id: false },
);

const ProviderRoutingSchema = new Schema(
    {
        sms: { type: ProviderChannelSchema, default: () => ({}) },
        email: { type: ProviderChannelSchema, default: () => ({}) },
        channelFallback: { type: ChannelFallbackSchema },
        circuitBreaker: { type: CircuitBreakerSchema, default: () => ({}) },
        retry: { type: RetrySchema, default: () => ({}) },
    },
    { _id: false },
);

const ApprovalPolicySchema = new Schema(
    {
        audienceSizeThreshold: { type: Number, default: 1000 },
        estimatedCostThreshold: { type: Number, default: 5000 },
        sensitiveSegmentIds: { type: [String], default: [] },
    },
    { _id: false },
);

const ExperimentVariantSchema = new Schema(
    {
        id: { type: String, required: true },
        subject: { type: String },
        body: { type: String },
        templateId: { type: Schema.Types.ObjectId },
        splitPercent: { type: Number, required: true },
    },
    { _id: false },
);

const ExperimentConfigSchema = new Schema(
    {
        variants: { type: [ExperimentVariantSchema], default: [] },
        holdoutPercent: { type: Number, default: 0, min: 0, max: 50 },
        observationWindowHours: { type: Number, default: 24 },
        primaryMetric: { type: String, enum: ['open', 'click', 'conversion'], default: 'open' },
    },
    { _id: false },
);

const DeliveryWindowSchema = new Schema(
    {
        startHour: { type: Number, min: 0, max: 23 },
        endHour: { type: Number, min: 0, max: 23 },
    },
    { _id: false },
);

const SendTimeConfigSchema = new Schema(
    {
        deliveryWindow: { type: DeliveryWindowSchema },
        quietHourExceptions: { type: [String], default: [] },
        bestTimeEnabled: { type: Boolean, default: false },
    },
    { _id: false },
);

const ChannelLengthLimitsSchema = new Schema(
    {
        sms: { type: Number, default: 160 },
        emailSubject: { type: Number, default: 200 },
    },
    { _id: false },
);

const ContentLintConfigSchema = new Schema(
    {
        restrictedTerms: { type: [String], default: [] },
        complianceFlagPatterns: { type: [String], default: [] },
        channelLengthLimits: { type: ChannelLengthLimitsSchema, default: () => ({}) },
        warnThreshold: { type: Number, default: 3 },
        blockThreshold: { type: Number, default: 7 },
    },
    { _id: false },
);

const ObservabilityConfigSchema = new Schema(
    {
        sloTargetPercent: { type: Number, default: 99 },
        queueLagThresholdMinutes: { type: Number, default: 5 },
        failureSurgeThresholdPercent: { type: Number, default: 10 },
        costAnomalyThresholdPercent: { type: Number, default: 200 },
        rollingWindowMinutes: { type: Number, default: 15 },
    },
    { _id: false },
);

const DataGovernanceConfigSchema = new Schema(
    {
        retentionDays: { type: Number, default: 365 },
        piiMaskingEnabled: { type: Boolean, default: true },
        exportPermissionRoles: { type: [String], default: ['admin', 'superadmin'] },
    },
    { _id: false },
);

const NotificationSettingsSchema = new Schema<INotificationSettings>(
    {
        dailySmsLimit: { type: Number, default: 500 },
        dailyEmailLimit: { type: Number, default: 2000 },
        monthlySmsBudgetBDT: { type: Number, default: 5000 },
        monthlyEmailBudgetBDT: { type: Number, default: 1000 },

        quietHours: { type: QuietHoursSchema, default: () => ({}) },

        duplicatePreventionWindowMinutes: { type: Number, default: 60 },

        maxRetryCount: { type: Number, default: 3 },
        retryDelayMinutes: { type: Number, default: 15 },

        triggers: { type: [TriggerToggleSchema], default: [] },

        subscriptionReminderDays: { type: [Number], default: [7, 3, 1] },
        resultPublishAutoSend: { type: Boolean, default: false },
        resultPublishChannels: [{ type: String, enum: ['sms', 'email'] }],
        resultPublishGuardianIncluded: { type: Boolean, default: false },

        autoSyncCostToFinance: { type: Boolean, default: true },

        /* ---- schema version ---- */
        schemaVersion: { type: Number, default: 2 },

        /* ---- advanced campaign settings ---- */
        frequencyCap: { type: FrequencyCapSchema, default: () => ({}) },
        budgetGuardrails: { type: BudgetGuardrailSchema, default: () => ({}) },
        providerRouting: { type: ProviderRoutingSchema, default: () => ({}) },
        approvalPolicy: { type: ApprovalPolicySchema, default: () => ({}) },
        experiment: { type: ExperimentConfigSchema, default: () => ({}) },
        sendTime: { type: SendTimeConfigSchema, default: () => ({}) },
        contentLint: { type: ContentLintConfigSchema, default: () => ({}) },
        observability: { type: ObservabilityConfigSchema, default: () => ({}) },
        dataGovernance: { type: DataGovernanceConfigSchema, default: () => ({}) },
    },
    { timestamps: true },
);

export default mongoose.model<INotificationSettings>('NotificationSettings', NotificationSettingsSchema);
