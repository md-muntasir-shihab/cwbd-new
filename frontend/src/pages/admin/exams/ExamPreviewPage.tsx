import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Clock, FileText, Hash, Award } from 'lucide-react';
import { getPreview } from '../../../api/adminExamApi';
import type { ExamPreviewResponse } from '../../../types/exam';

export default function ExamPreviewPage() {
    const { examId } = useParams<{ examId: string }>();
    const navigate = useNavigate();

    const [data, setData] = useState<ExamPreviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!examId) return;
        setLoading(true);
        getPreview(examId)
            .then((res) => setData(res))
            .catch(() => setError('Failed to load exam preview'))
            .finally(() => setLoading(false));
    }, [examId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="space-y-4">
                <button type="button" onClick={() => navigate(-1)} className="btn-ghost flex items-center gap-1 text-sm">
                    <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <div className="admin-panel-bg rounded-xl p-8 text-center">
                    <p className="text-red-500">{error || 'Exam not found'}</p>
                </div>
            </div>
        );
    }

    const { exam, questions } = data;

    const formatDuration = (minutes: number) => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
    };

    return (
        <div className="space-y-4">
            {/* Back button */}
            <button type="button" onClick={() => navigate(-1)} className="btn-ghost flex items-center gap-1 text-sm">
                <ChevronLeft className="h-4 w-4" /> Back to Exams
            </button>

            {/* Exam header */}
            <div className="admin-panel-bg rounded-xl p-3 md:p-5 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-text-muted dark:text-dark-text/65">
                            Exam Preview — Student View
                        </p>
                        <h2 className="text-lg md:text-xl font-bold text-text dark:text-dark-text truncate">{exam.title}</h2>
                        {exam.subject && (
                            <span className="inline-block mt-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                {exam.subject}
                            </span>
                        )}
                    </div>

                    {/* Timer mockup */}
                    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 md:px-4 py-2 md:py-2.5 dark:border-slate-700 dark:bg-slate-800 self-start sm:self-auto">
                        <Clock className="h-4 w-4 md:h-5 md:w-5 text-indigo-500" />
                        <span className="text-base md:text-lg font-mono font-semibold text-text dark:text-dark-text">
                            {formatDuration(exam.duration)}
                        </span>
                    </div>
                </div>

                {/* Metadata stats */}
                <div className="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-4">
                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-text-muted dark:text-dark-text/50">Duration</p>
                            <p className="text-sm font-semibold text-text dark:text-dark-text">{exam.duration} min</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                        <Award className="h-4 w-4 text-slate-400" />
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-text-muted dark:text-dark-text/50">Total Marks</p>
                            <p className="text-sm font-semibold text-text dark:text-dark-text">{exam.totalMarks}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                        <Hash className="h-4 w-4 text-slate-400" />
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-text-muted dark:text-dark-text/50">Questions</p>
                            <p className="text-sm font-semibold text-text dark:text-dark-text">{exam.totalQuestions}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <div>
                            <p className="text-[10px] uppercase tracking-wider text-text-muted dark:text-dark-text/50">Negative Marking</p>
                            <p className="text-sm font-semibold text-text dark:text-dark-text">
                                {exam.negativeMarking ? `−${exam.negativeMarkValue}` : 'No'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Questions list */}
            <div className="space-y-2 md:space-y-3">
                {questions
                    .sort((a, b) => a.orderIndex - b.orderIndex)
                    .map((q, idx) => (
                        <div key={idx} className="admin-panel-bg rounded-xl p-3 md:p-5 space-y-2 md:space-y-3">
                            {/* Question header */}
                            <div className="flex items-start gap-2 md:gap-3">
                                <span className="flex h-6 w-6 md:h-7 md:w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] md:text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                    {idx + 1}
                                </span>
                                <div className="flex-1 min-w-0 space-y-1">
                                    {q.question_en && (
                                        <p className="text-xs md:text-sm font-medium text-text dark:text-dark-text">{q.question_en}</p>
                                    )}
                                    {q.question_bn && (
                                        <p className="text-xs md:text-sm text-text-muted dark:text-dark-text/70">{q.question_bn}</p>
                                    )}
                                    {q.questionImageUrl && (
                                        <img
                                            src={q.questionImageUrl}
                                            alt={`Question ${idx + 1}`}
                                            className="mt-2 max-h-36 md:max-h-48 rounded-lg object-contain"
                                        />
                                    )}
                                </div>
                                <span className="shrink-0 rounded bg-slate-100 px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                                </span>
                            </div>

                            {/* Options */}
                            <div className="ml-8 md:ml-10 space-y-1.5 md:space-y-2">
                                {q.options.map((opt) => (
                                    <label
                                        key={opt.key}
                                        className="flex items-start gap-2 md:gap-2.5 rounded-lg border border-slate-200 px-2.5 md:px-3 py-1.5 md:py-2 cursor-default dark:border-slate-700"
                                    >
                                        <input
                                            type="radio"
                                            name={`q-${idx}`}
                                            disabled
                                            className="mt-0.5 h-4 w-4 accent-indigo-500"
                                        />
                                        <span className="text-xs font-bold text-text-muted dark:text-dark-text/50 mt-0.5">
                                            {opt.key}.
                                        </span>
                                        <div className="flex-1">
                                            {opt.text_en && (
                                                <p className="text-sm text-text dark:text-dark-text">{opt.text_en}</p>
                                            )}
                                            {opt.text_bn && (
                                                <p className="text-xs text-text-muted dark:text-dark-text/60">{opt.text_bn}</p>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
            </div>

            {questions.length === 0 && (
                <div className="admin-panel-bg rounded-xl p-8 text-center">
                    <p className="text-text-muted dark:text-dark-text/60">No questions found for this exam.</p>
                </div>
            )}
        </div>
    );
}
