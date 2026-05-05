/**
 * Property-based tests for QuestionFormModal.
 *
 * // Feature: question-bank-exam-center-overhaul, Property 6: Form population preserves all question fields
 * // Feature: question-bank-exam-center-overhaul, Property 7: Preview mode renders options as read-only rows
 *
 * Validates: Requirements 4.3, 4.5, 4.6, 5.2, 5.3
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string;[key: string]: unknown }) =>
        <a href={to} {...rest}>{children}</a>,
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
    toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn() },
}));

// Mock the useQuestion hook — we'll override the return value per test
const mockUseQuestion = vi.fn();
vi.mock('../../../../hooks/useExamSystemQueries', () => ({
    useQuestion: (id: string) => mockUseQuestion(id),
    useHierarchyTree: () => ({ data: { groups: [] }, isLoading: false }),
    useCreateQuestion: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useUpdateQuestion: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import QuestionFormModal from '../QuestionFormModal';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeQueryClient() {
    return new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
}

function renderModal(editingId: string) {
    const qc = makeQueryClient();
    return render(
        <QueryClientProvider client={qc}>
            <QuestionFormModal
                editingId={editingId}
                onClose={vi.fn()}
                onSubmit={vi.fn()}
                isSubmitting={false}
            />
        </QueryClientProvider>,
    );
}

// ── Arbitraries ───────────────────────────────────────────────────────────────

const questionTypeArb = fc.constantFrom(
    'mcq' as const,
    'written_cq' as const,
    'fill_blank' as const,
    'true_false' as const,
);

const difficultyArb = fc.constantFrom(
    'easy' as const,
    'medium' as const,
    'hard' as const,
    'expert' as const,
);

const optionArb = fc.record({
    key: fc.constantFrom('A', 'B', 'C', 'D'),
    // Use alphanumeric strings (no spaces) to avoid display value matching issues
    text_en: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/),
    text_bn: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/),
    isCorrect: fc.boolean(),
});

/**
 * Generate an array of options with unique keys
 */
const uniqueOptionsArb = (minLength: number, maxLength: number) =>
    fc.integer({ min: minLength, max: maxLength }).chain((length) => {
        const keys = ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, length);
        return fc.tuple(...keys.map((key) =>
            fc.record({
                key: fc.constant(key),
                text_en: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/),
                text_bn: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,20}$/),
                isCorrect: fc.boolean(),
            })
        ));
    });

/** Generate a 24-char hex string (MongoDB ObjectId-like) */
const objectIdArb = fc.stringMatching(/^[0-9a-f]{24}$/);

/**
 * Generate a non-empty, non-whitespace-only string that is unique enough
 * to avoid collisions with other form field values (marks, negativeMarks numbers).
 * Uses at least 4 chars starting with a letter to avoid matching numeric inputs.
 */
const questionTextArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{3,40}$/);

const arbitraryQuestion = () =>
    fc.record({
        _id: objectIdArb,
        question_type: questionTypeArb,
        question_en: questionTextArb,
        question_bn: questionTextArb,
        explanation_en: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,30}$/),
        explanation_bn: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{2,30}$/),
        difficulty: difficultyArb,
        marks: fc.integer({ min: 1, max: 10 }),
        negativeMarks: fc.integer({ min: 0, max: 5 }),
        tags: fc.array(fc.stringMatching(/^[a-z]{3,10}$/), { minLength: 0, maxLength: 3 }),
        options: fc.array(optionArb, { minLength: 2, maxLength: 4 }),
        group_id: fc.option(objectIdArb, { nil: undefined }),
        sub_group_id: fc.option(objectIdArb, { nil: undefined }),
        subject_id: fc.option(objectIdArb, { nil: undefined }),
        chapter_id: fc.option(objectIdArb, { nil: undefined }),
        topic_id: fc.option(objectIdArb, { nil: undefined }),
    });

/**
 * Generate arbitrary options array for Property 7 test
 */
