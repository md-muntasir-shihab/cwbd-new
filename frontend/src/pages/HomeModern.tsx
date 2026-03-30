import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    Search, Megaphone, AlertCircle, RefreshCw,
    GraduationCap, CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck, Newspaper,
    BookOpen, BarChart3, Layers, Sparkles, ArrowRight
} from 'lucide-react';
import UniversityCard from '../components/university/UniversityCard';
import DeadlineBadge from '../components/university/DeadlineBadge';
import DaysLeftChip from '../components/university/DaysLeftChip';
import SectionHeader from '../components/home/SectionHeader';
import PremiumCarousel from '../components/home/PremiumCarousel';
import HomeSkeleton from '../components/home/SectionSkeleton';
import EmptySection from '../components/home/EmptySection';
import SectionErrorBoundary from '../components/home/SectionErrorBoundary';
import DeadlineCard from '../components/home/cards/DeadlineCard';
import UpcomingExamCard from '../components/home/cards/UpcomingExamCard';
import CampaignBannerCard from '../components/home/cards/CampaignBannerCard';
import OnlineExamCard from '../components/home/cards/OnlineExamCard';
import NewsCard from '../components/home/cards/NewsCard';
import ResourceCard from '../components/home/cards/ResourceCard';
import HomeSubscriptionPreviewCard from '../components/home/cards/HomeSubscriptionPreviewCard';
import PlanDetailsDrawer from '../components/subscription/PlanDetailsDrawer';
import {
    resolveSubscriptionPlanTarget,
    shouldOpenSubscriptionPlanTargetInNewTab,
} from '../components/subscription/subscriptionAction';
import { getHome, type HomeApiResponse, type ApiUniversityCardPreview, type ApiClusterCardPreview, type ApiCategoryCardPreview, type HomeExamWidgetItem, type ApiNews, type SubscriptionPlanPublic } from '../services/api';
import type { UrgencyState } from '../lib/apiClient';
import { daysUntilUniversityDate, parseUniversityDate } from '../lib/universityPresentation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface SectionOrderItem { id: string; title: string; order: number }
interface ContentBlockItem {
    _id: string; type: string; title?: string; body?: string;
    imageUrl?: string; ctaLabel?: string; ctaUrl?: string;
    placements: string[]; priority?: number; dismissible?: boolean;
}

const SECTION_ID_ALIAS_MAP: Record<string, string> = {
    search: 'search',
    searchbar: 'search',
    hero: 'hero',
    herobanner: 'hero',
    subscriptionbanner: 'subscription_banner',
    subscriptionplans: 'subscription_banner',
    planspreview: 'subscription_banner',
    campaignbanners: 'campaign_banners',
    campaignbanner: 'campaign_banners',
    featured: 'featured',
    featureduniversities: 'featured',
    featureduniversity: 'featured',
    categoryfilter: 'category_filter',
    categoryclusterfilter: 'category_filter',
    categoryandclusterfilter: 'category_filter',
    deadlines: 'deadlines',
    admissiondeadlines: 'deadlines',
    applicationdeadlines: 'deadlines',
    upcomingexams: 'upcoming_exams',
    upcomingexam: 'upcoming_exams',
    onlineexampreview: 'online_exam_preview',
    onlineexamspreview: 'online_exam_preview',
    onlineexam: 'online_exam_preview',
    news: 'news',
    latestnews: 'news',
    newspreview: 'news',
    resources: 'resources',
    resource: 'resources',
    resourcespreview: 'resources',
    resourcepreview: 'resources',
    contentblocks: 'content_blocks',
    contentblock: 'content_blocks',
    globalcta: 'content_blocks',
    globalcontentblock: 'content_blocks',
    globalctacontentblock: 'content_blocks',
    stats: 'stats',
    quickstats: 'stats',
};

function normalizeSectionId(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = raw.toLowerCase();
    if (SECTION_ID_ALIAS_MAP[direct]) return SECTION_ID_ALIAS_MAP[direct];
    const collapsed = direct.replace(/[^a-z0-9]+/g, '');
    return SECTION_ID_ALIAS_MAP[collapsed] || direct.replace(/[^a-z0-9]+/g, '_');
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function matchesCategoryAndCluster(
    uni: ApiUniversityCardPreview,
    selectedCategory: string,
    selectedCluster: string,
): boolean {
    if (selectedCategory && uni.category !== selectedCategory) return false;
    if (selectedCluster && uni.clusterGroup !== selectedCluster) return false;
    return true;
}

function matchesClusterCard(
    cluster: ApiClusterCardPreview,
    selectedCategory: string,
    selectedCluster: string,
    search: string,
): boolean {
    if (selectedCategory && !cluster.categories.includes(selectedCategory)) return false;
    if (selectedCluster && cluster.name !== selectedCluster) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return cluster.name.toLowerCase().includes(term) || cluster.categories.some((item) => item.toLowerCase().includes(term));
}

function formatMetaDate(value: string): string {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function buildCategoryFallbackText(name: string): string {
    const cleaned = String(name || '').replace(/\([^)]*\)/g, ' ').trim();
    if (!cleaned) return 'CAT';
    const parts = cleaned
        .split(/[^A-Za-z0-9&]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => !['of', 'the', 'and', 'for'].includes(part.toLowerCase()));
    if (parts.length === 0) return 'CAT';
    if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase();
    return parts
        .map((part) => (part === '&' ? '&' : part[0]))
        .join('')
        .slice(0, 4)
        .toUpperCase();
}

function buildCategoryUrgency(value: string): { urgencyState: UrgencyState; daysLeft: number | null } {
    const parsed = parseUniversityDate(value);
    if (!parsed) return { urgencyState: 'unknown', daysLeft: null };
    const daysLeft = daysUntilUniversityDate(parsed);
    if (daysLeft === null) return { urgencyState: 'unknown', daysLeft: null };
    if (daysLeft < 0) return { urgencyState: 'closed', daysLeft: 0 };
    if (daysLeft <= 7) return { urgencyState: 'closing_soon', daysLeft };
    return { urgencyState: 'open', daysLeft };
}

function buildApplicationUrgency(
    startValue: string,
    endValue: string,
): { urgencyState: UrgencyState; daysLeft: number | null; windowLabel: string; endLabel: string } {
    const startDate = parseUniversityDate(startValue);
    const endDate = parseUniversityDate(endValue);
    if (!startDate || !endDate) {
        return {
            urgencyState: 'unknown',
            daysLeft: null,
            windowLabel: 'Application window: N/A',
            endLabel: 'Apply by N/A',
        };
    }

    const now = new Date();
    const nowTime = now.getTime();
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    const daysLeft = daysUntilUniversityDate(endDate);

    if (nowTime < startTime) {
        return {
            urgencyState: 'upcoming',
            daysLeft,
            windowLabel: `${formatMetaDate(startValue)} - ${formatMetaDate(endValue)}`,
            endLabel: `Starts ${formatMetaDate(startValue)}`,
        };
    }

    if (nowTime > endTime) {
        return {
            urgencyState: 'closed',
            daysLeft: 0,
            windowLabel: `${formatMetaDate(startValue)} - ${formatMetaDate(endValue)}`,
            endLabel: `Closed ${formatMetaDate(endValue)}`,
        };
    }

    return {
        urgencyState: daysLeft !== null && daysLeft <= 7 ? 'closing_soon' : 'open',
        daysLeft,
        windowLabel: `${formatMetaDate(startValue)} - ${formatMetaDate(endValue)}`,
        endLabel: `Apply by ${formatMetaDate(endValue)}`,
    };
}

function UnitDateChip({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2 dark:border-slate-700/80 dark:bg-slate-950/55">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">{label}</p>
            <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-slate-100">{formatMetaDate(value)}</p>
        </div>
    );
}

function CompactMetaLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500 dark:text-slate-500">{label}</span>
            <span className="text-right font-semibold text-slate-700 dark:text-slate-200">{value}</span>
        </div>
    );
}

