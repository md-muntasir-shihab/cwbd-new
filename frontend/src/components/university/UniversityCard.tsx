import { memo } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { Layers3, MapPin, Phone, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { normalizeExternalUrl } from '../../utils/url';
import { trackAnalyticsEvent, type HomeAnimationLevel, type HomeUniversityCardConfig } from '../../services/api';
import DaysLeftChip from './DaysLeftChip';
import UniversityLogo from './UniversityLogo';
import type { UrgencyState } from '../../lib/apiClient';
import {
    daysUntilUniversityDate,
    formatUniversityDate,
    getUniversityNameSizeClass,
    getUniversityShortFormClass,
    parseUniversityDate,
    pickNearestUniversityExamDate,
    pickText,
    toUniversitySlug,
} from '../../lib/universityPresentation';

export const DEFAULT_UNIVERSITY_CARD_CONFIG: HomeUniversityCardConfig = {
    defaultUniversityLogo: '',
    showExamCentersPreview: true,
    closingSoonDays: 7,
    showAddress: true,
    showEmail: true,
    showApplicationProgress: true,
    showExamDates: true,
    defaultSort: 'alphabetical',
};

export type UniversityCardActionVariant = 'default' | 'deadline' | 'exam';
export type UniversityCardVisualVariant = 'modern' | 'classic';

type UniversityCardEntity = any;

interface UniversityCardProps {
    university: UniversityCardEntity;
    config?: Partial<HomeUniversityCardConfig>;
    animationLevel?: HomeAnimationLevel;
    className?: string;
    actionVariant?: UniversityCardActionVariant;
    cardVariant?: UniversityCardVisualVariant;
    isAdmin?: boolean;
    onAdminEdit?: (university: UniversityCardEntity) => void;
    onFavoriteToggle?: (id: string) => void;
    isFavorited?: boolean;
}

function buildApplicationMeta(startRaw: unknown, endRaw: unknown, closingSoonDays: number) {
    const start = parseUniversityDate(startRaw);
    const end = parseUniversityDate(endRaw);
    if (!start || !end) {
        return {
            urgencyState: 'unknown' as UrgencyState,
            daysLeft: null as number | null,
            windowLabel: 'N/A',
            deadlineLabel: 'Apply by N/A',
        };
    }

    const now = new Date();
    const nowMs = now.getTime();
    const startMs = start.getTime();
    const endMs = end.getTime();
    const daysToEnd = daysUntilUniversityDate(end);

    if (nowMs < startMs) {
        return {
            urgencyState: 'upcoming' as UrgencyState,
            daysLeft: daysToEnd,
            windowLabel: `${formatUniversityDate(start, 'en-GB', { day: '2-digit', month: 'short' })} - ${formatUniversityDate(end, 'en-GB', { day: '2-digit', month: 'short' })}`,
            deadlineLabel: `Starts ${formatUniversityDate(start, 'en-GB', { day: '2-digit', month: 'short' })}`,
        };
    }

    if (nowMs > endMs) {
        return {
            urgencyState: 'closed' as UrgencyState,
            daysLeft: 0,
            windowLabel: `${formatUniversityDate(start, 'en-GB', { day: '2-digit', month: 'short' })} - ${formatUniversityDate(end, 'en-GB', { day: '2-digit', month: 'short' })}`,
            deadlineLabel: `Closed ${formatUniversityDate(end, 'en-GB', { day: '2-digit', month: 'short' })}`,
        };
    }

    return {
        urgencyState: (daysToEnd !== null && daysToEnd <= Math.max(1, closingSoonDays) ? 'closing_soon' : 'open') as UrgencyState,
        daysLeft: daysToEnd,
        windowLabel: `${formatUniversityDate(start, 'en-GB', { day: '2-digit', month: 'short' })} - ${formatUniversityDate(end, 'en-GB', { day: '2-digit', month: 'short' })}`,
        deadlineLabel: `Apply by ${formatUniversityDate(end, 'en-GB', { day: '2-digit', month: 'short' })}`,
    };
}

function getAnimationVariants(level: HomeAnimationLevel): Variants {
    if (level === 'off') {
        return {
            hidden: { opacity: 1, y: 0 },
            show: { opacity: 1, y: 0 },
        };
    }
    if (level === 'minimal') {
        return {
            hidden: { opacity: 0 },
            show: { opacity: 1, transition: { duration: 0.2 } },
        };
    }
    return {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.26 } },
    };
}