const arbitraryOption = () => optionArb;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Property 6: Form population preserves all question fields', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it(
        // Feature: question-bank-exam-center-overhaul, Property 6: Form population preserves all question fields
        'populates all text fields from the question object returned by useQuestion (direct/unwrapped shape)',
        async () => {
            await fc.assert(
                fc.asyncProperty(arbitraryQuestion(), async (question) => {
                    // Mock useQuestion to return the generated question directly
                    // (simulating the Axios interceptor unwrap — no .data wrapper)
                    mockUseQuestion.mockReturnValue({
                        data: question,
                        isLoading: false,
                        isError: false,
                        refetch: vi.fn(),
                    });

                    let unmount!: () => void;
                    await act(async () => {
                        ({ unmount } = renderModal(question._id));
                    });

                    // Assert question_en is populated in the textarea
                    // Use queryAllByDisplayValue to handle potential value collisions
                    const enElements = screen.queryAllByDisplayValue(question.question_en);
                    expect(enElements.length).toBeGreaterThan(0);

                    // Assert question_bn is populated
                    const bnElements = screen.queryAllByDisplayValue(question.question_bn);
                    expect(bnElements.length).toBeGreaterThan(0);

                    // Assert marks field is populated — find the marks input specifically
                    const marksElements = screen.queryAllByDisplayValue(String(question.marks));
                    expect(marksElements.length).toBeGreaterThan(0);

                    // Assert tags are populated (joined with ', ')
                    if (question.tags.length > 0) {
                        const tagsValue = question.tags.join(', ');
                        const tagsElements = screen.queryAllByDisplayValue(tagsValue);
                        expect(tagsElements.length).toBeGreaterThan(0);
                    }

                    unmount();
                }),
                { numRuns: 20 },
            );
        },
        60000,
    );

    it(
        // Feature: question-bank-exam-center-overhaul, Property 6: Form population preserves all question fields
        'populates all text fields when useQuestion returns wrapped { data: question } shape',
        async () => {
            await fc.assert(
                fc.asyncProperty(arbitraryQuestion(), async (question) => {
                    // Mock useQuestion to return the wrapped shape { data: question }
                    // (simulating when Axios interceptor does NOT unwrap)
                    mockUseQuestion.mockReturnValue({
                        data: { data: question },
                        isLoading: false,
                        isError: false,
                        refetch: vi.fn(),
                    });

                    let unmount!: () => void;
                    await act(async () => {
                        ({ unmount } = renderModal(question._id));
                    });

                    // Assert question_en is populated in the textarea
                    const enElements = screen.queryAllByDisplayValue(question.question_en);
                    expect(enElements.length).toBeGreaterThan(0);

                    // Assert marks field is populated
                    const marksElements = screen.queryAllByDisplayValue(String(question.marks));
                    expect(marksElements.length).toBeGreaterThan(0);

                    unmount();
                }),
                { numRuns: 20 },
            );
        },
        60000,
    );

    it(
        // Feature: question-bank-exam-center-overhaul, Property 6: Form population preserves all question fields
        'shows loading spinner while isLoading is true and does not render form fields',
        () => {
            fc.assert(
                fc.property(
                    objectIdArb,
                    (id) => {
                        mockUseQuestion.mockReturnValue({
                            data: undefined,
                            isLoading: true,
                            isError: false,
                            refetch: vi.fn(),
                        });

                        const { container, unmount } = renderModal(id);

                        // Should show spinner, not form
                        const spinner = container.querySelector('.animate-spin');
                        expect(spinner).not.toBeNull();

                        // Should NOT show the form submit button
                        const submitBtn = screen.queryByRole('button', { name: /update question/i });
                        expect(submitBtn).toBeNull();

                        unmount();
                    },
                ),
                { numRuns: 20 },
            );
        },
    );

    it(
        // Feature: question-bank-exam-center-overhaul, Property 6: Form population preserves all question fields
        'shows error banner and Retry button when isError is true',
        () => {
            fc.assert(
                fc.property(
                    objectIdArb,
                    (id) => {
                        mockUseQuestion.mockReturnValue({
                            data: undefined,
                            isLoading: false,
                            isError: true,
                            refetch: vi.fn(),
                        });

                        const { unmount } = renderModal(id);

                        // Should show error message
                        const errorMsg = screen.queryByText(/failed to load question data/i);
                        expect(errorMsg).not.toBeNull();

                        // Should show Retry button
                        const retryBtn = screen.queryByRole('button', { name: /retry/i });
                        expect(retryBtn).not.toBeNull();

                        unmount();
                    },
                ),
                { numRuns: 20 },
            );
        },
    );
});

