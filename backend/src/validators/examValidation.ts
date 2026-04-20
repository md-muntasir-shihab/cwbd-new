/**
 * Exam payload validation utility.
 *
 * Validates exam creation/update payloads:
 * - Non-empty title
 * - At least 1 question
 * - Duration > 0
 * - Total marks > 0
 * - Sum of question marks equals totalMarks
 *
 * Requirements: 8.7, 8.8, 8.9, 8.10, 13.5, 13.6, 13.7, 13.8, 13.9
 */

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateExamPayload(payload: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // 1. Title validation (Requirements 8.7, 13.5)
    if (!(payload.title as string)?.trim()) {
        errors.push('Exam title is required');
    }

    // 2. Questions validation (Requirements 8.8, 13.6)
    if (!payload.questions || (payload.questions as unknown[]).length === 0) {
        errors.push('At least 1 question is required');
    }

    // 3. Duration validation (Requirements 8.9, 13.7)
    if ((payload.duration as number) <= 0) {
        errors.push('Duration must be greater than 0');
    }

    // 4. Total marks validation (Requirements 8.10, 13.8)
    if ((payload.totalMarks as number) <= 0) {
        errors.push('Total marks must be greater than 0');
    }

    // 5. Sum of question marks must equal totalMarks (Requirement 13.9)
    const questions = payload.questions as Array<{ marks: number }>;
    if (questions) {
        const sum = questions.reduce((acc, q) => acc + (q.marks || 0), 0);
        if (sum !== (payload.totalMarks as number)) {
            errors.push(`Sum of question marks (${sum}) does not equal total marks (${payload.totalMarks})`);
        }
    }

    return { valid: errors.length === 0, errors };
}
