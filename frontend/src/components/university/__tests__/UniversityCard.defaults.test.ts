/**
 * Task 10.1: Ensure details page is unaffected
 *
 * Verifies that DEFAULT_UNIVERSITY_CARD_CONFIG keeps all detail-oriented
 * sections visible by default. The detail page (and any consumer that does
 * NOT pass an explicit config override) will use these defaults, so all
 * sections — exam dates, application progress, exam centers preview —
 * remain rendered.
 *
 * **Validates: Requirements 2.4**
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_UNIVERSITY_CARD_CONFIG } from '../UniversityCard';

describe('DEFAULT_UNIVERSITY_CARD_CONFIG preserves detail page sections', () => {
    it('showExamDates defaults to true', () => {
        expect(DEFAULT_UNIVERSITY_CARD_CONFIG.showExamDates).toBe(true);
    });

    it('showApplicationProgress defaults to true', () => {
        expect(DEFAULT_UNIVERSITY_CARD_CONFIG.showApplicationProgress).toBe(true);
    });

    it('showExamCentersPreview defaults to true', () => {
        expect(DEFAULT_UNIVERSITY_CARD_CONFIG.showExamCentersPreview).toBe(true);
    });

    it('showProgressBar defaults to true', () => {
        expect(DEFAULT_UNIVERSITY_CARD_CONFIG.showProgressBar).toBe(true);
    });

    it('showCategoryBadge defaults to true', () => {
        expect(DEFAULT_UNIVERSITY_CARD_CONFIG.showCategoryBadge).toBe(true);
    });
});
