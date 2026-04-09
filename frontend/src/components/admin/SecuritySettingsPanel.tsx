import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    KeyRound,
    Loader2,
    Lock,
    LogOut,
    RefreshCcw,
    Save,
    ServerCrash,
    Shield,
    ShieldAlert,
    ShieldCheck,
    TimerReset,
    UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    adminApprovePendingAction,
    adminForceLogoutAllUsers,
    adminGetPendingApprovals,
    adminGetSecurityCenterSettings,
    adminRejectPendingAction,
    adminResetSecurityCenterSettings,
    adminSetAdminPanelLockState,
    adminUpdateSecurityCenterSettings,
    type AdminActionApproval,
    type SecurityCenterSettings,
} from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { showConfirmDialog, showPromptDialog } from '../../lib/appDialog';
import AdminAuthenticatorSetup from './AdminAuthenticatorSetup';
import SecurityHelpButton from './SecurityHelpButton';

type PasswordPolicyKey = 'default' | 'admin' | 'staff' | 'student';
type VisibleTwoFactorMethod = 'authenticator' | 'email';
type RiskyActionKey = SecurityCenterSettings['twoPersonApproval']['riskyActions'][number];
type NormalizedSecurityCenterSettings = SecurityCenterSettings & {
    authentication: NonNullable<SecurityCenterSettings['authentication']>;
    passwordPolicies: NonNullable<SecurityCenterSettings['passwordPolicies']>;
    twoFactor: Omit<NonNullable<SecurityCenterSettings['twoFactor']>, 'allowedMethods' | 'defaultMethod'> & {
        allowedMethods: VisibleTwoFactorMethod[];
        defaultMethod: VisibleTwoFactorMethod;
    };
    sessions: NonNullable<SecurityCenterSettings['sessions']>;
    accessControl: NonNullable<SecurityCenterSettings['accessControl']>;
    verificationRecovery: NonNullable<SecurityCenterSettings['verificationRecovery']>;
    uploadSecurity: NonNullable<SecurityCenterSettings['uploadSecurity']>;
    alerting: NonNullable<SecurityCenterSettings['alerting']>;
    exportSecurity: NonNullable<SecurityCenterSettings['exportSecurity']>;
    backupRestore: NonNullable<SecurityCenterSettings['backupRestore']>;
    runtimeGuards: NonNullable<SecurityCenterSettings['runtimeGuards']>;
};

const ROLE_OPTIONS = [
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'moderator', label: 'Moderator' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Viewer' },
    { value: 'support_agent', label: 'Support' },
    { value: 'finance_agent', label: 'Finance' },
    { value: 'chairman', label: 'Chairman' },
    { value: 'student', label: 'Student' },
] as const;

const EXPORT_ROLE_OPTIONS = [
    { value: 'superadmin', label: 'Super Admin' },
    { value: 'admin', label: 'Admin' },
    { value: 'moderator', label: 'Moderator' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Viewer' },
    { value: 'support_agent', label: 'Support' },
    { value: 'finance_agent', label: 'Finance' },
    { value: 'chairman', label: 'Chairman' },
] as const;

const PASSWORD_POLICY_KEYS: PasswordPolicyKey[] = ['default', 'admin', 'staff', 'student'];

const TWO_FACTOR_METHOD_OPTIONS: Array<{ value: VisibleTwoFactorMethod; label: string; description: string }> = [
    { value: 'authenticator', label: 'Authenticator', description: 'TOTP app codes for production-grade MFA.' },
    { value: 'email', label: 'Email OTP', description: 'Email-delivered codes for lower-friction verification.' },
];

const RISKY_ACTION_OPTIONS: Array<{ value: RiskyActionKey; label: string; description: string }> = [
    { value: 'data.destructive_change', label: 'Destructive Data Change', description: 'Bulk or irreversible data mutations.' },
    { value: 'students.bulk_delete', label: 'Bulk Student Delete', description: 'Delete multiple students at once.' },
    { value: 'universities.bulk_delete', label: 'Bulk University Delete', description: 'Delete multiple universities at once.' },
    { value: 'news.bulk_delete', label: 'Bulk News Delete', description: 'Delete multiple news entries at once.' },
    { value: 'exams.publish_result', label: 'Publish Exam Result', description: 'Release protected exam result data.' },
    { value: 'news.publish_breaking', label: 'Publish Breaking News', description: 'Send high-priority news immediately.' },
    { value: 'payments.mark_refunded', label: 'Mark Payment Refunded', description: 'Finalize refund-sensitive finance actions.' },
    { value: 'students.export', label: 'Student Export', description: 'Export protected student records.' },
    { value: 'finance.adjustment', label: 'Finance Adjustment', description: 'Manual finance corrections and adjustments.' },
    { value: 'providers.credentials_change', label: 'Provider Credentials', description: 'Change external provider credentials.' },
    { value: 'security.settings_change', label: 'Security Settings Change', description: 'Change core security policies.' },
    { value: 'backups.restore', label: 'Backup Restore', description: 'Restore data from backups.' },
];

const DEFAULT_SETTINGS: NormalizedSecurityCenterSettings = {
    passwordPolicy: { minLength: 10, requireNumber: true, requireUppercase: true, requireSpecial: true },
    loginProtection: { maxAttempts: 5, lockoutMinutes: 15, recaptchaEnabled: false },
    session: { accessTokenTTLMinutes: 20, refreshTokenTTLDays: 7, idleTimeoutMinutes: 60 },
    adminAccess: { require2FAForAdmins: false, allowedAdminIPs: [], adminPanelEnabled: true },
    siteAccess: { maintenanceMode: false, blockNewRegistrations: false },
    examProtection: { maxActiveSessionsPerUser: 5, logTabSwitch: true, requireProfileScoreForExam: true, profileScoreThreshold: 70 },
    logging: { logLevel: 'info', logLoginFailures: true, logAdminActions: true },
    rateLimit: { loginWindowMs: 15 * 60 * 1000, loginMax: 10, examSubmitWindowMs: 15 * 60 * 1000, examSubmitMax: 60, adminWindowMs: 15 * 60 * 1000, adminMax: 300, uploadWindowMs: 15 * 60 * 1000, uploadMax: 80 },
    twoPersonApproval: { enabled: false, riskyActions: RISKY_ACTION_OPTIONS.map((option) => option.value), approvalExpiryMinutes: 120 },
    retention: { enabled: false, examSessionsDays: 30, auditLogsDays: 180, eventLogsDays: 90 },
    panic: { readOnlyMode: false, disableStudentLogins: false, disablePaymentWebhooks: false, disableExamStarts: false },
    authentication: {
        loginAttemptsLimit: 5,
        lockDurationMinutes: 15,
        genericErrorMessages: true,
        verificationRequired: true,
        allowedLoginMethods: ['username', 'email'],
        accountLockEnabled: true,
        newDeviceAlerts: true,
        suspiciousLoginAlerts: true,
        adminLoginAlerts: true,
        throttleWindowMinutes: 15,
        otpResendLimit: 8,
        otpVerifyLimit: 25,
        recaptchaEnabled: false,
    },
    passwordPolicies: {
        default: { minLength: 10, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: true, denyCommonPasswords: true, preventReuseCount: 5, expiryDays: 0, forceResetOnFirstLogin: false },
        admin: { minLength: 12, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: true, denyCommonPasswords: true, preventReuseCount: 8, expiryDays: 90, forceResetOnFirstLogin: true },
        staff: { minLength: 10, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: true, denyCommonPasswords: true, preventReuseCount: 5, expiryDays: 180, forceResetOnFirstLogin: true },
        student: { minLength: 10, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: false, denyCommonPasswords: true, preventReuseCount: 3, expiryDays: 0, forceResetOnFirstLogin: false },
        strengthMeterEnabled: true,
    },
    twoFactor: {
        requireForRoles: [],
        optionalForStudents: true,
        allowedMethods: ['authenticator', 'email'],
        defaultMethod: 'authenticator',
        emailFallbackEnabled: true,
        smsFallbackEnabled: false,
        backupCodesEnabled: true,
        stepUpForSensitiveActions: true,
        otpExpiryMinutes: 10,
        maxAttempts: 5,
    },
    sessions: { accessTokenTTLMinutes: 20, refreshTokenTTLDays: 7, idleTimeoutMinutes: 60, absoluteTimeoutHours: 24, rememberDeviceDays: 30, maxActiveSessionsPerUser: 5, allowConcurrentSessions: true },
    accessControl: { enforceRoutePolicies: true, allowedAdminIPs: [], requireApprovalForRiskyActions: false, sensitiveActionReasonRequired: true, exportAllowedRoles: ['superadmin', 'admin', 'finance_agent'] },
    verificationRecovery: { requireVerifiedEmailForStudents: false, requireVerifiedEmailForAdmins: false, phoneVerificationEnabled: false, emailVerificationExpiryHours: 24, passwordResetExpiryMinutes: 60, resendCooldownMinutes: 5, allowAdminRecovery: true },
    uploadSecurity: { publicAllowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'], protectedAllowedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx'], maxImageSizeMB: 5, maxDocumentSizeMB: 10, blockDangerousExtensions: true, protectedAccessEnabled: true, virusScanStatus: 'hook_ready' },
    alerting: { recipients: [], failedLoginThreshold: 10, otpFailureThreshold: 10, backupFailureAlerts: true, providerChangeAlerts: true, exportAlerts: true, suspiciousAdminAlerts: true },
    exportSecurity: { allowedRoles: ['superadmin', 'admin', 'finance_agent'], requireApproval: false, requireReason: true, logAllExports: true, maskSensitiveFields: true },
    backupRestore: { backupHealthWarnAfterHours: 24, requireRestoreApproval: true, archiveBeforeHardDelete: true, showStatusOnDashboard: true },
    runtimeGuards: { maintenanceMode: false, blockNewRegistrations: false, readOnlyMode: false, disableStudentLogins: false, disablePaymentWebhooks: false, disableExamStarts: false, adminPanelEnabled: true, testingAccessMode: false },
    updatedBy: null,
    updatedAt: null,
};

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueStrings(values: Iterable<string>): string[] {
    return Array.from(new Set(Array.from(values).map((value) => String(value || '').trim()).filter(Boolean)));
}

