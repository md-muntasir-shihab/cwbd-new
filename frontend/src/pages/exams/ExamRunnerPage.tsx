
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Flag,
    Lock,
    RefreshCw,
    ScrollText,
    Send,
    ShieldAlert,
    Timer,
    X,
} from "lucide-react";
import { useExamDetail, useSaveAnswers, useSessionQuestions, useStartSession, useSubmitExam } from "../../hooks/useExamQueries";
import { useExamAntiCheat } from "../../hooks/useExamAntiCheat";
import { useProactiveTokenRefresh } from "../../hooks/useProactiveTokenRefresh";
import MathText from "../../components/exam/MathText";
import type { BlockReason, ExamAnswer, PendingAnswerRow, RunnerCache, SelectedOptionKey } from "../../types/exam";

type SubmitMode = "manual" | "timeout";

const blockReasonMeta: Record<BlockReason, { label: string; href: string }> = {
    LOGIN_REQUIRED: { label: "Login", href: "/login" },
    SUBSCRIPTION_REQUIRED: { label: "Subscription", href: "/subscription-plans" },
    GROUP_RESTRICTED: { label: "Contact Admin", href: "/contact" },
    PLAN_RESTRICTED: { label: "Subscription", href: "/subscription-plans" },
    PAYMENT_PENDING: { label: "Payments", href: "/payments" },
    PROFILE_BELOW_70: { label: "Profile", href: "/profile" },
    EXAM_NOT_IN_WINDOW: { label: "Exam Window", href: "/exams" },
    ATTEMPT_LIMIT_REACHED: { label: "Attempts", href: "/exams" },
};

const sessionPointerKey = (examId: string) => `cw_exam_last_session_${examId}`;
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

