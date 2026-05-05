import { useState, useEffect, useCallback } from 'react';
import {
    X,
    Plus,
    Trash2,
    Loader2,
    ImagePlus,
    Eye,
    AlertCircle,
    CheckCircle2,
} from 'lucide-react';
import { useQuestion } from '../../../hooks/useExamSystemQueries';
import CascadingDropdowns from '../../../components/admin/question-bank/CascadingDropdowns';
import type { CascadingDropdownsValue } from '../../../components/admin/question-bank/CascadingDropdowns';
import type {
    CreateQuestionDto,
    QuestionOptionDto,
    QuestionType,
    DifficultyLevel,
} from '../../../types/exam-system';

// ─── Constants ───────────────────────────────────────────────────────────

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
    { value: 'mcq', label: 'MCQ' },
    { value: 'written_cq', label: 'Written / CQ' },
    { value: 'fill_blank', label: 'Fill in the Blank' },
    { value: 'true_false', label: 'True / False' },
    { value: 'image_mcq', label: 'Image MCQ' },
];

const DIFFICULTY_LEVELS: { value: DifficultyLevel; label: string }[] = [
    { value: 'easy', label: 'Easy' },
    { value: 'medium', label: 'Medium' },
    { value: 'hard', label: 'Hard' },
    { value: 'expert', label: 'Expert' },
];

const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 ' +
    'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
    'dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';

const selectCls =
    'w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
    'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
    'dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';

const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1';

function emptyOption(key: string): QuestionOptionDto {
    return { key, text_en: '', text_bn: '', isCorrect: false };
}

// ─── Props ───────────────────────────────────────────────────────────────

interface QuestionFormModalProps {
    editingId: string | null;
    onClose: () => void;
    onSubmit: (data: CreateQuestionDto) => Promise<void>;
    isSubmitting: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────

/**
 * Create/Edit question modal with bilingual text fields, question type selector,
 * options editor, difficulty, marks, hierarchy selection, tags, and image upload placeholder.
 *
 * Supports LaTeX preview via a simple toggle that renders raw LaTeX delimiters.
 */
export default function QuestionFormModal({
    editingId,
    onClose,
    onSubmit,
    isSubmitting,
}: QuestionFormModalProps) {
    // ── Fetch existing question for edit mode ────────────────────────────
    const { data: existingResponse, isLoading: isLoadingExisting, isError: isErrorExisting, refetch: refetchExisting } = useQuestion(editingId ?? '');

    // ── Form state ───────────────────────────────────────────────────────
    const [questionType, setQuestionType] = useState<QuestionType>('mcq');
    const [questionEn, setQuestionEn] = useState('');
    const [questionBn, setQuestionBn] = useState('');
    const [explanationEn, setExplanationEn] = useState('');
    const [explanationBn, setExplanationBn] = useState('');
    const [options, setOptions] = useState<QuestionOptionDto[]>([
        emptyOption('A'),
        emptyOption('B'),
        emptyOption('C'),
        emptyOption('D'),
    ]);
    const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
    const [marks, setMarks] = useState(1);
    const [negativeMarks, setNegativeMarks] = useState(0);
    const [tags, setTags] = useState('');
    const [hierarchy, setHierarchy] = useState<CascadingDropdownsValue>({});
    const [showPreview, setShowPreview] = useState(false);

    // ── Populate form when editing ───────────────────────────────────────
    useEffect(() => {
        if (!editingId || !existingResponse) return;
        // Support both { data: question } (wrapped) and question directly (unwrapped by Axios interceptor)
                const q = (existingResponse as unknown as Record<string, unknown>).data
                    ? (existingResponse as unknown as Record<string, unknown>).data as Record<string, unknown>
                    : existingResponse as unknown as Record<string, unknown>;
        setQuestionType((q.question_type as QuestionType) || 'mcq');
        setQuestionEn((q.question_en as string) || '');
        setQuestionBn((q.question_bn as string) || '');
        setExplanationEn((q.explanation_en as string) || '');
        setExplanationBn((q.explanation_bn as string) || '');
        setDifficulty((q.difficulty as DifficultyLevel) || 'medium');
        setMarks((q.marks as number) ?? 1);
        setNegativeMarks((q.negativeMarks as number) ?? 0);
        setTags(Array.isArray(q.tags) ? (q.tags as string[]).join(', ') : '');
        setHierarchy({
            group_id: (q.group_id as string) || undefined,
            sub_group_id: (q.sub_group_id as string) || undefined,
            subject_id: (q.subject_id as string) || undefined,
            chapter_id: (q.chapter_id as string) || undefined,
            topic_id: (q.topic_id as string) || undefined,
        });
        if (Array.isArray(q.options)) {
            setOptions(
                (q.options as Array<Record<string, unknown>>).map((opt, i) => ({
                    key: (opt.key as string) || String.fromCharCode(65 + i),
                    text_en: (opt.text_en as string) || '',
                    text_bn: (opt.text_bn as string) || '',
                    isCorrect: (opt.isCorrect as boolean) || false,
                })),
            );
        }
    }, [editingId, existingResponse]);

    // ── Option handlers ──────────────────────────────────────────────────

    const handleOptionChange = useCallback(
        (index: number, field: keyof QuestionOptionDto, value: string | boolean) => {
            setOptions((prev) =>
                prev.map((opt, i) => (i === index ? { ...opt, [field]: value } : opt)),
            );
        },
        [],
    );

    const handleAddOption = useCallback(() => {
        if (options.length >= 6) return;
        const nextKey = String.fromCharCode(65 + options.length);
        setOptions((prev) => [...prev, emptyOption(nextKey)]);
    }, [options.length]);

    const handleRemoveOption = useCallback(
        (index: number) => {
            if (options.length <= 2) return;
            setOptions((prev) => prev.filter((_, i) => i !== index));
        },
        [options.length],
    );

    const handleToggleCorrect = useCallback((index: number) => {
        setOptions((prev) =>
            prev.map((opt, i) => (i === index ? { ...opt, isCorrect: !opt.isCorrect } : opt)),
        );
    }, []);

    // ── Submit ───────────────────────────────────────────────────────────

    const handleSubmit = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            const parsedTags = tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean);

