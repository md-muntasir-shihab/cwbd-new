import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ExternalLink, Globe } from 'lucide-react';
import CountdownChip, { daysUntil, urgencyTone } from '../CountdownChip';
import type { ApiUniversityCardPreview } from '../../../services/api';
import UniversityLogo from '../../university/UniversityLogo';
import { formatUniversityDate, pickText } from '../../../lib/universityPresentation';

interface DeadlineCardProps {
    university: ApiUniversityCardPreview;
}

const borderTone: Record<string, string> = {
    danger: 'border-red-500/45',
    warning: 'border-amber-500/45',
    success: 'border-emerald-500/35',
    muted: 'border-slate-700/70',
};

function ExamChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-950/55">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">{formatUniversityDate(value, 'en-GB', { day: '2-digit', month: 'short' })}</p>
        </div>
    );
}

export default function DeadlineCard({ university: uni }: DeadlineCardProps) {
    const endDate = uni.applicationEndDate || uni.applicationEnd;
    const startDate = uni.applicationStartDate || uni.applicationStart;
    const days = daysUntil(endDate);
    const tone = urgencyTone(days);
    const officialUrl = pickText(uni.website);
    const applyUrl = pickText(uni.admissionWebsite);
    const detailsUrl = `/universities/${uni.slug}`;

    return (
        <motion.article
            whileHover={{ y: -3 }}
            className={`flex w-[250px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-white/95 shadow-[0_14px_30px_rgba(15,23,42,0.10)] transition-shadow hover:shadow-[0_20px_40px_rgba(15,23,42,0.14)] dark:bg-slate-900/95 dark:shadow-[0_14px_30px_rgba(4,12,24,0.26)] dark:hover:shadow-[0_20px_40px_rgba(4,12,24,0.30)] sm:w-[270px] md:w-[290px] ${borderTone[tone]}`}
        >
            <div className="flex items-start gap-3 p-4 pb-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
                    <UniversityLogo
                        name={uni.name}
                        shortForm={uni.shortForm}
                        logoUrl={uni.logoUrl}
                        alt={uni.shortForm || uni.name}
                        containerClassName="h-full w-full"
                        imageClassName="h-full w-full object-contain p-1"
                        fallbackClassName="rounded-none"
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <Link to={detailsUrl} className="block">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 transition-colors hover:text-cyan-600 dark:text-white dark:hover:text-cyan-200">
                            {uni.name}
                        </h3>
                    </Link>
                    <p className="mt-1 truncate text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-300">
                        {pickText(uni.shortForm, 'N/A')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-200">
                            {uni.category}
                        </span>
                        {uni.clusterGroup && (
                            <span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-700 dark:text-purple-200">
                                {uni.clusterGroup}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="space-y-3 px-4 pb-4">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Apply by {formatUniversityDate(endDate, 'en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                    <CountdownChip targetDate={endDate} size="sm" />
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/80 dark:bg-slate-950/55">
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-slate-500">Application Window</span>
                        <span className="text-right font-semibold text-slate-700 dark:text-slate-100">
                            {formatUniversityDate(startDate, 'en-GB', { day: '2-digit', month: 'short' })} - {formatUniversityDate(endDate, 'en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <ExamChip label="Science" value={uni.examDateScience || uni.scienceExamDate || ''} />
                    <ExamChip label="Arts" value={uni.examDateArts || uni.artsExamDate || ''} />
                    <ExamChip label="Business" value={uni.examDateBusiness || uni.businessExamDate || ''} />
                </div>
            </div>

            <div className="mt-auto grid grid-cols-3 gap-2 px-4 pb-4">
                {applyUrl ? (
                    <a
                        href={applyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                        <ExternalLink className="h-3.5 w-3.5" /> Apply
                    </a>
                ) : (
                    <Link
                        to={detailsUrl}
                        className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                    >
                        <ExternalLink className="h-3.5 w-3.5" /> Details
                    </Link>
                )}
                {officialUrl ? (
                    <a
                        href={officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        <Globe className="h-3.5 w-3.5" /> Official
                    </a>
                ) : (
                    <span className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-400 dark:border-slate-700 dark:text-slate-500">
                        Official N/A
                    </span>
                )}
                <Link
                    to={detailsUrl}
                    className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                    Details
                </Link>
            </div>
        </motion.article>
    );
}