function formatDuration(totalSeconds: number): string {
    const safe = Math.max(0, totalSeconds);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readSessionPointer(examId: string): string | undefined {
    if (!examId || typeof window === "undefined") return undefined;
    return window.localStorage.getItem(sessionPointerKey(examId)) || undefined;
}

function writeSessionPointer(examId: string, sessionId: string): void {
    if (!examId || !sessionId || typeof window === "undefined") return;
    window.localStorage.setItem(sessionPointerKey(examId), sessionId);
}

function clearSessionPointer(examId: string): void {
    if (!examId || typeof window === "undefined") return;
    window.localStorage.removeItem(sessionPointerKey(examId));
}

function clearRunnerCache(examId: string, sessionId: string): void {
    if (!examId || !sessionId || typeof window === "undefined") return;
    window.localStorage.removeItem(runnerCacheKey(examId, sessionId));
}

function readRunnerCache(examId: string, sessionId: string): RunnerCache | null {
    if (!examId || !sessionId || typeof window === "undefined") return null;
    try {
        const raw = window.localStorage.getItem(runnerCacheKey(examId, sessionId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<RunnerCache>;
        return {
            answers: parsed.answers ?? {},
            markedQuestionIds: Array.isArray(parsed.markedQuestionIds) ? parsed.markedQuestionIds : [],
            unsynced: Array.isArray(parsed.unsynced) ? parsed.unsynced : [],
            lastSavedAtUTC: parsed.lastSavedAtUTC ?? null,
        };
    } catch {
        return null;
    }
}

function mergeAnswerMaps(base: Record<string, ExamAnswer>, cached: Record<string, ExamAnswer>): Record<string, ExamAnswer> {
    const merged: Record<string, ExamAnswer> = { ...base };
    Object.entries(cached).forEach(([questionId, answer]) => {
        const current = merged[questionId];
        if (!current) {
            merged[questionId] = answer;
            return;
        }
        const currentTs = new Date(current.updatedAtUTC).getTime();
        const cachedTs = new Date(answer.updatedAtUTC).getTime();
        merged[questionId] = cachedTs >= currentTs ? answer : current;
    });
    return merged;
}

export const ExamRunnerPage = () => {
    const { examId = "" } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Proactive token refresh — keeps the access token fresh for the entire exam session
    useProactiveTokenRefresh(true);

    const [sessionId, setSessionId] = useState<string | undefined>(searchParams.get("sessionId") || readSessionPointer(examId));
    const [answers, setAnswers] = useState<Record<string, ExamAnswer>>({});
    const [markedMap, setMarkedMap] = useState<Record<string, boolean>>({});
    const [showRulesSheet, setShowRulesSheet] = useState(false);
    const [showMobilePalette, setShowMobilePalette] = useState(false);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
    const [showTimeoutModal, setShowTimeoutModal] = useState(false);
    const [autoSubmitFailed, setAutoSubmitFailed] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [lastSavedAtUTC, setLastSavedAtUTC] = useState<string | null>(null);
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);
    const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
    const [tick, setTick] = useState(Date.now());
    const [queueVersion, setQueueVersion] = useState(0);

    // ── Anti-cheat state ─────────────────────────────────────────────────────
    const [isSessionLocked, setIsSessionLocked] = useState(false);

    const detailQuery = useExamDetail(examId);
    const sessionQuery = useSessionQuestions(examId, sessionId);
    const startMutation = useStartSession(examId);
    const saveMutation = useSaveAnswers(examId, sessionId || "");
    const submitMutation = useSubmitExam(examId, sessionId || "");

    const saveInFlightRef = useRef(false);
    const autoSubmitTriggeredRef = useRef(false);
    const hydrationSessionRef = useRef<string | null>(null);
    const immediateFlushTimerRef = useRef<number | null>(null);
    const queueRef = useRef<Map<string, PendingAnswerRow>>(new Map());

    const detail = detailQuery.data;
    const sessionData = sessionQuery.data;
    const questions = sessionData?.questions ?? [];
    const rules = sessionData?.exam.rules ?? detail?.rules;
    const changeLimit = rules?.answerChangeLimit ?? null;

    // ── Anti-cheat hook callbacks ────────────────────────────────────────────
    const handleAntiCheatWarn = useCallback((message: string, remaining: number) => {
        toast(
            (t) => (
                <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                    <div>
                        <p className="text-sm font-semibold text-text dark:text-dark-text">{message}</p>
                        <p className="mt-0.5 text-xs text-text-muted dark:text-dark-text/70">
                            আরও {remaining}টি লঙ্ঘনে সেশন লক/সাবমিট হতে পারে
                        </p>
                    </div>
                    <button type="button" onClick={() => toast.dismiss(t.id)} className="ml-2 shrink-0">
                        <X className="h-4 w-4 text-text-muted" />
                    </button>
                </div>
            ),
            { duration: 6000, position: "top-center" },
        );
    }, []);

    const handleAntiCheatLock = useCallback(() => {
        setIsSessionLocked(true);
    }, []);

    const handleAntiCheatForceSubmit = useCallback(() => {
        if (!examId || !sessionId) return;
        // Use the submit mutation directly for force submit to avoid circular dependency
        // The submitSession function is defined later; we replicate the essential logic here
        void (async () => {
            try {
                await submitMutation.mutateAsync();
                clearSessionPointer(examId);
                clearRunnerCache(examId, sessionId);
                navigate(`/exam/${examId}/result?sessionId=${sessionId}`, { replace: true });
                toast.success("পরীক্ষা স্বয়ংক্রিয়ভাবে সাবমিট হয়েছে।");
            } catch {
                // If force submit fails, lock the session UI as fallback
                setIsSessionLocked(true);
                toast.error("স্বয়ংক্রিয় সাবমিট ব্যর্থ। সেশন লক করা হয়েছে।");
            }
        })();
    }, [examId, sessionId, submitMutation, navigate]);

    // ── Anti-cheat hook integration ──────────────────────────────────────────
    const antiCheatPolicy = sessionData?.antiCheatPolicy;
    const attemptRevision = sessionData?.session?.attemptRevision ?? 0;
    const antiCheatEnabled = Boolean(sessionId && sessionData?.session?.isActive);

    const { queuedSignals: antiCheatQueuedSignals } = useExamAntiCheat({
        examId: antiCheatEnabled ? examId : "",
        sessionId: antiCheatEnabled ? (sessionId ?? "") : "",
        attemptRevision,
        policy: {
            enableBlurTracking: antiCheatPolicy?.enableBlurTracking,
            enableContextMenuBlock: antiCheatPolicy?.enableContextMenuBlock,
            requireFullscreen: antiCheatPolicy?.requireFullscreen,
            enableClipboardBlock: antiCheatPolicy?.enableClipboardBlock,
            warningCooldownSeconds: antiCheatPolicy?.warningCooldownSeconds,
        },
        onWarn: handleAntiCheatWarn,
        onLock: handleAntiCheatLock,
        onForceSubmit: handleAntiCheatForceSubmit,
    });

    const remainingSeconds = useMemo(() => {
        if (!sessionData?.exam.expiresAtUTC) return null;
        const expiresAtMs = new Date(sessionData.exam.expiresAtUTC).getTime();
        if (!Number.isFinite(expiresAtMs)) return null;
        return Math.max(0, Math.floor((expiresAtMs - (tick + serverOffsetMs)) / 1000));
    }, [serverOffsetMs, sessionData?.exam.expiresAtUTC, tick]);

    const answeredCount = useMemo(
        () => questions.reduce((count, question) => (answers[question.id]?.selectedKey ? count + 1 : count), 0),
        [answers, questions],
    );

    const markedCount = useMemo(() => Object.values(markedMap).filter(Boolean).length, [markedMap]);

    const timerUrgency = useMemo(() => {
        if (remainingSeconds === null) return "normal";
        if (remainingSeconds <= 60) return "critical";
        if (remainingSeconds <= 300) return "warning";
        return "normal";
    }, [remainingSeconds]);

    const progressPercent = useMemo(() => {
        if (questions.length === 0) return 0;
        return Math.round((answeredCount / questions.length) * 100);
    }, [answeredCount, questions.length]);

    const saveStatusLabel = useMemo(() => {
        if (isOffline) return "Offline (will sync)";
        if (isSaving || saveMutation.isPending) return "Saving...";
        if (saveError) return "Save failed";
        if (!lastSavedAtUTC) return "Not saved yet";
        const savedTs = new Date(lastSavedAtUTC).getTime();
        if (!Number.isFinite(savedTs)) return "Saved";
        return `Saved ${Math.max(0, Math.floor((tick - savedTs) / 1000))}s ago`;
    }, [isOffline, isSaving, lastSavedAtUTC, saveError, saveMutation.isPending, tick]);
    useEffect(() => {
        const pointerFromRoute = searchParams.get("sessionId") || readSessionPointer(examId);
        setSessionId(pointerFromRoute || undefined);
        hydrationSessionRef.current = null;
        autoSubmitTriggeredRef.current = false;
        setAnswers({});
        setMarkedMap({});
        setSaveError(null);
        setSubmitError(null);
        setLastSavedAtUTC(null);
        queueRef.current.clear();
        setQueueVersion(0);
    }, [examId, searchParams]);

    useEffect(() => {
        const timer = window.setInterval(() => setTick(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const persistRunnerCache = useCallback(() => {
        if (!examId || !sessionId || typeof window === "undefined") return;
        const payload: RunnerCache = {
            answers,
            markedQuestionIds: Object.keys(markedMap).filter((questionId) => Boolean(markedMap[questionId])),
            unsynced: Array.from(queueRef.current.values()),
            lastSavedAtUTC,
        };
        window.localStorage.setItem(runnerCacheKey(examId, sessionId), JSON.stringify(payload));
    }, [answers, examId, lastSavedAtUTC, markedMap, sessionId]);

    useEffect(() => {
        persistRunnerCache();
    }, [persistRunnerCache, queueVersion]);

    useEffect(() => {
        if (!sessionId || !sessionData) return;
        if (sessionData.session && (!sessionData.session.isActive || sessionData.session.submittedAtUTC)) {
            clearSessionPointer(examId);
            clearRunnerCache(examId, sessionId);
            if (sessionData.session.submittedAtUTC) {
                navigate(`/exam/${examId}/result?sessionId=${sessionId}`, { replace: true });
            } else {
                setSessionId(undefined);
            }
            return;
        }
        if (hydrationSessionRef.current === sessionId) return;
        hydrationSessionRef.current = sessionId;
        writeSessionPointer(examId, sessionId);

        const serverAnswers = sessionData.answers.reduce<Record<string, ExamAnswer>>((acc, answer) => {
            acc[answer.questionId] = answer;
            return acc;
        }, {});

        const cache = readRunnerCache(examId, sessionId);
        const merged = cache ? mergeAnswerMaps(serverAnswers, cache.answers) : serverAnswers;
        setAnswers(merged);
        setMarkedMap(
            cache?.markedQuestionIds.reduce<Record<string, boolean>>((acc, questionId) => {
                acc[questionId] = true;
                return acc;
            }, {}) ?? {},
        );
        setLastSavedAtUTC(cache?.lastSavedAtUTC ?? null);
        setActiveQuestionId(sessionData.questions[0]?.id ?? null);

        queueRef.current.clear();
        cache?.unsynced.forEach((row) => queueRef.current.set(row.questionId, row));
        setQueueVersion((value) => value + 1);
    }, [examId, navigate, sessionData, sessionId]);

    const flushQueue = useCallback(async (): Promise<boolean> => {
        if (!sessionId || isOffline || saveInFlightRef.current) return false;
        const snapshot = Array.from(queueRef.current.values());
        if (snapshot.length === 0) return true;

        saveInFlightRef.current = true;
        setIsSaving(true);
        setSaveError(null);

        try {
            const response = await saveMutation.mutateAsync({ answers: snapshot });
            const updatedQuestionIds = new Set(response.updated.map((item) => item.questionId));
            let queueChanged = false;

            snapshot.forEach((sentRow) => {
                const current = queueRef.current.get(sentRow.questionId);
                if (!current) return;

                const currentTs = new Date(current.clientUpdatedAtUTC).getTime();
                const sentTs = new Date(sentRow.clientUpdatedAtUTC).getTime();
                const hasNewerLocalValue =
                    Number.isFinite(currentTs) && Number.isFinite(sentTs)
                        ? currentTs > sentTs
                        : current.clientUpdatedAtUTC !== sentRow.clientUpdatedAtUTC;
                if (hasNewerLocalValue) return;

                if (updatedQuestionIds.has(sentRow.questionId)) {
                    queueRef.current.delete(sentRow.questionId);
                    queueChanged = true;
                    return;
                }

                queueRef.current.set(sentRow.questionId, sentRow);
            });

            if (queueChanged) {
                setQueueVersion((value) => value + 1);
            }

            if (snapshot.length !== updatedQuestionIds.size) {
                setSaveError("Some answers are still pending sync.");
            } else {
                setSaveError(null);
            }

            setLastSavedAtUTC(response.serverSavedAtUTC);
            setAnswers((prev) => {
                const next = { ...prev };
                response.updated.forEach((updatedItem) => {
                    const current = next[updatedItem.questionId];
                    next[updatedItem.questionId] = {
                        questionId: updatedItem.questionId,
                        selectedKey: current?.selectedKey ?? null,
                        changeCount: updatedItem.changeCount,
                        updatedAtUTC: updatedItem.updatedAtUTC,
                    };
                });
                return next;
            });
            return true;
        } catch {
            setSaveError("Unable to sync answers. Will retry.");
            return false;
        } finally {
            saveInFlightRef.current = false;
            setIsSaving(false);
        }
    }, [isOffline, saveMutation, sessionId]);

    const scheduleImmediateFlush = useCallback(() => {
        if (immediateFlushTimerRef.current !== null) window.clearTimeout(immediateFlushTimerRef.current);
        immediateFlushTimerRef.current = window.setTimeout(() => {
            void flushQueue();
        }, 450);
    }, [flushQueue]);

    useEffect(() => {
        if (!sessionId) return undefined;
        const interval = window.setInterval(() => {
            void flushQueue();
        }, 5_000);
        return () => window.clearInterval(interval);
    }, [flushQueue, sessionId]);

    useEffect(() => {
        const onOnline = () => {
            setIsOffline(false);
            setSaveError(null);
            void flushQueue();
        };
        const onOffline = () => setIsOffline(true);

        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, [flushQueue]);

    useEffect(
        () => () => {
            if (immediateFlushTimerRef.current !== null) window.clearTimeout(immediateFlushTimerRef.current);
        },
        [],
    );

    const submitSession = useCallback(
        async (mode: SubmitMode) => {
            if (!examId || !sessionId || submitMutation.isPending) return;
            setSubmitError(null);
            if (mode === "timeout") setShowTimeoutModal(true);

            const synced = await flushQueue();
            if (!synced && isOffline) {
                const message = "Offline. Unable to submit now.";
                setSubmitError(message);
                setAutoSubmitFailed(mode === "timeout");
                return;
            }

            try {
                const response = await submitMutation.mutateAsync();
                clearSessionPointer(examId);
                clearRunnerCache(examId, sessionId);
                navigate(`/exam/${examId}/result?sessionId=${sessionId}`, { replace: true });
                toast.success(`Submitted at ${formatDateTime(response.submittedAtUTC)}`);
            } catch {
                const message = "Submit failed. Please retry.";
                setSubmitError(message);
                setAutoSubmitFailed(mode === "timeout");
                toast.error(message);
            }
        },
        [examId, flushQueue, isOffline, navigate, sessionId, submitMutation],
    );

    useEffect(() => {
        if (!rules?.autoSubmitOnTimeout || !sessionId || remainingSeconds !== 0 || autoSubmitTriggeredRef.current) return;
        autoSubmitTriggeredRef.current = true;
        void submitSession("timeout");
    }, [remainingSeconds, rules?.autoSubmitOnTimeout, sessionId, submitSession]);

    useEffect(() => {
        if (!questions.length) return;
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
                if (visible[0]) {
                    const id = visible[0].target.getAttribute("data-question-id");
                    if (id) setActiveQuestionId(id);
                }
            },
            { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.2, 0.6] },
        );

        questions.forEach((question) => {
            const node = document.getElementById(`exam-question-${question.id}`);
            if (node) observer.observe(node);
        });

        return () => observer.disconnect();
    }, [questions]);

    const startSession = async () => {
        if (!examId) return;
        try {
            const started = await startMutation.mutateAsync();
            if (started.redirect && started.externalExamUrl) {
                window.location.href = started.externalExamUrl;
                return;
            }
            setSessionId(started.sessionId);
            writeSessionPointer(examId, started.sessionId);
            const offset = new Date(started.serverNowUTC).getTime() - Date.now();
            setServerOffsetMs(Number.isFinite(offset) ? offset : 0);
            setShowRulesSheet(false);
            setSubmitError(null);
            setAutoSubmitFailed(false);
        } catch (err: unknown) {
            const axErr = err as { response?: { data?: { message?: string } } };
            const msg = axErr?.response?.data?.message || "Unable to start exam session.";
            toast.error(msg);
        }
    };

    const canSwitchOption = useCallback(
        (questionId: string, nextSelected: SelectedOptionKey) => {
            if (changeLimit === null) return true;
            const answer = answers[questionId];
            const currentSelected = answer?.selectedKey ?? null;
            if (currentSelected === nextSelected || currentSelected === null) return true;
            return (answer?.changeCount ?? 0) < changeLimit;
        },
        [answers, changeLimit],
    );

    const handleSelectOption = (questionId: string, selectedKey: SelectedOptionKey) => {
        if (!sessionId || submitMutation.isPending || isSessionLocked) return;
        if (!canSwitchOption(questionId, selectedKey)) {
            toast.error("Answer change limit reached for this question.");
            return;
        }

        const updatedAtUTC = new Date().toISOString();
        setAnswers((prev) => ({
            ...prev,
            [questionId]: {
                questionId,
                selectedKey,
                changeCount: prev[questionId]?.changeCount ?? 0,
                updatedAtUTC,
            },
        }));

        queueRef.current.set(questionId, { questionId, selectedKey, clientUpdatedAtUTC: updatedAtUTC });
        setQueueVersion((value) => value + 1);
        if (!isOffline) scheduleImmediateFlush();
    };

    const toggleMarked = (questionId: string) => {
        setMarkedMap((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
    };

    const scrollToQuestion = (questionId: string) => {
        const node = document.getElementById(`exam-question-${questionId}`);
        if (!node) return;
        setShowMobilePalette(false);
        node.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    if (detailQuery.isLoading) {
        return (
            <div className="section-container py-8">
                <div className="card-flat animate-pulse p-5">
                    <div className="h-5 w-48 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                    <div className="mt-3 h-4 w-72 rounded bg-slate-200/70 dark:bg-slate-800/70" />
                </div>
            </div>
        );
    }

    if (detailQuery.isError || !detail) {
        return (
            <div className="section-container py-8">
                <div className="card-flat p-5">
                    <p className="text-sm font-semibold text-danger">Failed to load exam details.</p>
                    <button type="button" onClick={() => detailQuery.refetch()} className="btn-secondary mt-3">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (detail.access.accessStatus === "blocked") {
        return (
            <div className="section-container py-6 sm:py-8">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-flat mx-auto max-w-2xl p-5 sm:p-6"
                >
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
                        <Lock className="h-3.5 w-3.5" />
                        Access Locked
                    </div>
                    <h1 className="text-xl font-semibold text-text dark:text-dark-text">{detail.title}</h1>
                    <p className="mt-2 text-sm text-text-muted dark:text-dark-text/70">
                        Your access is controlled by backend policy rules. Resolve the reasons below.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {detail.access.blockReasons.map((reason) => (
                            <span key={reason} className="badge-danger" aria-label={`Blocked: ${reason}`}>
                                ✕ {reason}
                            </span>
                        ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {detail.access.blockReasons.map((reason) => {
                            const action = blockReasonMeta[reason];
                            return action ? (
                                <a key={reason} href={action.href} className="btn-secondary">
                                    {action.label}
                                </a>
                            ) : null;
                        })}
                    </div>
                </motion.div>
            </div>
        );
    }

    if (!sessionId) {
        return (
            <div className="section-container py-6 sm:py-8">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-flat mx-auto max-w-3xl p-5 sm:p-6"
                >
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        <ScrollText className="h-3.5 w-3.5" />
                        Ready to Start
                    </div>
                    <h1 className="text-2xl font-bold text-text dark:text-dark-text">{detail.title}</h1>
                    <p className="mt-1 text-sm text-text-muted dark:text-dark-text/70">
                        {detail.subject} - {detail.examCategory}
                    </p>
                    {detail.description ? (
                        <p className="mt-3 text-sm text-text-muted dark:text-dark-text/75">{detail.description}</p>
                    ) : null}

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-card-border p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-dark-text/65">
                                Schedule Window
                            </p>
                            <p className="mt-1 text-sm text-text dark:text-dark-text">
                                {formatDateTime(detail.examWindowStartUTC)} - {formatDateTime(detail.examWindowEndUTC)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-card-border p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-dark-text/65">
                                Duration
                            </p>
                            <p className="mt-1 text-sm text-text dark:text-dark-text">{detail.durationMinutes} minutes</p>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-card-border p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted dark:text-dark-text/65">
                            Rules Summary
                        </p>
                        <div className="mt-2 grid gap-2 text-sm text-text dark:text-dark-text sm:grid-cols-2">
                            <p>
                                Negative Marking: {detail.rules.negativeMarkingEnabled ? `Yes (${detail.rules.negativePerWrong})` : "No"}
                            </p>
                            <p>
                                Answer Changes: {detail.rules.answerChangeLimit === null ? "Unlimited" : detail.rules.answerChangeLimit}
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void startSession()}
                            disabled={startMutation.isPending}
                            className="btn-primary"
                        >
                            {startMutation.isPending ? "Starting..." : "Start Exam"}
                        </button>
                        <button type="button" onClick={() => setShowRulesSheet(true)} className="btn-secondary">
                            Rules
                        </button>
                    </div>
                </motion.div>

                {showRulesSheet ? (
                    <div className="fixed inset-0 z-[70] bg-black/45" onClick={() => setShowRulesSheet(false)}>
                        <div
                            className="absolute bottom-0 left-0 right-0 rounded-t-3xl border border-card-border bg-surface p-5 dark:bg-dark-surface"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-base font-semibold text-text dark:text-dark-text">Rules</h2>
                                <button type="button" onClick={() => setShowRulesSheet(false)} className="btn-ghost">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <ul className="space-y-2 text-sm text-text-muted dark:text-dark-text/70">
                                <li>
                                    Negative marking: {detail.rules.negativeMarkingEnabled ? detail.rules.negativePerWrong : "Disabled"}
                                </li>
                                <li>
                                    Answer change limit: {detail.rules.answerChangeLimit === null ? "Unlimited" : detail.rules.answerChangeLimit}
                                </li>
                                <li>
                                    Attempt policy: {detail.attemptLimit
                                        ? `Up to ${detail.attemptLimit} attempt(s), re-attempt ${detail.allowReAttempt ? "allowed" : "disabled"
                                        }`
                                        : "Configured by backend policy"}
                                </li>
                            </ul>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (sessionQuery.isLoading) {
        return (
            <div className="section-container py-8">
                <div className="card-flat p-5 text-sm text-text-muted dark:text-dark-text/70">Loading exam questions...</div>
            </div>
        );
    }

    if (sessionQuery.isError || !sessionData) {
        return (
            <div className="section-container py-8">
                <div className="card-flat p-5">
                    <p className="text-sm font-semibold text-danger">Unable to load your exam session.</p>
                    <button type="button" onClick={() => sessionQuery.refetch()} className="btn-secondary mt-3">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="section-container py-4 pb-24 sm:py-6 sm:pb-8">
            <div className="sticky top-0 sm:top-16 z-40 overflow-hidden rounded-2xl border border-card-border bg-surface/95 backdrop-blur dark:bg-dark-surface/95">
                <div className="p-2.5 sm:p-3">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        {rules?.showTimer ? (
                            <div className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl border px-3 font-mono text-sm font-semibold transition-colors duration-300 ${timerUrgency === "critical"
                                ? "animate-pulse border-danger/50 bg-danger/10 text-danger"
                                : timerUrgency === "warning"
                                    ? "border-warning/40 bg-warning/10 text-warning"
                                    : "border-card-border text-text dark:text-dark-text"
                                }`}>
                                <Timer className="h-4 w-4" />
                                {formatDuration(remainingSeconds ?? 0)}
                            </div>
                        ) : null}

                        <div className="hidden items-center gap-2 text-xs font-medium text-text-muted dark:text-dark-text/70 sm:flex">
                            <span>{answeredCount}/{questions.length} answered</span>
                            <span className="text-text-muted/40 dark:text-dark-text/30">|</span>
                            <span>{saveStatusLabel}</span>
                            {antiCheatQueuedSignals > 0 ? (
                                <>
                                    <span className="text-text-muted/40 dark:text-dark-text/30">|</span>
                                    <span className="text-warning">{antiCheatQueuedSignals} queued</span>
                                </>
                            ) : null}
                        </div>
                        <div className="text-xs font-medium text-text-muted dark:text-dark-text/70 sm:hidden">{saveStatusLabel}</div>

                        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                            <button type="button" onClick={() => setShowRulesSheet(true)} className="btn-secondary text-xs sm:text-sm">
                                Rules
                            </button>
                            {rules?.showQuestionPalette ? (
                                <button
                                    type="button"
                                    onClick={() => setShowMobilePalette(true)}
                                    className="btn-secondary text-xs sm:text-sm lg:hidden"
                                >
                                    Palette
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => setShowSubmitConfirm(true)}
                                className="btn-primary text-xs sm:text-sm"
                                disabled={submitMutation.isPending}
                            >
                                <Send className="h-4 w-4 sm:mr-1.5" />
                                <span className="hidden sm:inline">Submit</span>
                            </button>
                        </div>
                    </div>
                    {isOffline ? (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Offline mode: answers are queued locally and will sync on reconnect.
                        </div>
                    ) : null}
                    {submitError ? (
                        <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-danger/15 px-2.5 py-1 text-xs font-medium text-danger">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {submitError}
                        </div>
                    ) : null}
                </div>
                {/* Progress bar */}
                <div className="h-1 w-full bg-card-border/30 dark:bg-slate-800/50">
                    <motion.div
                        className="h-full bg-gradient-to-r from-primary to-accent"
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
                <div className="space-y-4">
                    {questions.map((question, index) => {
                        const answer = answers[question.id];
                        const selected = answer?.selectedKey ?? null;
                        const changesLeft = changeLimit === null ? null : Math.max(changeLimit - (answer?.changeCount ?? 0), 0);
                        const isMarked = Boolean(markedMap[question.id]);

                        return (
                            <motion.article
                                key={question.id}
                                id={`exam-question-${question.id}`}
                                data-question-id={question.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, ease: "easeOut" }}
                                className="card-flat scroll-mt-32 p-4 sm:p-5"
                            >
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-text dark:text-dark-text">Q{index + 1}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-text-muted dark:text-dark-text/70">
                                            <span className="badge-primary">Marks: {question.marks}</span>
                                            {typeof question.negativeMarks === "number" ? <span className="badge-danger" aria-label={`Negative marks: ${question.negativeMarks}`}>✕ Negative: {question.negativeMarks}</span> : null}
                                            {changesLeft !== null ? <span className="badge-warning" aria-label={`Warning: ${changesLeft} changes left`}>⚠ Changes left: {changesLeft}</span> : null}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => toggleMarked(question.id)}
                                        className={isMarked ? "btn-secondary text-warning" : "btn-secondary"}
                                    >
                                        <Flag className={`mr-1.5 h-4 w-4 ${isMarked ? "fill-current" : ""}`} />
                                        {isMarked ? "Marked" : "Mark"}
                                    </button>
                                </div>

                                <div className="space-y-2 text-sm leading-relaxed text-text dark:text-dark-text prose prose-sm max-w-none dark:prose-invert">
                                    {question.question_bn ? <MathText>{question.question_bn}</MathText> : null}
                                    {question.question_en ? <MathText className={question.question_bn ? "text-text-muted dark:text-dark-text/70" : ""}>{question.question_en}</MathText> : null}
                                </div>

                                {question.questionImageUrl ? (
                                    <img
                                        src={question.questionImageUrl}
                                        alt={`Question ${index + 1}`}
                                        className="mt-3 max-h-72 w-full rounded-xl border border-card-border object-contain"
                                        loading="lazy"
                                    />
                                ) : null}

                                <div className="mt-4 grid gap-2.5">
                                    {question.options.map((option) => {
                                        const isSelected = selected === option.key;
                                        return (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => handleSelectOption(question.id, option.key)}
                                                className={`group/opt relative min-h-[52px] rounded-xl border-2 px-3.5 py-2.5 text-left transition-all duration-200 ${isSelected
                                                    ? "border-primary bg-primary/8 shadow-sm ring-1 ring-primary/20"
                                                    : "border-card-border bg-surface2/30 hover:border-primary/30 hover:bg-primary/4 dark:bg-dark-surface/30"}`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${isSelected
                                                        ? "border-primary bg-primary text-white"
                                                        : "border-card-border text-text-muted group-hover/opt:border-primary/40 dark:text-dark-text/60"
                                                        }`}>
                                                        {option.key}
                                                    </span>
                                                    <div className="flex-1">
                                                        <span className="text-sm text-text dark:text-dark-text"><MathText inline>{option.text_bn || option.text_en || "Option"}</MathText></span>
                                                        {option.imageUrl ? (
                                                            <img
                                                                src={option.imageUrl}
                                                                alt={`${option.key} option`}
                                                                className="mt-2 max-h-40 w-full rounded-lg border border-card-border object-contain"
                                                                loading="lazy"
                                                            />
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.article>
                        );
                    })}
                </div>

                {rules?.showQuestionPalette ? (
                    <aside className="sticky top-36 hidden h-fit rounded-2xl border border-card-border bg-surface p-4 dark:bg-dark-surface lg:block">
                        <h2 className="text-sm font-semibold text-text dark:text-dark-text">Question Palette</h2>
                        <div className="mt-3 grid grid-cols-5 gap-2">
                            {questions.map((question, index) => {
                                const isAnswered = Boolean(answers[question.id]?.selectedKey);
                                const isMarked = Boolean(markedMap[question.id]);
                                const isCurrent = question.id === activeQuestionId;
                                const buttonClass = isCurrent
                                    ? "bg-primary text-white border-primary"
                                    : isMarked
                                        ? "bg-warning/25 text-warning border-warning/40"
                                        : isAnswered
                                            ? "bg-success/20 text-success border-success/35"
                                            : "bg-surface2 text-text-muted border-card-border";

                                return (
                                    <button
                                        key={question.id}
                                        type="button"
                                        onClick={() => scrollToQuestion(question.id)}
                                        className={`h-9 rounded-lg border text-xs font-semibold ${buttonClass}`}
                                    >
                                        {index + 1}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-3 space-y-1 text-[11px] text-text-muted dark:text-dark-text/65">
                            <p>Answered: {answeredCount}</p>
                            <p>Marked: {markedCount}</p>
                            <p>Unanswered: {Math.max(questions.length - answeredCount, 0)}</p>
                        </div>
                    </aside>
                ) : null}
            </div>

            {/* Mobile sticky footer with submit button */}
            <div className="sticky bottom-0 z-40 flex items-center justify-between gap-2 border-t border-card-border bg-surface/95 backdrop-blur px-4 py-3 sm:hidden dark:bg-dark-surface/95">
                <span className="text-xs font-medium text-text-muted dark:text-dark-text/70">{answeredCount}/{questions.length} answered</span>
                <div className="flex items-center gap-2">
                    {rules?.showQuestionPalette ? (
                        <button type="button" onClick={() => setShowMobilePalette(true)} className="btn-secondary text-xs">
                            Palette
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setShowSubmitConfirm(true)}
                        className="btn-primary text-xs"
                        disabled={submitMutation.isPending}
                    >
                        <Send className="mr-1 h-3.5 w-3.5" />
                        Submit
                    </button>
                </div>
            </div>

            {showMobilePalette && rules?.showQuestionPalette ? (
                <div className="fixed inset-0 z-[70] bg-black/45 lg:hidden" onClick={() => setShowMobilePalette(false)}>
                    <div
                        className="absolute bottom-0 left-0 right-0 rounded-t-3xl border border-card-border bg-surface p-5 dark:bg-dark-surface"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-base font-semibold text-text dark:text-dark-text">Question Palette</h2>
                            <button type="button" onClick={() => setShowMobilePalette(false)} className="btn-ghost">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                            {questions.map((question, index) => {
                                const isAnswered = Boolean(answers[question.id]?.selectedKey);
                                const isMarked = Boolean(markedMap[question.id]);
                                const isCurrent = question.id === activeQuestionId;
                                const buttonClass = isCurrent
                                    ? "bg-primary text-white border-primary"
                                    : isMarked
                                        ? "bg-warning/25 text-warning border-warning/40"
                                        : isAnswered
                                            ? "bg-success/20 text-success border-success/35"
                                            : "bg-surface2 text-text-muted border-card-border";

                                return (
                                    <button
                                        key={question.id}
                                        type="button"
                                        onClick={() => scrollToQuestion(question.id)}
                                        className={`h-10 rounded-lg border text-xs font-semibold ${buttonClass}`}
                                    >
                                        {index + 1}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            ) : null}

            {showRulesSheet ? (
                <div className="fixed inset-0 z-[70] bg-black/45" onClick={() => setShowRulesSheet(false)}>
                    <div
                        className="absolute bottom-0 left-0 right-0 rounded-t-3xl border border-card-border bg-surface p-5 dark:bg-dark-surface"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-base font-semibold text-text dark:text-dark-text">Rules</h2>
                            <button type="button" onClick={() => setShowRulesSheet(false)} className="btn-ghost">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <ul className="space-y-2 text-sm text-text-muted dark:text-dark-text/70">
                            <li>Negative marking: {rules?.negativeMarkingEnabled ? rules.negativePerWrong : "Disabled"}</li>
                            <li>Answer change limit: {changeLimit === null ? "Unlimited" : changeLimit}</li>
                            <li>
                                Timer: {rules?.showTimer ? "Visible" : "Hidden"}, Auto-submit: {rules?.autoSubmitOnTimeout ? "Enabled" : "Disabled"}
                            </li>
                            <li>
                                Attempt policy: {detail.attemptLimit
                                    ? `Up to ${detail.attemptLimit} attempt(s), re-attempt ${detail.allowReAttempt ? "allowed" : "disabled"}`
                                    : "Configured by backend policy"}
                            </li>
                        </ul>
                    </div>
                </div>
            ) : null}

            <AnimatePresence>
                {showSubmitConfirm ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: 20 }}
                            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className="w-full max-w-md rounded-2xl border border-card-border bg-surface p-5 dark:bg-dark-surface"
                        >
                            <h2 className="text-lg font-semibold text-text dark:text-dark-text">Submit Exam?</h2>
                            <div className="mt-3 space-y-2 text-sm text-text-muted dark:text-dark-text/70">
                                <div className="flex items-center justify-between rounded-lg bg-success/8 px-3 py-2">
                                    <span>Answered</span>
                                    <span className="font-semibold text-success">{answeredCount}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg bg-slate-500/8 px-3 py-2">
                                    <span>Unanswered</span>
                                    <span className="font-semibold">{Math.max(questions.length - answeredCount, 0)}</span>
                                </div>
                                <div className="flex items-center justify-between rounded-lg bg-warning/8 px-3 py-2">
                                    <span>Marked for review</span>
                                    <span className="font-semibold text-warning">{markedCount}</span>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button type="button" onClick={() => setShowSubmitConfirm(false)} className="btn-secondary">Cancel</button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowSubmitConfirm(false);
                                        void submitSession("manual");
                                    }}
                                    disabled={submitMutation.isPending}
                                    className="btn-primary"
                                >
                                    {submitMutation.isPending ? "Submitting..." : "Confirm Submit"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>

            {showTimeoutModal ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-card-border bg-surface p-5 dark:bg-dark-surface">
                        <div className="inline-flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
                            <Clock3 className="h-3.5 w-3.5" />
                            Time Ended
                        </div>
                        <h2 className="mt-3 text-lg font-semibold text-text dark:text-dark-text">Time ended - submitting...</h2>
                        {submitMutation.isPending ? (
                            <p className="mt-2 text-sm text-text-muted dark:text-dark-text/70">Please wait while your exam is being safely submitted.</p>
                        ) : autoSubmitFailed ? (
                            <div className="mt-3 space-y-3">
                                <p className="text-sm text-danger">Auto-submit failed. Your answers are still saved locally.</p>
                                <button type="button" onClick={() => void submitSession("timeout")} className="btn-primary">Retry Submit</button>
                            </div>
                        ) : (
                            <div className="mt-3 inline-flex items-center gap-2 text-sm text-success">
                                <CheckCircle2 className="h-4 w-4" />
                                Submission completed.
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            {/* ── Anti-cheat: Session Locked Overlay ──────────────────────────── */}
            {isSessionLocked ? (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-md rounded-2xl border border-danger/30 bg-surface p-6 text-center dark:bg-dark-surface"
                    >
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger/10">
                            <Lock className="h-8 w-8 text-danger" />
                        </div>
                        <h2 className="mt-4 text-lg font-bold text-text dark:text-dark-text">
                            আপনার সেশন লক করা হয়েছে
                        </h2>
                        <p className="mt-2 text-sm text-text-muted dark:text-dark-text/70">
                            একাধিক নিয়ম লঙ্ঘনের কারণে আপনার পরীক্ষা সেশন লক করা হয়েছে।
                            অনুগ্রহ করে পরীক্ষা প্রশাসকের সাথে যোগাযোগ করুন।
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate("/exams")}
                            className="btn-secondary mt-5"
                        >
                            পরীক্ষা তালিকায় ফিরে যান
                        </button>
                    </motion.div>
                </div>
            ) : null}
        </div>
    );
};