function normalizeHomeSubscriptionPlan(raw: Record<string, unknown>): SubscriptionPlanPublic {
    const priceBDT = Math.max(0, Number(raw.priceBDT ?? raw.price ?? 0) || 0);
    const durationDays = Math.max(1, Number(raw.durationDays ?? raw.durationValue ?? 30) || 30);
    const durationValue = Math.max(1, Number(raw.durationValue ?? durationDays) || durationDays);
    const durationUnit = String(raw.durationUnit || 'days') === 'months' ? 'months' : 'days';
    const visibleFeatures = Array.isArray(raw.visibleFeatures) && raw.visibleFeatures.length
        ? raw.visibleFeatures.map((item) => String(item || '').trim()).filter(Boolean)
        : (Array.isArray(raw.features) ? raw.features.map((item) => String(item || '').trim()).filter(Boolean) : []);

    return {
        _id: String(raw._id || raw.id || ''),
        id: String(raw.id || raw._id || ''),
        code: String(raw.code || ''),
        slug: String(raw.slug || raw.code || ''),
        name: String(raw.name || 'Subscription Plan'),
        shortTitle: String(raw.shortTitle || raw.name || 'Subscription Plan'),
        shortLabel: String(raw.shortLabel || raw.shortTitle || raw.name || 'Subscription Plan'),
        tagline: String(raw.tagline || ''),
        type: String(raw.type || (priceBDT <= 0 ? 'free' : 'paid')) === 'free' ? 'free' : 'paid',
        planType: String(raw.planType || (priceBDT <= 0 ? 'free' : 'paid')) as SubscriptionPlanPublic['planType'],
        priceBDT,
        oldPrice: raw.oldPrice === null || raw.oldPrice === undefined ? null : Number(raw.oldPrice || 0),
        currency: String(raw.currency || 'BDT'),
        billingCycle: (String(raw.billingCycle || 'monthly') as SubscriptionPlanPublic['billingCycle']) || 'monthly',
        durationDays,
        durationMonths: raw.durationMonths === null || raw.durationMonths === undefined ? null : Number(raw.durationMonths || 0),
        durationValue,
        durationUnit,
        durationLabel: String(raw.durationLabel || (durationUnit === 'months' ? `${durationValue} month${durationValue === 1 ? '' : 's'}` : `${durationDays} day${durationDays === 1 ? '' : 's'}`)),
        validityLabel: String(raw.validityLabel || raw.durationLabel || ''),
        price: Number(raw.price ?? priceBDT),
        isFree: Boolean(raw.isFree ?? priceBDT <= 0),
        isPaid: Boolean(raw.isPaid ?? priceBDT > 0),
        bannerImageUrl: raw.bannerImageUrl ? String(raw.bannerImageUrl) : null,
        shortDescription: String(raw.shortDescription || raw.description || ''),
        fullDescription: String(raw.fullDescription || raw.description || raw.shortDescription || ''),
        description: String(raw.description || raw.fullDescription || raw.shortDescription || ''),
        features: visibleFeatures,
        visibleFeatures,
        fullFeatures: Array.isArray(raw.fullFeatures) ? raw.fullFeatures.map((item) => String(item || '').trim()).filter(Boolean) : visibleFeatures,
        excludedFeatures: Array.isArray(raw.excludedFeatures) ? raw.excludedFeatures.map((item) => String(item || '').trim()).filter(Boolean) : [],
        tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item || '').trim()).filter(Boolean) : [],
        includedModules: Array.isArray(raw.includedModules) ? raw.includedModules.map((item) => String(item || '').trim()).filter(Boolean) : [],
        recommendedFor: String(raw.recommendedFor || ''),
        comparisonNote: String(raw.comparisonNote || ''),
        supportLevel: String(raw.supportLevel || 'basic') as SubscriptionPlanPublic['supportLevel'],
        accessScope: String(raw.accessScope || ''),
        renewalNotes: String(raw.renewalNotes || ''),
        policyNote: String(raw.policyNote || ''),
        faqItems: Array.isArray(raw.faqItems) ? raw.faqItems as Array<{ question: string; answer: string }> : [],
        themeKey: String(raw.themeKey || 'basic') as SubscriptionPlanPublic['themeKey'],
        badgeText: String(raw.badgeText || ''),
        highlightText: String(raw.highlightText || ''),
        allowsExams: Boolean(raw.allowsExams ?? true),
        allowsPremiumResources: Boolean(raw.allowsPremiumResources ?? false),
        allowsSMSUpdates: Boolean(raw.allowsSMSUpdates ?? false),
        allowsEmailUpdates: Boolean(raw.allowsEmailUpdates ?? true),
        allowsGuardianAlerts: Boolean(raw.allowsGuardianAlerts ?? false),
        allowsSpecialGroups: Boolean(raw.allowsSpecialGroups ?? false),
        dashboardPrivileges: Array.isArray(raw.dashboardPrivileges) ? raw.dashboardPrivileges.map((item) => String(item || '').trim()).filter(Boolean) : [],
        maxAttempts: raw.maxAttempts === null || raw.maxAttempts === undefined ? null : Number(raw.maxAttempts || 0),
        enabled: Boolean(raw.enabled ?? raw.isActive ?? true),
        isActive: Boolean(raw.isActive ?? raw.enabled ?? true),
        isArchived: Boolean(raw.isArchived ?? false),
        isFeatured: Boolean(raw.isFeatured ?? false),
        showOnHome: Boolean(raw.showOnHome ?? false),
        showOnPricingPage: Boolean(raw.showOnPricingPage ?? true),
        displayOrder: Number(raw.displayOrder ?? raw.sortOrder ?? raw.priority ?? 100),
        priority: Number(raw.priority ?? raw.displayOrder ?? raw.sortOrder ?? 100),
        sortOrder: Number(raw.sortOrder ?? raw.displayOrder ?? raw.priority ?? 100),
        ctaLabel: String(raw.ctaLabel || raw.contactCtaLabel || 'Subscribe Now'),
        ctaUrl: String(raw.ctaUrl || raw.contactCtaUrl || '/contact'),
        ctaMode: String(raw.ctaMode || 'contact') as SubscriptionPlanPublic['ctaMode'],
        contactCtaLabel: String(raw.contactCtaLabel || raw.ctaLabel || 'Contact to Subscribe'),
        contactCtaUrl: String(raw.contactCtaUrl || raw.ctaUrl || '/contact'),
        createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
        updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    };
}

