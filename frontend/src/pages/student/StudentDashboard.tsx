import { useState, useEffect } from 'react';
import { SEO } from '../../components/common/SEO';
import { RefreshCw } from 'lucide-react';
import { useStudentDashboardFull, useDashboardRealtime } from '../../hooks/useStudentDashboard';
import type { DashboardSectionConfig } from '../../services/api';

import WelcomeHeader from '../../components/student/dashboard/WelcomeHeader';
import StudentEntryProfileCard from '../../components/student/dashboard/StudentEntryProfileCard';
import QuickStatusCards from '../../components/student/dashboard/QuickStatusCards';
import SmartProgressTracker from '../../components/student/dashboard/SmartProgressTracker';
import ProfileCompletion from '../../components/student/dashboard/ProfileCompletion';
import SubscriptionCard from '../../components/student/dashboard/SubscriptionCard';
import PaymentSummaryCard from '../../components/student/dashboard/PaymentSummaryCard';
import LiveAlertsSection from '../../components/student/dashboard/LiveAlertsSection';
import MyExamsSection from '../../components/student/dashboard/MyExamsSection';
import ResultsPerformance from '../../components/student/dashboard/ResultsPerformance';
import GamificationWidget from '../../components/student/dashboard/GamificationWidget';
import WeakTopicsSection from '../../components/student/dashboard/WeakTopicsSection';
import LeaderboardSnapshot from '../../components/student/dashboard/LeaderboardSnapshot';
import WatchlistSection from '../../components/student/dashboard/WatchlistSection';
import ResourcesForYou from '../../components/student/dashboard/ResourcesForYou';
import SupportShortcuts from '../../components/student/dashboard/SupportShortcuts';
import AccountSecurity from '../../components/student/dashboard/AccountSecurity';
import ImportantDates from '../../components/student/dashboard/ImportantDates';
import AchievementPopupCard from '../../components/ui/AchievementPopupCard';

function isSectionVisible(sections: Record<string, DashboardSectionConfig> | undefined, key: string): boolean {
    if (!sections || !sections[key]) return true;
    return sections[key].visible !== false;
}

function LoadingSkeleton() {
    return (
        <div className="space-y-4 max-w-7xl mx-auto animate-pulse">
            <div className="h-32 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900" />
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900" />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900" />
                <div className="h-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900" />
            </div>
            <div className="h-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900" />
        </div>
    );
}

