import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { daysUntil, urgencyTone } from '../CountdownChip';
import type { ApiUniversityCardPreview } from '../../../services/api';
import {
    formatUniversityDate,
    parseUniversityDate,
    pickText,
} from '../../../lib/universityPresentation';
import UniversityLogo from '../../university/UniversityLogo';

interface UpcomingExamCardProps {
    university: ApiUniversityCardPreview;
}

const accentTone: Record<string, string> = {
    danger: 'border-red-500/40 hover:border-red-500/60',
    warning: 'border-amber-500/40 hover:border-amber-500/60',
    success: 'border-emerald-500/30 hover:border-emerald-500/50',
    muted: 'border-slate-300/60 dark:border-slate-700/60',
};

const accentGradient: Record<string, string> = {
    danger: 'from-red-500 to-rose-500',
    warning: 'from-amber-500 to-orange-500',
    success: 'from-emerald-500 to-cyan-500',
    muted: 'from-slate-400 to-slate-500',
};

function pickNearestExam(uni: ApiUniversityCardPreview): string {
    const rows = [uni.examDateScience || uni.scienceExamDate, uni.examDateArts || uni.artsExamDate, uni.examDateBusiness || uni.businessExamDate];
    const usable = rows.map(v => parseUniversityDate(v)).filter((v): v is Date => Boolean(v)).sort((a, b) => a.getTime() - b.getTime());
    return usable[0]?.toISOString() || '';
}

function ExamChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200/60 bg-white/80 px-2.5 py-2 text-center dark:border-slate-700/60 dark:bg-slate-950/50">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</p>
            <p className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100">{formatUniversityDate(value, 'en-GB', { day: '2-digit', month: 'short' })}</p>
        </div>
    );
}

export default function UpcomingExamCard({ university: uni }: UpcomingExamCardProps) {
    const nearestExam = pickNearestExam(uni);
    const resolvedExamDate = uni.endedAt || nearestExam;
    const isHistorical = Boolean(uni.isHistorical && resolvedExamDate);
    const days = isHistorical ? 999 : daysUntil(resolvedExamDate);
    const tone = isHistorical ? 'muted' : urgencyTone(days);
    const applyUrl = pickText(uni.admissionWebsite);
    const detailsUrl = `/universities/${uni.slug}`;

    return (
        <motion.article
            whileHover={{ y: -4, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
            className={`group flex h-full w-[260px] shrink-0 snap-start flex-col overflow-hidden rounded-[1.5rem] border bg-white/95 shadow-[0_8px_30px_rgba(15,23,42,0.08)] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(15,23,42,0.14)] dark:bg-slate-900/95 dark:shadow-[0_8px_30px_rgba(4,12,24,0.2)] dark:hover:shadow-[0_20px_50px_rgba(4,12,24,0.3)] sm:w-[280px] ${accentTone[tone]}`}
        >
            {/* Accent line */}
            <div className={`h-[2px] w-full bg-gradient-to-r ${accentGradient[tone]} opacity-70 group-hover:opacity-100 transition-opacity`} />

            {/* Header */}
            <div className="flex items-start gap-3 p-4 pb-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm transition-transform duration-300 group-hover:scale-105 dark:border-slate-700/60 dark:bg-slate-950">
                    <UniversityLogo name={uni.name} shortForm={uni.shortForm} logoUrl={uni.logoUrl} alt={uni.shortForm || uni.name} containerClassName="h-full w-full" imageClassName="h-full w-full object-contain p-1" fallbackClassName="rounded-none" />
                </div>
                <div className="min-w-0 flex-1">
                    <Link to={detailsUrl} className="block">
                        <h3 className="truncate text-sm font-bold leading-snug text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-white dark:group-hover:text-cyan-300" title={uni.name}>{uni.name}</h3>
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-lg border border-sky-200/60 bg-sky-50/80 px-2 py-0.5 text-[10px] font-bold text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">{uni.category}</span>
                        {uni.clusterGroup && <span className="rounded-lg border border-purple-200/60 bg-purple-50/80 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-200">{uni.clusterGroup}</span>}
                    </div>
                </div>
            </div>

            {/* Exam info */}
            <div className="space-y-2.5 px-4 pb-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <CalendarDays className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
                        {isHistorical ? `Last exam ${formatUniversityDate(resolvedExamDate, 'en-GB', { day: '2-digit', month: 'short' })}` : `Next exam ${formatUniversityDate(resolvedExamDate, 'en-GB', { day: '2-digit', month: 'short' })}`}
                    </span>
                    <span className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${isHistorical ? 'border border-slate-200/70 bg-slate-100/80 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400' : 'border border-cyan-200/60 bg-cyan-50/80 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200'}`}>
                        {isHistorical ? 'Ended' : days === null ? 'TBD' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d left`}
                    </span>
                </div>

                {/* Application Window */}
                <div className="rounded-xl border border-slate-200/60 bg-slate-50/80 p-2.5 dark:border-slate-700/60 dark:bg-slate-950/40">
                    <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-400 dark:text-slate-500">Application Window</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                            {formatUniversityDate(uni.applicationStartDate || uni.applicationStart, 'en-GB', { day: '2-digit', month: 'short' })} – {formatUniversityDate(uni.applicationEndDate || uni.applicationEnd, 'en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                    </div>
                </div>

                {/* Exam Dates */}
                <div className="grid grid-cols-3 gap-1.5">
                    <ExamChip label="Science" value={uni.examDateScience || uni.scienceExamDate || ''} />
                    <ExamChip label="Humanities" value={uni.examDateArts || uni.artsExamDate || ''} />
                    <ExamChip label="Business" value={uni.examDateBusiness || uni.businessExamDate || ''} />
                </div>
            </div>

            {/* Actions — 2 buttons */}
            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-slate-100/80 p-4 pt-3 dark:border-slate-800/60">
                {applyUrl ? (
                    <a href={applyUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2 text-xs font-bold text-white shadow-md shadow-cyan-500/15 transition-all hover:shadow-lg hover:shadow-cyan-500/25">
                        <ExternalLink className="h-3.5 w-3.5" /> Apply Now
                    </a>
                ) : (
                    <Link to={detailsUrl} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2 text-xs font-bold text-white shadow-md shadow-cyan-500/15 transition-all hover:shadow-lg">
                        Apply Now
                    </Link>
                )}
                <Link to={detailsUrl} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200/80 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700/60 dark:text-slate-200 dark:hover:bg-slate-800">
                    Details
                </Link>
            </div>
        </motion.article>
    );
}
