import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronLeft, Save } from 'lucide-react';
import {
    createAdminExam,
    getAdminExam,
    updateAdminExam,
    listAdminExamQuestions,
    bulkAttachQuestions,
} from '../../../api/adminExamApi';
import ModernToggle from '../../../components/ui/ModernToggle';
import QuestionSelector from '../../../components/admin/exams/QuestionSelector';
import {
    QuestionSelectorProvider,
    useQuestionSelector,
} from '../../../components/admin/exams/QuestionSelectorContext';

/* ── Default form state ── */
interface ExamFormData {
    title: string;
    subject: string;
    durationMinutes: number;
    totalMarks: number;
    negativeMarkingEnabled: boolean;
    negativeMarkValue: number;
    showAnswersAfterExam: boolean;
}

const DEFAULT_FORM: ExamFormData = {
    title: '',
    subject: '',
    durationMinutes: 60,
    totalMarks: 100,
    negativeMarkingEnabled: false,
    negativeMarkValue: 0.25,
    showAnswersAfterExam: false,
};

const DEFAULT_MARKS_PER_QUESTION = 1;

/**
 * Outer wrapper — provides the QuestionSelectorProvider so the inner form
 * component can read/write the selector state via useQuestionSelector().
 */
export default function ExamFormPage() {
    return (
        <QuestionSelectorProvider>
            <ExamFormInner />
        </QuestionSelectorProvider>
    );
}

