import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateQuestionPayload } from '../utils/questionBank';

/**
 * Feature: exam-question-bank, Property 2: Question validation rejects invalid payloads
 *
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10, 13.1, 13.2, 13.3, 13.4
 *
 * For any question payload where at least one validation rule is violated,
 * validateQuestionPayload should return { valid: false } with non-empty errors.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_KEYS = ['A', 'B', 'C', 'D'] as const;
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

/** Generate a short string (0-9 chars) that fails the 10-char minimum */
const shortTextArb = fc.string({ minLength: 0, maxLength: 9 });

/** Generate a string with at least 10 chars */
const longTextArb = fc.string({ minLength: 10, maxLength: 60 }).filter((s) => s.trim().length >= 10);

/** Non-empty trimmed string for option text */
const nonEmptyTextArb = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** Build a valid option with a given key */
function makeOption(key: string, text_en: string, text_bn?: string) {
    return { key, text_en, text_bn: text_bn ?? '' };
}

/** Build a valid base payload (all rules satisfied) */
function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        question_en: 'This is a valid question text with enough characters',
        question_bn: '',
        options: [
            makeOption('A', 'Option A text'),
            makeOption('B', 'Option B text'),
            makeOption('C', 'Option C text'),
            makeOption('D', 'Option D text'),
        ],
        correctKey: 'A',
        difficulty: 'easy',
        subject: 'Mathematics',
        ...overrides,
    };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 2: Question validation rejects invalid payloads', () => {

    /**
     * Rule (a): Both question_en and question_bn are < 10 chars
     * Validates: Requirements 1.2, 1.9, 13.1
     */
    it('rejects when both question_en and question_bn are < 10 characters', () => {
        fc.assert(
            fc.property(shortTextArb, shortTextArb, (en, bn) => {
                const payload = validPayload({ question_en: en, question_bn: bn });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors.some((e) => e.toLowerCase().includes('10 characters'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (b): Options array has < 4 entries
     * Validates: Requirements 1.3, 13.2
     */
    it('rejects when options array has fewer than 4 entries', () => {
        const fewOptionsArb = fc.integer({ min: 0, max: 3 }).chain((count) => {
            const options = Array.from({ length: count }, (_, i) =>
                makeOption(VALID_KEYS[i] ?? 'A', `Option ${i + 1}`),
            );
            return fc.constant(options);
        });

        fc.assert(
            fc.property(fewOptionsArb, (options) => {
                const payload = validPayload({
                    options,
                    correctKey: options.length > 0 ? options[0].key : 'A',
                });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('4 options'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (c): An option has empty text in both languages
     * Validates: Requirements 1.3, 1.10
     */
    it('rejects when any option has empty text_en and text_bn', () => {
        // Pick a random index (0-3) to make empty
        const emptyIndexArb = fc.integer({ min: 0, max: 3 });

        fc.assert(
            fc.property(emptyIndexArb, (emptyIdx) => {
                const options = VALID_KEYS.map((key, i) => {
                    if (i === emptyIdx) {
                        return { key, text_en: '', text_bn: '' };
                    }
                    return makeOption(key, `Option ${key}`);
                });
                const payload = validPayload({ options, correctKey: 'A' });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('required'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (d): Two options share identical text in the same language (English)
     * Validates: Requirements 1.4, 13.3
     */
    it('rejects when two options have duplicate text_en', () => {
        fc.assert(
            fc.property(nonEmptyTextArb, (dupText) => {
                const options = [
                    makeOption('A', dupText),
                    makeOption('B', dupText), // duplicate
                    makeOption('C', 'Unique option C'),
                    makeOption('D', 'Unique option D'),
                ];
                const payload = validPayload({ options, correctKey: 'A' });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (d): Two options share identical text in the same language (Bengali)
     * Validates: Requirements 1.4, 13.3
     */
    it('rejects when two options have duplicate text_bn', () => {
        fc.assert(
            fc.property(nonEmptyTextArb, (dupText) => {
                const options = [
                    makeOption('A', 'Unique A', dupText),
                    makeOption('B', 'Unique B', dupText), // duplicate bn
                    makeOption('C', 'Unique C', 'Unique bn C'),
                    makeOption('D', 'Unique D', 'Unique bn D'),
                ];
                const payload = validPayload({ options, correctKey: 'A' });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('duplicate'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (e): correctKey is not in the options keys
     * Validates: Requirements 1.5, 13.4
     */
    it('rejects when correctKey is not present in options keys', () => {
        // Generate a key that is NOT in the options
        const invalidKeyArb = fc.string({ minLength: 1, maxLength: 5 }).filter(
            (k) => !VALID_KEYS.includes(k as any),
        );

        fc.assert(
            fc.property(invalidKeyArb, (badKey) => {
                const options = VALID_KEYS.map((key) => makeOption(key, `Option ${key}`));
                const payload = validPayload({ options, correctKey: badKey });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('correctkey'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (f): difficulty is not one of easy/medium/hard
     * Validates: Requirements 1.6
     */
    it('rejects when difficulty is not easy, medium, or hard', () => {
        const invalidDifficultyArb = fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((d) => !['easy', 'medium', 'hard'].includes(d));

        fc.assert(
            fc.property(invalidDifficultyArb, (badDifficulty) => {
                const payload = validPayload({ difficulty: badDifficulty });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('difficulty'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (g): subject is empty
     * Validates: Requirements 1.7
     */
    it('rejects when subject is empty or whitespace-only', () => {
        const emptySubjectArb = fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t  ');

        fc.assert(
            fc.property(emptySubjectArb, (emptySubject) => {
                const payload = validPayload({ subject: emptySubject });
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('subject'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Composite: a randomly chosen violation should always be rejected
     * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10, 13.1, 13.2, 13.3, 13.4
     */
    it('rejects any payload with at least one randomly chosen violation', () => {
        // Arbitrary that picks one of 7 violation strategies
        const violationArb = fc.integer({ min: 0, max: 6 }).chain((strategy) => {
            switch (strategy) {
                case 0:
                    // Both question texts too short
                    return fc.record({
                        question_en: shortTextArb,
                        question_bn: shortTextArb,
                    }).map((texts) => validPayload(texts));
                case 1:
                    // Too few options
                    return fc.integer({ min: 0, max: 3 }).map((count) => {
                        const opts = Array.from({ length: count }, (_, i) =>
                            makeOption(VALID_KEYS[i] ?? 'A', `Opt ${i}`),
                        );
                        return validPayload({
                            options: opts,
                            correctKey: count > 0 ? opts[0].key : 'A',
                        });
                    });
                case 2:
                    // An option with empty text
                    return fc.integer({ min: 0, max: 3 }).map((idx) => {
                        const opts = VALID_KEYS.map((k, i) =>
                            i === idx ? { key: k, text_en: '', text_bn: '' } : makeOption(k, `Opt ${k}`),
                        );
                        return validPayload({ options: opts });
                    });
                case 3:
                    // Duplicate English text
                    return nonEmptyTextArb.map((dup) => {
                        const opts = [
                            makeOption('A', dup),
                            makeOption('B', dup),
                            makeOption('C', 'Unique C'),
                            makeOption('D', 'Unique D'),
                        ];
                        return validPayload({ options: opts });
                    });
                case 4:
                    // Invalid correctKey
                    return fc.string({ minLength: 1, maxLength: 5 })
                        .filter((k) => !VALID_KEYS.includes(k as any))
                        .map((badKey) => validPayload({ correctKey: badKey }));
                case 5:
                    // Invalid difficulty
                    return fc.string({ minLength: 1, maxLength: 15 })
                        .filter((d) => !['easy', 'medium', 'hard'].includes(d))
                        .map((badDiff) => validPayload({ difficulty: badDiff }));
                case 6:
                default:
                    // Empty subject
                    return fc.constantFrom('', ' ', '\t').map((s) => validPayload({ subject: s }));
            }
        });

        fc.assert(
            fc.property(violationArb, (payload) => {
                const result = validateQuestionPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
            }),
            { numRuns: 20 },
        );
    });
});
