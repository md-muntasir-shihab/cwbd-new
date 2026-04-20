// Property 3: Risk Classification Consistency
//
// Feature: campusway-qa-audit, Property 3: Risk Classification Consistency
//
// For any route or endpoint path, the risk classification function should
// deterministically assign a risk level based on the path pattern:
// - Critical: /api/auth/*, /api/exams/*/start, /api/exams/*/submit, /api/payments/*
// - High: /api/__cw_admin__/*, /api/auth/security/*
// - Medium: /api/news/*, /api/resources/*, /api/universities/*, /api/subscription-plans/*
// - Low: /api/help-center/*, /api/contact, /api/settings/public
//
// Validates: Requirements 3.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { classifyRisk } from '../../../qa/inventory-risk-map';
import type { RiskLevel } from '../../../qa/types';

// ─── Known Path → Expected Risk Level Mappings ──────────────────────

interface PathRiskEntry {
    path: string;
    expected: RiskLevel;
}

const CRITICAL_PATHS: PathRiskEntry[] = [
    { path: '/api/auth/login', expected: 'Critical' },
    { path: '/api/auth/register', expected: 'Critical' },
    { path: '/api/auth/logout', expected: 'Critical' },
    { path: '/api/auth/refresh', expected: 'Critical' },
    { path: '/api/auth/me', expected: 'Critical' },
    { path: '/api/auth/forgot-password', expected: 'Critical' },
    { path: '/api/auth/reset-password', expected: 'Critical' },
    { path: '/api/auth/change-password', expected: 'Critical' },
    { path: '/api/auth/verify', expected: 'Critical' },
    { path: '/api/auth/verify-2fa', expected: 'Critical' },
    { path: '/api/auth/resend-otp', expected: 'Critical' },
    { path: '/api/auth/admin/login', expected: 'Critical' },
    { path: '/api/auth/chairman/login', expected: 'Critical' },
    { path: '/api/exams/abc123/start', expected: 'Critical' },
    { path: '/api/exams/exam-001/submit', expected: 'Critical' },
    { path: '/api/exams/xyz/start', expected: 'Critical' },
    { path: '/api/exams/test-exam/submit', expected: 'Critical' },
    { path: '/api/payments', expected: 'Critical' },
    { path: '/api/payments/create', expected: 'Critical' },
    { path: '/api/payments/refund', expected: 'Critical' },
];

const HIGH_PATHS: PathRiskEntry[] = [
    { path: '/api/__cw_admin__/dashboard', expected: 'High' },
    { path: '/api/__cw_admin__/universities', expected: 'High' },
    { path: '/api/__cw_admin__/exams', expected: 'High' },
    { path: '/api/__cw_admin__/news', expected: 'High' },
    { path: '/api/__cw_admin__/students', expected: 'High' },
    { path: '/api/__cw_admin__/subscription-plans', expected: 'High' },
    { path: '/api/__cw_admin__/payments', expected: 'High' },
    { path: '/api/__cw_admin__/finance/dashboard', expected: 'High' },
    { path: '/api/auth/security/sessions', expected: 'High' },
    { path: '/api/auth/security/2fa/setup', expected: 'High' },
    { path: '/api/auth/security/2fa/confirm', expected: 'High' },
    { path: '/api/auth/security/2fa/disable', expected: 'High' },
    { path: '/api/auth/security/logout-all', expected: 'High' },
];

const MEDIUM_PATHS: PathRiskEntry[] = [
    { path: '/api/news', expected: 'Medium' },
    { path: '/api/news/featured', expected: 'Medium' },
    { path: '/api/news/trending', expected: 'Medium' },
    { path: '/api/news/categories', expected: 'Medium' },
    { path: '/api/resources', expected: 'Medium' },
    { path: '/api/resources/some-slug', expected: 'Medium' },
    { path: '/api/universities', expected: 'Medium' },
    { path: '/api/universities/some-slug', expected: 'Medium' },
    { path: '/api/subscription-plans', expected: 'Medium' },
    { path: '/api/subscription-plans/public', expected: 'Medium' },
    { path: '/api/subscription-plans/some-slug', expected: 'Medium' },
];

const LOW_PATHS: PathRiskEntry[] = [
    { path: '/api/help-center', expected: 'Low' },
    { path: '/api/help-center/search', expected: 'Low' },
    { path: '/api/help-center/some-article', expected: 'Low' },
    { path: '/api/contact', expected: 'Low' },
    { path: '/api/settings/public', expected: 'Low' },
];

const ALL_PATH_ENTRIES: PathRiskEntry[] = [
    ...CRITICAL_PATHS,
    ...HIGH_PATHS,
    ...MEDIUM_PATHS,
    ...LOW_PATHS,
];

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 3: Risk Classification Consistency', () => {
    it('classifyRisk deterministically assigns risk level based on path pattern', () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Strategy: Use fc.constantFrom() with known path patterns to generate
         * test inputs, then verify classifyRisk returns the expected risk level.
         */
        fc.assert(
            fc.property(
                fc.constantFrom(...ALL_PATH_ENTRIES),
                (entry: PathRiskEntry) => {
                    const result = classifyRisk(entry.path);
                    expect(result).toBe(entry.expected);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('classifyRisk is deterministic — same path always yields same risk level', () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Strategy: For any path from the known set, calling classifyRisk
         * twice should return the same result.
         */
        fc.assert(
            fc.property(
                fc.constantFrom(...ALL_PATH_ENTRIES.map((e) => e.path)),
                (path: string) => {
                    const first = classifyRisk(path);
                    const second = classifyRisk(path);
                    expect(first).toBe(second);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('classifyRisk always returns a valid RiskLevel', () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Strategy: For any path from the known set, the result must be
         * one of the four valid risk levels.
         */
        const validLevels: RiskLevel[] = ['Critical', 'High', 'Medium', 'Low'];

        fc.assert(
            fc.property(
                fc.constantFrom(...ALL_PATH_ENTRIES.map((e) => e.path)),
                (path: string) => {
                    const result = classifyRisk(path);
                    expect(validLevels).toContain(result);
                },
            ),
            { numRuns: 20 },
        );
    });
});
