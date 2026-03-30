import { Link } from 'react-router-dom';
import { Crown, UserCircle } from 'lucide-react';
import DashboardSection from './DashboardSection';
import type { StudentDashboardFullResponse } from '../../../services/api';

interface Props {
    header: StudentDashboardFullResponse['header'];
    dailyFocus: StudentDashboardFullResponse['dailyFocus'];
    personalizedCtas: StudentDashboardFullResponse['personalizedCtas'];
    onProfileClick?: () => void;
}

export default function WelcomeHeader({ header, dailyFocus, personalizedCtas, onProfileClick }: Props) {
    const isPremium = header.subscription?.isActive;
    const progressPct = Math.min(100, Math.max(0, header.profileCompletionPercentage));

    return (
        <DashboardSection delay={0}>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-indigo-50 via-white to-sky-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950 p-5 md:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={onProfileClick}
                            data-testid="student-entry-trigger"
                            aria-label="Open student access card"
                            className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full shrink-0 group transition-transform hover:scale-105 active:scale-95 cursor-pointer ${isPremium ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 shadow-[0_0_20px_rgba(251,191,36,0.3)]' : 'ring-2 ring-indigo-500/20 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 dark:ring-indigo-400/20 hover:ring-indigo-500/50 transition-all shadow-sm'}`}
                        >
                            {header.profilePicture ? (
                                <img src={header.profilePicture} alt={header.name} className="w-full h-full rounded-full object-cover" />
                            ) : (
                                <div className="w-full h-full rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                    <UserCircle className="w-8 h-8 text-slate-400" />
                                </div>
                            )}
                            {/* Hover overlay */}
                            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[10px] font-bold text-white uppercase tracking-wider hidden sm:block">View</span>
                            </div>
                            {isPremium && (
                                <div className="absolute -top-1 -right-1 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full p-1 shadow-lg border-2 border-white dark:border-slate-900 z-10">
                                    <Crown className="w-3 h-3 text-white" />
                                </div>
                            )}
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">{header.name}</h1>
                                {isPremium && (
                                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">
                                        {header.subscription.planName || 'Premium'}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{header.welcomeMessage}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-mono">
                                    ID: {header.userUniqueId || header.userId?.slice(-8)}
                                </span>
                                <span className="text-[10px] bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-semibold">
                                    Profile: {progressPct}%
                                </span>
                                {header.overallRank && (
                                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                                        Rank #{header.overallRank}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="sm:text-right shrink-0">
                        {(!header.isProfileEligible) ? (
                            <button onClick={onProfileClick} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-5 py-2.5 text-sm font-bold tracking-wide shadow-lg shadow-amber-500/20 transition-all hover:scale-105 active:scale-95 border border-white/20">
                                Complete Profile
                            </button>
                        ) : (
                            <Link to="/student/exams-hub" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600 text-white px-5 py-2.5 text-sm font-bold tracking-wide shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 border border-white/20">
                                Go to Exams
                            </Link>
                        )}
                    </div>
                </div>

                {dailyFocus.recommendedAction && (
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 italic">
                        Today&apos;s focus: {dailyFocus.recommendedAction}
                    </p>
                )}

                {personalizedCtas.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {personalizedCtas.map(cta => (
                            <Link
                                key={cta.id}
                                to={cta.url}
                                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition ${
                                    cta.variant === 'danger'
                                        ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20'
                                        : cta.variant === 'warning'
                                            ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/20'
                                            : cta.variant === 'success'
                                                ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                                                : 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                                }`}
                            >
                                {cta.text}
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </DashboardSection>
    );
}
