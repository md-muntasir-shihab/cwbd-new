/**
 * Unit tests for frontend campaign settings components
 * Validates: Requirements 16.1, 16.2, 16.4, 16.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AdvancedNotificationSettings } from '../../types/campaignSettings';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => mockUseAuth(),
}));

// Mock campaignSettingsApi
const mockGetAdvancedSettings = vi.fn();
const mockUpdateAdvancedSettings = vi.fn();
const mockSimulateSettings = vi.fn();
vi.mock('../../api/campaignSettingsApi', () => ({
    getAdvancedSettings: () => mockGetAdvancedSettings(),
    updateAdvancedSettings: (...args: unknown[]) => mockUpdateAdvancedSettings(...args),
    simulateSettings: (...args: unknown[]) => mockSimulateSettings(...args),
}));

// Mock appDialog
const mockShowConfirmDialog = vi.fn();
vi.mock('../../lib/appDialog', () => ({
    showConfirmDialog: (...args: unknown[]) => mockShowConfirmDialog(...args),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────────────

import CollapsibleSection from '../../components/campaign-settings/CollapsibleSection';
import ValidationMessage from '../../components/campaign-settings/ValidationMessage';
import CapsSettingsSection from '../../components/campaign-settings/CapsSettingsSection';
import BudgetSettingsSection from '../../components/campaign-settings/BudgetSettingsSection';
import ApprovalSettingsSection from '../../components/campaign-settings/ApprovalSettingsSection';
import ObservabilitySettingsSection from '../../components/campaign-settings/ObservabilitySettingsSection';
import ExperimentSettingsSection from '../../components/campaign-settings/ExperimentSettingsSection';
import CampaignSettingsPage from '../../pages/admin/CampaignSettingsPage';
import { Settings } from 'lucide-react';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const defaultSettings: AdvancedNotificationSettings = {
    schemaVersion: 2,
    dailySmsLimit: 100,
    dailyEmailLimit: 200,
    monthlySmsBudgetBDT: 5000,
    monthlyEmailBudgetBDT: 3000,
    quietHours: { enabled: false, startHour: 22, endHour: 6, timezone: 'Asia/Dhaka' },
    duplicatePreventionWindowMinutes: 30,
    maxRetryCount: 3,
    retryDelayMinutes: 5,
    triggerToggles: [],
    subscriptionReminderDays: [7, 3, 1],
    resultPublishAutoSend: true,
    autoSyncCostToFinance: true,
    frequencyCap: { dailyCap: 5, weeklyCap: 20, monthlyCap: 60, cooldownMinutes: 30 },
    budgetGuardrail: { softLimitPercent: 80, hardLimitEnabled: true, anomalySpikeThresholdPercent: 200 },
    providerRouting: {
        sms: { primary: 'provider-a' },
        email: { primary: 'provider-b' },
        circuitBreaker: { failureThreshold: 50, rollingWindowMs: 60000, backoffIntervalMs: 30000 },
        retry: { baseDelayMs: 1000, maxAttempts: 3 },
    },
    approvalPolicy: { audienceSizeThreshold: 1000, estimatedCostThreshold: 5000, sensitiveSegmentIds: [] },
    experiment: { variants: [], holdoutPercent: 10, observationWindowHours: 24, primaryMetric: 'open' },
    sendTime: { deliveryWindow: { startHour: 8, endHour: 20 }, quietHourExceptions: [], bestTimeEnabled: false },
    contentLint: { restrictedTerms: [], complianceFlagPatterns: [], channelLengthLimits: { sms: 160, emailSubject: 200 }, warnThreshold: 3, blockThreshold: 7 },
    observability: { sloTargetPercent: 95, queueLagThresholdMinutes: 10, failureSurgeThresholdPercent: 20, costAnomalyThresholdPercent: 50, rollingWindowMinutes: 60 },
    dataGovernance: { retentionDays: 90, piiMaskingEnabled: true, exportPermissionRoles: ['superadmin', 'admin'] },
};

function setupAuthMock(role: string) {
    mockUseAuth.mockReturnValue({
        user: { _id: 'u1', username: 'testuser', email: 'test@test.com', role, fullName: 'Test User' },
        token: 'mock-token',
        isAuthenticated: true,
        isLoading: false,
    });
}

// ─── 1. Section Rendering (Req 16.1) ────────────────────────────────────────

describe('Section Rendering (Req 16.1)', () => {
    it('CollapsibleSection renders title and toggles content', () => {
        render(
            <CollapsibleSection icon={Settings} title="Test Section" defaultOpen={false}>
                <p>Inner content</p>
            </CollapsibleSection>,
        );
        expect(screen.getByText('Test Section')).toBeInTheDocument();
        // Content hidden by default (defaultOpen=false)
        const content = screen.getByText('Inner content');
        expect(content.closest('div[class*="max-h-0"]')).toBeInTheDocument();

        // Click to open
        fireEvent.click(screen.getByRole('button'));
        expect(content.closest('div[class*="max-h-0"]')).not.toBeInTheDocument();
    });

    it('CollapsibleSection renders open by default when defaultOpen=true', () => {
        render(
            <CollapsibleSection icon={Settings} title="Open Section" defaultOpen>
                <p>Visible content</p>
            </CollapsibleSection>,
        );
        const content = screen.getByText('Visible content');
        expect(content.closest('div[class*="max-h-0"]')).not.toBeInTheDocument();
    });

    it('CapsSettingsSection renders title and all fields', () => {
        const onChange = vi.fn();
        render(<CapsSettingsSection settings={defaultSettings.frequencyCap} onChange={onChange} />);
        expect(screen.getByText('Frequency Caps')).toBeInTheDocument();
        expect(screen.getByText('Daily Cap')).toBeInTheDocument();
        expect(screen.getByText('Weekly Cap')).toBeInTheDocument();
        expect(screen.getByText('Monthly Cap')).toBeInTheDocument();
        expect(screen.getByText('Cooldown (min)')).toBeInTheDocument();
    });

    it('BudgetSettingsSection renders title and fields', () => {
        const onChange = vi.fn();
        render(<BudgetSettingsSection settings={defaultSettings.budgetGuardrail} onChange={onChange} />);
        expect(screen.getByText('Budget Guardrails')).toBeInTheDocument();
        expect(screen.getByText('Soft Limit (%)')).toBeInTheDocument();
        expect(screen.getByText('Anomaly Spike Threshold (%)')).toBeInTheDocument();
        expect(screen.getByText('Hard Limit Enabled')).toBeInTheDocument();
    });

    it('ApprovalSettingsSection renders title and fields', () => {
        const onChange = vi.fn();
        render(<ApprovalSettingsSection settings={defaultSettings.approvalPolicy} onChange={onChange} />);
        expect(screen.getByText('Approval Workflow')).toBeInTheDocument();
        expect(screen.getByText('Audience Size Threshold')).toBeInTheDocument();
        expect(screen.getByText('Estimated Cost Threshold (BDT)')).toBeInTheDocument();
    });

    it('ObservabilitySettingsSection renders title and fields', () => {
        const onChange = vi.fn();
        render(<ObservabilitySettingsSection settings={defaultSettings.observability} onChange={onChange} />);
        expect(screen.getByText('Observability')).toBeInTheDocument();
        expect(screen.getByText('SLO Target (%)')).toBeInTheDocument();
        expect(screen.getByText('Queue Lag Threshold (min)')).toBeInTheDocument();
    });

    it('ExperimentSettingsSection renders title and fields', () => {
        const onChange = vi.fn();
        render(<ExperimentSettingsSection settings={defaultSettings.experiment} onChange={onChange} />);
        expect(screen.getByText('A/B Experiment')).toBeInTheDocument();
        expect(screen.getByText('Holdout (%)')).toBeInTheDocument();
        expect(screen.getByText('Observation Window (hrs)')).toBeInTheDocument();
        expect(screen.getByText('Primary Metric')).toBeInTheDocument();
    });
});

// ─── 2. Validation Message Display (Req 16.2) ───────────────────────────────

describe('Validation Message Display (Req 16.2)', () => {
    it('ValidationMessage renders nothing when no message', () => {
        const { container } = render(<ValidationMessage />);
        expect(container.innerHTML).toBe('');
    });

    it('ValidationMessage renders message text', () => {
        render(<ValidationMessage message="Field is required" />);
        expect(screen.getByText('Field is required')).toBeInTheDocument();
    });

    it('CapsSettingsSection shows validation when dailyCap < 1', () => {
        const onChange = vi.fn();
        render(
            <CapsSettingsSection
                settings={{ dailyCap: 0, weeklyCap: 20, monthlyCap: 60, cooldownMinutes: 30 }}
                onChange={onChange}
            />,
        );
        // Open the section first
        fireEvent.click(screen.getByText('Frequency Caps'));
        expect(screen.getByText('Daily cap must be at least 1')).toBeInTheDocument();
    });

    it('CapsSettingsSection shows validation when weeklyCap < dailyCap', () => {
        const onChange = vi.fn();
        render(
            <CapsSettingsSection
                settings={{ dailyCap: 10, weeklyCap: 5, monthlyCap: 60, cooldownMinutes: 30 }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('Frequency Caps'));
        expect(screen.getByText('Weekly cap must be ≥ daily cap')).toBeInTheDocument();
    });

    it('CapsSettingsSection shows validation when monthlyCap < weeklyCap', () => {
        const onChange = vi.fn();
        render(
            <CapsSettingsSection
                settings={{ dailyCap: 5, weeklyCap: 20, monthlyCap: 10, cooldownMinutes: 30 }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('Frequency Caps'));
        expect(screen.getByText('Monthly cap must be ≥ weekly cap')).toBeInTheDocument();
    });

    it('CapsSettingsSection shows validation when cooldown is negative', () => {
        const onChange = vi.fn();
        render(
            <CapsSettingsSection
                settings={{ dailyCap: 5, weeklyCap: 20, monthlyCap: 60, cooldownMinutes: -1 }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('Frequency Caps'));
        expect(screen.getByText('Cooldown cannot be negative')).toBeInTheDocument();
    });

    it('BudgetSettingsSection shows validation for out-of-range softLimitPercent', () => {
        const onChange = vi.fn();
        render(
            <BudgetSettingsSection
                settings={{ softLimitPercent: 0, hardLimitEnabled: true, anomalySpikeThresholdPercent: 200 }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('Budget Guardrails'));
        expect(screen.getByText('Soft limit must be 1–100%')).toBeInTheDocument();
    });

    it('BudgetSettingsSection shows validation for anomaly threshold < 100', () => {
        const onChange = vi.fn();
        render(
            <BudgetSettingsSection
                settings={{ softLimitPercent: 80, hardLimitEnabled: true, anomalySpikeThresholdPercent: 50 }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('Budget Guardrails'));
        expect(screen.getByText('Anomaly spike threshold must be ≥ 100%')).toBeInTheDocument();
    });

    it('ObservabilitySettingsSection shows validation for SLO out of range', () => {
        const onChange = vi.fn();
        render(
            <ObservabilitySettingsSection
                settings={{ ...defaultSettings.observability, sloTargetPercent: 0 }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('Observability'));
        expect(screen.getByText('SLO target must be 1–100%')).toBeInTheDocument();
    });

    it('ExperimentSettingsSection shows validation for holdout > 50%', () => {
        const onChange = vi.fn();
        render(
            <ExperimentSettingsSection
                settings={{ ...defaultSettings.experiment, holdoutPercent: 60 }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('A/B Experiment'));
        expect(screen.getByText('Holdout must be 0–50%')).toBeInTheDocument();
    });

    it('ExperimentSettingsSection shows validation when variant splits do not sum to 100', () => {
        const onChange = vi.fn();
        render(
            <ExperimentSettingsSection
                settings={{
                    ...defaultSettings.experiment,
                    variants: [
                        { id: 'a', splitPercent: 40 },
                        { id: 'b', splitPercent: 30 },
                    ],
                }}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByText('A/B Experiment'));
        expect(screen.getByText('Variant splits must total 100% (currently 70%)')).toBeInTheDocument();
    });
});


// ─── 3. RBAC-Based Section Visibility (Req 16.4) ────────────────────────────

describe('RBAC-Based Section Visibility (Req 16.4)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdvancedSettings.mockResolvedValue({ ...defaultSettings });
        mockUpdateAdvancedSettings.mockResolvedValue({ ...defaultSettings });
    });

    it('superadmin sees all 9 sections', async () => {
        setupAuthMock('superadmin');
        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('General Settings')).toBeInTheDocument());

        expect(screen.getByText('General Settings')).toBeInTheDocument();
        expect(screen.getByText('Consent & Send-Time')).toBeInTheDocument();
        expect(screen.getByText('Frequency Caps')).toBeInTheDocument();
        expect(screen.getByText('Budget Guardrails')).toBeInTheDocument();
        expect(screen.getByText('Provider Routing')).toBeInTheDocument();
        expect(screen.getByText('Approval Workflow')).toBeInTheDocument();
        expect(screen.getByText('A/B Experiment')).toBeInTheDocument();
        expect(screen.getByText('Compliance & Data Governance')).toBeInTheDocument();
        expect(screen.getByText('Observability')).toBeInTheDocument();
    });

    it('moderator sees General, Caps, Experiment, Observability but NOT Budget, Routing, Approval, Consent, Compliance', async () => {
        setupAuthMock('moderator');
        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('General Settings')).toBeInTheDocument());

        // Visible for moderator
        expect(screen.getByText('General Settings')).toBeInTheDocument();
        expect(screen.getByText('Frequency Caps')).toBeInTheDocument();
        expect(screen.getByText('A/B Experiment')).toBeInTheDocument();
        expect(screen.getByText('Observability')).toBeInTheDocument();

        // Hidden for moderator
        expect(screen.queryByText('Consent & Send-Time')).not.toBeInTheDocument();
        expect(screen.queryByText('Budget Guardrails')).not.toBeInTheDocument();
        expect(screen.queryByText('Provider Routing')).not.toBeInTheDocument();
        expect(screen.queryByText('Approval Workflow')).not.toBeInTheDocument();
        expect(screen.queryByText('Compliance & Data Governance')).not.toBeInTheDocument();
    });

    it('viewer role sees no sections', async () => {
        setupAuthMock('viewer');
        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('Campaign Settings')).toBeInTheDocument());

        expect(screen.queryByText('General Settings')).not.toBeInTheDocument();
        expect(screen.queryByText('Frequency Caps')).not.toBeInTheDocument();
        expect(screen.queryByText('Budget Guardrails')).not.toBeInTheDocument();
        expect(screen.queryByText('A/B Experiment')).not.toBeInTheDocument();
        expect(screen.queryByText('Observability')).not.toBeInTheDocument();
    });

    it('editor role sees no sections', async () => {
        setupAuthMock('editor');
        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('Campaign Settings')).toBeInTheDocument());

        expect(screen.queryByText('General Settings')).not.toBeInTheDocument();
        expect(screen.queryByText('Consent & Send-Time')).not.toBeInTheDocument();
    });
});

// ─── 4. Elevated Confirmation Prompt (Req 16.5) ─────────────────────────────

describe('Elevated Confirmation Prompt (Req 16.5)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAdvancedSettings.mockResolvedValue({ ...defaultSettings });
        mockUpdateAdvancedSettings.mockResolvedValue({ ...defaultSettings });
        mockShowConfirmDialog.mockResolvedValue(true);
        setupAuthMock('superadmin');
    });

    it('calls showConfirmDialog when saving with budgetGuardrail changes', async () => {
        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('Campaign Settings')).toBeInTheDocument());

        // Open Budget section and change a value to mark budgetGuardrail as dirty
        fireEvent.click(screen.getByText('Budget Guardrails'));
        const softLimitInputs = screen.getAllByDisplayValue('80');
        fireEvent.change(softLimitInputs[0], { target: { value: '90' } });

        // Click Save
        fireEvent.click(screen.getByText('Save Settings'));

        await waitFor(() => {
            expect(mockShowConfirmDialog).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Sensitive Settings Change',
                    tone: 'danger',
                }),
            );
        });
    });

    it('calls showConfirmDialog when saving with approvalPolicy changes', async () => {
        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('Campaign Settings')).toBeInTheDocument());

        // Open Approval section and change the audience size threshold
        fireEvent.click(screen.getByText('Approval Workflow'));
        // Find the Audience Size Threshold label, then get its sibling input
        const approvalSection = screen.getByText('Audience Size Threshold').closest('label')!;
        const audienceInput = approvalSection.querySelector('input')!;
        fireEvent.change(audienceInput, { target: { value: '2000' } });

        // Click Save
        fireEvent.click(screen.getByText('Save Settings'));

        await waitFor(() => {
            expect(mockShowConfirmDialog).toHaveBeenCalled();
        });
    });

    it('does NOT call showConfirmDialog when saving non-sensitive changes', async () => {
        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('Campaign Settings')).toBeInTheDocument());

        // Open Caps section and change a non-sensitive value
        fireEvent.click(screen.getByText('Frequency Caps'));
        const dailyCapInputs = screen.getAllByDisplayValue('5');
        fireEvent.change(dailyCapInputs[0], { target: { value: '10' } });

        // Click Save
        fireEvent.click(screen.getByText('Save Settings'));

        await waitFor(() => {
            expect(mockUpdateAdvancedSettings).toHaveBeenCalled();
        });
        expect(mockShowConfirmDialog).not.toHaveBeenCalled();
    });

    it('does not save when user cancels the confirmation dialog', async () => {
        mockShowConfirmDialog.mockResolvedValue(false);

        render(<CampaignSettingsPage />);
        await waitFor(() => expect(screen.getByText('Campaign Settings')).toBeInTheDocument());

        // Trigger a sensitive change
        fireEvent.click(screen.getByText('Budget Guardrails'));
        const softLimitInputs = screen.getAllByDisplayValue('80');
        fireEvent.change(softLimitInputs[0], { target: { value: '90' } });

        fireEvent.click(screen.getByText('Save Settings'));

        await waitFor(() => {
            expect(mockShowConfirmDialog).toHaveBeenCalled();
        });

        // updateAdvancedSettings should NOT have been called
        expect(mockUpdateAdvancedSettings).not.toHaveBeenCalled();
    });
});