function UnitDateChip({ label, value }: { label: string; value: unknown }) {
    return (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-950/55">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
                {formatUniversityDate(value, 'en-GB', { day: '2-digit', month: 'short' })}
            </p>
        </div>
    );
}

function calculateApplicationDurationDays(startRaw: unknown, endRaw: unknown): number | null {
    const start = parseUniversityDate(startRaw);
    const end = parseUniversityDate(endRaw);
    if (!start || !end) return null;
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return null;
    const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
    return Number.isFinite(days) ? days : null;
}

function normalizeSeat(value: unknown): string {
    const text = pickText(value);
    if (!text || text.toLowerCase() === 'n/a') return 'N/A';
    const onlyNumbers = text.replace(/[^\d]/g, '');
    if (!onlyNumbers) return 'N/A';
    const numeric = Number(onlyNumbers);
    if (!Number.isFinite(numeric) || numeric <= 0) return 'N/A';
    return numeric.toLocaleString();
}

function shortenAddress(address: string): string {
    if (!address) return 'N/A';
    const pieces = address.split(',').map((part) => part.trim()).filter(Boolean);
    if (pieces.length >= 2) return `${pieces[0]}, ${pieces[1]}`;
    if (address.length <= 44) return address;
    return `${address.slice(0, 41)}...`;
}

function getClassicStatusLabel(urgencyState: UrgencyState): string {
    if (urgencyState === 'closing_soon') return 'Closing soon';
    if (urgencyState === 'open') return 'Open';
    if (urgencyState === 'upcoming') return 'Upcoming';
    if (urgencyState === 'closed') return 'Closed';
    return 'N/A';
}

function getClassicStatusTone(urgencyState: UrgencyState): string {
    if (urgencyState === 'closing_soon') {
        return 'text-amber-700 bg-amber-100 border-amber-200 dark:text-amber-200 dark:bg-amber-500/15 dark:border-amber-500/35';
    }
    if (urgencyState === 'open') {
        return 'text-emerald-700 bg-emerald-100 border-emerald-200 dark:text-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/35';
    }
    if (urgencyState === 'upcoming') {
        return 'text-sky-700 bg-sky-100 border-sky-200 dark:text-sky-200 dark:bg-sky-500/15 dark:border-sky-500/35';
    }
    if (urgencyState === 'closed') {
        return 'text-rose-700 bg-rose-100 border-rose-200 dark:text-rose-200 dark:bg-rose-500/15 dark:border-rose-500/35';
    }
    return 'text-slate-500 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800/70 dark:border-slate-700';
}

function getClassicStatusIndicatorTone(urgencyState: UrgencyState): string {
    if (urgencyState === 'closing_soon') {
        return 'text-amber-500 bg-amber-500/12 ring-amber-500/20';
    }
    if (urgencyState === 'open') {
        return 'text-emerald-500 bg-emerald-500/12 ring-emerald-500/20';
    }
    if (urgencyState === 'upcoming') {
        return 'text-sky-500 bg-sky-500/12 ring-sky-500/20';
    }
    if (urgencyState === 'closed') {
        return 'text-rose-500 bg-rose-500/12 ring-rose-500/20';
    }
    return 'text-slate-400 bg-slate-500/10 ring-slate-500/10';
}

