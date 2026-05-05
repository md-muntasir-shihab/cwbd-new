import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import ExamSelectorPanel from '../../../components/admin/exam-center/ExamSelectorPanel';
import {
    FileText,
    CheckCircle2,
    Save,
    Loader2,
    ChevronDown,
    ChevronUp,
    Image as ImageIcon,
    Sparkles,
    User,
    AlertCircle,
    ClipboardCheck,
    MessageSquare,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import type { WrittenGrade, ApiResponse } from '../../../types/exam-system';

// ─── Types ───────────────────────────────────────────────────────────────

/** Shape of a single answer within a result, as returned by the API. */
interface WrittenAnswer {
    question: string;
    questionType: 'mcq' | 'written';
    selectedAnswer: string;
    writtenAnswerUrl?: string;
    marks?: number;
    marksObtained?: number;
    topic?: string;
}

/** Shape of a pending evaluation result returned by the API. */
interface PendingResult {
    _id: string;
    student: { _id: string; full_name?: string; username?: string; email?: string };
    answers: WrittenAnswer[];
    writtenGrades: WrittenGrade[];
    totalMarks: number;
    obtainedMarks: number;
    status: 'submitted' | 'evaluated' | 'pending_evaluation';
    submittedAt: string;
}

/** Local grading state per question for a student result. */
interface GradeInput {
    marks: string;
    feedback: string;
    aiSuggestedMarks?: number;
    maxMarks: number;
    saved: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────

const BASE = '/v1/exams';

const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';

const btnPrimary =
    'flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors';

// ─── API helpers ─────────────────────────────────────────────────────────

async function fetchPendingResults(examId: string): Promise<PendingResult[]> {
    const res = await api.get<ApiResponse<PendingResult[]>>(
        `${BASE}/${examId}/results/pending-evaluation`,
    );
    return res.data.data ?? [];
}

async function submitGrade(
    resultId: string,
    questionId: string,
    marks: number,
    maxMarks: number,
    feedback: string,
): Promise<void> {
    await api.post<ApiResponse<unknown>>(
        `${BASE}/results/${resultId}/grade`,
        { questionId, marks, maxMarks, feedback },
    );
}

// ─── Progress Bar ────────────────────────────────────────────────────────

function ProgressBar({ graded, total }: { graded: number; total: number }) {
    const pct = total === 0 ? 0 : Math.round((graded / total) * 100);
    return (
        <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                    className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                {graded}/{total} graded ({pct}%)
            </span>
        </div>
    );
}

// ─── Student Card ────────────────────────────────────────────────────────

function StudentCard({
    result,
    gradeInputs,
    onGradeChange,
    onAcceptAI,
    onSave,
    saving,
}: {
    result: PendingResult;
    gradeInputs: Record<string, GradeInput>;
    onGradeChange: (questionId: string, field: 'marks' | 'feedback', value: string) => void;
    onAcceptAI: (questionId: string) => void;
    onSave: () => void;
    saving: boolean;
}) {
    const [expanded, setExpanded] = useState(true);

    const writtenAnswers = useMemo(
        () => result.answers.filter((a) => a.questionType === 'written'),
        [result.answers],
    );

    const studentName =
        result.student.full_name || result.student.username || result.student.email || 'Unknown Student';

    const allSaved = Object.values(gradeInputs).every((g) => g.saved);

    return (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
            {/* Header */}
            <button
                type="button"
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                onClick={() => setExpanded((p) => !p)}
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
                        <User className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {studentName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Submitted {new Date(result.submittedAt).toLocaleString()} &middot;{' '}
                            {writtenAnswers.length} written question
                            {writtenAnswers.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {allSaved && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> Graded
                        </span>
                    )}
                    {expanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                </div>
            </button>

            {/* Body */}
            {expanded && (
                <div className="border-t border-slate-200 px-5 pb-5 dark:border-slate-700">
                    {writtenAnswers.map((answer, idx) => {
                        const qId = answer.question;
                        const grade = gradeInputs[qId];
                        if (!grade) return null;

                        return (
                            <div
                                key={qId}
                                className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50"
                            >
                                {/* Question header */}
                                <div className="mb-3 flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-slate-500" />
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        Question {idx + 1}
                                    </span>
                                    {answer.topic && (
                                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                                            {answer.topic}
                                        </span>
                                    )}
                                    <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                                        Max: {grade.maxMarks} marks
                                    </span>
                                </div>

                                {/* Student answer (rich text) */}
                                <div className="mb-3">
                                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                        Student&#39;s Answer
                                    </label>
                                    {answer.selectedAnswer && (
                                        <div
                                            className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 prose prose-sm max-w-none dark:prose-invert"
                                            dangerouslySetInnerHTML={{ __html: answer.selectedAnswer }}
                                        />
                                    )}
                                    {answer.writtenAnswerUrl && (
                                        <div className="mt-2">
                                            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-slate-500 dark:text-slate-400">
                                                <ImageIcon className="h-3.5 w-3.5" />
                                                Uploaded Image
                                            </div>
                                            <img
                                                src={answer.writtenAnswerUrl}
                                                alt="Handwritten answer"
                                                className="max-h-96 rounded-lg border border-slate-200 object-contain dark:border-slate-600"
                                            />
                                        </div>
                                    )}
                                    {!answer.selectedAnswer && !answer.writtenAnswerUrl && (
                                        <p className="text-sm italic text-slate-400 dark:text-slate-500">
                                            No answer provided
                                        </p>
                                    )}
                                </div>

                                {/* AI Suggested Score */}
                                {grade.aiSuggestedMarks != null && (
                                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                                        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                        <span className="text-sm text-amber-800 dark:text-amber-300">
                                            AI Suggested: <strong>{grade.aiSuggestedMarks}</strong> / {grade.maxMarks}
                                        </span>
                                        <button
                                            type="button"
                                            className="ml-auto flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                                            onClick={() => onAcceptAI(qId)}
                                        >
                                            <CheckCircle2 className="h-3 w-3" />
                                            Accept AI Score
                                        </button>
                                    </div>
                                )}

                                {/* Marks + Feedback */}
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label
                                            htmlFor={`marks-${result._id}-${qId}`}
                                            className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                                        >
                                            <ClipboardCheck className="mr-1 inline h-3.5 w-3.5" />
                                            Marks (0&ndash;{grade.maxMarks})
                                        </label>
                                        <input
                                            id={`marks-${result._id}-${qId}`}
                                            type="number"
                                            min={0}
                                            max={grade.maxMarks}
                                            step="0.5"
                                            className={inputCls}
                                            placeholder={`0–${grade.maxMarks}`}
                                            value={grade.marks}
                                            onChange={(e) => onGradeChange(qId, 'marks', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor={`feedback-${result._id}-${qId}`}
                                            className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                                        >
                                            <MessageSquare className="mr-1 inline h-3.5 w-3.5" />
                                            Feedback
                                        </label>
                                        <textarea
                                            id={`feedback-${result._id}-${qId}`}
                                            rows={2}
                                            className={inputCls}
                                            placeholder="Add feedback for the student..."
                                            value={grade.feedback}
                                            onChange={(e) => onGradeChange(qId, 'feedback', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {grade.saved && (
                                    <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                        <CheckCircle2 className="h-3 w-3" /> Saved
                                    </p>
                                )}
                            </div>
                        );
                    })}

                    {/* Save button */}
                    <div className="mt-4 flex justify-end">
                        <button type="button" className={btnPrimary} disabled={saving} onClick={onSave}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save Grades
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────

export default function WrittenGradingInterface() {
    const { examId } = useParams<{ examId?: string }>();
    const navigate = useNavigate();

    const [results, setResults] = useState<PendingResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});

    // gradeState: resultId -> { questionId -> GradeInput }
    const [gradeState, setGradeState] = useState<Record<string, Record<string, GradeInput>>>({});

    // ── Early return: Show exam selector if no examId ───────────────────

    if (!examId) {
        return (
            <AdminGuardShell title="Written Answer Grading" requiredModule="exam_center">
                <ExamSelectorPanel
                    apiUrl="/v1/exams?hasPendingEvaluation=true"
                    onSelect={(id) => navigate(`/exam-center/grading/${id}`)}
                    title="Select an Exam to Grade"
                    description="Choose an exam with pending written answer evaluations"
                    emptyMessage="No exams with pending evaluations found"
                />
            </AdminGuardShell>
        );
    }

    // ── Fetch pending results ────────────────────────────────────────────

    const loadResults = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchPendingResults(examId!);
            setResults(data);

            // Initialize grade inputs from existing writtenGrades or defaults
            const initial: Record<string, Record<string, GradeInput>> = {};
            for (const r of data) {
                const map: Record<string, GradeInput> = {};
                const writtenAnswers = r.answers.filter((a) => a.questionType === 'written');
                for (const ans of writtenAnswers) {
                    const existing = r.writtenGrades?.find((g) => g.questionId === ans.question);
                    map[ans.question] = {
                        marks: existing ? String(existing.marks) : '',
                        feedback: existing?.feedback ?? '',
                        aiSuggestedMarks: existing?.aiSuggestedMarks,
                        maxMarks: ans.marks ?? 10,
                        saved: !!existing,
                    };
                }
                initial[r._id] = map;
            }
            setGradeState(initial);
        } catch {
            setError('Failed to load pending evaluation results.');
            toast.error('Failed to load results');
        } finally {
            setLoading(false);
        }
    }, [examId]);

    useEffect(() => {
        loadResults();
    }, [loadResults]);

    // ── Grade change handler ─────────────────────────────────────────────

    const handleGradeChange = useCallback(
        (resultId: string, questionId: string, field: 'marks' | 'feedback', value: string) => {
            setGradeState((prev) => ({
                ...prev,
                [resultId]: {
                    ...prev[resultId],
                    [questionId]: {
                        ...prev[resultId]?.[questionId],
                        [field]: value,
                        saved: false,
                    },
                },
            }));
        },
        [],
    );

    // ── Accept AI score ──────────────────────────────────────────────────

    const handleAcceptAI = useCallback(
        (resultId: string, questionId: string) => {
            setGradeState((prev) => {
                const grade = prev[resultId]?.[questionId];
                if (!grade || grade.aiSuggestedMarks == null) return prev;
                return {
                    ...prev,
                    [resultId]: {
                        ...prev[resultId],
                        [questionId]: {
                            ...grade,
                            marks: String(grade.aiSuggestedMarks),
                            saved: false,
                        },
                    },
                };
            });
        },
        [],
    );

    // ── Save grades for a student ────────────────────────────────────────

    const handleSave = useCallback(
        async (resultId: string) => {
            const grades = gradeState[resultId];
            if (!grades) return;

            // Validate all marks
            for (const [, g] of Object.entries(grades)) {
                const m = parseFloat(g.marks);
                if (g.marks === '' || isNaN(m) || m < 0 || m > g.maxMarks) {
                    toast.error(`Marks must be between 0 and ${g.maxMarks}`);
                    return;
                }
            }

            setSavingMap((prev) => ({ ...prev, [resultId]: true }));
            try {
                for (const [questionId, g] of Object.entries(grades)) {
                    if (g.saved) continue;
                    await submitGrade(resultId, questionId, parseFloat(g.marks), g.maxMarks, g.feedback);
                }

                // Mark all as saved
                setGradeState((prev) => {
                    const updated = { ...prev[resultId] };
                    for (const qId of Object.keys(updated)) {
                        updated[qId] = { ...updated[qId], saved: true };
                    }
                    return { ...prev, [resultId]: updated };
                });

                toast.success('Grades saved successfully');
            } catch {
                toast.error('Failed to save grades');
            } finally {
                setSavingMap((prev) => ({ ...prev, [resultId]: false }));
            }
        },
        [gradeState],
    );

    // ── Progress computation ─────────────────────────────────────────────

    const { gradedCount, totalCount } = useMemo(() => {
        let graded = 0;
        let total = 0;
        for (const r of results) {
            const written = r.answers.filter((a) => a.questionType === 'written');
            total += written.length;
            const grades = gradeState[r._id];
            if (grades) {
                graded += Object.values(grades).filter((g) => g.saved).length;
            }
        }
        return { gradedCount: graded, totalCount: total };
    }, [results, gradeState]);

    // ── Render ───────────────────────────────────────────────────────────

    if (loading) {
        return (
            <AdminGuardShell title="Written Answer Grading" requiredModule="exam_center">
                <div className="flex min-h-[400px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
                </div>
            </AdminGuardShell>
        );
    }

    if (error) {
        return (
            <AdminGuardShell title="Written Answer Grading" requiredModule="exam_center">
                <div className="mx-auto max-w-3xl px-4 py-10">
                    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                </div>
            </AdminGuardShell>
        );
    }

    return (
        <AdminGuardShell title="Written Answer Grading" requiredModule="exam_center">
            <div className="mx-auto max-w-4xl px-4 py-6">
                {/* Page header */}
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                        Written Answer Grading
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Review and grade student written/CQ answers for exam{' '}
                        <span className="font-mono text-xs">{examId}</span>
                    </p>
                </div>

                {/* Progress */}
                <div className="mb-6">
                    <ProgressBar graded={gradedCount} total={totalCount} />
                </div>

                {/* Empty state */}
                {results.length === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 dark:border-slate-600">
                        <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-500" />
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                            All written answers have been graded
                        </p>
                        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                            No pending evaluations for this exam.
                        </p>
                    </div>
                )}

                {/* Student cards */}
                <div className="space-y-4">
                    {results.map((r) => (
                        <StudentCard
                            key={r._id}
                            result={r}
                            gradeInputs={gradeState[r._id] ?? {}}
                            onGradeChange={(qId, field, val) => handleGradeChange(r._id, qId, field, val)}
                            onAcceptAI={(qId) => handleAcceptAI(r._id, qId)}
                            onSave={() => handleSave(r._id)}
                            saving={!!savingMap[r._id]}
                        />
                    ))}
                </div>
            </div>
        </AdminGuardShell>
    );
}
