import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Award, BarChart3, CheckCircle2, Clock3, Download, SkipForward, Trophy, XCircle } from "lucide-react";
import { downloadPdfEndpoint, examPdfUrls } from "../../api/examApi";
import { useExamResult, useExamSolutions, usePdfAvailability } from "../../hooks/useExamQueries";

const lastSessionKey = (examId: string) => `cw_exam_last_session_${examId}`;

function formatDuration(totalSeconds: number): string {
    const safe = Math.max(0, totalSeconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
}

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBA";
    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function ScoreRing({ percentage }: { percentage: number }) {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
    const color = percentage >= 80 ? "var(--success)" : percentage >= 50 ? "var(--primary)" : "var(--danger)";

    return (
        <div className="relative inline-flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--color-card-border)" strokeWidth="8" opacity="0.3" />
                <motion.circle
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <motion.span
                    className="text-3xl font-bold text-text dark:text-dark-text sm:text-4xl"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.8 }}
                >
                    {percentage}%
                </motion.span>
                <span className="text-xs text-text-muted dark:text-dark-text/60">Score</span>
            </div>
        </div>
    );
}

function SubmissionStatusBadge({ status }: { status?: string }) {
    if (!status) return null;
    const config: Record<string, { label: string; className: string }> = {
        submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
        pending_review: { label: "Pending Review", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
        graded: { label: "Graded", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
        published: { label: "Published", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    };
    const c = config[status] || { label: status, className: "bg-gray-100 text-gray-700" };
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.className}`}>
            {c.label}
        </span>
    );
}

function PerformanceSummary({ summary }: { summary: { totalScore: number; percentage: number; strengths: string[]; weaknesses: string[] } }) {
    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="card-flat mt-4 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-card-border px-5 py-3">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-text dark:text-dark-text">Performance Summary</h2>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div>
                    <h3 className="mb-2 text-xs font-medium uppercase text-success">Strengths</h3>
                    {summary.strengths.length > 0 ? (
                        <ul className="space-y-1">
                            {summary.strengths.map((s) => (
                                <li key={s} className="flex items-center gap-1.5 text-sm text-text dark:text-dark-text">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                    {s}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-text-muted dark:text-dark-text/60">No strong topics identified</p>
                    )}
                </div>
                <div>
                    <h3 className="mb-2 text-xs font-medium uppercase text-danger">Needs Improvement</h3>
                    {summary.weaknesses.length > 0 ? (
                        <ul className="space-y-1">
                            {summary.weaknesses.map((w) => (
                                <li key={w} className="flex items-center gap-1.5 text-sm text-text dark:text-dark-text">
                                    <XCircle className="h-3.5 w-3.5 text-danger" />
                                    {w}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-text-muted dark:text-dark-text/60">No weak topics identified</p>
                    )}
                </div>
            </div>
        </motion.section>
    );
}

function QuestionBreakdown({ answers }: { answers: NonNullable<import("../../types/exam").ResultResponsePublished["detailedAnswers"]> }) {
    const [expanded, setExpanded] = useState(false);
    const visible = expanded ? answers : answers.slice(0, 5);

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }} className="card-flat mt-4 overflow-hidden">
            <div className="border-b border-card-border px-5 py-3">
                <h2 className="text-sm font-semibold text-text dark:text-dark-text">Question Breakdown</h2>
            </div>
            <div className="divide-y divide-card-border">
                {visible.map((a, i) => (
                    <div key={a.questionId || i} className="flex items-start gap-3 px-5 py-3">
                        <div className="mt-0.5 flex-shrink-0">
                            {a.correctWrongIndicator === "correct" ? (
                                <CheckCircle2 className="h-5 w-5 text-success" />
                            ) : a.correctWrongIndicator === "wrong" ? (
                                <XCircle className="h-5 w-5 text-danger" />
                            ) : (
                                <SkipForward className="h-5 w-5 text-warning" />
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-text dark:text-dark-text">Q{i + 1}</span>
                                <span className="text-xs font-semibold text-text-muted dark:text-dark-text/60">
                                    {a.marksObtained}/{a.marks}
                                </span>
                            </div>
                            {a.question ? (
                                <p className="mt-0.5 text-xs text-text-muted dark:text-dark-text/70 line-clamp-2">{a.question}</p>
                            ) : null}
                            {a.explanation ? (
                                <p className="mt-1 text-xs text-primary/80 dark:text-primary/60">{a.explanation}</p>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>
            {answers.length > 5 ? (
                <div className="border-t border-card-border px-5 py-3 text-center">
                    <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? "Show less" : `Show all ${answers.length} questions`}
                    </button>
                </div>
            ) : null}
        </motion.section>
    );
}

export const ExamResultPage = () => {
    const { examId = "" } = useParams();
    const [searchParams] = useSearchParams();
    const [tick, setTick] = useState(Date.now());
    const [serverOffsetMs, setServerOffsetMs] = useState(0);

    const sessionId =
        searchParams.get("sessionId") ||
        (typeof window !== "undefined" ? window.localStorage.getItem(lastSessionKey(examId)) : "") ||
        "";

    const resultQuery = useExamResult(examId, sessionId, Boolean(examId && sessionId));
    const solutionsQuery = useExamSolutions(examId, sessionId, Boolean(examId && sessionId));
    const questionsPdfQuery = usePdfAvailability(examPdfUrls.questions(examId), Boolean(examId));
    const solutionsPdfQuery = usePdfAvailability(examPdfUrls.solutions(examId), Boolean(examId));
    const answersPdfQuery = usePdfAvailability(examPdfUrls.answers(examId, sessionId), Boolean(examId && sessionId));

    useEffect(() => {
        const timer = window.setInterval(() => setTick(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (resultQuery.data?.status !== "locked") return;
        const serverNowMs = new Date(resultQuery.data.serverNowUTC).getTime();
        if (!Number.isFinite(serverNowMs)) return;
        setServerOffsetMs(serverNowMs - Date.now());
    }, [resultQuery.data]);

    const countdownLabel = useMemo(() => {
        if (resultQuery.data?.status !== "locked") return null;
        const publishAt = new Date(resultQuery.data.publishAtUTC).getTime();
        const now = tick + serverOffsetMs;
        const remaining = Math.max(0, Math.floor((publishAt - now) / 1000));
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }, [resultQuery.data, serverOffsetMs, tick]);

    if (!sessionId) {
        return (
            <div className="section-container py-8">
                <div className="card-flat p-6 text-sm text-text-muted dark:text-dark-text/70">
                    No exam session found for this result. Start an exam first from <Link to="/exams" className="text-primary underline">/exams</Link>.
                </div>
            </div>
        );
    }

    if (resultQuery.isLoading) {
        return (
            <div className="section-container py-8">
                <div className="card-flat animate-pulse p-6">
                    <div className="h-6 w-40 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                </div>
            </div>
        );
    }

    if (resultQuery.isError || !resultQuery.data) {
        return (
            <div className="section-container py-8">
                <div className="card-flat p-6 text-sm text-danger">Failed to load exam result.</div>
            </div>
        );
    }

    if (resultQuery.data.status === "locked") {
        return (
            <div className="section-container py-8">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-flat mx-auto max-w-xl p-6">
                    <div className="inline-flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                        <Clock3 className="h-3.5 w-3.5" />
                        Result Locked
                    </div>
                    <h1 className="mt-3 text-xl font-semibold text-text dark:text-dark-text">Result not published yet</h1>
                    <p className="mt-2 text-sm text-text-muted dark:text-dark-text/70">
                        Publish time: {formatDateTime(resultQuery.data.publishAtUTC)}
                    </p>
                    <p className="mt-3 text-lg font-mono font-semibold text-text dark:text-dark-text">{countdownLabel}</p>
                </motion.div>
            </div>
        );
    }

    const result = resultQuery.data;
    const solutionsReady = solutionsQuery.data?.status === "available";

    return (
        <div className="section-container py-6 sm:py-8">
            <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-flat overflow-hidden">
                {/* Celebration header */}
                <div className="relative bg-gradient-to-r from-primary/10 via-accent/8 to-success/10 px-5 py-6 text-center sm:px-8 sm:py-8">
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-4 inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-1.5 text-sm font-semibold text-success"
                    >
                        <Trophy className="h-4 w-4" />
                        Result Published
                    </motion.div>

                    <ScoreRing percentage={result.percentage} />

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="mt-2 text-lg font-bold text-text dark:text-dark-text"
                    >
                        {result.obtainedMarks} / {result.totalMarks}
                    </motion.p>

                    {typeof result.rank === "number" ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 1.2 }}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary"
                        >
                            <Award className="h-4 w-4" />
                            Rank #{result.rank}
                        </motion.div>
                    ) : null}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-2.5 p-4 sm:gap-3 sm:grid-cols-4 sm:p-6">
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="rounded-xl border border-success/20 bg-success/5 p-3">
                        <div className="flex items-center gap-2 text-success">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase">Correct</span>
                        </div>
                        <p className="mt-1 text-xl font-bold text-text dark:text-dark-text">{result.correctCount}</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="rounded-xl border border-danger/20 bg-danger/5 p-3">
                        <div className="flex items-center gap-2 text-danger">
                            <XCircle className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase">Wrong</span>
                        </div>
                        <p className="mt-1 text-xl font-bold text-text dark:text-dark-text">{result.wrongCount}</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="rounded-xl border border-warning/20 bg-warning/5 p-3">
                        <div className="flex items-center gap-2 text-warning">
                            <SkipForward className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase">Skipped</span>
                        </div>
                        <p className="mt-1 text-xl font-bold text-text dark:text-dark-text">{result.skippedCount}</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <div className="flex items-center gap-2 text-primary">
                            <Clock3 className="h-4 w-4" />
                            <span className="text-xs font-medium uppercase">Time</span>
                        </div>
                        <p className="mt-1 text-lg font-bold text-text dark:text-dark-text">{formatDuration(result.timeTakenSeconds)}</p>
                    </motion.div>
                </div>

                {/* Actions */}
                <div className="border-t border-card-border px-4 py-4 sm:px-6">
                    <div className="flex flex-wrap gap-2">
                        <Link to={`/exam/${examId}/solutions?sessionId=${sessionId}`} className="btn-primary">
                            View Solutions
                        </Link>
                        {questionsPdfQuery.data ? (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    void downloadPdfEndpoint(
                                        examPdfUrls.questions(examId),
                                        `exam-${examId}-questions.pdf`,
                                    );
                                }}
                            >
                                <Download className="mr-1.5 h-4 w-4" />
                                Questions PDF
                            </button>
                        ) : null}
                        {solutionsPdfQuery.data ? (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    void downloadPdfEndpoint(
                                        examPdfUrls.solutions(examId),
                                        `exam-${examId}-solutions.pdf`,
                                    );
                                }}
                            >
                                <Download className="mr-1.5 h-4 w-4" />
                                Solutions PDF
                            </button>
                        ) : null}
                        {answersPdfQuery.data ? (
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    void downloadPdfEndpoint(
                                        examPdfUrls.answers(examId, sessionId),
                                        `exam-${examId}-answers.pdf`,
                                    );
                                }}
                            >
                                <Download className="mr-1.5 h-4 w-4" />
                                My Answers PDF
                            </button>
                        ) : null}
                    </div>
                    {!solutionsReady ? (
                        <p className="mt-3 text-xs text-text-muted dark:text-dark-text/60">
                            Solutions may remain locked until backend release policy allows it.
                        </p>
                    ) : null}
                </div>
            </motion.section>

            {/* Performance Summary */}
            {result.performanceSummary ? (
                <PerformanceSummary summary={result.performanceSummary} />
            ) : null}

            {/* Question Breakdown */}
            {result.detailedAnswers && result.detailedAnswers.length > 0 ? (
                <QuestionBreakdown answers={result.detailedAnswers} />
            ) : null}
        </div>
    );
};