function normalizeRoles(values: Iterable<string>, allow: readonly string[]): string[] {
    const allowed = new Set(allow.map((item) => item.toLowerCase()));
    return uniqueStrings(values).map((item) => item.toLowerCase()).filter((item) => allowed.has(item));
}

function normalizeAllowedMethods(values: Iterable<string>): VisibleTwoFactorMethod[] {
    return normalizeRoles(values, TWO_FACTOR_METHOD_OPTIONS.map((option) => option.value)) as VisibleTwoFactorMethod[];
}

function normalizeDefaultMethod(value: string | undefined, allowedMethods: VisibleTwoFactorMethod[]): VisibleTwoFactorMethod {
    const normalized = String(value || '').trim().toLowerCase() as VisibleTwoFactorMethod;
    if (allowedMethods.includes(normalized)) return normalized;
    return allowedMethods[0] || 'authenticator';
}

function normalizeSettings(raw?: Partial<SecurityCenterSettings> | null): NormalizedSecurityCenterSettings {
    const defaults = deepClone(DEFAULT_SETTINGS);
    const source = raw || {};
    const adminIps = uniqueStrings(source.adminAccess?.allowedAdminIPs || source.accessControl?.allowedAdminIPs || defaults.adminAccess.allowedAdminIPs);
    const roleOptions = ROLE_OPTIONS.map((option) => option.value);
    const exportRoleOptions = EXPORT_ROLE_OPTIONS.map((option) => option.value);
    const allowedMethods = normalizeAllowedMethods(source.twoFactor?.allowedMethods || defaults.twoFactor.allowedMethods);

    return {
        ...defaults,
        ...source,
        passwordPolicy: { ...defaults.passwordPolicy, ...(source.passwordPolicy || {}) },
        loginProtection: { ...defaults.loginProtection, ...(source.loginProtection || {}) },
        session: { ...defaults.session, ...(source.session || {}) },
        adminAccess: { ...defaults.adminAccess, ...(source.adminAccess || {}), allowedAdminIPs: adminIps },
        siteAccess: { ...defaults.siteAccess, ...(source.siteAccess || {}) },
        examProtection: { ...defaults.examProtection, ...(source.examProtection || {}) },
        logging: { ...defaults.logging, ...(source.logging || {}) },
        rateLimit: { ...defaults.rateLimit, ...(source.rateLimit || {}) },
        twoPersonApproval: {
            ...defaults.twoPersonApproval,
            ...(source.twoPersonApproval || {}),
            riskyActions: normalizeRoles(
                source.twoPersonApproval?.riskyActions || defaults.twoPersonApproval.riskyActions,
                RISKY_ACTION_OPTIONS.map((option) => option.value),
            ) as RiskyActionKey[],
        },
        retention: { ...defaults.retention, ...(source.retention || {}) },
        panic: { ...defaults.panic, ...(source.panic || {}) },
        authentication: { ...defaults.authentication, ...(source.authentication || {}) },
        passwordPolicies: {
            ...defaults.passwordPolicies,
            ...(source.passwordPolicies || {}),
            default: { ...defaults.passwordPolicies.default, ...(source.passwordPolicies?.default || {}) },
            admin: { ...defaults.passwordPolicies.admin, ...(source.passwordPolicies?.admin || {}) },
            staff: { ...defaults.passwordPolicies.staff, ...(source.passwordPolicies?.staff || {}) },
            student: { ...defaults.passwordPolicies.student, ...(source.passwordPolicies?.student || {}) },
        },
        twoFactor: {
            ...defaults.twoFactor,
            ...(source.twoFactor || {}),
            requireForRoles: normalizeRoles(source.twoFactor?.requireForRoles || defaults.twoFactor.requireForRoles, roleOptions),
            allowedMethods: allowedMethods.length ? allowedMethods : ['authenticator', 'email'],
            defaultMethod: normalizeDefaultMethod(source.twoFactor?.defaultMethod, allowedMethods.length ? allowedMethods : ['authenticator', 'email']),
        },
        sessions: {
            ...defaults.sessions,
            ...(source.sessions || {}),
            maxActiveSessionsPerUser: Number(source.sessions?.maxActiveSessionsPerUser || source.examProtection?.maxActiveSessionsPerUser || defaults.sessions.maxActiveSessionsPerUser),
        },
        accessControl: {
            ...defaults.accessControl,
            ...(source.accessControl || {}),
            allowedAdminIPs: adminIps,
            exportAllowedRoles: normalizeRoles(
                source.accessControl?.exportAllowedRoles || source.exportSecurity?.allowedRoles || defaults.accessControl.exportAllowedRoles,
                exportRoleOptions,
            ),
        },
        verificationRecovery: { ...defaults.verificationRecovery, ...(source.verificationRecovery || {}) },
        uploadSecurity: { ...defaults.uploadSecurity, ...(source.uploadSecurity || {}) },
        alerting: { ...defaults.alerting, ...(source.alerting || {}) },
        exportSecurity: {
            ...defaults.exportSecurity,
            ...(source.exportSecurity || {}),
            allowedRoles: normalizeRoles(source.exportSecurity?.allowedRoles || source.accessControl?.exportAllowedRoles || defaults.exportSecurity.allowedRoles, exportRoleOptions),
        },
        backupRestore: { ...defaults.backupRestore, ...(source.backupRestore || {}) },
        runtimeGuards: {
            ...defaults.runtimeGuards,
            ...(source.runtimeGuards || {}),
            maintenanceMode: Boolean(source.runtimeGuards?.maintenanceMode ?? source.siteAccess?.maintenanceMode ?? defaults.runtimeGuards.maintenanceMode),
            blockNewRegistrations: Boolean(source.runtimeGuards?.blockNewRegistrations ?? source.siteAccess?.blockNewRegistrations ?? defaults.runtimeGuards.blockNewRegistrations),
            readOnlyMode: Boolean(source.runtimeGuards?.readOnlyMode ?? source.panic?.readOnlyMode ?? defaults.runtimeGuards.readOnlyMode),
            disableStudentLogins: Boolean(source.runtimeGuards?.disableStudentLogins ?? source.panic?.disableStudentLogins ?? defaults.runtimeGuards.disableStudentLogins),
            disablePaymentWebhooks: Boolean(source.runtimeGuards?.disablePaymentWebhooks ?? source.panic?.disablePaymentWebhooks ?? defaults.runtimeGuards.disablePaymentWebhooks),
            disableExamStarts: Boolean(source.runtimeGuards?.disableExamStarts ?? source.panic?.disableExamStarts ?? defaults.runtimeGuards.disableExamStarts),
            adminPanelEnabled: Boolean(source.runtimeGuards?.adminPanelEnabled ?? source.adminAccess?.adminPanelEnabled ?? defaults.runtimeGuards.adminPanelEnabled),
        },
    };
}

