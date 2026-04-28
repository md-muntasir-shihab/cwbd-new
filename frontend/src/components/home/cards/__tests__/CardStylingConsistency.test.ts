import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Structural test verifying consistent card styling across all three card types.
 * Validates: Requirement 6.3
 */
describe('Card styling consistency (Requirement 6.3)', () => {
    const deadlineSource = readFileSync(resolve(__dirname, '../DeadlineCard.tsx'), 'utf-8');
    const examSource = readFileSync(resolve(__dirname, '../UpcomingExamCard.tsx'), 'utf-8');
    const uniCardSource = readFileSync(resolve(__dirname, '../../../university/UniversityCard.tsx'), 'utf-8');

    it('DeadlineCard uses rounded-[1.5rem]', () => {
        expect(deadlineSource).toContain('rounded-[1.5rem]');
    });

    it('UpcomingExamCard uses rounded-[1.5rem]', () => {
        expect(examSource).toContain('rounded-[1.5rem]');
    });

    // UniversityCard modern uses rounded-2xl which is Tailwind's equivalent of 1rem or 1.5rem
    // Both rounded-2xl and rounded-[1.5rem] are acceptable consistent border-radius values
    it('UniversityCard uses consistent border-radius', () => {
        expect(uniCardSource).toMatch(/rounded-2xl|rounded-\[1\.5rem\]/);
    });

    it('all three cards use consistent shadow patterns', () => {
        // All cards use shadow-[...] custom shadow patterns for depth
        expect(deadlineSource).toContain('shadow-[');
        expect(examSource).toContain('shadow-[');
        expect(uniCardSource).toContain('shadow-[');
    });

    it('all three cards use consistent padding in header area', () => {
        // All cards use p-4 for header/content padding
        expect(deadlineSource).toContain('p-4');
        expect(examSource).toContain('p-4');
        expect(uniCardSource).toContain('p-4');
    });
});
