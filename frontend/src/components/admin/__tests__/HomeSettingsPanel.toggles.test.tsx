import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Structural tests for the four new toggle controls added to HomeSettingsPanel
 * as part of the home-card-cleanup-redesign spec.
 *
 * We verify the source contains the correct Toggle declarations with their
 * labels and corresponding draft state field bindings, rather than rendering
 * the full panel (which requires extensive API/auth mocking).
 *
 * Validates: Requirement 8.6
 */

const source = readFileSync(
    resolve(__dirname, '../HomeSettingsPanel.tsx'),
    'utf-8',
);

describe('HomeSettingsPanel — new toggle controls (Requirement 8.6)', () => {
    describe('toggle label rendering', () => {
        it('contains "Show Progress Bar" toggle with correct label', () => {
            expect(source).toContain('label="Show Progress Bar"');
        });

        it('contains "Show Category Badge" toggle with correct label', () => {
            expect(source).toContain('label="Show Category Badge"');
        });

        it('contains "Show Cluster Badge" toggle with correct label', () => {
            expect(source).toContain('label="Show Cluster Badge"');
        });

        it('contains "Show Exam Centers on Home Cards" toggle with correct label', () => {
            expect(source).toContain('label="Show Exam Centers on Home Cards"');
        });
    });

    describe('toggle state bindings (draft updates)', () => {
        it('"Show Progress Bar" reads from and writes to draft.universityCardConfig.showProgressBar', () => {
            expect(source).toContain('draft.universityCardConfig.showProgressBar');
            expect(source).toContain('showProgressBar: value');
        });

        it('"Show Category Badge" reads from and writes to draft.universityCardConfig.showCategoryBadge', () => {
            expect(source).toContain('draft.universityCardConfig.showCategoryBadge');
            expect(source).toContain('showCategoryBadge: value');
        });

        it('"Show Cluster Badge" reads from and writes to draft.universityCardConfig.showClusterBadge', () => {
            expect(source).toContain('draft.universityCardConfig.showClusterBadge');
            expect(source).toContain('showClusterBadge: value');
        });

        it('"Show Exam Centers on Home Cards" reads from and writes to draft.universityCardConfig.showExamCentersOnHomeCards', () => {
            expect(source).toContain('draft.universityCardConfig.showExamCentersOnHomeCards');
            expect(source).toContain('showExamCentersOnHomeCards: value');
        });
    });
});