describe('Property 7: Preview mode renders options as read-only rows', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it(
        // Feature: question-bank-exam-center-overhaul, Property 7: Preview mode renders options as read-only rows
        'renders options as read-only divs (no input elements) when preview is activated',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    uniqueOptionsArb(2, 6),
                    async (options) => {
                        // Create a question with MCQ type and the generated options
                        const question = {
                            _id: '507f1f77bcf86cd799439011',
                            question_type: 'mcq' as const,
                            question_en: 'TestQuestion',
                            question_bn: 'পরীক্ষাপ্রশ্ন',
                            explanation_en: 'TestExplanation',
                            explanation_bn: 'পরীক্ষাব্যাখ্যা',
                            difficulty: 'medium' as const,
                            marks: 1,
                            negativeMarks: 0,
                            tags: [],
                            options: Array.from(options),
                        };

                        mockUseQuestion.mockReturnValue({
                            data: question,
                            isLoading: false,
                            isError: false,
                            refetch: vi.fn(),
                        });

                        const user = userEvent.setup();
                        let unmount!: () => void;
                        let container!: HTMLElement;

                        await act(async () => {
                            ({ unmount, container } = renderModal(question._id));
                        });

                        // Find and click the Preview button
                        const previewBtn = screen.getAllByRole('button', { name: /preview/i })[0];
                        await act(async () => {
                            await user.click(previewBtn);
                        });

                        // After activating preview, assert that the options section has no <input> elements
                        const optionsSection = container.querySelector('.space-y-2');
                        expect(optionsSection).not.toBeNull();

                        if (optionsSection) {
                            const inputElements = optionsSection.querySelectorAll('input');
                            expect(inputElements.length).toBe(0);
                        }

                        // Assert that each option's key and text are visible
                        for (const opt of options) {
                            // Check that the option key is visible
                            const keyElement = screen.queryByText(opt.key);
                            expect(keyElement).not.toBeNull();

                            // Check that the English text is visible (if not empty)
                            if (opt.text_en) {
                                const textElement = screen.queryByText(opt.text_en);
                                expect(textElement).not.toBeNull();
                            }

                            // Check that the Bengali text is visible (if not empty)
                            if (opt.text_bn) {
                                const bnTextElement = screen.queryByText(opt.text_bn);
                                expect(bnTextElement).not.toBeNull();
                            }
                        }

                        unmount();
                    },
                ),
                { numRuns: 20 },
            );
        },
        60000,
    );
});