/* ── Inner form component (has access to QuestionSelector context) ── */
function ExamFormInner() {
    const { examId } = useParams<{ examId?: string }>();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { state: selectorState, dispatch: selectorDispatch } = useQuestionSelector();

    const isEdit = Boolean(examId);
    const [form, setForm] = useState<ExamFormData>({ ...DEFAULT_FORM });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Partial<Record<keyof ExamFormData, string>>>({});

    /* ── Fetch existing exam + questions for edit mode ── */
    const fetchExam = useCallback(async (id: string) => {
        try {
            setLoading(true);
            const exam = await getAdminExam(id);
            setForm({
                title: exam.title ?? '',
                subject: exam.subject ?? '',
                durationMinutes: exam.durationMinutes ?? exam.duration ?? 60,
                totalMarks: exam.totalMarks ?? 100,
                negativeMarkingEnabled: exam.negativeMarkingEnabled ?? exam.negativeMarking ?? false,
                negativeMarkValue: exam.negativeMarkValue ?? exam.negativePerWrong ?? 0.25,
                showAnswersAfterExam: exam.showAnswersAfterExam ?? false,
            });

            // Populate the right panel with currently assigned questions
            try {
                const questions = await listAdminExamQuestions(id);
                if (Array.isArray(questions) && questions.length > 0) {
                    const bankQuestions = questions.map((q: Record<string, unknown>) => ({
                        _id: (q.fromBankQuestionId as string) || (q._id as string),
                        bankQuestionId: (q.fromBankQuestionId as string) || (q._id as string),
                        question_en: q.question_en as string ?? '',
                        question_bn: q.question_bn as string ?? '',
                        subject: q.subject as string ?? '',
                        moduleCategory: q.moduleCategory as string ?? '',
                        topic: q.topic as string ?? '',
                        subtopic: '',
                        difficulty: (q.difficulty as string ?? 'medium') as 'easy' | 'medium' | 'hard',
                        languageMode: 'both' as const,
                        questionImageUrl: q.questionImageUrl as string ?? '',
                        options: (q.options ?? []) as { key: 'A' | 'B' | 'C' | 'D'; text_en: string; text_bn: string }[],
                        correctKey: (q.correctKey as 'A' | 'B' | 'C' | 'D') ?? 'A',
                        explanation_en: q.explanation_en as string ?? '',
                        explanation_bn: q.explanation_bn as string ?? '',
                        explanationImageUrl: '',
                        marks: (q.marks as number) ?? DEFAULT_MARKS_PER_QUESTION,
                        negativeMarks: 0,
                        tags: [] as string[],
                        sourceLabel: '',
                        chapter: '',
                        boardOrPattern: '',
                        yearOrSession: '',
                        isActive: true,
                        isArchived: false,
                        contentHash: '',
                        versionNo: 1,
                        parentQuestionId: null,
                        createdByAdminId: '',
                        updatedByAdminId: '',
                        createdAt: '',
                        updatedAt: '',
                    }));
                    selectorDispatch({
                        type: 'BULK_ADD',
                        questions: bankQuestions,
                        defaultMarks: DEFAULT_MARKS_PER_QUESTION,
                    });
                    // Override marks from the actual exam question records
                    for (const q of questions) {
                        const bqId = (q.fromBankQuestionId as string) || (q._id as string);
                        const marks = q.marks as number;
                        if (typeof marks === 'number') {
                            selectorDispatch({ type: 'SET_MARKS', bankQuestionId: bqId, marks });
                        }
                    }
                }
            } catch {
                // Non-critical — selector will just be empty
            }
        } catch {
            toast.error('Failed to load exam data');
        } finally {
            setLoading(false);
        }
    }, [selectorDispatch]);

    useEffect(() => {
        if (examId) fetchExam(examId);
    }, [examId, fetchExam]);

    /* ── Field setter ── */
    const setField = <K extends keyof ExamFormData>(key: K, value: ExamFormData[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    /* ── Validation ── */
    const validate = (): boolean => {
        const errs: Partial<Record<keyof ExamFormData, string>> = {};
        if (!form.title.trim()) errs.title = 'Title is required';
        if (!form.subject.trim()) errs.subject = 'Subject is required';
        if (!form.durationMinutes || form.durationMinutes <= 0) errs.durationMinutes = 'Duration must be greater than 0';
        if (!form.totalMarks || form.totalMarks <= 0) errs.totalMarks = 'Total marks must be greater than 0';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    /* ── Mutations ── */
    const createMutation = useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            const result = await createAdminExam(data);
            const newExamId = result?.exam?._id ?? result?._id ?? result?.id;
            // Attach selected questions after creating the exam
            if (newExamId && selectorState.selectedQuestions.length > 0) {
                await bulkAttachQuestions(
                    newExamId,
                    selectorState.selectedQuestions.map((q) => ({
                        bankQuestionId: q.bankQuestionId,
                        marks: q.marks,
                        orderIndex: q.orderIndex,
                    })),
                );
            }
            return result;
        },
        onSuccess: () => {
            toast.success('Exam created');
            qc.invalidateQueries({ queryKey: ['admin-exams'] });
            navigate(-1);
        },
        onError: () => toast.error('Failed to create exam'),
    });

    const updateMutation = useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            const result = await updateAdminExam(examId!, data);
            // Re-attach selected questions on update
            if (selectorState.selectedQuestions.length > 0) {
                await bulkAttachQuestions(
                    examId!,
                    selectorState.selectedQuestions.map((q) => ({
                        bankQuestionId: q.bankQuestionId,
                        marks: q.marks,
                        orderIndex: q.orderIndex,
                    })),
                );
            }
            return result;
        },
        onSuccess: () => {
            toast.success('Exam updated');
            qc.invalidateQueries({ queryKey: ['admin-exams'] });
            navigate(-1);
        },
        onError: () => toast.error('Failed to update exam'),
    });

    const saving = createMutation.isPending || updateMutation.isPending;

    const handleSave = () => {
        if (!validate()) return;
        const payload: Record<string, unknown> = {
            title: form.title.trim(),
            subject: form.subject.trim(),
            durationMinutes: form.durationMinutes,
            totalMarks: form.totalMarks,
            negativeMarkingEnabled: form.negativeMarkingEnabled,
            negativePerWrong: form.negativeMarkingEnabled ? form.negativeMarkValue : 0,
            showAnswersAfterExam: form.showAnswersAfterExam,
        };
        if (isEdit) updateMutation.mutate(payload);
        else createMutation.mutate(payload);
    };

    /* ── Render helpers ── */
    const fieldError = (key: keyof ExamFormData) =>
        errors[key] ? <p className="text-xs text-red-500 mt-0.5">{errors[key]}</p> : null;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-3 md:space-y-4">
            {/* Back / Cancel */}
            <button type="button" onClick={() => navigate(-1)} className="btn-ghost flex items-center gap-1 text-sm">
                <ChevronLeft className="h-4 w-4" />
                {isEdit ? 'Back to List' : 'Cancel'}
            </button>

            <h2 className="text-lg md:text-xl font-bold text-text dark:text-dark-text">
                {isEdit ? 'Edit Exam' : 'Create Exam'}
            </h2>

            {/* ── Metadata Fields ── */}
            <div className="admin-panel-bg rounded-xl p-3 md:p-5 space-y-3 md:space-y-4">
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-text-muted">Exam Details</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    {/* Title */}
                    <label className="block">
                        <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">
                            Title <span className="text-red-500">*</span>
                        </span>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setField('title', e.target.value)}
                            placeholder="Enter exam title"
                            className="admin-input mt-1"
                        />
                        {fieldError('title')}
                    </label>

                    {/* Subject */}
                    <label className="block">
                        <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">
                            Subject <span className="text-red-500">*</span>
                        </span>
                        <input
                            type="text"
                            value={form.subject}
                            onChange={(e) => setField('subject', e.target.value)}
                            placeholder="e.g. Mathematics, Science"
                            className="admin-input mt-1"
                        />
                        {fieldError('subject')}
                    </label>

                    {/* Duration */}
                    <label className="block">
                        <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">
                            Duration (minutes) <span className="text-red-500">*</span>
                        </span>
                        <input
                            type="number"
                            min={1}
                            value={form.durationMinutes}
                            onChange={(e) => setField('durationMinutes', Number(e.target.value))}
                            className="admin-input mt-1"
                        />
                        {fieldError('durationMinutes')}
                    </label>

                    {/* Total Marks */}
                    <label className="block">
                        <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">
                            Total Marks <span className="text-red-500">*</span>
                        </span>
                        <input
                            type="number"
                            min={1}
                            value={form.totalMarks}
                            onChange={(e) => setField('totalMarks', Number(e.target.value))}
                            className="admin-input mt-1"
                        />
                        {fieldError('totalMarks')}
                    </label>
                </div>
            </div>

            {/* ── Options ── */}
            <div className="admin-panel-bg rounded-xl p-3 md:p-5 space-y-3 md:space-y-4">
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-text-muted">Options</h3>

                <div className="space-y-4">
                    {/* Negative Marking */}
                    <div className="flex items-center justify-between">
                        <ModernToggle
                            label="Negative Marking"
                            helper="Deduct marks for incorrect answers"
                            checked={form.negativeMarkingEnabled}
                            onChange={(v) => setField('negativeMarkingEnabled', v)}
                            size="sm"
                        />
                    </div>

                    {form.negativeMarkingEnabled && (
                        <label className="block max-w-xs">
                            <span className="text-xs font-semibold text-text-muted dark:text-dark-text/65 uppercase tracking-wider">
                                Marks deducted per wrong answer
                            </span>
                            <input
                                type="number"
                                min={0}
                                step={0.25}
                                value={form.negativeMarkValue}
                                onChange={(e) => setField('negativeMarkValue', Number(e.target.value))}
                                className="admin-input mt-1"
                            />
                        </label>
                    )}

                    {/* Show Answers After Exam */}
                    <div className="flex items-center justify-between">
                        <ModernToggle
                            label="Show Answers After Exam"
                            helper="Allow students to see correct answers after submission"
                            checked={form.showAnswersAfterExam}
                            onChange={(v) => setField('showAnswersAfterExam', v)}
                            size="sm"
                        />
                    </div>
                </div>
            </div>

            {/* ── Question Selector ── */}
            <div className="admin-panel-bg rounded-xl p-3 md:p-5 space-y-3 md:space-y-4">
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-text-muted">
                    Questions
                    {selectorState.totalQuestions > 0 && (
                        <span className="ml-2 text-indigo-600 dark:text-indigo-400 normal-case font-medium">
                            ({selectorState.totalQuestions} selected · {selectorState.totalMarks} marks)
                        </span>
                    )}
                </h3>
                <div className="h-[400px] md:h-[500px]">
                    <QuestionSelector skipProvider />
                </div>
            </div>

            {/* ── Action Buttons ── */}
            <div className="flex items-center gap-3 pt-2">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary flex items-center gap-2"
                >
                    <Save className="h-4 w-4" />
                    {saving ? 'Saving…' : isEdit ? 'Update Exam' : 'Create Exam'}
                </button>
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="btn-ghost"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
