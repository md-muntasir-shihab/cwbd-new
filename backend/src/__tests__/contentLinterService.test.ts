import { describe, it, expect } from 'vitest';
import { lint } from '../services/contentLinterService';
import type { ContentLintConfig } from '../types/campaignSettings';

// ─── Default test config ─────────────────────────────────────────────────────

const defaultConfig: ContentLintConfig = {
    restrictedTerms: ['spam', 'free money'],
    complianceFlagPatterns: ['\\bguaranteed\\b'],
    channelLengthLimits: { sms: 160, emailSubject: 200 },
    warnThreshold: 3,
    blockThreshold: 7,
};

// ─── Unit Tests: ContentLinter lint() ────────────────────────────────────────

describe('ContentLinter — lint()', () => {
    // Req 11.1: valid content with all placeholders resolved
    it('returns no errors for valid content with all placeholders resolved', () => {
        const result = lint(
            { body: 'Hello {{firstName}}, your order {{orderId}} is ready.' },
            'sms',
            { firstName: 'Alice', orderId: '12345' },
            defaultConfig,
        );

        expect(result.placeholderErrors).toEqual([]);
        expect(result.lengthWarnings).toEqual([]);
        expect(result.restrictedTermHits).toEqual([]);
        expect(result.policyScore).toBe(0);
        expect(result.decision).toBe('pass');
    });

    // Req 11.2: unresolvable placeholders
    it('returns placeholderErrors for unresolvable placeholders', () => {
        const result = lint(
            { body: 'Hi {{firstName}}, your code is {{promoCode}}' },
            'sms',
            { firstName: 'Bob' },
            defaultConfig,
        );

        expect(result.placeholderErrors).toEqual(['promoCode']);
    });

    // Req 11.3: SMS body exceeds 160 chars
    it('returns lengthWarnings when SMS body exceeds 160 chars', () => {
        const longBody = 'A'.repeat(161);
        const result = lint(
            { body: longBody },
            'sms',
            {},
            defaultConfig,
        );

        expect(result.lengthWarnings).toEqual([
            { channel: 'sms', actual: 161, limit: 160 },
        ]);
    });

    // Req 11.4: email subject exceeds 200 chars
    it('returns lengthWarnings when email subject exceeds 200 chars', () => {
        const longSubject = 'S'.repeat(201);
        const result = lint(
            { body: 'Body text', subject: longSubject },
            'email',
            {},
            defaultConfig,
        );

        expect(result.lengthWarnings).toEqual([
            { channel: 'email_subject', actual: 201, limit: 200 },
        ]);
    });

    // Req 11.5: restricted term detection
    it('detects restricted terms in content', () => {
        const result = lint(
            { body: 'Get free money now! This is not spam.' },
            'sms',
            {},
            defaultConfig,
        );

        expect(result.restrictedTermHits).toContain('spam');
        expect(result.restrictedTermHits).toContain('free money');
        expect(result.restrictedTermHits).toHaveLength(2);
    });

    // Req 11.6: policy score computation (+1 per restricted term, +2 per compliance flag)
    it('computes correct policy score (+1 per restricted term, +2 per compliance flag)', () => {
        // 2 restricted terms (spam, free money) = 2 points
        // 1 compliance flag (guaranteed) = 2 points
        // Total = 4
        const result = lint(
            { body: 'Get free money now! This is spam. Results guaranteed!' },
            'sms',
            {},
            defaultConfig,
        );

        expect(result.restrictedTermHits).toHaveLength(2);
        expect(result.policyScore).toBe(4);
    });

    // Req 11.6: decision 'pass' when score < warnThreshold
    it("returns 'pass' when score < warnThreshold", () => {
        // 1 restricted term = score 1, warnThreshold = 3
        const result = lint(
            { body: 'This is spam content' },
            'sms',
            {},
            defaultConfig,
        );

        expect(result.policyScore).toBe(1);
        expect(result.decision).toBe('pass');
    });

    // Req 11.6: decision 'warn' when score >= warnThreshold and < blockThreshold
    it("returns 'warn' when score >= warnThreshold and < blockThreshold", () => {
        // 2 restricted terms (2) + 1 compliance flag (2) = 4
        // warnThreshold = 3, blockThreshold = 7 → 'warn'
        const result = lint(
            { body: 'Get free money! spam guaranteed offer' },
            'sms',
            {},
            defaultConfig,
        );

        expect(result.policyScore).toBeGreaterThanOrEqual(defaultConfig.warnThreshold);
        expect(result.policyScore).toBeLessThan(defaultConfig.blockThreshold);
        expect(result.decision).toBe('warn');
    });

    // Req 11.6: decision 'block' when score >= blockThreshold
    it("returns 'block' when score >= blockThreshold", () => {
        // Use a config with a low blockThreshold to trigger block
        const strictConfig: ContentLintConfig = {
            ...defaultConfig,
            blockThreshold: 3,
        };

        // 2 restricted terms (2) + 1 compliance flag (2) = 4 >= 3
        const result = lint(
            { body: 'Get free money! spam guaranteed offer' },
            'sms',
            {},
            strictConfig,
        );

        expect(result.policyScore).toBeGreaterThanOrEqual(strictConfig.blockThreshold);
        expect(result.decision).toBe('block');
    });
});