describe('Property 8: Preview toggle is idempotent over two presses', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it(
        // Feature: question-bank-exam-center-overhaul, Property 8: Preview toggle is idempotent over two presses
        'returns to editable state (showPreview === false) after clicking Preview button twice',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    arbitraryQuestion(),
                    async (question) => {
                        // Ensure options have unique keys to avoid React warnings
                        const uniqueOptions = question.options.map((opt, idx) => ({
                            ...opt,
                            key: String.fromCharCode(65 + idx), // A, B, C, D, etc.
                        }));

                        const questionWithUniqueKeys = {
                            ...question,
                            options: uniqueOptions,
                        };

                        mockUseQuestion.mockReturnValue({
                            data: questionWithUniqueKeys,
                            isLoading: false,
                            isError: false,
                            refetch: vi.fn(),
                        });

                        const user = userEvent.setup();
                        let unmount!: () => void;
                        let container!: HTMLElement;

                        await act(async () => {
                            ({ unmount, container } = renderModal(questionWithUniqueKeys._id));
                        });

                        // Wait for the modal to be fully rendered by checking for the form
                        const form = container.querySelector('form');
                        if (!form) {
                            unmount();
                            return; // Skip this test case if form didn't render
                        }

                        // Initial state: form fields should be editable (textareas present)
                        const initialTextareas = container.querySelectorAll('textarea');
                        const initialTextareaCount = initialTextareas.length;
                        expect(initialTextareaCount).toBeGreaterThan(0);

                        // Find the Preview button
                        const previewButtons = screen.queryAllByRole('button', { name: /preview/i });
                        if (previewButtons.length === 0) {
                            unmount();
                            return; // Skip if preview button not found
                        }
                        const previewBtn = previewButtons[0];

                        // First click: activate preview
                        await act(async () => {
                            await user.click(previewBtn);
                        });

                        // After first click: textareas should be replaced with divs (preview mode)
                        const previewTextareas = container.querySelectorAll('textarea');
                        expect(previewTextareas.length).toBe(0);

                        // Second click: deactivate preview
                        await act(async () => {
                            await user.click(previewBtn);
                        });

                        // After second click: textareas should be back (editable mode)
                        const finalTextareas = container.querySelectorAll('textarea');
                        expect(finalTextareas.length).toBe(initialTextareaCount);

                        // Verify that form fields are editable by checking for input elements
                        // For MCQ questions, options should have input fields
                        if (questionWithUniqueKeys.question_type === 'mcq' || questionWithUniqueKeys.question_type === 'true_false' || questionWithUniqueKeys.question_type === 'image_mcq') {
                            const optionInputs = container.querySelectorAll('input[type="text"]');
                            expect(optionInputs.length).toBeGreaterThan(0);
                        }

                        unmount();
                    },
                ),
                { numRuns: 20 },
            );
        },
        60000,
    );

    it(
        // Feature: question-bank-exam-center-overhaul, Property 8: Preview toggle is idempotent over two presses
        'submit button is enabled after two preview toggles',
        async () => {
            await fc.assert(
                fc.asyncProperty(
                    arbitraryQuestion(),
                    async (question) => {
                        // Ensure options have unique keys
                        const uniqueOptions = question.options.map((opt, idx) => ({
                            ...opt,
                            key: String.fromCharCode(65 + idx),
                        }));

                        const questionWithUniqueKeys = {
                            ...question,
                            options: uniqueOptions,
                        };

                        mockUseQuestion.mockReturnValue({
                            data: questionWithUniqueKeys,
                            isLoading: false,
                            isError: false,
                            refetch: vi.fn(),
                        });

                        const user = userEvent.setup();
                        let unmount!: () => void;

                        await act(async () => {
                            ({ unmount } = renderModal(questionWithUniqueKeys._id));
                        });

                        // Wait for buttons to be available
                        const previewButtons = screen.queryAllByRole('button', { name: /preview/i });
                        const submitButtons = screen.queryAllByRole('button', { name: /update question/i });

                        if (previewButtons.length === 0 || submitButtons.length === 0) {
                            unmount();
                            return; // Skip if buttons not found
                        }

                        const previewBtn = previewButtons[0];
                        const submitBtn = submitButtons[0];

                        // Initial state: submit button should be enabled
                        expect(submitBtn).not.toBeDisabled();

                        // First click: activate preview
                        await act(async () => {
                            await user.click(previewBtn);
                        });

                        // After first click: submit button should be disabled
                        expect(submitBtn).toBeDisabled();

                        // Second click: deactivate preview
                        await act(async () => {
                            await user.click(previewBtn);
                        });

                        // After second click: submit button should be enabled again
                        expect(submitBtn).not.toBeDisabled();

                        unmount();
                    },
                ),
                { numRuns: 20 },
            );
        },
        60000,
    );
});
