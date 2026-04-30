import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Clock3, Download, Flag, SkipForward, XCircle } from "lucide-react";
import { downloadPdfEndpoint, examPdfUrls } from "../../api/examApi";
import { useExamSolutions, usePdfAvailability } from "../../hooks/useExamQueries";
import MathText from "../../components/exam/MathText";
import type { OptionKey, RunnerCache } from "../../types/exam";

type FilterKey = "All" | "Wrong" | "Correct" | "Skipped" | "Marked";

const filterTabs: FilterKey[] = ["All", "Wrong", "Correct", "Skipped", "Marked"];
const lastSessionKey = (examId: string) => `cw_exam_last_session_${examId}`;
const runnerCacheKey = (examId: string, sessionId: string) => `cw_exam_${examId}_${sessionId}`;

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

export const ExamSolutionsPage = () => {
    const { examId = "" } = useParams();
    const [searchParams] = useSearchParams();
    const [filter, setFilter] = useState<FilterKey>("All");
    const [tick, setTick] = useState(Date.now());
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<string>>(new Set());

    const sessionId =
        searchParams.get("sessionId") ||
        (typeof window !== "undefined" ? window.localStorage.getItem(lastSessionKey(examId)) : "") ||
        "";

    const query = useExamSolutions(examId, sessionId, Boolean(examId && sessionId));
    const solutionsPdfQuery = usePdfAvailability(examPdfUrls.solutions(examId), Boolean(examId));

    useEffect(() => {
        const timer = window.setInterval(() => setTick(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!examId || !sessionId || typeof window === "undefined") return;
        const raw = window.localStorage.getItem(runnerCacheKey(examId, sessionId));
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as RunnerCache;
            setMarkedQuestionIds(new Set(parsed.markedQuestionIds ?? []));
        } catch {
            setMarkedQuestionIds(new Set());
        }
    }, [examId, sessionId]);

    useEffect(() => {
        if (query.data?.status !== "locked") return;
        const serverNowMs = new Date(query.data.serverNowUTC).getTime();
        if (!Number.isFinite(serverNowMs)) return;
        setServerOffsetMs(serverNowMs - Date.now());
    }, [query.data]);

    const filterCounts = useMemo(() => {
        if (query.data?.status !== "available") return { All: 0, Wrong: 0, Correct: 0, Skipped: 0, Marked: 0 };
        const items = query.data.items;
        return {
            All: items.length,
            Wrong: items.filter((i) => i.selectedKey !== null && i.selectedKey !== i.correctKey).length,
            Correct: items.filter((i) => i.selectedKey === i.correctKey).length,
            Skipped: items.filter((i) => i.selectedKey === null).length,
            Marked: items.filter((i) => markedQuestionIds.has(i.questionId)).length,
        };
    }, [markedQuestionIds, query.data]);

    const filtered = useMemo(() => {
        if (query.data?.status !== "available") return [];
        return query.data.items.filter((item) => {
            const selected = item.selectedKey;
            const correct = item.correctKey;
            if (filter === "All") return true;
            if (filter === "Wrong") return selected !== null && selected !== correct;
            if (filter === "Correct") return selected === correct;
            if (filter === "Skipped") return selected === null;
            return markedQuestionIds.has(item.questionId);
        });
    }, [filter, markedQuestionIds, query.data]);

    const lockedCountdown = useMemo(() => {
        if (query.data?.status !== "locked") return null;
        const publishAtMs = new Date(query.data.publishAtUTC).getTime();
        const nowMs = tick + serverOffsetMs;
        const remaining = Math.max(0, Math.floor((publishAtMs - nowMs) / 1000));
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }, [query.data, serverOffsetMs, tick]);

    if (!sessionId) {
        return (
            <div className="section-container py-8">
                <div className="card-flat p-6 text-sm text-text-muted dark:text-dark-text/70">
                    No session found for solutions.
                </div>
            </div>
        );
    }

    if (query.isLoading) {
        return (
            <div className="section-container py-8">
                <div className="card-flat animate-pulse p-6">
                    <div className="h-6 w-40 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                </div>
            </div>
        );
    }

    if (query.isError || !query.data) {
        return (
            <div className="section-container py-8">
                <div className="card-flat p-6 text-sm text-danger">Failed to load solutions.</div>
            </div>
        );
    }

    if (query.data.status === "locked") {
        return (
            <div className="section-container py-8">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card-flat mx-auto max-w-xl p-6">
                    <div className="inline-flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                        <Clock3 className="h-3.5 w-3.5" />
                        Solutions Locked
                    </div>
                    <p className="mt-3 text-sm text-text-muted dark:text-dark-text/70">
                        {query.data.reason} - Release at {formatDateTime(query.data.publishAtUTC)}
                    </p>
                    <p className="mt-2 font-mono text-lg font-semibold text-text dark:text-dark-text">{lockedCountdown}</p>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="section-container py-6 sm:py-8">
            {/* Progress summary bar */}
            {query.data?.status === "available" && filterCounts.All > 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 overflow-hidden rounded-2xl border border-card-border"
                >
                    <div className="flex h-2.5">
                        <div
                            className="bg-success transition-all duration-500"
                            style={{ width: `${(filterCounts.Correct / filterCounts.All) * 100}%` }}
                        />
                        <div
                            className="bg-danger transition-all duration-500"
                            style={{ width: `${(filterCounts.Wrong / filterCounts.All) * 100}%` }}
                        />
                        <div
                            className="bg-warning/60 transition-all duration-500"
                            style={{ width: `${(filterCounts.Skipped / filterCounts.All) * 100}%` }}
                        />
                    </div>
                    <div className="flex flex-wrap gap-4 bg-surface px-4 py-2.5 text-xs font-medium dark:bg-dark-surface">
                        <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-3.5 w-3.5" />{filterCounts.Correct} Correct</span>
                        <span className="flex items-center gap-1.5 text-danger"><XCircle className="h-3.5 w-3.5" />{filterCounts.Wrong} Wrong</span>
                        <span className="flex items-center gap-1.5 text-warning"><SkipForward className="h-3.5 w-3.5" />{filterCounts.Skipped} Skipped</span>
                        {filterCounts.Marked > 0 ? <span className="flex items-center gap-1.5 text-text-muted dark:text-dark-text/60"><Flag className="h-3.5 w-3.5" />{filterCounts.Marked} Marked</span> : null}
                    </div>
                </motion.div>
            ) : null}

            {/* Filter tabs */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
                {filterTabs.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setFilter(tab)}
                        className={`${filter === tab ? "tab-pill-active" : "tab-pill-inactive"} relative`}
                    >
                        {tab}
                        {filterCounts[tab] > 0 ? (
                            <span className={`ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[max(10px,0.625rem)] font-bold ${filter === tab ? "bg-white/25 text-white" : "bg-card-border/50 text-text-muted dark:text-dark-text/60"
                                }`}>
                                {filterCounts[tab]}
                            </span>
                        ) : null}
                    </button>
                ))}
                {solutionsPdfQuery.data ? (
                    <button
                        type="button"
                        className="btn-secondary w-full sm:ml-auto sm:w-auto"
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
            </div>

            <div className="space-y-3">
                {filtered.map((item, index) => {
                    const isCorrect = item.selectedKey === item.correctKey;
                    const isSkipped = item.selectedKey === null;
                    const selected = (item.selectedKey ?? "Skipped") as OptionKey | "Skipped";
                    const borderColor = isCorrect
                        ? "border-l-success"
                        : isSkipped
                            ? "border-l-warning"
                            : "border-l-danger";

                    return (
                        <motion.article
                            key={item.questionId}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className={`card-flat border-l-4 ${borderColor} p-4 sm:p-5`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-semibold text-text dark:text-dark-text prose prose-sm max-w-none dark:prose-invert">
                                    <MathText>{`Q${index + 1}. ${item.questionText}`}</MathText>
                                </div>
                                {isCorrect ? (
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                                ) : isSkipped ? (
                                    <SkipForward className="h-5 w-5 shrink-0 text-warning" />
                                ) : (
                                    <XCircle className="h-5 w-5 shrink-0 text-danger" />
                                )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <span
                                    className={isSkipped ? "badge-warning" : isCorrect ? "badge-success" : "badge-danger"}
                                    aria-label={isSkipped ? "Warning: Skipped" : isCorrect ? "Correct answer" : "Incorrect answer"}
                                >
                                    {isSkipped ? "⚠ " : isCorrect ? "✓ " : "✕ "}Selected: {selected}
                                </span>
                                <span className="badge-success" aria-label="Correct answer">✓ Correct: {item.correctKey}</span>
                                {markedQuestionIds.has(item.questionId) ? <span className="badge-warning" aria-label="Warning: Marked for review">⚠ Marked</span> : null}
                            </div>

                            {item.questionImageUrl ? (
                                <img
                                    src={item.questionImageUrl}
                                    alt={`Question ${index + 1}`}
                                    className="mt-3 max-h-72 w-full rounded-xl border border-card-border object-contain"
                                    loading="lazy"
                                />
                            ) : null}

                            {item.explanationText ? (
                                <div className="mt-3 rounded-xl border border-card-border bg-surface2/30 p-3 dark:bg-dark-surface/30">
                                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted dark:text-dark-text/55">Explanation</p>
                                    <div className="text-sm leading-relaxed text-text-muted dark:text-dark-text/75 prose prose-sm max-w-none dark:prose-invert">
                                        <MathText>{item.explanationText}</MathText>
                                    </div>
                                </div>
                            ) : null}

                            {item.explanationImageUrl ? (
                                <img
                                    src={item.explanationImageUrl}
                                    alt={`Explanation ${index + 1}`}
                                    className="mt-3 max-h-72 w-full rounded-xl border border-card-border object-contain"
                                    loading="lazy"
                                />
                            ) : null}
                        </motion.article>
                    );
                })}
                {filtered.length === 0 ? (
                    <div className="card-flat p-6 text-sm text-text-muted dark:text-dark-text/70">
                        No items found for the selected filter.
                    </div>
                ) : null}
            </div>
        </div>
    );
};
