import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { isAxiosError } from "axios";
import { AlertTriangle, BookOpen, CalendarDays, Clock3, Lock, RefreshCw, Search, Sparkles, Users } from "lucide-react";
import { useExamList } from "../../hooks/useExamQueries";
import type { BlockReason, ExamListItem } from "../../types/exam";
import { startExam } from "../../services/api";
import PageHeroBanner from '../../components/common/PageHeroBanner';
import { usePageHeroSettings } from '../../hooks/usePageHeroSettings';

type PaidFilter = "all" | "paid" | "free";
type StatusFilter = "live" | "upcoming" | "ended";

const statusTabs: Array<{ id: StatusFilter; label: string }> = [
    { id: "live", label: "Live" },
    { id: "upcoming", label: "Upcoming" },
    { id: "ended", label: "Ended" },
];

const blockReasonMeta: Record<BlockReason, { label: string; href: string }> = {
    LOGIN_REQUIRED: { label: "Login", href: "/login" },
    SUBSCRIPTION_REQUIRED: { label: "Subscription", href: "/subscription-plans" },
    GROUP_RESTRICTED: { label: "Contact Admin", href: "/contact" },
    PLAN_RESTRICTED: { label: "Subscription", href: "/subscription-plans" },
    PAYMENT_PENDING: { label: "Payments", href: "/payments" },
    PROFILE_BELOW_70: { label: "Profile", href: "/profile" },
    EXAM_NOT_IN_WINDOW: { label: "Exam Window", href: "/exams" },
    ATTEMPT_LIMIT_REACHED: { label: "Attempts Used", href: "/exams" },
};

function formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBA";

    return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function durationLabel(minutes: number): string {
    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
    }

    return `${minutes}m`;
}

function ExamCardSkeleton() {
    return (
        <div className="card-flat overflow-hidden animate-pulse">
            <div className="h-40 bg-gradient-to-br from-slate-200/80 to-slate-300/60 dark:from-slate-800/80 dark:to-slate-700/60" />
            <div className="space-y-3 p-4 sm:p-5">
                <div className="h-5 w-4/5 rounded-lg bg-slate-200/70 dark:bg-slate-800/70" />
                <div className="h-3.5 w-3/5 rounded-lg bg-slate-200/60 dark:bg-slate-800/60" />
                <div className="flex gap-2">
                    <div className="h-4 w-24 rounded-lg bg-slate-200/60 dark:bg-slate-800/60" />
                    <div className="h-4 w-20 rounded-lg bg-slate-200/60 dark:bg-slate-800/60" />
                </div>
                <div className="flex gap-2 pt-1">
                    <div className="h-7 w-16 rounded-full bg-slate-200/60 dark:bg-slate-800/60" />
                    <div className="h-7 w-20 rounded-full bg-slate-200/60 dark:bg-slate-800/60" />
                </div>
                <div className="h-11 w-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
            </div>
        </div>
    );
}

function reasonLinks(reasons: BlockReason[]) {
    return reasons
        .map((reason) => blockReasonMeta[reason])
        .filter(Boolean)
        .map((item) => (
            <Link
                key={`${item.href}-${item.label}`}
                to={item.href}
                className="inline-flex items-center rounded-lg border border-card-border px-2.5 py-1 text-[11px] font-semibold text-text-muted hover:border-primary hover:text-primary dark:text-dark-text/80"
            >
                {item.label}
            </Link>
        ));
}