            const dto: CreateQuestionDto = {
                question_type: questionType,
                question_en: questionEn || undefined,
                question_bn: questionBn || undefined,
                options,
                difficulty,
                marks,
                negativeMarks: negativeMarks || undefined,
                group_id: hierarchy.group_id || undefined,
                sub_group_id: hierarchy.sub_group_id || undefined,
                subject_id: hierarchy.subject_id || undefined,
                chapter_id: hierarchy.chapter_id || undefined,
                topic_id: hierarchy.topic_id || undefined,
                tags: parsedTags.length > 0 ? parsedTags : undefined,
                explanation_en: explanationEn || undefined,
                explanation_bn: explanationBn || undefined,
            };
            onSubmit(dto);
        },
        [
            questionType, questionEn, questionBn, options, difficulty, marks,
            negativeMarks, hierarchy, tags, explanationEn, explanationBn, onSubmit,
        ],
    );

    // ── Determine if options section should show ─────────────────────────
    const showOptionsSection = questionType === 'mcq' || questionType === 'true_false' || questionType === 'image_mcq';

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12">
            <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        {editingId ? 'Edit Question' : 'Create Question'}
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowPreview((p) => !p)}
                            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${showPreview
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                                }`}
                        >
                            <Eye size={14} />
                            Preview
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                            aria-label="Close modal"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Loading state for edit */}
                {editingId && isLoadingExisting ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 size={24} className="animate-spin text-indigo-500" />
                    </div>
                ) : editingId && isErrorExisting ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-20">
                        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>Failed to load question data. Please try again.</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => refetchExisting()}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                            Retry
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-6 py-5">
                        <div className="space-y-5">
                            {/* ── Question Type ───────────────────────── */}
                            <div>
                                <label className={labelCls}>Question Type</label>
                                <select
                                    value={questionType}
                                    onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                                    className={selectCls}
                                >
                                    {QUESTION_TYPES.map((t) => (
                                        <option key={t.value} value={t.value}>
                                            {t.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* ── Bilingual Question Text ─────────────── */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={labelCls}>Question (English)</label>
                                    {showPreview ? (
                                        <div className="min-h-[5rem] rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                                            {questionEn || <span className="text-slate-400">No content</span>}
                                        </div>
                                    ) : (
                                        <textarea
                                            value={questionEn}
                                            onChange={(e) => setQuestionEn(e.target.value)}
                                            rows={3}
                                            placeholder="Enter question text (supports $LaTeX$)…"
                                            className={inputCls}
                                        />
                                    )}
                                </div>
                                <div>
                                    <label className={labelCls}>Question (বাংলা)</label>
                                    {showPreview ? (
                                        <div className="min-h-[5rem] rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800">
                                            {questionBn || <span className="text-slate-400">No content</span>}
                                        </div>
                                    ) : (
                                        <textarea
                                            value={questionBn}
                                            onChange={(e) => setQuestionBn(e.target.value)}
                                            rows={3}
                                            placeholder="প্রশ্নের টেক্সট লিখুন ($LaTeX$ সাপোর্ট)…"
                                            className={inputCls}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* ── Options Editor (MCQ / True-False / Image MCQ) ── */}
                            {showOptionsSection && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <label className={labelCls}>Options</label>
                                        {!showPreview && options.length < 6 && (
                                            <button
                                                type="button"
                                                onClick={handleAddOption}
                                                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                                            >
                                                <Plus size={14} />
                                                Add Option
                                            </button>
                                        )}
                                    </div>
                                    {showPreview ? (
                                        <div className="space-y-2">
                                            {options.map((opt) => (
                                                <div
                                                    key={opt.key}
                                                    className={`flex items-center gap-3 rounded-lg border p-3 ${opt.isCorrect
                                                        ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-900/10'
                                                        : 'border-slate-200 dark:border-slate-700'
                                                        }`}
                                                >
                                                    <span className="w-6 text-sm font-bold text-slate-700 dark:text-slate-300">
                                                        {opt.key}
                                                    </span>
                                                    <span className="flex-1 text-sm text-slate-900 dark:text-white">
                                                        {opt.text_en || <span className="text-slate-400">No text</span>}
                                                    </span>
                                                    {opt.text_bn && (
                                                        <span className="flex-1 text-sm text-slate-600 dark:text-slate-400">
                                                            {opt.text_bn}
                                                        </span>
                                                    )}
                                                    {opt.isCorrect && (
                                                        <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                {options.map((opt, idx) => (
                                    <div
                                        key={idx}
                                        className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                                            opt.isCorrect
                                                ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-700 dark:bg-emerald-900/10'
                                                : 'border-slate-200 dark:border-slate-700'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => !showPreview && handleToggleCorrect(idx)}
                                            disabled={showPreview}
                                            className={`mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                                                opt.isCorrect
                                                    ? 'border-emerald-500 bg-emerald-500 text-white'
                                                    : 'border-slate-300 text-slate-400 hover:border-emerald-400 dark:border-slate-600'
                                            }`}
                                        >
                                            {opt.key}
                                        </button>
                                        <div className="flex-1 space-y-2">
                                            {showPreview ? (
                                                <div className="text-sm dark:text-white">{opt.text_en || <span className="text-slate-400">No English text</span>}</div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={opt.text_en}
                                                    onChange={(e) => handleOptionChange(idx, 'text_en', e.target.value)}
                                                    placeholder={`Option ${opt.key} (English)`}
                                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                                                />
                                            )}
                                            {showPreview ? (
                                                <div className="text-sm dark:text-white">{opt.text_bn || <span className="text-slate-400">No Bengali text</span>}</div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={opt.text_bn}
                                                    onChange={(e) => handleOptionChange(idx, 'text_bn', e.target.value)}
                                                    placeholder={`Option ${opt.key} (Bengali)`}
                                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                                                />
                                            )}
                                        </div>
                                        {/* Remove Option Button */}
                                        {options.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => !showPreview && handleRemoveOption(idx)}
                                                disabled={showPreview}
                                                className="mt-1.5 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50 disabled:hover:bg-transparent dark:hover:bg-red-900/20"
                                                aria-label={`Remove option ${opt.key}`}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Difficulty, Marks, Negative Marks ────── */}
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className={labelCls}>Difficulty</label>
                                    <select
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                                        className={selectCls}
                                    >
                                        {DIFFICULTY_LEVELS.map((d) => (
                                            <option key={d.value} value={d.value}>
                                                {d.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Marks</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.25}
                                        value={marks}
                                        onChange={(e) => setMarks(Number(e.target.value))}
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Negative Marks</label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.25}
                                        value={negativeMarks}
                                        onChange={(e) => setNegativeMarks(Number(e.target.value))}
                                        className={inputCls}
                                    />
                                </div>
                            </div>

                            {/* ── Hierarchy Selection ─────────────────── */}
                            <div>
                                <label className={labelCls}>Classification</label>
                                <CascadingDropdowns value={hierarchy} onChange={setHierarchy} />
                            </div>

                            {/* ── Tags ────────────────────────────────── */}
                            <div>
                                <label className={labelCls}>Tags (comma-separated)</label>
                                <input
                                    type="text"
                                    value={tags}
                                    onChange={(e) => setTags(e.target.value)}
                                    placeholder="e.g. physics, mechanics, hsc-2024"
                                    className={inputCls}
                                />
                            </div>

                            {/* ── Bilingual Explanation ────────────────── */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={labelCls}>Explanation (English)</label>
                                    <textarea
                                        value={explanationEn}
                                        onChange={(e) => setExplanationEn(e.target.value)}
                                        rows={2}
                                        placeholder="Explanation (supports $LaTeX$)…"
                                        className={inputCls}
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Explanation (বাংলা)</label>
                                    <textarea
                                        value={explanationBn}
                                        onChange={(e) => setExplanationBn(e.target.value)}
                                        rows={2}
                                        placeholder="ব্যাখ্যা ($LaTeX$ সাপোর্ট)…"
                                        className={inputCls}
                                    />
                                </div>
                            </div>

                            {/* ── Image Upload Placeholder ────────────── */}
                            <div>
                                <label className={labelCls}>Images</label>
                                <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-6 dark:border-slate-700">
                                    <ImagePlus size={20} className="text-slate-400" />
                                    <span className="text-sm text-slate-500 dark:text-slate-400">
                                        Drag &amp; drop images here or click to upload (diagrams, graphs, charts)
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* ── Footer Actions ──────────────────────────── */}
                        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || showPreview}
                                title={showPreview ? "Exit preview to submit" : undefined}
                                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-slate-900"
                            >
                                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                                {editingId ? 'Update Question' : 'Create Question'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
