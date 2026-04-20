import { describe, it, expect } from 'vitest';
import {
    applyMigrationDefaults,
    ADVANCED_SETTINGS_DEFAULTS,
} from '../models/NotificationSettings';
import {
    validateSettingsBody,
    type ValidationError,
} from '../middlewares/settingsValidator';

// ─── Unit Tests: applyMigrationDefaults (Req 1.1, 1.2) ─────────────────────

describe('applyMigrationDefaults', () => {
    it('merges all advanced defaults into a legacy doc with no schemaVersion', () => {
        const legacy: Record<string, unknown> = {
            dailySmsLimit: 500,
            dailyEmailLimit: 2000,
        };

        const result = applyMigrationDefaults(legacy);

        // Original fields preserved
        expect(result.dailySmsLimit).toBe(500);
        expect(result.dailyEmailLimit).toBe(2000);

        // Advanced defaults merged
        expect(result.schemaVersion).toBe(2);
        expect(result.frequencyCap).toEqual(ADVANCED_SETTINGS_DEFAULTS.frequencyCap);
        expect(result.budgetGuardrails).toEqual(ADVANCED_SETTINGS_DEFAULTS.budgetGuardrails);
        expect(result.providerRouting).toEqual(ADVANCED_SETTINGS_DEFAULTS.providerRouting);
        expect(result.approvalPolicy).toEqual(ADVANCED_SETTINGS_DEFAULTS.approvalPolicy);
        expect(result.experiment).toEqual(ADVANCED_SETTINGS_DEFAULTS.experiment);
        expect(result.sendTime).toEqual(ADVANCED_SETTINGS_DEFAULTS.sendTime);
        expect(result.contentLint).toEqual(ADVANCED_SETTINGS_DEFAULTS.contentLint);
        expect(result.observability).toEqual(ADVANCED_SETTINGS_DEFAULTS.observability);
        expect(result.dataGovernance).toEqual(ADVANCED_SETTINGS_DEFAULTS.dataGovernance);
    });

    it('merges defaults when schemaVersion is 0 (preserves existing schemaVersion value)', () => {
        const doc: Record<string, unknown> = { schemaVersion: 0 };
        const result = applyMigrationDefaults(doc);

        // schemaVersion already exists (0), so it is NOT overwritten — only missing keys are filled
        expect(result.schemaVersion).toBe(0);
        expect(result.frequencyCap).toEqual(ADVANCED_SETTINGS_DEFAULTS.frequencyCap);
    });

    it('merges defaults when schemaVersion is 1 (preserves existing schemaVersion value)', () => {
        const doc: Record<string, unknown> = { schemaVersion: 1 };
        const result = applyMigrationDefaults(doc);

        // schemaVersion already exists (1), so it is NOT overwritten
        expect(result.schemaVersion).toBe(1);
        expect(result.observability).toEqual(ADVANCED_SETTINGS_DEFAULTS.observability);
    });

    it('does NOT overwrite existing advanced field values', () => {
        const customCap = { dailyCap: 10, weeklyCap: 50, monthlyCap: 200, cooldownMinutes: 5 };
        const doc: Record<string, unknown> = {
            schemaVersion: 1,
            frequencyCap: customCap,
        };

        const result = applyMigrationDefaults(doc);

        // Existing value kept
        expect(result.frequencyCap).toEqual(customCap);
        // Missing defaults still filled
        expect(result.budgetGuardrails).toEqual(ADVANCED_SETTINGS_DEFAULTS.budgetGuardrails);
    });

    it('returns doc unchanged when schemaVersion >= 2', () => {
        const doc: Record<string, unknown> = {
            schemaVersion: 2,
            dailySmsLimit: 100,
        };

        const result = applyMigrationDefaults(doc);

        expect(result).toEqual(doc);
        // No extra keys added
        expect(result.frequencyCap).toBeUndefined();
    });

    it('returns doc unchanged when schemaVersion is 3', () => {
        const doc: Record<string, unknown> = { schemaVersion: 3 };
        const result = applyMigrationDefaults(doc);

        expect(result).toEqual(doc);
    });
});


// ─── Unit Tests: validateSettingsBody (Req 1.4, 1.5) ────────────────────────