function ExamCard({
    item,
    index,
}: {
    item: ExamListItem;
    index: number;
}) {
    const [startingExternal, setStartingExternal] = useState(false);
    const blockedReasons = Array.isArray(item.blockedReasons) ? item.blockedReasons : [];
    const isBlocked = blockedReasons.length > 0 || Boolean(item.isLocked);
    const isLive = item.status === "live";
    const ctaLabel = isBlocked ? "Contact Admin" : isLive ? "Start" : "View";
    const ctaHref = isBlocked
        ? (item.contactAdmin?.whatsapp || "/contact")
        : (item.joinUrl || `/exam/${item.id}`);
    const ctaExternal = Boolean(isBlocked && item.contactAdmin?.whatsapp);
    const serialLabel = item.serialNo ? `#${item.serialNo}` : "";
    const isDirectExternalStart = !isBlocked && isLive && item.deliveryMode === "external_link";

    const handleExternalStart = async () => {
        if (startingExternal) return;
        setStartingExternal(true);
        try {
            const response = await startExam(item.id);
            const payload = response.data || {};
            if (payload.redirect && payload.externalExamUrl) {
                window.location.href = payload.externalExamUrl;
                return;
            }
            window.location.href = `/exam/${item.id}`;
        } finally {
            setStartingExternal(false);
        }
    };

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94], delay: index * 0.06 }}
            className="card-flat group relative overflow-hidden transition-shadow duration-300 hover:shadow-card-hover"
        >
            {item.bannerImageUrl ? (
                <div className="relative h-40 overflow-hidden">
                    <img
                        src={item.bannerImageUrl}
                        alt={item.title || 'Exam banner'}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg ${isLive ? "bg-success/90" : item.status === "upcoming" ? "bg-primary/90" : "bg-slate-500/90"
                        }`}>
                        {item.status}
                    </span>
                </div>
            ) : (
                <div className="relative h-40 w-full bg-gradient-to-br from-primary/15 via-accent/10 to-primary/5">
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.08]">
                        <BookOpen className="h-20 w-20" />
                    </div>
                    <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-lg ${isLive ? "bg-success/90" : item.status === "upcoming" ? "bg-primary/90" : "bg-slate-500/90"
                        }`}>
                        {item.status}
                    </span>
                </div>
            )}

            <div className="space-y-3 p-4 sm:p-5">
                <div>
                    <h3 className="line-clamp-2 text-base font-semibold text-text dark:text-dark-text">
                        {serialLabel ? <span className="mr-2 text-primary">{serialLabel}</span> : null}
                        {item.title}
                    </h3>
                    <p className="mt-1 text-xs text-text-muted dark:text-dark-text/70">
                        {item.subject || 'General'} - {item.examCategory || 'Uncategorized'}
                    </p>
                </div>

                <div className="grid gap-2 text-xs text-text-muted dark:text-dark-text/70">
                    <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-primary" />
                        <span>
                            {formatDateTime(item.examWindowStartUTC)} - {formatDateTime(item.examWindowEndUTC)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Clock3 className="h-3.5 w-3.5 text-primary" />
                        <span>Duration: {durationLabel(item.durationMinutes || 0)}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <span className="badge-primary">{item.paymentRequired ? `Paid BDT ${item.priceBDT ?? 0}` : "Free"}</span>
                    {item.subscriptionRequired ? (
                        <span className="badge-warning" aria-label="Warning: Subscription Required">⚠ Subscription Required</span>
                    ) : null}
                    {item.paymentRequired ? <span className="badge-danger" aria-label="Alert: Payment Required">✕ Payment Required</span> : null}
                </div>

                <div className="pt-1">
                    {isDirectExternalStart ? (
                        <button
                            type="button"
                            onClick={() => void handleExternalStart()}
                            disabled={startingExternal}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-50"
                        >
                            {startingExternal ? "Starting..." : "Start"}
                        </button>
                    ) : ctaExternal ? (
                        <a
                            href={ctaHref}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold ${isBlocked ? "btn-secondary" : "btn-primary"
                                }`}
                        >
                            {ctaLabel}
                        </a>
                    ) : (
                        <Link
                            to={ctaHref}
                            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-semibold ${isBlocked ? "btn-secondary" : "btn-primary"
                                }`}
                        >
                            {ctaLabel}
                        </Link>
                    )}
                </div>
            </div>

            {isBlocked ? (
                <div className="absolute inset-0 flex flex-col justify-end gap-3 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 sm:p-5">
                    <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-danger/20 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <Lock className="h-3.5 w-3.5" />
                        Locked
                    </div>
                    <div className="rounded-xl border border-white/25 bg-black/40 p-2.5 backdrop-blur-sm">
                        <p className="mb-2 text-xs font-medium text-white/90">
                            {blockedReasons.length ? blockedReasons.join(" | ") : "Locked"}
                        </p>
                        <div className="flex flex-wrap gap-1.5">{reasonLinks(blockedReasons)}</div>
                    </div>
                </div>
            ) : null}
        </motion.article>
    );
}