/* ------------------------------------------------------------------ */
/*  Shared UI primitives                                               */
/* ------------------------------------------------------------------ */
const fadeInUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0 } };

function SectionWrap({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <motion.section
            variants={fadeInUp}
            initial="hidden"
            animate="show"
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={`w-full ${className}`}
        >
            {children}
        </motion.section>
    );
}

function SmartActionLink({ href, children, className = '' }: {
    href: string; children: ReactNode; className?: string;
}) {
    const isExternal = /^https?:\/\//.test(href);
    if (isExternal) {
        return (
            <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {children}
            </a>
        );
    }
    return <Link to={href} className={className}>{children}</Link>;
}

function SectionRenderer({ renderer }: { renderer: () => ReactNode }) {
    return <>{renderer()}</>;
}

function ClusterPreviewCard({ cluster }: { cluster: ApiClusterCardPreview }) {
    const fallbackText = buildCategoryFallbackText(cluster.name);
    const centersText = cluster.examCentersPreview.slice(0, 3).join(', ');
    const appMeta = buildApplicationUrgency(cluster.applicationStartDate, cluster.applicationEndDate);

    return (
        <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_14px_30px_rgba(15,23,42,0.10)] dark:border-slate-700/70 dark:bg-slate-900/95 dark:shadow-[0_14px_30px_rgba(4,12,24,0.26)]">
            <div className="flex items-start gap-3 p-3 pb-2.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-300">
                    {fallbackText}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Cluster</p>
                            <Link to={`/universities/cluster/${cluster.slug}`} className="mt-1 block line-clamp-2 text-sm font-semibold leading-snug text-slate-900 transition-colors hover:text-cyan-600 dark:text-white dark:hover:text-cyan-200">
                                {cluster.name}
                            </Link>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-cyan-700 dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-200">
                            {cluster.memberCount} members
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 px-3 pb-2">
                {cluster.categories.slice(0, 2).map((category) => (
                    <span
                        key={category}
                        className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-200"
                    >
                        {category}
                    </span>
                ))}
            </div>

            <div className="space-y-2 px-3 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                    <DaysLeftChip daysLeft={appMeta.daysLeft} urgencyState={appMeta.urgencyState} />
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{appMeta.endLabel}</span>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/90 p-2.5 dark:border-slate-700/80 dark:bg-slate-950/55">
                    <CompactMetaLine label="Application Window" value={appMeta.windowLabel} />
                    <div className="mt-2 grid grid-cols-1 gap-1.5">
                        <CompactMetaLine label="Nearest Deadline" value={formatMetaDate(cluster.nearestDeadline)} />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <UnitDateChip label="Science" value={cluster.scienceExamDate} />
                    <UnitDateChip label="Arts" value={cluster.artsExamDate} />
                    <UnitDateChip label="Business" value={cluster.businessExamDate} />
                </div>
            </div>

            <div className="mt-auto border-t border-slate-200/80 px-3 py-2.5 dark:border-slate-700/80">
                <p className="text-xs text-slate-500 dark:text-slate-400">{centersText ? `Centers: ${centersText}` : 'Centers: N/A'}</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                    {cluster.admissionWebsite ? (
                        <a
                            href={cluster.admissionWebsite}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[42px] items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:opacity-90"
                        >
                            Apply Now
                        </a>
                    ) : (
                        <Link
                            to={`/universities/cluster/${cluster.slug}`}
                            className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                        >
                            View Cluster
                        </Link>
                    )}
                    <Link
                        to={`/universities/cluster/${cluster.slug}`}
                        className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                        Details
                    </Link>
                </div>
            </div>
        </article>
    );
}

function CategoryPreviewCard({ category }: { category: ApiCategoryCardPreview }) {
    const fallbackText = buildCategoryFallbackText(category.name);
    const categoryUrgency = buildCategoryUrgency(category.nearestDeadline);
    const clusterCount = category.clusterGroups.length;

    return (
        <Link
            to={`/universities/category/${category.slug}`}
            className="group relative flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/95 shadow-[0_14px_30px_rgba(15,23,42,0.10)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.14)] dark:border-slate-700/70 dark:bg-slate-900/95 dark:shadow-[0_14px_30px_rgba(4,12,24,0.26)] dark:hover:shadow-[0_20px_40px_rgba(4,12,24,0.30)]"
            data-testid="highlighted-category-card"
        >
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-cyan-500/10 via-sky-500/10 to-transparent dark:from-cyan-500/8 dark:via-sky-500/6" />
            <div className="relative flex h-full flex-col p-4">
                <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase tracking-[0.18em] text-cyan-600 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-300">
                        <div className="flex h-full w-full items-center justify-center px-1 text-center">
                            {fallbackText}
                        </div>
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-500">Highlighted Category</p>
                                <h3 className="mt-1 line-clamp-2 text-base font-semibold leading-snug text-slate-900 dark:text-white" title={category.name}>
                                    {category.name}
                                </h3>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-cyan-700 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-cyan-200">
                                {category.memberCount} universities
                            </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-200">
                                Home Highlight
                            </span>
                            {category.badgeText ? (
                                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
                                    {category.badgeText}
                                </span>
                            ) : null}
                            <DeadlineBadge urgencyState={categoryUrgency.urgencyState} />
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <DaysLeftChip daysLeft={categoryUrgency.daysLeft} urgencyState={categoryUrgency.urgencyState} />
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Nearest deadline {formatMetaDate(category.nearestDeadline)}</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/80 dark:bg-slate-950/55">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Nearest Exam</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{formatMetaDate(category.nearestExam)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/80 dark:bg-slate-950/55">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">Coverage</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{category.memberCount} universities</p>
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{clusterCount} clusters linked</p>
                    </div>
                </div>

                {clusterCount > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {category.clusterGroups.slice(0, 3).map((group) => (
                            <span key={group} className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[11px] font-semibold text-purple-700 dark:text-purple-200">
                                {group}
                            </span>
                        ))}
                    </div>
                )}

                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-700 transition-colors group-hover:text-cyan-600 dark:text-cyan-200 dark:group-hover:text-cyan-100">
                    Explore category
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </div>
            </div>
        </Link>
    );
}

