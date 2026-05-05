import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import toast from 'react-hot-toast';
import { formatImportToast, showImportErrors } from '../QuestionBankManager';

// Mock toast
vi.mock('react-hot-toast', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Import Toast Formatting Properties', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // Feature: question-bank-exam-center-overhaul, Property 9: formatImportToast format bounds
    it('Property 9: formatImportToast correctly formats success and warning messages', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 10000 }), // successCount
                fc.integer({ min: 0, max: 10000 }), // failedCount
                fc.integer({ min: 0, max: 5000 }),  // hierarchyCreated
                (successCount, failedCount, hierarchyCreated) => {
                    vi.clearAllMocks();
                    const totalCount = successCount + failedCount;

                    formatImportToast(successCount, failedCount, totalCount, hierarchyCreated);

                    if (totalCount === 0) {
                        expect(toast.error).toHaveBeenCalledWith(
                            'No rows found. Download the template to see the expected format.',
                            { duration: 8000 }
                        );
                    } else if (failedCount === 0) {
                        expect(toast.success).toHaveBeenCalled();
                        const callArg = vi.mocked(toast.success).mock.calls[0][0] as string;
                        expect(callArg).toContain(`${successCount} questions imported`);
                        if (hierarchyCreated > 0) {
                            expect(callArg).toContain(`${hierarchyCreated} hierarchy nodes created`);
                        }
                    } else {
                        expect(toast.error).toHaveBeenCalled();
                        const callArg = vi.mocked(toast.error).mock.calls[0][0] as string;
                        expect(callArg).toContain(`${successCount} succeeded`);
                        expect(callArg).toContain(`${failedCount} failed`);
                        if (hierarchyCreated > 0) {
                            expect(callArg).toContain(`${hierarchyCreated} hierarchy nodes created`);
                        }
                    }
                }
            ),
            { numRuns: 1000 }
        );
    });

    // Feature: question-bank-exam-center-overhaul, Property 10: Error toast count bound
    it('Property 10: showImportErrors bounds error toasts to a maximum of 3', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        row: fc.integer({ min: 1 }),
                        error: fc.string({ minLength: 1 }),
                    }),
                    { minLength: 0, maxLength: 50 }
                ),
                (errors) => {
                    vi.clearAllMocks();
                    
                    showImportErrors(errors);

                    const expectedCalls = Math.min(errors.length, 3);
                    expect(toast.error).toHaveBeenCalledTimes(expectedCalls);
                    
                    // Verify the content of the calls
                    for (let i = 0; i < expectedCalls; i++) {
                        const callArg = vi.mocked(toast.error).mock.calls[i][0] as string;
                        expect(callArg).toContain(`Row ${errors[i].row}`);
                        expect(callArg).toContain(errors[i].error);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