export const ExamsListPage = () => {
    const hero = usePageHeroSettings('exams');
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [status, setStatus] = useState<StatusFilter>("live");
    const [paid, setPaid] = useState<PaidFilter>("all");

    const { data, isLoading, isError, error, refetch, isFetching } = useExamList({
        category: category || undefined,
        status,
        paid: paid === "all" ? undefined : paid,
        q: search || undefined,
        page: 1,
        limit: 24,
    });

    const items = data?.items ?? [];
    const statusCode = isAxiosError(error) ? (error.response?.status ?? null) : null;

    const categories = useMemo(() => {
        const values = new Set<string>();
        items.forEach((item) => values.add(item.examCategory));
        return Array.from(values).sort((left, right) => left.localeCompare(right));
    }, [items]);

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            const matchSearch = search.trim()
                ? [item.title, item.title_bn, item.subject, item.examCategory]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase()
                    .includes(search.trim().toLowerCase())
                : true;

            const matchPaid =
                paid === "all" ? true : paid === "paid" ? Boolean(item.paymentRequired) : !item.paymentRequired;

            return matchSearch && matchPaid;
        });
    }, [items, paid, search]);

    const liveCount = useMemo(() => items.filter((item) => item.status === "live").length, [items]);
    const totalCount = filteredItems.length;

    return (
        <>
            {hero.enabled && (
                <PageHeroBanner
                    title={hero.title}
                    subtitle={hero.subtitle}
                    pillText={hero.pillText}
                    vantaEffect={hero.vantaEffect}
                    vantaColor={hero.vantaColor}
                    vantaBackgroundColor={hero.vantaBackgroundColor}
                    gradientFrom={hero.gradientFrom}
                    gradientTo={hero.gradientTo}
                    primaryCTA={hero.primaryCTA}
                    secondaryCTA={hero.secondaryCTA}
                />
            )}
            <div className="section-container py-4 sm:py-6 lg:py-8">
                {/* Page Header */}
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="mb-5"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <Sparkles className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-text dark:text-dark-text sm:text-2xl">Exams</h1>
                            <p className="text-xs text-text-muted dark:text-dark-text/60">
                                {liveCount > 0 ? `${liveCount} live now` : "Browse available exams"}
                            </p>
                        </div>
                    </div>
                </motion.div>

                {/* Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                    className="card-flat mb-5 p-4 sm:p-5"
                >
                    <div className="grid gap-3">
                        <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted dark:text-dark-text/60" />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search exam title, subject, category"
                                aria-label="Search exams"
                                className="input-field pl-9"
                            />
                        </label>

                        <div className="flex flex-wrap gap-2">
                            {statusTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setStatus(tab.id)}
                                    className={status === tab.id ? "tab-pill-active" : "tab-pill-inactive"}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <select
                                value={category}
                                onChange={(event) => setCategory(event.target.value)}
                                className="select-field"
                            >
                                <option value="">All Categories</option>
                                {categories.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>

                            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-card-border p-2">
                                {(["all", "free", "paid"] as const).map((chip) => (
                                    <button
                                        key={chip}
                                        type="button"
                                        onClick={() => setPaid(chip)}
                                        className={
                                            paid === chip
                                                ? "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white"
                                                : "rounded-full border border-card-border px-3 py-1.5 text-xs font-semibold text-text-muted dark:text-dark-text/70"
                                        }
                                    >
                                        {chip === "all" ? "All" : chip === "free" ? "Free" : "Paid"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </motion.div>

                {isLoading ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <ExamCardSkeleton key={`exam-skeleton-${index}`} />
                        ))}
                    </div>
                ) : null}

                {isError ? (
                    <div className="card-flat flex flex-col items-start gap-3 p-5">
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-danger">
                            <AlertTriangle className="h-4 w-4" />
                            {statusCode === 401 || statusCode === 403
                                ? "Exam list access requires login"
                                : statusCode === 404
                                    ? "Exam list API is not available"
                                    : "Failed to load exams"}
                        </div>
                        <p className="text-xs text-text-muted dark:text-dark-text/65">
                            {statusCode === 401 || statusCode === 403
                                ? "Please login and retry. If login is done already, backend exam access may still be restricted."
                                : "Retry now. If this keeps failing, verify backend exam routes and auth policy."}
                        </p>
                        {statusCode === 401 || statusCode === 403 ? (
                            <Link to="/login" className="btn-primary">
                                Go to Login
                            </Link>
                        ) : null}
                        <button type="button" onClick={() => refetch()} className="btn-secondary">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                        </button>
                    </div>
                ) : null}

                {!isLoading && !isError && filteredItems.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="card-flat flex flex-col items-center gap-3 p-8 text-center"
                    >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <Search className="h-6 w-6 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-text dark:text-dark-text">No exams found</p>
                        <p className="text-xs text-text-muted dark:text-dark-text/60">Try adjusting your filters or search terms.</p>
                    </motion.div>
                ) : null}

                {!isLoading && !isError && filteredItems.length > 0 ? (
                    <>
                        <div className="mb-3 flex items-center gap-2 text-xs text-text-muted dark:text-dark-text/60">
                            <Users className="h-3.5 w-3.5" />
                            <span>{totalCount} exam{totalCount !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            <AnimatePresence mode="popLayout">
                                {filteredItems.map((item, index) => (
                                    <ExamCard key={item.id} item={item} index={index} />
                                ))}
                            </AnimatePresence>
                        </div>
                    </>
                ) : null}

                {isFetching && !isLoading ? (
                    <div className="mt-4 text-xs text-text-muted dark:text-dark-text/60">Refreshing exams...</div>
                ) : null}
            </div>
        </>
    );
};