/* ------------------------------------------------------------------ */
/*  Default section order                                              */
/* ------------------------------------------------------------------ */
const DEFAULT_ORDER: SectionOrderItem[] = [
    { id: 'search', title: 'Search', order: 0 },
    { id: 'hero', title: 'Hero Banner', order: 1 },
    { id: 'subscription_banner', title: 'Subscription Preview', order: 2 },
    { id: 'campaign_banners', title: 'Campaign Banners', order: 3 },
    { id: 'featured', title: 'Featured Universities', order: 4 },
    { id: 'category_filter', title: 'Category Filter', order: 5 },
    { id: 'deadlines', title: 'Admission Deadlines', order: 6 },
    { id: 'upcoming_exams', title: 'Upcoming Exams', order: 7 },
    { id: 'online_exam_preview', title: 'Online Exam Preview', order: 8 },
    { id: 'news', title: 'Latest News', order: 9 },
    { id: 'resources', title: 'Resources', order: 10 },
    { id: 'content_blocks', title: 'Content Blocks', order: 11 },
    { id: 'stats', title: 'Quick Stats', order: 12 },
];

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function HomeModern() {
    const navigate = useNavigate();
    /* ---------- data ---------- */
    const { data, isLoading, isError } = useQuery<HomeApiResponse>({
        queryKey: ['home'],
        queryFn: () => getHome().then(r => r.data),
        staleTime: 60_000,
        refetchInterval: 90_000,
    });

    /* ---------- state ---------- */
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedCluster, setSelectedCluster] = useState('');
    const categoryScrollRef = useRef<HTMLDivElement | null>(null);
    const clusterScrollRef = useRef<HTMLDivElement | null>(null);
    const [categoryScrollState, setCategoryScrollState] = useState({ canLeft: false, canRight: false });
    const [clusterScrollState, setClusterScrollState] = useState({ canLeft: false, canRight: false });

    /* ---------- derived ---------- */
    const hs = data?.homeSettings;
    const categories = data?.universityCategories ?? [];
    const uniSettings = data?.uniSettings;

    /* Highlighted categories sorted first */
    const sortedCategories = useMemo(() => {
        const highlighted = data?.universityDashboardData?.highlightedCategories ?? [];
        return [...categories].sort((a, b) => {
            const aHl = highlighted.find(h => h.category === a.categoryName);
            const bHl = highlighted.find(h => h.category === b.categoryName);
            if (aHl && !bHl) return -1;
            if (!aHl && bHl) return 1;
            if (aHl && bHl) return aHl.order - bHl.order;
            return 0;
        });
    }, [categories, data?.universityDashboardData?.highlightedCategories]);

    const currentClusters = useMemo(() => {
        if (!selectedCategory) return [];
        const cat = categories.find(c => c.categoryName === selectedCategory);
        return cat?.clusterGroups ?? [];
    }, [selectedCategory, categories]);

    /* Filtered university lists */
    const filteredFeatured = useMemo(() => {
        const sl = search.toLowerCase().trim();
        return (data?.featuredUniversities ?? []).filter(u =>
            matchesCategoryAndCluster(u, selectedCategory, selectedCluster)
            && (!sl || u.name.toLowerCase().includes(sl) || u.shortForm?.toLowerCase().includes(sl)),
        );
    }, [data?.featuredUniversities, selectedCategory, selectedCluster, search]);

    const filteredFeaturedClusters = useMemo(() => (
        (data?.featuredClusters ?? []).filter((cluster) => matchesClusterCard(cluster, selectedCategory, selectedCluster, search))
    ), [data?.featuredClusters, search, selectedCategory, selectedCluster]);
    const filteredFeaturedCategories = useMemo(() => {
        const term = search.toLowerCase().trim();
        return (data?.featuredCategories ?? []).filter((category) => {
            if (selectedCluster) return false;
            if (selectedCategory && category.name !== selectedCategory) return false;
            if (!term) return true;
            return category.name.toLowerCase().includes(term)
                || category.clusterGroups.some((group) => group.toLowerCase().includes(term));
        });
    }, [data?.featuredCategories, search, selectedCategory, selectedCluster]);

    const filteredDeadline = useMemo(() => {
        const sl = search.toLowerCase().trim();
        return (data?.deadlineUniversities ?? []).filter(u =>
            matchesCategoryAndCluster(u, selectedCategory, selectedCluster)
            && (!sl || u.name.toLowerCase().includes(sl) || u.shortForm?.toLowerCase().includes(sl))
        );
    }, [data?.deadlineUniversities, selectedCategory, selectedCluster, search]);
    const filteredDeadlineClusters = useMemo(() => (
        (data?.deadlineClusters ?? []).filter((cluster) => matchesClusterCard(cluster, selectedCategory, selectedCluster, search))
    ), [data?.deadlineClusters, search, selectedCategory, selectedCluster]);
    const filteredUpcoming = useMemo(() => {
        const sl = search.toLowerCase().trim();
        return (data?.upcomingExamUniversities ?? []).filter(u =>
            matchesCategoryAndCluster(u, selectedCategory, selectedCluster)
            && (!sl || u.name.toLowerCase().includes(sl) || u.shortForm?.toLowerCase().includes(sl))
        );
    }, [data?.upcomingExamUniversities, selectedCategory, selectedCluster, search]);
    const filteredUpcomingClusters = useMemo(() => (
        (data?.upcomingExamClusters ?? []).filter((cluster) => matchesClusterCard(cluster, selectedCategory, selectedCluster, search))
    ), [data?.upcomingExamClusters, search, selectedCategory, selectedCluster]);

    const sectionOrder = useMemo<SectionOrderItem[]>(() => {
        if (data?.sectionOrder && data.sectionOrder.length > 0) {
            const normalized = data.sectionOrder
                .map((item) => {
                    const id = normalizeSectionId(item.id);
                    if (!id) return null;
                    return {
                        id,
                        title: String(item.title || id),
                        order: Number.isFinite(Number(item.order)) ? Number(item.order) : 0,
                    };
                })
                .filter(Boolean) as SectionOrderItem[];
            if (normalized.length > 0) {
                return normalized.sort((a, b) => a.order - b.order);
            }
        }
        return DEFAULT_ORDER;
    }, [data?.sectionOrder]);

    const contentBlocks = data?.contentBlocksForHome ?? [];
    const featuredNewsItems = data?.featuredNewsItems ?? data?.featuredNews ?? [];
    const newsItems = data?.newsPreviewItems ?? data?.newsPreview ?? [];
    const resourceItems = data?.resourcePreviewItems ?? data?.resourcesPreview ?? [];
    const [activeSubscriptionPlan, setActiveSubscriptionPlan] = useState<SubscriptionPlanPublic | null>(null);
    const subscriptionPlans = useMemo(
        () => (data?.subscriptionPlans ?? []).map((plan) => normalizeHomeSubscriptionPlan(plan as unknown as Record<string, unknown>)),
        [data?.subscriptionPlans]
    );
    const visibleSubscriptionPlans = useMemo(
        () => subscriptionPlans.slice(0, 3),
        [subscriptionPlans]
    );
    const campaignBanners = data?.campaignBannersActive ?? [];
    const onlineExams = data?.onlineExamsPreview;
    const stats = data?.stats;
    const cardConfig = hs?.universityCardConfig;
    const animLevel = hs?.ui?.animationLevel ?? 'minimal';
    const compactCarouselCardClass = 'snap-start shrink-0 w-[264px] sm:w-[286px] md:w-[308px]';

    const handleHorizontalWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        const container = event.currentTarget;
        if (container.scrollWidth <= container.clientWidth) return;
        const dominantDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        if (!dominantDelta) return;
        container.scrollLeft += dominantDelta;
        event.preventDefault();
    };

    const scrollChipRow = (target: 'category' | 'cluster', direction: 'left' | 'right') => {
        const ref = target === 'category' ? categoryScrollRef : clusterScrollRef;
        const el = ref.current;
        if (!el) return;
        const amount = Math.max(180, Math.floor(el.clientWidth * 0.65));
        el.scrollBy({ left: direction === 'right' ? amount : -amount, behavior: 'smooth' });
        window.setTimeout(() => {
            updateScrollControls(target);
        }, 240);
    };

    const updateScrollControls = useCallback((target: 'category' | 'cluster') => {
        const el = target === 'category' ? categoryScrollRef.current : clusterScrollRef.current;
        const next = {
            canLeft: Boolean(el && el.scrollLeft > 4),
            canRight: Boolean(el && el.scrollLeft + el.clientWidth < el.scrollWidth - 4),
        };
        if (target === 'category') {
            setCategoryScrollState((prev) => (
                prev.canLeft === next.canLeft && prev.canRight === next.canRight ? prev : next
            ));
            return;
        }
        setClusterScrollState((prev) => (
            prev.canLeft === next.canLeft && prev.canRight === next.canRight ? prev : next
        ));
    }, []);

    useEffect(() => {
        const categoryEl = categoryScrollRef.current;
        const clusterEl = clusterScrollRef.current;

        const onCategoryScroll = () => updateScrollControls('category');
        const onClusterScroll = () => updateScrollControls('cluster');
        const onResize = () => {
            updateScrollControls('category');
            updateScrollControls('cluster');
        };

        updateScrollControls('category');
        updateScrollControls('cluster');

        categoryEl?.addEventListener('scroll', onCategoryScroll, { passive: true });
        clusterEl?.addEventListener('scroll', onClusterScroll, { passive: true });
        window.addEventListener('resize', onResize);

        return () => {
            categoryEl?.removeEventListener('scroll', onCategoryScroll);
            clusterEl?.removeEventListener('scroll', onClusterScroll);
            window.removeEventListener('resize', onResize);
        };
    }, [currentClusters.length, selectedCategory, sortedCategories.length, updateScrollControls]);

    /* ================================================================ */
    /*  SECTION RENDERERS                                                */
    /* ================================================================ */

    /* 1 ─ Search */
    function renderSearch() {
        if (hs?.hero?.showSearch === false) return null;
        const placeholder = hs?.hero?.searchPlaceholder || 'Search universities, news, exams…';
        return (
            <div className="sticky top-0 z-30 bg-white/70 dark:bg-gray-950/70 backdrop-blur-2xl border-b border-gray-200/40 dark:border-gray-800/40 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
                <div className="max-w-3xl mx-auto px-4 py-3.5">
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400 group-focus-within:text-[var(--primary)] transition-colors duration-300" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={placeholder}
                            aria-label="Search universities, news, exams and resources"
                            className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white/60 dark:bg-gray-800/60 backdrop-blur-md text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 border border-gray-200/60 dark:border-gray-700/60 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 focus:bg-white dark:focus:bg-gray-800/80 outline-none transition-all duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.04)] focus:shadow-[0_4px_20px_rgba(13,95,219,0.12)]"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
                                aria-label="Clear search"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    /* 2 ─ Hero Banner */
    function renderHero() {
        if (!hs?.sectionVisibility?.hero) return null;
        const hero = hs.hero;
        if (!hero) return null;
        return (
            <SectionWrap>
                <div className="relative overflow-hidden rounded-2xl md:rounded-3xl text-white mx-4 md:mx-0 min-h-[280px] md:min-h-[340px]" style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #4338ca 40%, #7c3aed 70%, #a855f7 100%)', backgroundSize: '200% 200%', animation: 'gradientShift 8s ease-in-out infinite' }}>
                    {/* Decorative floating orbs */}
                    <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/[0.07] blur-2xl animate-float-slow pointer-events-none" />
                    <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-purple-300/[0.08] blur-2xl animate-float-slow-reverse pointer-events-none" />
                    <div className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full bg-cyan-300/[0.06] blur-xl animate-float-slow pointer-events-none" style={{ animationDelay: '2s' }} />
                    {/* Grid pattern overlay */}
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
                    {hero.heroImageUrl && (
                        <img src={hero.heroImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-15 mix-blend-overlay" />
                    )}
                    <div className="relative z-10 px-6 py-12 md:px-14 md:py-16 max-w-3xl">
                        {hero.pillText && (
                            <motion.span
                                initial={{ opacity: 0, y: -12, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 text-xs font-semibold rounded-full bg-white/15 backdrop-blur-md border border-white/20 shadow-lg shadow-black/10"
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                {hero.pillText}
                            </motion.span>
                        )}
                        <motion.h1
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                            className="font-heading text-2xl md:text-4xl lg:text-5xl font-extrabold leading-[1.1] mb-4 drop-shadow-md"
                        >
                            {hero.title}
                        </motion.h1>
                        {hero.subtitle && (
                            <motion.p
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                                className="text-sm md:text-base text-white/80 mb-8 max-w-lg leading-relaxed"
                            >
                                {hero.subtitle}
                            </motion.p>
                        )}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-wrap gap-3"
                        >
                            {hero.primaryCTA?.label && hero.primaryCTA?.url && (
                                <SmartActionLink href={hero.primaryCTA.url}
                                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-[var(--primary)] font-bold text-sm hover:bg-blue-50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                                    {hero.primaryCTA.label}
                                </SmartActionLink>
                            )}
                            {hero.secondaryCTA?.label && hero.secondaryCTA?.url && (
                                <SmartActionLink href={hero.secondaryCTA.url}
                                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-white/30 text-white font-semibold text-sm hover:bg-white/15 hover:border-white/50 transition-all duration-300 backdrop-blur-sm">
                                    {hero.secondaryCTA.label}
                                </SmartActionLink>
                            )}
                        </motion.div>
                    </div>
                </div>
            </SectionWrap>
        );
    }

    /* 3 ─ Campaign Banners */
    function renderCampaignBanners() {
        if (hs?.sectionVisibility?.adsSection === false) return null;
        if (!campaignBanners.length) return null;
        if (hs?.campaignBanners && hs.campaignBanners.enabled === false) return null;
        const cbConfig = hs?.campaignBanners;
        return (
            <SectionWrap>
                <div className="px-4 md:px-0">
                    <SectionHeader
                        title={cbConfig?.title || 'Promotions & Campaigns'}
                        subtitle={cbConfig?.subtitle || 'Latest offers and announcements'}
                        icon={Megaphone}
                    />
                    <PremiumCarousel autoRotate autoRotateInterval={cbConfig?.autoRotateInterval || 5000}>
                        {campaignBanners.map(banner => (
                            <CampaignBannerCard key={banner._id} banner={banner} />
                        ))}
                    </PremiumCarousel>
                </div>
            </SectionWrap>
        );
    }

    /* 4 ─ Featured Universities */
    function renderFeatured() {
        const hasFeaturedContent = filteredFeaturedCategories.length > 0 || filteredFeatured.length > 0;
        return (
            <SectionWrap>
                <div className="space-y-6 px-4 md:px-0" data-testid="home-featured-section">
                    <div>
                        <SectionHeader title="Featured Universities" subtitle="Hand-picked for you" icon={GraduationCap} viewAllHref="/universities" />
                        {hasFeaturedContent ? (
                            <div className="space-y-4">
                                {filteredFeaturedCategories.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Category Spotlights</p>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">{filteredFeaturedCategories.length} highlighted</span>
                                        </div>
                                        <PremiumCarousel ariaLabel="Featured category spotlights">
                                            {filteredFeaturedCategories.map(category => (
                                                <div key={category.id} className="snap-start shrink-0 w-[280px] sm:w-[316px]">
                                                    <CategoryPreviewCard category={category} />
                                                </div>
                                            ))}
                                        </PremiumCarousel>
                                    </div>
                                )}
                                {filteredFeatured.length > 0 ? (
                                    <PremiumCarousel ariaLabel="Featured universities carousel">
                                        {filteredFeatured.map(uni => (
                                            <div key={uni.id} className={compactCarouselCardClass}>
                                                <UniversityCard university={uni} config={cardConfig} animationLevel={animLevel} actionVariant="default" />
                                            </div>
                                        ))}
                                    </PremiumCarousel>
                                ) : (
                                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                                        Featured universities are not available for the current filter, but the highlighted categories remain active.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <EmptySection icon={GraduationCap} message="No featured universities match your filter" />
                        )}
                    </div>

                    {filteredFeaturedClusters.length > 0 && (
                        <div>
                            <SectionHeader title="Featured Clusters" subtitle="Browse clusters and their universities" icon={Layers} viewAllHref="/universities" />
                            <PremiumCarousel>
                                {filteredFeaturedClusters.map(cluster => (
                                    <div key={cluster.id} className={compactCarouselCardClass}>
                                        <ClusterPreviewCard cluster={cluster} />
                                    </div>
                                ))}
                            </PremiumCarousel>
                        </div>
                    )}
                </div>
            </SectionWrap>
        );
    }

    /* 3 — Subscription Preview */
    function renderSubscriptionPreview() {
        if (hs?.sectionVisibility?.subscriptionBanner === false) return null;
        if (hs?.subscriptionBanner?.enabled === false) return null;
        const previewTitle = hs?.subscriptionBanner?.title || 'Subscription Preview';
        const previewSubtitle = hs?.subscriptionBanner?.subtitle || 'Choose a plan to access live exams, smart practice, and result analytics.';
        const primaryCtaLabel = hs?.subscriptionBanner?.primaryCTA?.label || 'See Plans';
        const primaryCtaUrl = hs?.subscriptionBanner?.primaryCTA?.url || '/subscription-plans';

        return (
            <SectionWrap>
                <div className="px-4 md:px-0" data-testid="home-subscription-section">
                    <SectionHeader title={previewTitle} subtitle={previewSubtitle} icon={Sparkles} viewAllHref="/subscription-plans" viewAllLabel="See all" />
                    {visibleSubscriptionPlans.length > 0 ? (
                        <PremiumCarousel ariaLabel="Subscription plans carousel">
                            {visibleSubscriptionPlans.map((plan) => (
                                <div key={plan.id || plan._id} className={compactCarouselCardClass}>
                                    <HomeSubscriptionPreviewCard
                                        plan={plan}
                                        onPrimaryAction={(item) => {
                                            const target = resolveSubscriptionPlanTarget(item);
                                            if (shouldOpenSubscriptionPlanTargetInNewTab(item)) {
                                                window.open(target, '_blank', 'noopener,noreferrer');
                                                return;
                                            }
                                            navigate(target);
                                        }}
                                        onViewDetails={setActiveSubscriptionPlan}
                                    />
                                </div>
                            ))}
                        </PremiumCarousel>
                    ) : (
                        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600 shadow-card dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                            <p className="font-medium text-gray-800 dark:text-gray-100">Subscription plans are being updated.</p>
                            <p className="mt-1">You can still open the plans page and continue from there.</p>
                            <SmartActionLink
                                href={primaryCtaUrl}
                                className="mt-4 inline-flex items-center rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                            >
                                {primaryCtaLabel}
                            </SmartActionLink>
                        </div>
                    )}
                </div>
            </SectionWrap>
        );
    }

    /* 5 ─ Category + Cluster Filter */
    function renderCategoryFilter() {
        if (!categories.length) return null;
        const enableCluster = uniSettings?.enableClusterFilterOnHome !== false && hs?.universityPreview?.enableClusterFilter !== false;
        return (
            <SectionWrap>
                <div className="px-4 md:px-0">
                    <SectionHeader title="Browse by Category" subtitle="Find universities that match your profile" icon={Layers} />
                    {/* Category chips */}
                    <div className="relative">
                        <div
                            ref={categoryScrollRef}
                            onWheel={handleHorizontalWheel}
                            className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide touch-pan-x px-3 sm:px-4 md:px-16 lg:px-20"
                            style={{ scrollPaddingLeft: '4.5rem', scrollPaddingRight: '4.5rem' }}
                        >
                            <button
                                onClick={() => { setSelectedCategory(''); setSelectedCluster(''); }}
                                className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                                    !selectedCategory
                                        ? 'bg-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/25'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                                }`}>
                                All
                            </button>
                            {sortedCategories.map(cat => {
                                const isActive = selectedCategory === cat.categoryName;
                                const highlighted = data?.universityDashboardData?.categories?.find(item => item.key === cat.categoryName);
                                return (
                                    <button key={cat.categoryName}
                                        onClick={() => {
                                            setSelectedCategory(isActive ? '' : cat.categoryName);
                                            setSelectedCluster('');
                                        }}
                                        className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5 ${
                                            isActive
                                                ? 'bg-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/25'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                                        }`}>
                                        {cat.categoryName}
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-200/80 dark:bg-gray-700'}`}>
                                            {cat.count}
                                        </span>
                                        {highlighted?.badgeText && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-900 font-bold animate-pulse">{highlighted.badgeText}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="pointer-events-none absolute inset-y-0 left-2 hidden md:flex items-center">
                            <button
                                type="button"
                                onClick={() => scrollChipRow('category', 'left')}
                                disabled={!categoryScrollState.canLeft}
                                className={`pointer-events-auto ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200/80 bg-white/85 text-gray-600 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/85 dark:text-gray-200 ${
                                    categoryScrollState.canLeft
                                        ? 'hover:bg-white'
                                        : 'cursor-not-allowed opacity-35'
                                }`}
                                aria-label="Scroll categories left"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="pointer-events-none absolute inset-y-0 right-2 hidden md:flex items-center">
                            <button
                                type="button"
                                onClick={() => scrollChipRow('category', 'right')}
                                disabled={!categoryScrollState.canRight}
                                className={`pointer-events-auto mr-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200/80 bg-white/85 text-gray-600 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/85 dark:text-gray-200 ${
                                    categoryScrollState.canRight
                                        ? 'hover:bg-white'
                                        : 'cursor-not-allowed opacity-35'
                                }`}
                                aria-label="Scroll categories right"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="absolute left-0 top-0 h-full w-8 bg-gradient-to-r from-gray-50 dark:from-gray-950 pointer-events-none md:hidden" />
                        <div className="absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-gray-50 dark:from-gray-950 pointer-events-none md:hidden" />
                    </div>
                    {/* Cluster chips */}
                    {enableCluster && currentClusters.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            ref={clusterScrollRef}
                            onWheel={handleHorizontalWheel}
                            className="flex gap-2 overflow-x-auto pb-2 mt-1 scrollbar-hide touch-pan-x"
                        >
                            <button
                                onClick={() => setSelectedCluster('')}
                                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                    !selectedCluster
                                        ? 'bg-purple-600 text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                                }`}>
                                All Clusters
                            </button>
                            {currentClusters.map(cl => (
                                <button key={cl}
                                    onClick={() => setSelectedCluster(selectedCluster === cl ? '' : cl)}
                                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                        selectedCluster === cl
                                            ? 'bg-purple-600 text-white shadow-sm'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                                    }`}>
                                    {cl}
                                </button>
                            ))}
                        </motion.div>
                    )}
                    {enableCluster && currentClusters.length > 0 && (
                        <div className="mt-1 hidden md:flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => scrollChipRow('cluster', 'left')}
                                disabled={!clusterScrollState.canLeft}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200/80 bg-white/85 text-gray-600 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/85 dark:text-gray-200 ${
                                    clusterScrollState.canLeft
                                        ? 'hover:bg-white'
                                        : 'cursor-not-allowed opacity-35'
                                }`}
                                aria-label="Scroll clusters left"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => scrollChipRow('cluster', 'right')}
                                disabled={!clusterScrollState.canRight}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200/80 bg-white/85 text-gray-600 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-gray-900/85 dark:text-gray-200 ${
                                    clusterScrollState.canRight
                                        ? 'hover:bg-white'
                                        : 'cursor-not-allowed opacity-35'
                                }`}
                                aria-label="Scroll clusters right"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </div>
            </SectionWrap>
        );
    }

    /* 6 ─ Admission Deadlines */
    function renderDeadlines() {
        if (hs?.sectionVisibility?.closingExamWidget === false) return null;
        const hasAnyItems = filteredDeadlineClusters.length > 0 || filteredDeadline.length > 0;
        return (
            <SectionWrap>
                <div className="px-4 md:px-0" data-testid="home-deadlines-section">
                    <SectionHeader title="Application Deadlines" subtitle="Don't miss your chance to apply" icon={CalendarClock} viewAllHref="/universities" viewAllLabel="See all" />
                    {hasAnyItems ? (
                        <PremiumCarousel>
                            {filteredDeadlineClusters.map(cluster => (
                                <div key={cluster.id} className={compactCarouselCardClass}>
                                    <ClusterPreviewCard cluster={cluster} />
                                </div>
                            ))}
                            {filteredDeadline.map(uni => (
                                <DeadlineCard key={uni.id} university={uni} />
                            ))}
                        </PremiumCarousel>
                    ) : (
                        <EmptySection icon={CalendarClock} message="No upcoming deadlines in this category" />
                    )}
                </div>
            </SectionWrap>
        );
    }

    /* 7 ─ Upcoming Exams */
    function renderUpcomingExams() {
        if (hs?.sectionVisibility?.examsWidget === false) return null;
        const hasAnyItems = filteredUpcomingClusters.length > 0 || filteredUpcoming.length > 0;
        return (
            <SectionWrap>
                <div className="px-4 md:px-0">
                    <SectionHeader title="Upcoming Exams" subtitle="Prepare and plan ahead" icon={CalendarClock} viewAllHref="/universities" viewAllLabel="See all" />
                    {hasAnyItems ? (
                        <PremiumCarousel>
                            {filteredUpcomingClusters.map(cluster => (
                                <div key={cluster.id} className={compactCarouselCardClass}>
                                    <ClusterPreviewCard cluster={cluster} />
                                </div>
                            ))}
                            {filteredUpcoming.map(uni => (
                                <UpcomingExamCard key={uni.id} university={uni} />
                            ))}
                        </PremiumCarousel>
                    ) : (
                        <EmptySection icon={CalendarClock} message="No upcoming exams in this category" />
                    )}
                </div>
            </SectionWrap>
        );
    }

    /* 8 ─ Online Exam Preview */
    function renderOnlineExamPreview() {
        if (hs?.sectionVisibility?.examsWidget === false) return null;
        if (!onlineExams) return null;
        const items: HomeExamWidgetItem[] = (
            onlineExams.items?.length
                ? onlineExams.items
                : [...(onlineExams.liveNow ?? []), ...(onlineExams.upcoming ?? [])]
        ).slice(0, 6);
        if (!items.length) return null;

        return (
            <SectionWrap>
                <div className="px-4 md:px-0">
                    <SectionHeader title="Online Exams" subtitle="Test your preparation" icon={ClipboardCheck} viewAllHref="/exams" />
                    <PremiumCarousel>
                        {items.map(exam => (
                            <OnlineExamCard key={exam.id} exam={exam} />
                        ))}
                    </PremiumCarousel>
                </div>
            </SectionWrap>
        );
    }

    /* 9 ─ News Preview */
    function renderNewsPreview() {
        if (hs?.sectionVisibility?.newsPreview === false) return null;
        const featuredIds = new Set(featuredNewsItems.map((item) => item._id));
        const latestNewsItems = newsItems.filter((item) => !featuredIds.has(item._id));
        const fallbackLatest = latestNewsItems.length > 0 ? latestNewsItems : newsItems;
        if (!featuredNewsItems.length && !fallbackLatest.length) return null;
        return (
            <SectionWrap>
                <div className="space-y-6 px-4 md:px-0">
                    {featuredNewsItems.length > 0 ? (
                        <div>
                            <SectionHeader title="Featured News" subtitle="Pinned updates that should stay visible on the homepage" icon={Megaphone} viewAllHref="/news" />
                            <PremiumCarousel ariaLabel="Featured news carousel">
                                {featuredNewsItems.map((item: ApiNews) => (
                                    <NewsCard key={`featured-${item._id}`} item={item} />
                                ))}
                            </PremiumCarousel>
                        </div>
                    ) : null}
                    {fallbackLatest.length > 0 ? (
                        <div>
                            <SectionHeader title="Latest News" subtitle="Admission updates & announcements" icon={Newspaper} viewAllHref="/news" />
                            <PremiumCarousel ariaLabel="Latest news carousel">
                                {fallbackLatest.map((item: ApiNews) => (
                                    <NewsCard key={item._id} item={item} />
                                ))}
                            </PremiumCarousel>
                        </div>
                    ) : null}
                </div>
            </SectionWrap>
        );
    }

    /* 10 ─ Resources Preview */
    function renderResourcesPreview() {
        if (hs?.sectionVisibility?.resourcesPreview === false) return null;
        if (!resourceItems.length) return null;
        return (
            <SectionWrap>
                <div className="px-4 md:px-0">
                    <SectionHeader title="Resources" subtitle="Guides, downloads & study materials" icon={BookOpen} viewAllHref="/resources" />
                    <PremiumCarousel>
                        {resourceItems.map(res => (
                            <ResourceCard key={res._id} resource={res} />
                        ))}
                    </PremiumCarousel>
                </div>
            </SectionWrap>
        );
    }

    /* 11 ─ Content Blocks */
    function renderContentBlocks() {
        if (!contentBlocks.length) return null;
        return (
            <SectionWrap>
                <div className="px-4 md:px-0 space-y-4">
                    {contentBlocks.map((block: ContentBlockItem) => {
                        if (block.type === 'cta_strip' || block.type === 'campaign_card') {
                            return (
                                <motion.div key={block._id} whileHover={{ scale: 1.005 }}
                                    className="rounded-2xl overflow-hidden bg-gradient-to-r from-[var(--primary)] to-purple-600 text-white p-6 md:p-8 flex flex-col md:flex-row items-center gap-5 shadow-elevated">
                                    {block.imageUrl && <img src={block.imageUrl} alt="" className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover shrink-0 ring-2 ring-white/20" />}
                                    <div className="flex-1 text-center md:text-left">
                                        {block.title && <h3 className="font-heading font-bold text-lg md:text-xl mb-1">{block.title}</h3>}
                                        {block.body && <p className="text-sm text-white/75 line-clamp-2">{block.body}</p>}
                                    </div>
                                    {block.ctaLabel && block.ctaUrl && (
                                        <SmartActionLink href={block.ctaUrl}
                                            className="shrink-0 px-6 py-3 rounded-xl bg-white text-[var(--primary)] font-semibold text-sm hover:bg-blue-50 transition-colors shadow-elevated">
                                            {block.ctaLabel}
                                        </SmartActionLink>
                                    )}
                                </motion.div>
                            );
                        }
                        if (block.type === 'notice_ribbon' || block.type === 'info_banner') {
                            return (
                                <div key={block._id}
                                    className="rounded-2xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-900/20 p-4 md:p-5 flex items-start gap-3 shadow-card">
                                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 shrink-0">
                                        <Megaphone className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                    </div>
                                    <div className="flex-1">
                                        {block.title && <p className="font-semibold text-sm text-amber-900 dark:text-amber-200 mb-0.5">{block.title}</p>}
                                        {block.body && <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{block.body}</p>}
                                    </div>
                                    {block.ctaLabel && block.ctaUrl && (
                                        <SmartActionLink href={block.ctaUrl}
                                            className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors">
                                            {block.ctaLabel} →
                                        </SmartActionLink>
                                    )}
                                </div>
                            );
                        }
                        /* hero_card or generic fallback */
                        return (
                            <motion.div key={block._id} whileHover={{ y: -2 }}
                                className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-5 shadow-card hover:shadow-card-hover transition-shadow flex flex-col md:flex-row items-center gap-5">
                                {block.imageUrl && <img src={block.imageUrl} alt="" className="w-full md:w-44 h-36 md:h-32 rounded-xl object-cover shrink-0" />}
                                <div className="flex-1">
                                    {block.title && <h3 className="font-heading font-bold text-base text-gray-900 dark:text-white mb-1">{block.title}</h3>}
                                    {block.body && <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">{block.body}</p>}
                                </div>
                                {block.ctaLabel && block.ctaUrl && (
                                    <SmartActionLink href={block.ctaUrl}
                                        className="shrink-0 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-card">
                                        {block.ctaLabel}
                                    </SmartActionLink>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            </SectionWrap>
        );
    }

    /* 12 ─ Quick Stats */
    function renderStats() {
        if (hs?.sectionVisibility?.stats === false) return null;
        if (!stats?.items?.length) return null;
        const enabled = stats.items.filter(s => s.enabled);
        if (!enabled.length) return null;

        const statGradients = [
            'from-blue-500/20 to-cyan-400/10 dark:from-blue-500/30 dark:to-cyan-400/20',
            'from-purple-500/20 to-pink-400/10 dark:from-purple-500/30 dark:to-pink-400/20',
            'from-emerald-500/20 to-teal-400/10 dark:from-emerald-500/30 dark:to-teal-400/20',
            'from-amber-500/20 to-orange-400/10 dark:from-amber-500/30 dark:to-orange-400/20',
        ];
        const statTextColors = [
            'text-blue-700 dark:text-blue-300',
            'text-purple-700 dark:text-purple-300',
            'text-emerald-700 dark:text-emerald-300',
            'text-amber-700 dark:text-amber-300',
        ];

        return (
            <SectionWrap>
                <div className="px-4 md:px-0">
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-900/95 dark:to-gray-800/90 border border-gray-200/80 dark:border-gray-700/60 p-8 md:p-12 shadow-card">
                        {/* Decorative background pattern */}
                        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '40px 40px' }} />
                        <SectionHeader title={hs?.stats?.title || 'Platform Overview'} subtitle={hs?.stats?.subtitle || 'CampusWay at a glance'} icon={BarChart3} />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                            {enabled.map((stat, idx) => (
                                <motion.div
                                    key={stat.key}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                                    whileHover={{ scale: 1.04, y: -2 }}
                                    className={`relative text-center p-5 md:p-6 rounded-2xl bg-gradient-to-br ${statGradients[idx % 4]} border border-gray-100/80 dark:border-gray-700/40 backdrop-blur-sm transition-shadow duration-300 hover:shadow-lg`}
                                >
                                    <p className={`text-3xl md:text-4xl font-extrabold ${statTextColors[idx % 4]} tracking-tight`}>
                                        {(stat.value ?? 0).toLocaleString()}
                                    </p>
                                    <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-2 font-semibold uppercase tracking-wider">{stat.label}</p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </SectionWrap>
        );
    }

    /* ================================================================ */
    /*  Section renderer map                                             */
    /* ================================================================ */
    const sectionRenderers: Record<string, () => ReactNode> = {
        search: renderSearch,
        hero: renderHero,
        subscription_banner: renderSubscriptionPreview,
        campaign_banners: renderCampaignBanners,
        featured: renderFeatured,
        category_filter: renderCategoryFilter,
        deadlines: renderDeadlines,
        upcoming_exams: renderUpcomingExams,
        online_exam_preview: renderOnlineExamPreview,
        news: renderNewsPreview,
        resources: renderResourcesPreview,
        content_blocks: renderContentBlocks,
        stats: renderStats,
    };

    /* ================================================================ */
    /*  RENDER                                                           */
    /* ================================================================ */
    if (isLoading) return <HomeSkeleton />;
    if (isError || !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500 dark:text-gray-400 px-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col items-center"
                >
                    <div className="relative p-5 rounded-3xl bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/10 mb-5 ring-1 ring-red-200/50 dark:ring-red-800/30">
                        <AlertCircle className="w-10 h-10 text-red-400 dark:text-red-500" />
                    </div>
                    <p className="text-xl font-heading font-bold text-gray-800 dark:text-gray-200">Unable to load homepage</p>
                    <p className="text-sm mt-2 text-gray-500 dark:text-gray-400 max-w-xs text-center">Something went wrong. Please check your connection and try again.</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm hover:opacity-90 transition-opacity shadow-card"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Retry
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
            <div className="max-w-7xl mx-auto space-y-10 md:space-y-14 pb-20">
                {sectionOrder.map(section => {
                    const renderer = sectionRenderers[section.id];
                    if (!renderer) return null;
                    return (
                        <SectionErrorBoundary key={section.id}>
                            <SectionRenderer renderer={renderer} />
                        </SectionErrorBoundary>
                    );
                })}
            </div>
            <PlanDetailsDrawer
                open={Boolean(activeSubscriptionPlan)}
                plan={activeSubscriptionPlan}
                onClose={() => setActiveSubscriptionPlan(null)}
                onDismissToContact={() => navigate('/contact')}
                onPrimaryAction={(plan) => {
                    const target = resolveSubscriptionPlanTarget(plan);
                    if (shouldOpenSubscriptionPlanTargetInNewTab(plan)) {
                        window.open(target, '_blank', 'noopener,noreferrer');
                        return;
                    }
                    navigate(target);
                }}
            />
        </div>
    );
}