function buildSavePayload(settings: NormalizedSecurityCenterSettings): Partial<SecurityCenterSettings> {
    const exportApprovalEnabled = settings.twoPersonApproval.enabled && settings.twoPersonApproval.riskyActions.includes('students.export');
    const backupApprovalEnabled = settings.twoPersonApproval.enabled && settings.twoPersonApproval.riskyActions.includes('backups.restore');

    const payload: Record<string, unknown> = {
        passwordPolicies: {
            default: { ...settings.passwordPolicies.default },
            admin: { ...settings.passwordPolicies.admin },
            staff: { ...settings.passwordPolicies.staff },
            student: { ...settings.passwordPolicies.student },
        },
        authentication: {
            loginAttemptsLimit: settings.authentication.loginAttemptsLimit,
            lockDurationMinutes: settings.authentication.lockDurationMinutes,
            genericErrorMessages: settings.authentication.genericErrorMessages,
            otpResendLimit: settings.authentication.otpResendLimit,
            otpVerifyLimit: settings.authentication.otpVerifyLimit,
        },
        twoFactor: {
            requireForRoles: [...settings.twoFactor.requireForRoles],
            allowedMethods: [...settings.twoFactor.allowedMethods],
            defaultMethod: settings.twoFactor.defaultMethod,
            otpExpiryMinutes: settings.twoFactor.otpExpiryMinutes,
            maxAttempts: settings.twoFactor.maxAttempts,
            stepUpForSensitiveActions: settings.twoFactor.stepUpForSensitiveActions,
        },
        sessions: {
            accessTokenTTLMinutes: settings.sessions.accessTokenTTLMinutes,
            refreshTokenTTLDays: settings.sessions.refreshTokenTTLDays,
            idleTimeoutMinutes: settings.sessions.idleTimeoutMinutes,
            allowConcurrentSessions: settings.sessions.allowConcurrentSessions,
            maxActiveSessionsPerUser: settings.sessions.maxActiveSessionsPerUser,
        },
        adminAccess: {
            allowedAdminIPs: [...settings.adminAccess.allowedAdminIPs],
            adminPanelEnabled: settings.adminAccess.adminPanelEnabled,
        },
        siteAccess: {
            maintenanceMode: settings.siteAccess.maintenanceMode,
            blockNewRegistrations: settings.siteAccess.blockNewRegistrations,
        },
        verificationRecovery: {
            requireVerifiedEmailForAdmins: settings.verificationRecovery.requireVerifiedEmailForAdmins,
            requireVerifiedEmailForStudents: settings.verificationRecovery.requireVerifiedEmailForStudents,
            emailVerificationExpiryHours: settings.verificationRecovery.emailVerificationExpiryHours,
            passwordResetExpiryMinutes: settings.verificationRecovery.passwordResetExpiryMinutes,
        },
        twoPersonApproval: {
            enabled: settings.twoPersonApproval.enabled,
            riskyActions: [...settings.twoPersonApproval.riskyActions],
            approvalExpiryMinutes: settings.twoPersonApproval.approvalExpiryMinutes,
        },
        accessControl: {
            sensitiveActionReasonRequired: settings.accessControl.sensitiveActionReasonRequired,
            exportAllowedRoles: [...settings.accessControl.exportAllowedRoles],
        },
        panic: {
            readOnlyMode: settings.panic.readOnlyMode,
            disableStudentLogins: settings.panic.disableStudentLogins,
            disablePaymentWebhooks: settings.panic.disablePaymentWebhooks,
            disableExamStarts: settings.panic.disableExamStarts,
        },
        runtimeGuards: {
            testingAccessMode: settings.runtimeGuards.testingAccessMode,
        },
        examProtection: {
            maxActiveSessionsPerUser: settings.sessions.maxActiveSessionsPerUser,
            requireProfileScoreForExam: settings.examProtection.requireProfileScoreForExam,
            profileScoreThreshold: settings.examProtection.profileScoreThreshold,
        },
        retention: {
            enabled: settings.retention.enabled,
            examSessionsDays: settings.retention.examSessionsDays,
            auditLogsDays: settings.retention.auditLogsDays,
            eventLogsDays: settings.retention.eventLogsDays,
        },
        exportSecurity: {
            allowedRoles: [...settings.accessControl.exportAllowedRoles],
            requireReason: settings.accessControl.sensitiveActionReasonRequired,
            requireApproval: exportApprovalEnabled,
        },
        backupRestore: {
            requireRestoreApproval: backupApprovalEnabled,
        },
    };

    return payload as Partial<SecurityCenterSettings>;
}

function toMultilineList(values: string[]): string {
    return values.join('\n');
}

function fromMultilineList(value: string): string[] {
    return uniqueStrings(value.split(/[\n,]+/g));
}

function formatTimestamp(value?: string | null): string {
    if (!value) return 'Just now';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
}

function formatApprovalExpiry(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString();
}

type SectionCardProps = {
    title: string;
    description: string;
    help?: ComponentProps<typeof SecurityHelpButton>;
    children: ReactNode;
};

function SectionCard({ title, description, help, children }: SectionCardProps) {
    return (
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/50 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all duration-500 hover:shadow-[0_8px_32px_rgba(6,182,212,0.1)]">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-indigo-500/5 pointer-events-none" />
            <div className="relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-white/5 bg-slate-950/40 px-8 py-6">
                <div>
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
                        {help ? <SecurityHelpButton {...help} /> : null}
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-slate-400">{description}</p>
                </div>
            </div>
            <div className="relative z-10 space-y-6 px-8 py-7">{children}</div>
        </section>
    );
}

type ToggleFieldProps = {
    label: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
};

function ToggleField({ label, description, checked, onChange }: ToggleFieldProps) {
    return (
        <label className="group relative flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-all duration-300 hover:border-cyan-500/30 hover:bg-white/[0.04]">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/0 via-cyan-500/0 to-cyan-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />
            <div className="min-w-0 flex-1 relative z-10">
                <p className="text-sm font-semibold text-slate-200 transition-colors group-hover:text-white">{label}</p>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed transition-colors group-hover:text-slate-300">{description}</p>
            </div>
            <div className="relative z-10 flex shrink-0 items-center justify-center mt-1">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange(event.target.checked)}
                    className="peer sr-only"
                />
                <div className={`h-[22px] w-10 rounded-full p-[3px] transition-colors duration-300 ease-in-out ${checked ? 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]' : 'bg-slate-700/80 shadow-inner'}`}>
                    <div className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-in-out ${checked ? 'translate-x-full' : 'translate-x-0'}`} />
                </div>
            </div>
        </label>
    );
}

type NumberFieldProps = {
    label: string;
    description: string;
    value: number;
    min: number;
    max?: number;
    step?: number;
    onChange: (value: number) => void;
};

function NumberField({ label, description, value, min, max, step = 1, onChange }: NumberFieldProps) {
    return (
        <label className="group relative block rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-all duration-300 hover:border-cyan-500/30 hover:bg-white/[0.04]">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/0 via-cyan-500/0 to-cyan-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />
            <div className="relative z-10 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-200 transition-colors group-hover:text-white">{label}</p>
                    <p className="mt-1.5 text-xs text-slate-400 leading-relaxed transition-colors group-hover:text-slate-300">{description}</p>
                </div>
                <div className="relative shrink-0">
                    <input
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={(event) => onChange(Number(event.target.value))}
                        className="w-24 rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-center text-sm font-bold text-white shadow-inner outline-none transition-all duration-300 focus:border-cyan-400 focus:bg-slate-800 focus:ring-2 focus:ring-cyan-500/20"
                    />
                </div>
            </div>
        </label>
    );
}

type ChipToggleGroupProps<T extends string> = {
    title: string;
    description: string;
    options: Array<{ value: T; label: string; description?: string }>;
    selected: T[];
    onChange: (selected: T[]) => void;
    dataTestId?: string;
};

function ChipToggleGroup<T extends string>({
    title,
    description,
    options,
    selected,
    onChange,
    dataTestId,
}: ChipToggleGroupProps<T>) {
    const toggleValue = (value: T) => {
        const next = selected.includes(value)
            ? selected.filter((item) => item !== value)
            : [...selected, value];
        onChange(next);
    };

    return (
        <div className="group relative rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-4 transition-all duration-300 hover:border-cyan-500/30 hover:bg-white/[0.04]" data-testid={dataTestId}>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/0 via-cyan-500/0 to-cyan-500/5 opacity-0 transition-opacity duration-500 group-hover:opacity-100 pointer-events-none" />
            <div className="relative z-10">
                <p className="text-sm font-semibold text-slate-200 transition-colors group-hover:text-white">{title}</p>
                <p className="mt-1.5 text-xs text-slate-400 leading-relaxed transition-colors group-hover:text-slate-300">{description}</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                    {options.map((option) => {
                        const active = selected.includes(option.value);
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => toggleValue(option.value)}
                                className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition-all duration-300 ${
                                    active
                                        ? 'border-cyan-400/60 bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 text-cyan-50 shadow-[0_0_15px_rgba(6,182,212,0.15)] ring-1 ring-cyan-400/30'
                                        : 'border-white/5 bg-slate-800/50 text-slate-400 hover:border-white/20 hover:bg-slate-800 hover:text-white'
                                }`}
                                title={option.description || option.label}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

type PolicyCardProps = {
    label: string;
    policy: NormalizedSecurityCenterSettings['passwordPolicies']['default'];
    onChange: (policy: NormalizedSecurityCenterSettings['passwordPolicies']['default']) => void;
    dataTestId: string;
};