describe('validateSettingsBody', () => {
    // --- Unknown key rejection (Req 1.4) ---

    it('rejects unknown top-level keys with descriptive error', () => {
        const body = { bogusKey: 123, anotherBad: 'nope' };
        const errors = validateSettingsBody(body);

        expect(errors.length).toBe(1);
        expect(errors[0].path).toBe('_unknown');
        expect(errors[0].message).toContain('bogusKey');
        expect(errors[0].message).toContain('anotherBad');
    });

    // --- Numeric range validation (Req 1.5) ---

    it('rejects negative dailySmsLimit', () => {
        const errors = validateSettingsBody({ dailySmsLimit: -1 });
        expect(errors.some((e) => e.path === 'dailySmsLimit' && e.message.includes('>= 0'))).toBe(true);
    });

    it('rejects non-finite numeric values', () => {
        const errors = validateSettingsBody({ dailySmsLimit: Infinity });
        expect(errors.some((e) => e.path === 'dailySmsLimit')).toBe(true);
    });

    it('rejects budgetGuardrails.softLimitPercent above 100', () => {
        const errors = validateSettingsBody({
            budgetGuardrails: { softLimitPercent: 150 },
        });
        expect(errors.some((e) => e.path === 'budgetGuardrails.softLimitPercent' && e.message.includes('<= 100'))).toBe(true);
    });

    it('rejects budgetGuardrails.softLimitPercent below 1', () => {
        const errors = validateSettingsBody({
            budgetGuardrails: { softLimitPercent: 0 },
        });
        expect(errors.some((e) => e.path === 'budgetGuardrails.softLimitPercent' && e.message.includes('>= 1'))).toBe(true);
    });

    it('rejects experiment.holdoutPercent above 50', () => {
        const errors = validateSettingsBody({
            experiment: { holdoutPercent: 60 },
        });
        expect(errors.some((e) => e.path === 'experiment.holdoutPercent' && e.message.includes('<= 50'))).toBe(true);
    });

    it('rejects observability.sloTargetPercent above 100', () => {
        const errors = validateSettingsBody({
            observability: { sloTargetPercent: 101 },
        });
        expect(errors.some((e) => e.path === 'observability.sloTargetPercent' && e.message.includes('<= 100'))).toBe(true);
    });

    // --- Relational cap validation (Req 4.6) ---

    it('rejects dailyCap > weeklyCap', () => {
        const errors = validateSettingsBody({
            frequencyCap: { dailyCap: 30, weeklyCap: 10, monthlyCap: 60 },
        });
        expect(errors.some((e) => e.path === 'frequencyCap.dailyCap' && e.message.includes('dailyCap must be <= weeklyCap'))).toBe(true);
    });

    it('rejects weeklyCap > monthlyCap', () => {
        const errors = validateSettingsBody({
            frequencyCap: { dailyCap: 5, weeklyCap: 100, monthlyCap: 50 },
        });
        expect(errors.some((e) => e.path === 'frequencyCap.weeklyCap' && e.message.includes('weeklyCap must be <= monthlyCap'))).toBe(true);
    });

    it('reports both relational violations when dailyCap > weeklyCap > monthlyCap', () => {
        const errors = validateSettingsBody({
            frequencyCap: { dailyCap: 100, weeklyCap: 50, monthlyCap: 10 },
        });
        expect(errors.some((e) => e.path === 'frequencyCap.dailyCap')).toBe(true);
        expect(errors.some((e) => e.path === 'frequencyCap.weeklyCap')).toBe(true);
    });

    // --- Valid body passes ---

    it('returns no errors for a valid body with known keys', () => {
        const errors = validateSettingsBody({
            dailySmsLimit: 500,
            dailyEmailLimit: 2000,
            frequencyCap: { dailyCap: 5, weeklyCap: 20, monthlyCap: 60, cooldownMinutes: 0 },
            budgetGuardrails: { softLimitPercent: 80, hardLimitEnabled: true, anomalySpikeThresholdPercent: 200 },
            observability: { sloTargetPercent: 99, queueLagThresholdMinutes: 5 },
        });
        expect(errors).toEqual([]);
    });

    it('returns no errors for an empty body', () => {
        const errors = validateSettingsBody({});
        expect(errors).toEqual([]);
    });
});