export default function StudentDashboard() {
    const { data, isLoading, isError, isFetching } = useStudentDashboardFull();
    const [showCelebration, setShowCelebration] = useState(false);
    const [celebrationMessage, setCelebrationMessage] = useState('');
    const [celebrationScore, setCelebrationScore] = useState(0);
    const [celebrationRank, setCelebrationRank] = useState<number | null>(null);
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    useDashboardRealtime(Boolean(data?.config?.enableRealtime));

    useEffect(() => {
        if (!data?.config?.celebrationRules || !data?.results?.recent) return;

        const rules = data.config.celebrationRules;
        if (!rules.enabled || data.results.recent.length === 0) return;

        // Get most recent result
        const latestResult = data.results.recent[0];
        // Ensure there's a valid ID to track
        const resultId = (latestResult as any).id || (latestResult as any)._id || latestResult.examId;
        if (!resultId) return;

        // Check if rules apply based on mode
        let deservesCelebration = false;
        if (rules.ruleMode === 'score_or_rank' || rules.ruleMode === 'score_and_rank' || rules.ruleMode === 'custom') {
            if ((latestResult as any).percentage >= rules.minPercentage) deservesCelebration = true;
        }
        if (rules.ruleMode === 'score_or_rank' || rules.ruleMode === 'score_and_rank' || rules.ruleMode === 'custom') {
            if (latestResult.rank && latestResult.rank <= rules.maxRank) deservesCelebration = true;
        }

        if (!deservesCelebration) return;

        // Check tracking logic: prevent multiple showings for the same exam result today
        const todayStr = new Date().toISOString().split('T')[0];
        const trackingKey = 'dashboard_celebration_tracking';

        let trackingData: Record<string, unknown> = {};
        try {
            trackingData = JSON.parse(localStorage.getItem(trackingKey) || '{}');
            // Reset if different day
            if (trackingData.date !== todayStr) {
                trackingData = { date: todayStr, showsToday: 0, examsCelebrated: [] };
            }
        } catch {
            trackingData = { date: todayStr, showsToday: 0, examsCelebrated: [] };
        }

        const examsCelebrated = (trackingData.examsCelebrated as string[]) || [];

        // Already celebrated this specific result?
        if (examsCelebrated.includes(String(resultId))) return;

        // Exceeded daily limit?
        const showsToday = (trackingData.showsToday as number) || 0;
        if (rules.maxShowsPerDay > 0 && showsToday >= rules.maxShowsPerDay) return;

        // Pick random message
        const messages = rules.messageTemplates?.length ? rules.messageTemplates : ["Great job! You passed the exam!"];
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];

        // Update tracking
        trackingData.showsToday = showsToday + 1;
        examsCelebrated.push(String(resultId));
        trackingData.examsCelebrated = examsCelebrated;
        localStorage.setItem(trackingKey, JSON.stringify(trackingData));

        // Show popup
        setCelebrationMessage(randomMsg);
        setCelebrationScore((latestResult as any).percentage || 0);
        setCelebrationRank(latestResult.rank || null);
        setShowCelebration(true);
    }, [data?.config?.celebrationRules, data?.results?.recent]);

    if (isLoading) return <LoadingSkeleton />;

    if (isError || !data) {
        return (
            <div className="max-w-7xl mx-auto">
                <div className="rounded-2xl border border-red-300 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-5 text-red-700 dark:text-red-200 text-sm">
                    Failed to load dashboard data. Please try again later.
                </div>
            </div>
        );
    }

    const { sections, config } = data;

    return (
        <div className="space-y-5 max-w-7xl mx-auto px-1 sm:px-0 relative">
            <SEO title="Dashboard" description="Your personalized student dashboard on CampusWay. Track exams, results, progress and more." />
            {isFetching && (
                <div className="absolute top-2 right-2 z-10">
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                </div>
            )}

            {/* 1 — Welcome Header (always visible) */}
            <WelcomeHeader
                header={data.header}
                dailyFocus={data.dailyFocus}
                personalizedCtas={data.personalizedCtas}
                onProfileClick={() => setIsProfileOpen(true)}
            />

            {/* Profile Popup */}
            {isProfileOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsProfileOpen(false)} />
                    <div className="relative w-full max-w-4xl z-10 animate-in fade-in zoom-in-95 duration-200">
                        <div onClick={(e) => e.stopPropagation()}>
                            <StudentEntryProfileCard
                                header={data.header}
                                support={data.support}
                                onClose={() => setIsProfileOpen(false)}
                            />
                        </div>
                    </div>
                </div>
            )}
            {/* 2 — Quick Status Cards */}
            {isSectionVisible(sections, 'quickStatus') && (
                <QuickStatusCards status={data.quickStatus} />
            )}

            {/* 2b — Smart Progress Tracker */}
            {config.enableProgressCharts && (
                <SmartProgressTracker
                    header={data.header}
                    results={data.results}
                    exams={data.exams}
                />
            )}

            {/* 3 — Profile Completion */}
            {isSectionVisible(sections, 'profileCompletion') && (
                <ProfileCompletion
                    header={data.header}
                    gatingMessage={config.profileGatingMessage}
                />
            )}

            {/* 4 — Subscription */}
            {isSectionVisible(sections, 'subscription') && (
                <SubscriptionCard
                    subscription={data.subscription}
                    renewalCtaText={config.renewalCtaText}
                    renewalCtaUrl={config.renewalCtaUrl}
                />
            )}

            {/* 5 — Payment Summary */}
            {isSectionVisible(sections, 'payment') && (
                <PaymentSummaryCard payments={data.payments} />
            )}

            {/* 6 — Live Alerts & Notifications */}
            {isSectionVisible(sections, 'alerts') && (
                <LiveAlertsSection
                    alerts={data.alerts}
                    notifications={data.notifications}
                />
            )}

            {/* 7 — My Exams */}
            {isSectionVisible(sections, 'exams') && (
                <MyExamsSection
                    live={data.exams.live}
                    upcoming={data.exams.upcoming}
                    missed={data.exams.missed ?? []}
                    totalUpcoming={data.exams.totalUpcoming}
                    results={data.results}
                />
            )}

            {/* 8 — Results & Performance */}
            {isSectionVisible(sections, 'results') && (
                <ResultsPerformance
                    recent={data.results.recent}
                    progress={data.results.progress}
                    badges={data.results.badges}
                />
            )}

            {/* 8b — Gamification Widget */}
            {config.enableBadges && (
                <GamificationWidget results={data.results} />
            )}

            {/* 9 — Weak Topics */}
            {isSectionVisible(sections, 'weakTopics') && config.enableWeakTopics && (
                <WeakTopicsSection
                    topics={data.weakTopics.topics}
                    weakCount={data.weakTopics.weakCount ?? 0}
                    hasData={data.weakTopics.hasData}
                    resources={data.resources.items}
                />
            )}

            {/* 10 — Leaderboard */}
            {isSectionVisible(sections, 'leaderboard') && config.enableLeaderboard && (
                <LeaderboardSnapshot
                    topPerformers={data.leaderboard.topPerformers}
                    myRank={data.leaderboard.myRank}
                    myAvgPercentage={data.leaderboard.myAvgPercentage}
                />
            )}

            {/* 11 — Watchlist */}
            {isSectionVisible(sections, 'watchlist') && config.enableWatchlist && (
                <WatchlistSection watchlist={data.watchlist} />
            )}

            {/* 12 — Resources */}
            {isSectionVisible(sections, 'resources') && config.enableRecommendations && (
                <ResourcesForYou items={data.resources.items} />
            )}

            {/* 13 — Support Shortcuts */}
            {isSectionVisible(sections, 'support') && (
                <SupportShortcuts support={data.support} />
            )}

            {/* 14 — Account & Security */}
            {isSectionVisible(sections, 'accountSecurity') && (
                <AccountSecurity security={data.security} />
            )}

            {/* 15 — Important Dates */}
            {isSectionVisible(sections, 'importantDates') && (
                <ImportantDates dates={data.importantDates} />
            )}

            <AchievementPopupCard
                open={showCelebration}
                score={celebrationScore}
                rank={celebrationRank}
                message={celebrationMessage}
                onClose={() => setShowCelebration(false)}
                showForSec={data.config?.celebrationRules?.showForSec || 5}
                dismissible={data.config?.celebrationRules?.dismissible !== false}
            />
        </div>
    );
}