const UniversityCard = memo(function UniversityCard({
    university,
    config,
    animationLevel = 'normal',
    className = '',
    actionVariant = 'default',
    cardVariant = 'modern',
}: UniversityCardProps) {
    const mergedConfig: HomeUniversityCardConfig = { ...DEFAULT_UNIVERSITY_CARD_CONFIG, ...(config || {}) };
    const id = pickText(university.id || university._id);
    const name = pickText(university.name, 'University');
    const shortForm = pickText(university.shortForm, 'N/A');
    const category = pickText(university.category, 'N/A');
    const clusterGroup = pickText(university.clusterGroup);
    const clusterSlug = pickText(university.clusterSlug) || toUniversitySlug(clusterGroup);
    const admissionWebsite = normalizeExternalUrl(pickText(university.admissionWebsite));
    const officialWebsite = normalizeExternalUrl(pickText(university.website));
    const slug = pickText(university.slug);
    const detailsUrl = slug ? `/universities/${slug}` : '/universities';
    const clusterUrl = clusterGroup && clusterSlug ? `/universities/cluster/${clusterSlug}` : '';
    const logoUrl = pickText(university.logoUrl || university.logo) || pickText(mergedConfig.defaultUniversityLogo);
    const universityNameSizeClass = getUniversityNameSizeClass(name);
    const shortFormClass = getUniversityShortFormClass(shortForm);
    const nearestExam = pickNearestUniversityExamDate(university);
    const startRaw = university.applicationStart || university.applicationStartDate;
    const endRaw = university.applicationEnd || university.applicationEndDate;
    const appMeta = buildApplicationMeta(
        startRaw,
        endRaw,
        mergedConfig.closingSoonDays,
    );
    const appDurationDays = calculateApplicationDurationDays(startRaw, endRaw);
    const contactNumber = pickText(university.contactNumber);
    const establishedYear = pickText(university.establishedYear || university.established);
    const email = pickText(university.email);
    const rawAddress = pickText(university.address);
    const address = shortenAddress(rawAddress);
    const seats = {
        total: normalizeSeat(university.totalSeats),
        science: normalizeSeat(university.scienceSeats),
        arts: normalizeSeat(university.artsSeats),
        business: normalizeSeat(university.businessSeats),
    };
    const classicStatusLabel = getClassicStatusLabel(appMeta.urgencyState);
    const classicStatusTone = getClassicStatusTone(appMeta.urgencyState);
    const classicStatusIndicatorTone = getClassicStatusIndicatorTone(appMeta.urgencyState);
    const examCenterPreview = Array.isArray(university.examCentersPreview)
        ? university.examCentersPreview.map((value: unknown) => pickText(value)).filter(Boolean).slice(0, 3)
        : [];
    const phoneLink = contactNumber ? `tel:${contactNumber.replace(/\s+/g, '')}` : '';
    const emailLink = email ? `mailto:${email}` : '';
    const showStatusPulse = appMeta.urgencyState !== 'closed' && appMeta.urgencyState !== 'unknown';

    const sendEvent = (eventName: string, meta: Record<string, unknown>) => {
        void trackAnalyticsEvent({
            eventName,
            module: 'universities',
            source: 'public',
            meta,
        }).catch(() => undefined);
    };

    const copyAddress = async () => {
        if (!rawAddress) return;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(rawAddress);
            } else {
                throw new Error('Clipboard API unavailable');
            }
            toast.success('Address copied');
            sendEvent('university_address_copy', { universityId: id, slug, address: rawAddress });
        } catch {
            toast.error('Could not copy address');
        }
    };

    const variants = getAnimationVariants(animationLevel);

    const detailsButton = (
        <Link
            to={detailsUrl}
            data-testid="university-card-details"
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
            View Details
        </Link>
    );

    const officialButton = officialWebsite ? (
        <a
            href={officialWebsite}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="university-card-official"
            onClick={() => sendEvent('university_official_click', { universityId: id, slug, website: officialWebsite })}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
            Official
        </a>
    ) : (
        <span className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-400 dark:border-slate-700 dark:text-slate-500">
            Official N/A
        </span>
    );

    const applyButton = admissionWebsite ? (
        <a
            href={admissionWebsite}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="university-card-apply"
            onClick={() => sendEvent('university_apply_click', { universityId: id, slug, admissionWebsite })}
            className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90"
        >
            Apply
        </a>
    ) : (
        <span className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-400 dark:border-slate-700 dark:text-slate-500">
            Apply N/A
        </span>
    );

    const actionRows = actionVariant === 'deadline'
        ? [applyButton, officialButton, detailsButton]
        : actionVariant === 'exam'
            ? [applyButton, detailsButton, officialButton]
            : [applyButton, officialButton, detailsButton];

    if (cardVariant === 'classic') {
        return (
            <motion.article
                variants={variants}
                whileHover={animationLevel === 'off' ? undefined : { y: -5, transition: { duration: 0.2 } }}
                className={`group relative flex flex-col overflow-hidden rounded-[24px] border border-white/20 bg-white/70 shadow-lg backdrop-blur-xl transition-all duration-300 hover:shadow-2xl dark:border-white/10 dark:bg-slate-900/60 ${className}`}
                data-university-card-id={id}
                data-university-category={category}
                data-university-cluster={clusterGroup}
                data-university-card-variant="classic"
            >
                <div
                    className={`pointer-events-none absolute right-4 top-4 z-[1] flex h-6 w-6 items-center justify-center rounded-full shadow-sm ring-1 backdrop-blur-sm ${classicStatusIndicatorTone}`}
                    title={classicStatusLabel}
                    data-testid="university-card-status-indicator"
                    data-university-status={appMeta.urgencyState}
                >
                    <span className="relative flex h-2.5 w-2.5 items-center justify-center">
                        {showStatusPulse ? (
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-55" />
                        ) : null}
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
                    </span>
                </div>
                <div className="space-y-4 p-5">
                    <div className="flex items-start gap-4">
                        <div className="relative flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                            <UniversityLogo
                                name={name}
                                shortForm={shortForm}
                                logoUrl={logoUrl}
                                containerClassName="h-full w-full"
                                fallbackTextClassName="text-[0.95rem] sm:text-[1.05rem]"
                            />
                        </div>

                        <div className="min-w-0 flex-1 pr-8 sm:pr-10">
                            <Link
                                to={detailsUrl}
                                onClick={() => sendEvent('university_details_click', { universityId: id, slug, via: 'title' })}
                                className={`block ${universityNameSizeClass} line-clamp-2 font-bold leading-tight text-slate-900 transition hover:text-primary dark:text-white dark:hover:text-cyan-300`}
                                title={name}
                            >
                                {name}
                            </Link>

                            <div className="mt-3 flex flex-wrap items-center gap-1.5 pb-1">
                                {/* Short form badge */}
                                <span className={`inline-flex items-center rounded-[6px] border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-200`}>
                                    {shortForm && shortForm !== 'N/A' ? shortForm : 'N/A'}
                                </span>

                                {/* Established badge */}
                                <span className="inline-flex items-center rounded-[6px] border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-400">
                                    EST. {establishedYear || 'N/A'}
                                </span>

                                {/* Category badge */}
                                <span className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${(category && category !== 'N/A') ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300' : 'border-slate-200/60 bg-slate-50 text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-500'}`}>
                                    {category && category !== 'N/A' ? category : 'N/A'}
                                </span>

                                {/* Cluster badge */}
                                {clusterGroup && clusterGroup !== 'N/A' ? (
                                    clusterUrl ? (
                                        <Link
                                            to={clusterUrl}
                                            className="inline-flex items-center gap-1 rounded-[6px] border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-purple-700 transition hover:bg-purple-100 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300 dark:hover:bg-purple-500/20"
                                        >
                                            <Layers3 className="h-3 w-3" />
                                            <span className="max-w-[13rem] truncate">{clusterGroup}</span>
                                        </Link>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded-[6px] border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300">
                                            <Layers3 className="h-3 w-3" />
                                            <span className="max-w-[13rem] truncate">{clusterGroup}</span>
                                        </span>
                                    )
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-[6px] border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-500">
                                        <Layers3 className="h-3 w-3 opacity-50" />
                                        <span>N/A</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Location</p>
                            {mergedConfig.showAddress && rawAddress ? (
                                <button
                                    type="button"
                                    onClick={copyAddress}
                                    className="mt-2 flex w-full items-start gap-2 text-left text-[13px] text-slate-600 transition hover:text-primary dark:text-slate-300 dark:hover:text-cyan-300"
                                    title="Copy address"
                                >
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span className="line-clamp-2 break-words">{address}</span>
                                </button>
                            ) : (
                                <div className="mt-2 flex items-start gap-2 text-[13px] text-slate-600 dark:text-slate-300">
                                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span className="line-clamp-2">N/A</span>
                                </div>
                            )}
                        </div>

                        <div className="rounded-[1.35rem] border border-slate-200/80 bg-white/90 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Contact</p>
                            <div className="mt-2 space-y-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                                {phoneLink ? (
                                    <a
                                        href={phoneLink}
                                        className="flex min-h-[1rem] items-center gap-1.5 transition hover:text-primary dark:hover:text-cyan-300"
                                        onClick={() => sendEvent('university_phone_click', { universityId: id, slug, phone: contactNumber })}
                                    >
                                        <Phone className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{contactNumber}</span>
                                    </a>
                                ) : (
                                    <div className="flex min-h-[1rem] items-center gap-1.5">
                                        <Phone className="h-3 w-3 shrink-0" />
                                        <span className="truncate">N/A</span>
                                    </div>
                                )}
                                {mergedConfig.showEmail && email ? (
                                    <a
                                        href={emailLink}
                                        className="flex min-h-[1rem] items-center gap-1.5 text-slate-500 transition hover:text-primary dark:text-slate-400 dark:hover:text-cyan-300"
                                        onClick={() => sendEvent('university_email_click', { universityId: id, slug, email })}
                                    >
                                        <Mail className="h-3 w-3 shrink-0" />
                                        <span className="break-all">{email}</span>
                                    </a>
                                ) : (
                                    <div className="text-slate-500 dark:text-slate-400">Email N/A</div>
                                )}
                            </div>
                        </div>

                        <div className="rounded-[1.35rem] border border-slate-200/80 bg-slate-50/90 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-950/35 sm:col-span-2">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Application</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-100">
                                        {appMeta.windowLabel}
                                        {appDurationDays !== null ? ` (${appDurationDays} days)` : ''}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Status</p>
                                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-100">{appMeta.deadlineLabel}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="px-5">
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-800" />
                </div>
                <div className="p-5">
                    <div className="mb-3 flex items-center gap-2">
                        <div className="h-1 w-4 rounded-full bg-primary" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Available Seats</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/50 p-2 text-center dark:border-slate-800 dark:bg-slate-950/30">
                            <span className="mb-0.5 text-[10px] text-slate-400 dark:text-slate-500">Total</span>
                            <span className="text-sm font-black text-primary">{seats.total}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/50 p-2 text-center dark:border-slate-800 dark:bg-slate-950/30">
                            <span className="mb-0.5 text-[10px] text-slate-400 dark:text-slate-500">Sci</span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-200">{seats.science}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/50 p-2 text-center dark:border-slate-800 dark:bg-slate-950/30">
                            <span className="mb-0.5 text-[10px] text-slate-400 dark:text-slate-500">Com</span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-200">{seats.business}</span>
                        </div>
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-slate-50/50 p-2 text-center dark:border-slate-800 dark:bg-slate-950/30">
                            <span className="mb-0.5 text-[10px] text-slate-400 dark:text-slate-500">Arts</span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-200">{seats.arts}</span>
                        </div>
                    </div>
                </div>
                <div className="px-5">
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-800" />
                </div>
                <div className="flex-1 p-5">
                    <div className="mb-3 flex items-center gap-2">
                        <div className="h-1 w-4 rounded-full bg-amber-500" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Upcoming Exams</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Science Unit</span>
                            <span className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {formatUniversityDate(university.scienceExamDate || university.examDateScience, 'en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Arts Unit</span>
                            <span className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {formatUniversityDate(university.artsExamDate || university.examDateArts, 'en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Commerce Unit</span>
                            <span className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                {formatUniversityDate(university.businessExamDate || university.examDateBusiness, 'en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-auto grid grid-cols-1 gap-2 p-5 pt-0 sm:grid-cols-2">
                    {actionVariant === 'exam' ? (
                        <>
                            <Link
                                to={detailsUrl}
                                data-testid="university-card-details"
                                className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                            >
                                Details
                            </Link>
                            {officialWebsite ? (
                                <a
                                    href={officialWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid="university-card-official"
                                    onClick={() => sendEvent('university_official_click', { universityId: id, slug, website: officialWebsite })}
                                    className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                                >
                                    Official
                                </a>
                            ) : (
                                <span className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-400 dark:border-slate-800 dark:text-slate-500">
                                    Official N/A
                                </span>
                            )}
                        </>
                    ) : null}
                    {actionVariant === 'deadline' ? (
                        <>
                            {admissionWebsite ? (
                                <a
                                    href={admissionWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid="university-card-apply"
                                    onClick={() => sendEvent('university_apply_click', { universityId: id, slug, admissionWebsite })}
                                    className="flex min-h-[44px] items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                                >
                                    Apply
                                </a>
                            ) : (
                                <span className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-400 dark:border-slate-800 dark:text-slate-500">
                                    Apply N/A
                                </span>
                            )}
                            {officialWebsite ? (
                                <a
                                    href={officialWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid="university-card-official"
                                    onClick={() => sendEvent('university_official_click', { universityId: id, slug, website: officialWebsite })}
                                    className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                                >
                                    Official
                                </a>
                            ) : (
                                <span className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-400 dark:border-slate-800 dark:text-slate-500">
                                    Official N/A
                                </span>
                            )}
                        </>
                    ) : null}
                    {actionVariant === 'default' ? (
                        <>
                            <Link
                                to={detailsUrl}
                                data-testid="university-card-details"
                                className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                            >
                                View Details
                            </Link>
                            {officialWebsite ? (
                                <a
                                    href={officialWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid="university-card-official"
                                    onClick={() => sendEvent('university_official_click', { universityId: id, slug, website: officialWebsite })}
                                    className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                                >
                                    Official Site
                                </a>
                            ) : (
                                <span className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-400 dark:border-slate-800 dark:text-slate-500">
                                    Official N/A
                                </span>
                            )}
                            {admissionWebsite ? (
                                <a
                                    href={admissionWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    data-testid="university-card-apply"
                                    onClick={() => sendEvent('university_apply_click', { universityId: id, slug, admissionWebsite })}
                                    className="flex min-h-[44px] items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 py-3 text-[13px] font-bold text-white shadow-lg shadow-indigo-500/20 transition-transform hover:scale-[1.02] active:scale-[0.98] sm:col-span-2"
                                >
                                    Quick Apply
                                </a>
                            ) : (
                                <span className="flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-[13px] font-bold text-slate-400 dark:border-slate-800 dark:text-slate-500 sm:col-span-2">
                                    Apply N/A
                                </span>
                            )}
                        </>
                    ) : null}
                </div>
            </motion.article>
        );
    }

    return (
        <motion.article
            variants={variants}
            whileHover={animationLevel === 'off' ? undefined : { y: -4, transition: { duration: 0.2 } }}
            className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_14px_30px_rgba(15,23,42,0.10)] transition-all duration-300 hover:shadow-[0_20px_40px_rgba(15,23,42,0.14)] dark:border-slate-700/70 dark:bg-slate-900/95 dark:shadow-[0_14px_30px_rgba(4,12,24,0.26)] dark:hover:shadow-[0_20px_40px_rgba(4,12,24,0.30)] ${className}`}
            data-university-card-id={id}
            data-university-category={category}
            data-university-cluster={clusterGroup}
            data-university-card-variant="modern"
        >
            <div className="flex gap-3 p-4 pb-3">
                <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                    <UniversityLogo
                        name={name}
                        shortForm={shortForm}
                        logoUrl={logoUrl}
                        containerClassName="h-full w-full"
                        fallbackTextClassName="text-[0.95rem] sm:text-[1rem]"
                    />
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <h3 className={`${universityNameSizeClass} line-clamp-2 font-bold leading-tight text-slate-900 dark:text-white`} title={name}>
                                {name}
                            </h3>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 pb-1">
                                {/* Short form badge */}
                                <span className={`inline-flex items-center rounded-[6px] border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-200`}>
                                    {shortForm && shortForm !== 'N/A' ? shortForm : 'N/A'}
                                </span>

                                {/* Established badge */}
                                <span className="inline-flex items-center rounded-[6px] border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-400">
                                    EST. {establishedYear || 'N/A'}
                                </span>

                                {/* Category badge */}
                                <span className={`inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${(category && category !== 'N/A') ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300' : 'border-slate-200/60 bg-slate-50 text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-500'}`}>
                                    {category && category !== 'N/A' ? category : 'N/A'}
                                </span>

                                {/* Cluster badge */}
                                {clusterGroup && clusterGroup !== 'N/A' ? (
                                    clusterUrl ? (
                                        <Link
                                            to={clusterUrl}
                                            className="inline-flex items-center gap-1 rounded-[6px] border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-purple-700 transition hover:bg-purple-100 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300 dark:hover:bg-purple-500/20"
                                        >
                                            <Layers3 className="h-3 w-3" />
                                            <span className="max-w-[13rem] truncate">{clusterGroup}</span>
                                        </Link>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 rounded-[6px] border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-300">
                                            <Layers3 className="h-3 w-3" />
                                            <span className="max-w-[13rem] truncate">{clusterGroup}</span>
                                        </span>
                                    )
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-[6px] border border-slate-200/60 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-500">
                                        <Layers3 className="h-3 w-3 opacity-50" />
                                        <span>N/A</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {address && address !== 'N/A' && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{address}</span>
                            </span>
                        )}
                        {contactNumber && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <Phone className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{contactNumber}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-3 px-4 pb-4">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/80 dark:bg-slate-950/55">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">Application Window</div>
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-100">{appMeta.windowLabel}</div>
                        </div>
                        <DaysLeftChip daysLeft={appMeta.daysLeft} urgencyState={appMeta.urgencyState} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-500 dark:text-slate-400">{appMeta.deadlineLabel}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-100">
                            {nearestExam ? formatUniversityDate(nearestExam, 'en-GB', { day: '2-digit', month: 'short' }) : 'N/A'}
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    <UnitDateChip label="Science" value={university.scienceExamDate || university.examDateScience} />
                    <UnitDateChip label="Arts" value={university.artsExamDate || university.examDateArts} />
                    <UnitDateChip label="Business" value={university.businessExamDate || university.examDateBusiness} />
                </div>
                {mergedConfig.showExamCentersPreview && examCenterPreview.length > 0 && (
                    <p className="line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                        Centers: {examCenterPreview.join(', ')}
                    </p>
                )}
            </div>

            <div className="mt-auto grid grid-cols-3 gap-2 px-4 pb-4 pt-0">
                {actionRows.map((actionNode, index) => (
                    <span key={`${id}-action-${index}`} className="contents">
                        {actionNode}
                    </span>
                ))}
            </div>
        </motion.article>
    );
});

export default UniversityCard;

export function UniversityCardSkeleton() {
    return (
        <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-slate-200 dark:bg-slate-800" />
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
            </div>
            <div className="mt-4 h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="h-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
            </div>
        </div>
    );
}