function PolicyCard({ label, policy, onChange, dataTestId }: PolicyCardProps) {
    const update = <K extends keyof NormalizedSecurityCenterSettings['passwordPolicies']['default']>(
        key: K,
        value: NormalizedSecurityCenterSettings['passwordPolicies']['default'][K],
    ) => {
        onChange({ ...policy, [key]: value });
    };

    return (
        <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 p-1 group hover:border-cyan-500/20 transition-all duration-500" data-testid={dataTestId}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="relative z-10 bg-slate-950/60 backdrop-blur-md rounded-[1.35rem] p-5">
                <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/5 pb-4">
                    <h4 className="text-base font-bold tracking-tight text-white">{label}</h4>
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                        Active policy
                    </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <NumberField
                        label="Minimum length"
                        description="Shortest allowed password length."
                        value={policy.minLength}
                        min={8}
                        max={128}
                        onChange={(value) => update('minLength', value)}
                    />
                    <NumberField
                        label="Reuse prevention"
                        description="How many old passwords remain blocked."
                        value={policy.preventReuseCount}
                        min={0}
                        max={24}
                        onChange={(value) => update('preventReuseCount', value)}
                    />
                    <NumberField
                        label="Expiry days"
                        description="Use 0 to disable password expiry."
                        value={policy.expiryDays}
                        min={0}
                        max={3650}
                        onChange={(value) => update('expiryDays', value)}
                    />
                    <div className="rounded-2xl border border-white/5 bg-slate-900/50 px-5 py-4 sm:col-span-2">
                        <p className="text-sm font-semibold text-slate-200">Required character mix</p>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <ToggleField label="Uppercase" description="Require at least one uppercase letter." checked={policy.requireUppercase} onChange={(value) => update('requireUppercase', value)} />
                            <ToggleField label="Lowercase" description="Require at least one lowercase letter." checked={policy.requireLowercase} onChange={(value) => update('requireLowercase', value)} />
                            <ToggleField label="Number" description="Require at least one numeric character." checked={policy.requireNumber} onChange={(value) => update('requireNumber', value)} />
                            <ToggleField label="Special" description="Require at least one special character." checked={policy.requireSpecial} onChange={(value) => update('requireSpecial', value)} />
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-slate-900/50 px-5 py-4 sm:col-span-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                            <ToggleField
                                label="Deny common passwords"
                                description="Reject weak and commonly-used passwords from dictionary."
                                checked={policy.denyCommonPasswords}
                                onChange={(value) => update('denyCommonPasswords', value)}
                            />
                            <ToggleField
                                label="Force reset on first login"
                                description="Require a password change upon first activation."
                                checked={policy.forceResetOnFirstLogin}
                                onChange={(value) => update('forceResetOnFirstLogin', value)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SecuritySettingsPanel() {
    const queryClient = useQueryClient();
    const [settings, setSettings] = useState<NormalizedSecurityCenterSettings | null>(null);
    const [baseline, setBaseline] = useState<NormalizedSecurityCenterSettings | null>(null);
    const [adminIpDraft, setAdminIpDraft] = useState('');

    const settingsQuery = useQuery({
        queryKey: queryKeys.securitySettings,
        queryFn: async () => {
            const response = await adminGetSecurityCenterSettings();
            return normalizeSettings(response.data?.settings);
        },
        staleTime: 30_000,
        refetchOnWindowFocus: false,
    });

    const pendingApprovalsQuery = useQuery({
        queryKey: [...queryKeys.pendingApprovals, 'security-center'],
        queryFn: async () => {
            const response = await adminGetPendingApprovals({ limit: 8 });
            return response.data;
        },
        staleTime: 10_000,
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        if (!settingsQuery.data) return;
        setSettings(settingsQuery.data);
        setBaseline(settingsQuery.data);
        setAdminIpDraft(toMultilineList(settingsQuery.data.adminAccess.allowedAdminIPs));
    }, [settingsQuery.data]);

    const invalidateSecurityQueries = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.securitySettings }),
            queryClient.invalidateQueries({ queryKey: queryKeys.pendingApprovals }),
            queryClient.invalidateQueries({ queryKey: ['securityDashboard'] }),
            queryClient.invalidateQueries({ queryKey: ['securityAuditLogs'] }),
            queryClient.invalidateQueries({ queryKey: ['securityAlerts'] }),
            queryClient.invalidateQueries({ queryKey: ['securityAlertsSummary'] }),
        ]);
    };

    const saveMutation = useMutation({
        mutationFn: async (current: NormalizedSecurityCenterSettings) => adminUpdateSecurityCenterSettings(buildSavePayload(current)),
        onSuccess: async (response) => {
            const body = response.data as { settings?: SecurityCenterSettings; message?: string } | undefined;
            if (body?.settings) {
                const nextSettings = normalizeSettings(body.settings);
                setSettings(nextSettings);
                setBaseline(nextSettings);
                setAdminIpDraft(toMultilineList(nextSettings.adminAccess.allowedAdminIPs));
            }
            toast.success(body?.message || 'Security settings updated');
            await invalidateSecurityQueries();
        },
        onError: (error: unknown) => {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Unable to save security settings';
            toast.error(message);
        },
    });

    const resetMutation = useMutation({
        mutationFn: async () => adminResetSecurityCenterSettings(),
        onSuccess: async (response) => {
            const body = response.data as { settings?: SecurityCenterSettings; message?: string } | undefined;
            if (body?.settings) {
                const nextSettings = normalizeSettings(body.settings);
                setSettings(nextSettings);
                setBaseline(nextSettings);
                setAdminIpDraft(toMultilineList(nextSettings.adminAccess.allowedAdminIPs));
            }
            toast.success(body?.message || 'Security settings reset');
            await invalidateSecurityQueries();
        },
        onError: (error: unknown) => {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Unable to reset security settings';
            toast.error(message);
        },
    });

    const forceLogoutMutation = useMutation({
        mutationFn: async () => adminForceLogoutAllUsers(),
        onSuccess: async (response) => {
            toast.success(response.data?.message || 'Active sessions were terminated');
            await invalidateSecurityQueries();
        },
        onError: (error: unknown) => {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Unable to force logout all users';
            toast.error(message);
        },
    });

    const adminPanelMutation = useMutation({
        mutationFn: async (enabled: boolean) => adminSetAdminPanelLockState(enabled),
        onSuccess: async (response) => {
            const body = response.data as { settings?: SecurityCenterSettings; message?: string } | undefined;
            if (body?.settings) {
                const nextSettings = normalizeSettings(body.settings);
                setSettings(nextSettings);
                setBaseline(nextSettings);
                setAdminIpDraft(toMultilineList(nextSettings.adminAccess.allowedAdminIPs));
            }
            toast.success(body?.message || 'Admin panel access updated');
            await invalidateSecurityQueries();
        },
        onError: (error: unknown) => {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Unable to update admin panel state';
            toast.error(message);
        },
    });

    const approveMutation = useMutation({
        mutationFn: async (id: string) => adminApprovePendingAction(id),
        onSuccess: async (response) => {
            toast.success(response.data?.message || 'Pending action approved');
            await invalidateSecurityQueries();
        },
        onError: (error: unknown) => {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Unable to approve pending action';
            toast.error(message);
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => adminRejectPendingAction(id, reason),
        onSuccess: async (response) => {
            toast.success(response.data?.message || 'Pending action rejected');
            await invalidateSecurityQueries();
        },
        onError: (error: unknown) => {
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Unable to reject pending action';
            toast.error(message);
        },
    });

    const hasChanges = useMemo(() => {
        if (!settings || !baseline) return false;
        return JSON.stringify(settings) !== JSON.stringify(baseline);
    }, [settings, baseline]);

    const updateSettings = (updater: (current: NormalizedSecurityCenterSettings) => NormalizedSecurityCenterSettings) => {
        setSettings((current) => (current ? updater(current) : current));
    };

    const saveCurrentSettings = async () => {
        if (!settings) return;
        await saveMutation.mutateAsync(settings);
    };

    const resetDefaults = async () => {
        const confirmed = await showConfirmDialog({
            title: 'Reset security settings?',
            message: 'This will restore the Security Center to default policy values.',
            description: 'Saved defaults can change login behavior, MFA enforcement, and emergency controls.',
            confirmLabel: 'Reset to defaults',
            cancelLabel: 'Keep current settings',
            tone: 'danger',
        });
        if (!confirmed) return;
        await resetMutation.mutateAsync();
    };

    const forceLogoutAll = async () => {
        const confirmed = await showConfirmDialog({
            title: 'Force logout every active session?',
            message: 'All users will be signed out from active devices.',
            description: 'Use this only for incident response, compromised tokens, or major policy changes.',
            confirmLabel: 'Force logout all',
            cancelLabel: 'Cancel',
            tone: 'danger',
        });
        if (!confirmed) return;
        await forceLogoutMutation.mutateAsync();
    };

    const toggleAdminPanel = async () => {
        if (!settings) return;
        const nextEnabled = !settings.adminAccess.adminPanelEnabled;
        const confirmed = await showConfirmDialog({
            title: nextEnabled ? 'Unlock admin panel?' : 'Lock admin panel?',
            message: nextEnabled
                ? 'Admin routes will be accessible again to authorized staff.'
                : 'This will block admin route access for everyone except current in-flight sessions.',
            description: nextEnabled
                ? 'Use this after emergency maintenance or incident response.'
                : 'Locking the admin panel is an emergency control. Make sure the team is informed first.',
            confirmLabel: nextEnabled ? 'Unlock panel' : 'Lock panel',
            cancelLabel: 'Cancel',
            tone: nextEnabled ? 'default' : 'danger',
        });
        if (!confirmed) return;
        await adminPanelMutation.mutateAsync(nextEnabled);
    };

    const rejectApproval = async (item: AdminActionApproval) => {
        const reason = await showPromptDialog({
            title: 'Reject pending approval',
            message: `Provide a short reason for rejecting ${item.action.replace(/_/g, ' ')}.`,
            defaultValue: 'Rejected after policy review',
            placeholder: 'Reason for rejection',
            confirmLabel: 'Reject action',
            cancelLabel: 'Cancel',
            tone: 'danger',
            inputLabel: 'Reason',
        });
        if (!reason) return;
        await rejectMutation.mutateAsync({ id: item._id, reason });
    };

    if (settingsQuery.isLoading || !settings) {
        return (
            <div className="flex items-center justify-center rounded-3xl border border-white/8 bg-slate-950/70 py-24">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            </div>
        );
    }

    if (settingsQuery.isError) {
        return (
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/10 px-6 py-8 text-center">
                <ServerCrash className="mx-auto h-8 w-8 text-rose-300" />
                <h3 className="mt-3 text-lg font-semibold text-white">Security settings failed to load</h3>
                <p className="mt-1 text-sm text-rose-100/80">The Security Center could not load its canonical policy snapshot.</p>
                <button
                    type="button"
                    onClick={() => settingsQuery.refetch()}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                >
                    <RefreshCcw className="h-4 w-4" />
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8" data-testid="security-settings-panel">
            <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-900/60 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-indigo-500/5 pointer-events-none" />
                <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
                    <div className="max-w-2xl">
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-500 p-2.5 shadow-lg shadow-cyan-500/20 text-white">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <h2 className="bg-gradient-to-r from-white to-slate-400 bg-clip-text text-3xl font-black tracking-tight text-transparent">Security Center</h2>
                            <div className="ml-2">
                                <SecurityHelpButton
                                    title="Security Settings"
                                    content="This page now owns only real security controls that are enforced in backend or runtime flows."
                                    impact="It removes duplicate or dead settings so policy changes are predictable."
                                    affected="Admin authentication, session handling, exports, approvals, and emergency operations."
                                    enabledNote="Changes here propagate to the canonical security snapshot used by auth and sensitive-action middleware."
                                    disabledNote="Duplicate settings elsewhere are intentionally hidden to avoid split ownership."
                                    bestPractice="Review these controls in sections, then save once after checking the impact summary."
                                />
                            </div>
                        </div>
                        <p className="mt-4 text-sm font-medium leading-relaxed text-slate-400">
                            Canonical policy controls governing administrative access, sessions, and protections. Upload placeholders and dead legacy mirrors are intentionally removed from this surface.
                        </p>
                        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.02] px-3 py-1 shadow-inner">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
                            </span>
                            <span className="text-[11px] font-bold tracking-wide text-slate-300">SYNCED {formatTimestamp(settings.updatedAt).toUpperCase()}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            onClick={resetDefaults}
                            disabled={resetMutation.isPending}
                            className="inline-flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-2.5 text-sm font-bold text-rose-200 transition-all duration-300 hover:bg-rose-500/20 hover:shadow-[0_0_15px_rgba(244,63,94,0.15)] disabled:opacity-50"
                        >
                            {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TimerReset className="h-4 w-4" />}
                            Reset defaults
                        </button>
                        <button
                            type="button"
                            onClick={saveCurrentSettings}
                            disabled={!hasChanges || saveMutation.isPending}
                            data-testid="security-settings-save"
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition-all duration-300 hover:from-cyan-400 hover:to-indigo-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                        >
                            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save changes
                        </button>
                    </div>
                </div>

                <div className="relative z-10 mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="group relative overflow-hidden rounded-[1.5rem] border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-cyan-500/50 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(6,182,212,0.15)]">
                        <div className="absolute -right-6 -top-6 rounded-full bg-cyan-500/10 p-12 blur-3xl transition-all duration-500 group-hover:bg-cyan-500/20" />
                        <div className="relative z-10 mb-4 flex items-center gap-3 text-cyan-400">
                            <div className="rounded-xl bg-cyan-500/10 p-2 shadow-inner"><KeyRound className="h-5 w-5" /></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-cyan-200">Password Roles</span>
                        </div>
                        <p className="relative z-10 px-1 text-4xl font-black text-white drop-shadow-sm">{PASSWORD_POLICY_KEYS.length}</p>
                        <p className="relative z-10 mt-3 text-xs font-medium leading-relaxed text-slate-400">Canonical role-based password policies.</p>
                    </div>
                    <div className="group relative overflow-hidden rounded-[1.5rem] border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-indigo-500/50 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(99,102,241,0.15)]">
                        <div className="absolute -right-6 -top-6 rounded-full bg-indigo-500/10 p-12 blur-3xl transition-all duration-500 group-hover:bg-indigo-500/20" />
                        <div className="relative z-10 mb-4 flex items-center gap-3 text-indigo-400">
                            <div className="rounded-xl bg-indigo-500/10 p-2 shadow-inner"><ShieldCheck className="h-5 w-5" /></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">2FA Roles</span>
                        </div>
                        <p className="relative z-10 px-1 text-4xl font-black text-white drop-shadow-sm">{settings.twoFactor.requireForRoles.length}</p>
                        <p className="relative z-10 mt-3 text-xs font-medium leading-relaxed text-slate-400">Roles forced through MFA during login.</p>
                    </div>
                    <div className="group relative overflow-hidden rounded-[1.5rem] border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-amber-500/50 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                        <div className="absolute -right-6 -top-6 rounded-full bg-amber-500/10 p-12 blur-3xl transition-all duration-500 group-hover:bg-amber-500/20" />
                        <div className="relative z-10 mb-4 flex items-center gap-3 text-amber-400">
                            <div className="rounded-xl bg-amber-500/10 p-2 shadow-inner"><ShieldAlert className="h-5 w-5" /></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-amber-200">Risky Actions</span>
                        </div>
                        <p className="relative z-10 px-1 text-4xl font-black text-white drop-shadow-sm">{settings.twoPersonApproval.riskyActions.length}</p>
                        <p className="relative z-10 mt-3 text-xs font-medium leading-relaxed text-slate-400">Actions that can require second approval.</p>
                    </div>
                    <div className="group relative overflow-hidden rounded-[1.5rem] border border-white/5 bg-gradient-to-br from-white/[0.04] to-transparent p-6 transition-all duration-300 hover:border-emerald-500/50 hover:bg-white/[0.06] hover:shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                        <div className="absolute -right-6 -top-6 rounded-full bg-emerald-500/10 p-12 blur-3xl transition-all duration-500 group-hover:bg-emerald-500/20" />
                        <div className="relative z-10 mb-4 flex items-center gap-3 text-emerald-400">
                            <div className="rounded-xl bg-emerald-500/10 p-2 shadow-inner"><CheckCircle2 className="h-5 w-5" /></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-emerald-200">Admin Panel</span>
                        </div>
                        <p className="relative z-10 px-1 text-4xl font-black text-white drop-shadow-sm">{settings.adminAccess.adminPanelEnabled ? 'Open' : 'Locked'}</p>
                        <p className="relative z-10 mt-3 text-xs font-medium leading-relaxed text-slate-400">Emergency access gate for admin routes.</p>
                    </div>
                </div>
            </div>

            <SectionCard
                title="Password Policies"
                description="Role-scoped password rules that actually feed backend password validation."
                help={{
                    title: 'Password Policies',
                    content: 'Each role card maps to the canonical passwordPolicies object used by account creation, reset, and password-change flows.',
                    impact: 'Weak role policies directly reduce account protection and increase takeover risk.',
                    affected: 'Default, admin, staff, and student users.',
                    enabledNote: 'Role-specific requirements let privileged users carry a stricter password posture than students.',
                    disabledNote: 'Relying on legacy flat passwordPolicy fields causes drift between roles.',
                    bestPractice: 'Keep admin and staff requirements stricter than student defaults and use non-zero reuse limits.',
                }}
            >
                <div className="grid gap-4 xl:grid-cols-2">
                    {PASSWORD_POLICY_KEYS.map((key) => (
                        <PolicyCard
                            key={key}
                            label={key === 'default' ? 'Default Policy' : `${key.charAt(0).toUpperCase()}${key.slice(1)} Policy`}
                            policy={settings.passwordPolicies[key]}
                            onChange={(policy) =>
                                updateSettings((current) => ({
                                    ...current,
                                    passwordPolicies: {
                                        ...current.passwordPolicies,
                                        [key]: policy,
                                    },
                                }))
                            }
                            dataTestId={`security-password-policy-${key}`}
                        />
                    ))}
                </div>
            </SectionCard>

            <SectionCard
                title="Authentication & Login"
                description="Only active login throttling and verification controls stay here."
                help={{
                    title: 'Authentication & Login',
                    content: 'These controls map to authentication.loginAttemptsLimit, lockDurationMinutes, genericErrorMessages, otpResendLimit, and otpVerifyLimit.',
                    impact: 'These values govern brute-force resistance and OTP abuse protection.',
                    affected: 'Every login portal and OTP challenge flow.',
                    enabledNote: 'Balanced limits reduce abuse while keeping support overhead manageable.',
                    disabledNote: 'Loose settings make password and OTP guessing easier.',
                    bestPractice: 'Keep generic login errors on and OTP resend/verify caps finite.',
                }}
            >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <NumberField
                        label="Login attempts limit"
                        description="Failed login attempts allowed before temporary lockout."
                        value={settings.authentication.loginAttemptsLimit}
                        min={1}
                        max={20}
                        onChange={(value) => updateSettings((current) => ({ ...current, authentication: { ...current.authentication, loginAttemptsLimit: value } }))}
                    />
                    <NumberField
                        label="Lock duration"
                        description="Minutes an account stays locked after the attempt limit is hit."
                        value={settings.authentication.lockDurationMinutes}
                        min={1}
                        max={240}
                        onChange={(value) => updateSettings((current) => ({ ...current, authentication: { ...current.authentication, lockDurationMinutes: value } }))}
                    />
                    <NumberField
                        label="OTP resend limit"
                        description="How many resend attempts are allowed per OTP window."
                        value={settings.authentication.otpResendLimit}
                        min={1}
                        max={50}
                        onChange={(value) => updateSettings((current) => ({ ...current, authentication: { ...current.authentication, otpResendLimit: value } }))}
                    />
                    <NumberField
                        label="OTP verify limit"
                        description="How many OTP verify attempts are allowed per window."
                        value={settings.authentication.otpVerifyLimit}
                        min={1}
                        max={100}
                        onChange={(value) => updateSettings((current) => ({ ...current, authentication: { ...current.authentication, otpVerifyLimit: value } }))}
                    />
                    <div className="md:col-span-2 xl:col-span-1">
                        <ToggleField
                            label="Generic login error messages"
                            description="Hide whether a username, email, or password was incorrect."
                            checked={settings.authentication.genericErrorMessages}
                            onChange={(checked) => updateSettings((current) => ({ ...current, authentication: { ...current.authentication, genericErrorMessages: checked } }))}
                        />
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="Two-Factor Policy"
                description="Canonical MFA policy for login enforcement, allowed methods, and step-up verification."
                help={{
                    title: 'Two-Factor Policy',
                    content: 'This section maps to twoFactor.requireForRoles, allowedMethods, defaultMethod, otpExpiryMinutes, maxAttempts, and stepUpForSensitiveActions.',
                    impact: 'It controls both who must pass MFA and how sensitive admin actions request extra proof.',
                    affected: 'Admin, chairman, and student logins depending on role selection.',
                    enabledNote: 'Authenticator plus step-up verification significantly lowers stolen-password risk.',
                    disabledNote: 'No required roles means MFA remains optional for everyone except self-enabled users.',
                    bestPractice: 'Prefer authenticator as default, enable step-up for sensitive actions, and only keep email as a fallback delivery method.',
                }}
            >
                <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                        <ChipToggleGroup
                            title="Required roles"
                            description="Selected roles must complete MFA during login even if they did not just enable it themselves."
                            options={ROLE_OPTIONS.map((option) => ({ ...option }))}
                            selected={settings.twoFactor.requireForRoles}
                            onChange={(selected) =>
                                updateSettings((current) => ({
                                    ...current,
                                    twoFactor: {
                                        ...current.twoFactor,
                                        requireForRoles: normalizeRoles(selected, ROLE_OPTIONS.map((option) => option.value)),
                                    },
                                }))
                            }
                            dataTestId="security-two-factor-roles"
                        />

                        <ChipToggleGroup
                            title="Allowed methods"
                            description="Only authenticator and email are exposed here because SMS delivery is not production-ready."
                            options={TWO_FACTOR_METHOD_OPTIONS}
                            selected={settings.twoFactor.allowedMethods}
                            onChange={(selected) =>
                                updateSettings((current) => {
                                    const nextAllowed = normalizeAllowedMethods(selected);
                                    return {
                                        ...current,
                                        twoFactor: {
                                            ...current.twoFactor,
                                            allowedMethods: nextAllowed.length ? nextAllowed : ['authenticator'],
                                            defaultMethod: normalizeDefaultMethod(current.twoFactor.defaultMethod, nextAllowed.length ? nextAllowed : ['authenticator']),
                                        },
                                    };
                                })
                            }
                            dataTestId="security-two-factor-methods"
                        />

                        <div className="grid gap-4 md:grid-cols-3">
                            <label className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                                <p className="text-sm font-medium text-white">Default method</p>
                                <p className="mt-1 text-xs text-slate-400">Preferred challenge when a user enables 2FA.</p>
                                <select
                                    value={settings.twoFactor.defaultMethod}
                                    onChange={(event) =>
                                        updateSettings((current) => ({
                                            ...current,
                                            twoFactor: {
                                                ...current.twoFactor,
                                                defaultMethod: normalizeDefaultMethod(event.target.value, current.twoFactor.allowedMethods),
                                            },
                                        }))
                                    }
                                    className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
                                >
                                    {settings.twoFactor.allowedMethods.map((method) => (
                                        <option key={method} value={method}>
                                            {method === 'authenticator' ? 'Authenticator' : 'Email OTP'}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <NumberField
                                label="OTP expiry"
                                description="Minutes an OTP challenge stays valid."
                                value={settings.twoFactor.otpExpiryMinutes}
                                min={1}
                                max={30}
                                onChange={(value) => updateSettings((current) => ({ ...current, twoFactor: { ...current.twoFactor, otpExpiryMinutes: value } }))}
                            />

                            <NumberField
                                label="Max OTP attempts"
                                description="Failed attempts allowed per challenge."
                                value={settings.twoFactor.maxAttempts}
                                min={1}
                                max={20}
                                onChange={(value) => updateSettings((current) => ({ ...current, twoFactor: { ...current.twoFactor, maxAttempts: value } }))}
                            />
                        </div>

                        <ToggleField
                            label="Step-up verification for sensitive admin actions"
                            description="When enabled, admins with 2FA set up must provide authenticator or backup code for protected writes."
                            checked={settings.twoFactor.stepUpForSensitiveActions}
                            onChange={(checked) => updateSettings((current) => ({ ...current, twoFactor: { ...current.twoFactor, stepUpForSensitiveActions: checked } }))}
                        />
                    </div>

                    <AdminAuthenticatorSetup />
                </div>
            </SectionCard>

            <SectionCard
                title="Sessions & Access"
                description="Canonical session lifetime, concurrency, and admin route access rules."
                help={{
                    title: 'Sessions & Access',
                    content: 'These controls map to sessions.*, adminAccess.allowedAdminIPs, and adminAccess.adminPanelEnabled.',
                    impact: 'They affect token lifetime, concurrent device usage, and emergency admin-route shutdown.',
                    affected: 'Every authenticated user plus all admin route access.',
                    enabledNote: 'Shorter lifetimes and lower session counts reduce token persistence risk.',
                    disabledNote: 'Loose session rules can leave stale or compromised tokens active longer.',
                    bestPractice: 'Keep token TTLs conservative, define allow-lists only when needed, and reserve admin panel lock for emergency use.',
                }}
            >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <NumberField
                        label="Access token TTL"
                        description="Minutes before access tokens expire."
                        value={settings.sessions.accessTokenTTLMinutes}
                        min={5}
                        max={180}
                        onChange={(value) => updateSettings((current) => ({ ...current, sessions: { ...current.sessions, accessTokenTTLMinutes: value } }))}
                    />
                    <NumberField
                        label="Refresh token TTL"
                        description="Days before refresh tokens expire."
                        value={settings.sessions.refreshTokenTTLDays}
                        min={1}
                        max={120}
                        onChange={(value) => updateSettings((current) => ({ ...current, sessions: { ...current.sessions, refreshTokenTTLDays: value } }))}
                    />
                    <NumberField
                        label="Idle timeout"
                        description="Minutes before inactive sessions expire."
                        value={settings.sessions.idleTimeoutMinutes}
                        min={5}
                        max={1440}
                        onChange={(value) => updateSettings((current) => ({ ...current, sessions: { ...current.sessions, idleTimeoutMinutes: value } }))}
                    />
                    <NumberField
                        label="Max active sessions"
                        description="Maximum concurrent active sessions per user."
                        value={settings.sessions.maxActiveSessionsPerUser}
                        min={1}
                        max={20}
                        onChange={(value) =>
                            updateSettings((current) => ({
                                ...current,
                                sessions: { ...current.sessions, maxActiveSessionsPerUser: value },
                                examProtection: { ...current.examProtection, maxActiveSessionsPerUser: value },
                            }))
                        }
                    />
                    <div className="md:col-span-2 xl:col-span-1">
                        <ToggleField
                            label="Allow concurrent sessions"
                            description="If off, a new login forces other active sessions out."
                            checked={settings.sessions.allowConcurrentSessions}
                            onChange={(checked) => updateSettings((current) => ({ ...current, sessions: { ...current.sessions, allowConcurrentSessions: checked } }))}
                        />
                    </div>
                    <label className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 md:col-span-2 xl:col-span-2">
                        <p className="text-sm font-medium text-white">Allowed admin IPs</p>
                        <p className="mt-1 text-xs text-slate-400">Leave empty to allow all admin IPs. One IP or CIDR per line.</p>
                        <textarea
                            value={adminIpDraft}
                            onChange={(event) => {
                                const nextText = event.target.value;
                                setAdminIpDraft(nextText);
                                const ips = fromMultilineList(nextText);
                                updateSettings((current) => ({
                                    ...current,
                                    adminAccess: { ...current.adminAccess, allowedAdminIPs: ips },
                                    accessControl: { ...current.accessControl, allowedAdminIPs: ips },
                                }));
                            }}
                            rows={4}
                            placeholder={`203.0.113.10\n198.51.100.0/24`}
                            className="mt-3 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50"
                        />
                    </label>
                    <div className="md:col-span-2 xl:col-span-1">
                        <ToggleField
                            label="Admin panel enabled"
                            description="Master switch for admin route access. Use the quick action below for emergency lock or unlock."
                            checked={settings.adminAccess.adminPanelEnabled}
                            onChange={(checked) =>
                                updateSettings((current) => ({
                                    ...current,
                                    adminAccess: { ...current.adminAccess, adminPanelEnabled: checked },
                                    runtimeGuards: { ...current.runtimeGuards, adminPanelEnabled: checked },
                                }))
                            }
                        />
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="Verification & Recovery"
                description="Keep only verified-email requirements and real expiry windows."
                help={{
                    title: 'Verification & Recovery',
                    content: 'This section owns requireVerifiedEmailForAdmins, requireVerifiedEmailForStudents, emailVerificationExpiryHours, and passwordResetExpiryMinutes.',
                    impact: 'These rules define how quickly email verification and reset links expire and whether verified email is mandatory.',
                    affected: 'Admin and student recovery, onboarding, and login readiness.',
                    enabledNote: 'Verified-email requirements improve account recovery trust and reduce impersonation risk.',
                    disabledNote: 'Long-lived reset windows and unverified accounts increase recovery abuse risk.',
                    bestPractice: 'Keep password reset expiry short and require verified email at least for admin users.',
                }}
            >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <ToggleField
                        label="Require verified email for admins"
                        description="Admin accounts must verify email before using protected account flows."
                        checked={settings.verificationRecovery.requireVerifiedEmailForAdmins}
                        onChange={(checked) => updateSettings((current) => ({ ...current, verificationRecovery: { ...current.verificationRecovery, requireVerifiedEmailForAdmins: checked } }))}
                    />
                    <ToggleField
                        label="Require verified email for students"
                        description="Students must verify email before protected account recovery and access checks."
                        checked={settings.verificationRecovery.requireVerifiedEmailForStudents}
                        onChange={(checked) => updateSettings((current) => ({ ...current, verificationRecovery: { ...current.verificationRecovery, requireVerifiedEmailForStudents: checked } }))}
                    />
                    <NumberField
                        label="Email verification expiry"
                        description="Hours before verification links expire."
                        value={settings.verificationRecovery.emailVerificationExpiryHours}
                        min={1}
                        max={168}
                        onChange={(value) => updateSettings((current) => ({ ...current, verificationRecovery: { ...current.verificationRecovery, emailVerificationExpiryHours: value } }))}
                    />
                    <NumberField
                        label="Password reset expiry"
                        description="Minutes before password reset links expire."
                        value={settings.verificationRecovery.passwordResetExpiryMinutes}
                        min={5}
                        max={1440}
                        onChange={(value) => updateSettings((current) => ({ ...current, verificationRecovery: { ...current.verificationRecovery, passwordResetExpiryMinutes: value } }))}
                    />
                </div>
            </SectionCard>

            <SectionCard
                title="Approvals & Sensitive Actions"
                description="Two-person approval policy, risky-action coverage, export roles, and approval queue."
                help={{
                    title: 'Approvals & Sensitive Actions',
                    content: 'This section maps to twoPersonApproval, accessControl.sensitiveActionReasonRequired, and accessControl.exportAllowedRoles.',
                    impact: 'It decides which protected actions need a second approver and which roles may export sensitive data.',
                    affected: 'Security settings updates, exports, destructive admin actions, and restore flows.',
                    enabledNote: 'Two-person approval limits unilateral destructive or high-risk changes.',
                    disabledNote: 'Without approvals, one compromised privileged account can execute risky actions alone.',
                    bestPractice: 'Enable approvals for restore, exports, destructive changes, and security-setting updates in production.',
                }}
            >
                <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <ToggleField
                                label="Enable two-person approval"
                                description="Sensitive actions can be queued for a second approver instead of executing immediately."
                                checked={settings.twoPersonApproval.enabled}
                                onChange={(checked) => updateSettings((current) => ({ ...current, twoPersonApproval: { ...current.twoPersonApproval, enabled: checked } }))}
                            />
                            <ToggleField
                                label="Require a reason for sensitive actions"
                                description="Protected writes and exports must include a human-readable reason."
                                checked={settings.accessControl.sensitiveActionReasonRequired}
                                onChange={(checked) =>
                                    updateSettings((current) => ({
                                        ...current,
                                        accessControl: { ...current.accessControl, sensitiveActionReasonRequired: checked },
                                        exportSecurity: { ...current.exportSecurity, requireReason: checked },
                                    }))
                                }
                            />
                        </div>

                        <NumberField
                            label="Approval expiry"
                            description="Minutes before a pending approval request expires."
                            value={settings.twoPersonApproval.approvalExpiryMinutes}
                            min={5}
                            max={1440}
                            onChange={(value) => updateSettings((current) => ({ ...current, twoPersonApproval: { ...current.twoPersonApproval, approvalExpiryMinutes: value } }))}
                        />

                        <ChipToggleGroup
                            title="Risky actions"
                            description="Select every action that should be covered when two-person approval is enabled."
                            options={RISKY_ACTION_OPTIONS}
                            selected={settings.twoPersonApproval.riskyActions}
                            onChange={(selected) =>
                                updateSettings((current) => ({
                                    ...current,
                                    twoPersonApproval: {
                                        ...current.twoPersonApproval,
                                        riskyActions: normalizeRoles(selected, RISKY_ACTION_OPTIONS.map((option) => option.value)) as RiskyActionKey[],
                                    },
                                }))
                            }
                            dataTestId="security-risky-actions"
                        />

                        <ChipToggleGroup
                            title="Export-allowed roles"
                            description="Only these roles are allowed to export protected data."
                            options={EXPORT_ROLE_OPTIONS.map((option) => ({ ...option }))}
                            selected={settings.accessControl.exportAllowedRoles}
                            onChange={(selected) =>
                                updateSettings((current) => ({
                                    ...current,
                                    accessControl: {
                                        ...current.accessControl,
                                        exportAllowedRoles: normalizeRoles(selected, EXPORT_ROLE_OPTIONS.map((option) => option.value)),
                                    },
                                    exportSecurity: {
                                        ...current.exportSecurity,
                                        allowedRoles: normalizeRoles(selected, EXPORT_ROLE_OPTIONS.map((option) => option.value)),
                                    },
                                }))
                            }
                            dataTestId="security-export-roles"
                        />
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-semibold text-white">Pending approvals</h4>
                                <p className="mt-1 text-xs text-slate-400">Second-approval queue for risky actions.</p>
                            </div>
                            {pendingApprovalsQuery.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                        </div>
                        <div className="mt-4 space-y-3">
                            {(pendingApprovalsQuery.data?.items || []).map((item) => (
                                <div key={item._id} className="rounded-2xl border border-white/8 bg-slate-950/70 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-white">{item.action.replace(/_/g, ' ')}</p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {item.module} · {item.method.toUpperCase()} · expires {formatApprovalExpiry(item.expiresAt)}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500">Requested by {item.initiatedByRole}</p>
                                        </div>
                                        <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                                            {item.status.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    {item.reviewSummary?.length ? (
                                        <div className="mt-3 space-y-1">
                                            {item.reviewSummary.slice(0, 3).map((entry) => (
                                                <p key={`${item._id}-${entry.label}`} className="text-xs text-slate-400">
                                                    <span className="font-semibold text-slate-300">{entry.label}:</span> {entry.value}
                                                </p>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => approveMutation.mutate(item._id)}
                                            disabled={approveMutation.isPending}
                                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                                        >
                                            <UserCheck className="h-3.5 w-3.5" />
                                            Approve
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => rejectApproval(item)}
                                            disabled={rejectMutation.isPending}
                                            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                                        >
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {!pendingApprovalsQuery.isLoading && !(pendingApprovalsQuery.data?.items || []).length ? (
                                <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-6 text-center">
                                    <p className="text-sm font-medium text-white">No pending approvals</p>
                                    <p className="mt-1 text-xs text-slate-400">Sensitive actions that need a second approver will appear here.</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="Site, Emergency & Retention"
                description="Live access controls, exam gating, testing mode, and retention windows."
                help={{
                    title: 'Site, Emergency & Retention',
                    content: 'These controls own maintenance mode, registration blocks, emergency panic switches, testing access mode, exam gating, and retention windows.',
                    impact: 'They directly affect whether users can log in, start exams, or hit webhooks during incidents.',
                    affected: 'Public visitors, students, admins, payment webhooks, and exam operations.',
                    enabledNote: 'Emergency toggles let you contain incidents quickly without editing code or using a separate runtime control surface elsewhere.',
                    disabledNote: 'Without these controls, response time during incidents is slower and more manual.',
                    bestPractice: 'Use maintenance/read-only only when needed, and keep retention windows aligned to audit and compliance needs.',
                }}
            >
                <div className="grid gap-5 xl:grid-cols-2">
                    <div className="space-y-4">
                        <ToggleField label="Maintenance mode" description="Show maintenance state to the site and stop normal access flows." checked={settings.siteAccess.maintenanceMode} onChange={(checked) => updateSettings((current) => ({ ...current, siteAccess: { ...current.siteAccess, maintenanceMode: checked }, runtimeGuards: { ...current.runtimeGuards, maintenanceMode: checked } }))} />
                        <ToggleField label="Block new registrations" description="Prevent new accounts from being created while keeping existing access intact." checked={settings.siteAccess.blockNewRegistrations} onChange={(checked) => updateSettings((current) => ({ ...current, siteAccess: { ...current.siteAccess, blockNewRegistrations: checked }, runtimeGuards: { ...current.runtimeGuards, blockNewRegistrations: checked } }))} />
                        <ToggleField label="Read-only mode" description="Block write-heavy actions during incidents or maintenance windows." checked={settings.panic.readOnlyMode} onChange={(checked) => updateSettings((current) => ({ ...current, panic: { ...current.panic, readOnlyMode: checked }, runtimeGuards: { ...current.runtimeGuards, readOnlyMode: checked } }))} />
                        <ToggleField label="Disable student logins" description="Prevent students from starting new authenticated sessions." checked={settings.panic.disableStudentLogins} onChange={(checked) => updateSettings((current) => ({ ...current, panic: { ...current.panic, disableStudentLogins: checked }, runtimeGuards: { ...current.runtimeGuards, disableStudentLogins: checked } }))} />
                        <ToggleField label="Disable payment webhooks" description="Pause payment webhook intake during gateway or incident response windows." checked={settings.panic.disablePaymentWebhooks} onChange={(checked) => updateSettings((current) => ({ ...current, panic: { ...current.panic, disablePaymentWebhooks: checked }, runtimeGuards: { ...current.runtimeGuards, disablePaymentWebhooks: checked } }))} />
                        <ToggleField label="Disable exam starts" description="Prevent new exam launches while leaving analytics and monitoring intact." checked={settings.panic.disableExamStarts} onChange={(checked) => updateSettings((current) => ({ ...current, panic: { ...current.panic, disableExamStarts: checked }, runtimeGuards: { ...current.runtimeGuards, disableExamStarts: checked } }))} />
                        <ToggleField label="Testing access mode" description="Disables certain production-grade restrictions for controlled QA environments." checked={settings.runtimeGuards.testingAccessMode} onChange={(checked) => updateSettings((current) => ({ ...current, runtimeGuards: { ...current.runtimeGuards, testingAccessMode: checked } }))} />
                    </div>

                    <div className="space-y-4">
                        <ToggleField label="Require profile score for exam access" description="Students must meet the configured profile score threshold before starting protected exams." checked={settings.examProtection.requireProfileScoreForExam} onChange={(checked) => updateSettings((current) => ({ ...current, examProtection: { ...current.examProtection, requireProfileScoreForExam: checked } }))} />
                        <NumberField label="Profile score threshold" description="Minimum score required when exam access gating is on." value={settings.examProtection.profileScoreThreshold} min={0} max={100} onChange={(value) => updateSettings((current) => ({ ...current, examProtection: { ...current.examProtection, profileScoreThreshold: value } }))} />
                        <ToggleField label="Retention policy enabled" description="Turn retention windows on for audit and event cleanup processes." checked={settings.retention.enabled} onChange={(checked) => updateSettings((current) => ({ ...current, retention: { ...current.retention, enabled: checked } }))} />
                        <NumberField label="Exam sessions retention" description="Days to keep exam session records before cleanup." value={settings.retention.examSessionsDays} min={7} max={3650} onChange={(value) => updateSettings((current) => ({ ...current, retention: { ...current.retention, examSessionsDays: value } }))} />
                        <NumberField label="Audit logs retention" description="Days to keep admin audit logs before cleanup." value={settings.retention.auditLogsDays} min={30} max={3650} onChange={(value) => updateSettings((current) => ({ ...current, retention: { ...current.retention, auditLogsDays: value } }))} />
                        <NumberField label="Event logs retention" description="Days to keep lower-level event and security logs." value={settings.retention.eventLogsDays} min={30} max={3650} onChange={(value) => updateSettings((current) => ({ ...current, retention: { ...current.retention, eventLogsDays: value } }))} />
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="Critical Actions"
                description="Immediate response controls kept separate from policy editing."
                help={{
                    title: 'Critical Actions',
                    content: 'These actions trigger sensitive backend operations such as forced logout and admin-panel lockdown.',
                    impact: 'They are meant for incident response, compromised sessions, or emergency maintenance.',
                    affected: 'All active users or all admin-route visitors depending on the action.',
                    enabledNote: 'Use these controls when immediate containment is more important than normal continuity.',
                    disabledNote: 'Avoid using them casually because they interrupt normal operations.',
                    bestPractice: 'Announce these actions to the team before triggering them unless you are actively containing an incident.',
                }}
            >
                <div className="grid gap-4 md:grid-cols-3">
                    <button
                        type="button"
                        onClick={forceLogoutAll}
                        disabled={forceLogoutMutation.isPending}
                        className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-left transition hover:bg-amber-500/20 disabled:opacity-50"
                    >
                        {forceLogoutMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin text-amber-200" /> : <LogOut className="h-5 w-5 text-amber-200" />}
                        <div>
                            <p className="text-sm font-semibold text-white">Force logout all sessions</p>
                            <p className="mt-1 text-xs text-slate-300">Ends all active sessions across the platform.</p>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={toggleAdminPanel}
                        disabled={adminPanelMutation.isPending}
                        className={`flex items-center gap-3 rounded-2xl border px-4 py-4 text-left transition disabled:opacity-50 ${
                            settings.adminAccess.adminPanelEnabled
                                ? 'border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20'
                                : 'border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20'
                        }`}
                    >
                        {adminPanelMutation.isPending ? (
                            <Loader2 className="h-5 w-5 animate-spin text-white" />
                        ) : settings.adminAccess.adminPanelEnabled ? (
                            <Lock className="h-5 w-5 text-rose-200" />
                        ) : (
                            <Shield className="h-5 w-5 text-emerald-200" />
                        )}
                        <div>
                            <p className="text-sm font-semibold text-white">{settings.adminAccess.adminPanelEnabled ? 'Lock admin panel' : 'Unlock admin panel'}</p>
                            <p className="mt-1 text-xs text-slate-300">{settings.adminAccess.adminPanelEnabled ? 'Emergency stop for admin routes.' : 'Restore admin route access.'}</p>
                        </div>
                    </button>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                        <div className="flex items-center gap-3">
                            <Clock3 className="h-5 w-5 text-cyan-300" />
                            <div>
                                <p className="text-sm font-semibold text-white">Current posture</p>
                                <p className="mt-1 text-xs text-slate-400">
                                    Admin panel {settings.adminAccess.adminPanelEnabled ? 'open' : 'locked'} · MFA roles {settings.twoFactor.requireForRoles.length} · approvals {settings.twoPersonApproval.enabled ? 'enabled' : 'off'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
