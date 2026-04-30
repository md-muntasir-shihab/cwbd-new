import { Link } from 'react-router-dom';
import {
    BarChart3,
    BellRing,
    BookOpen,
    Briefcase,
    DollarSign,
    Globe,
    GraduationCap,
    Home,
    Library,
    Newspaper,
    Plug,
    Shield,
    Sparkles,
    Users,
} from 'lucide-react';
import AdminGuardShell from '../components/admin/AdminGuardShell';

type CategoryCard = {
    key: string;
    title: string;
    description: string;
    icon: typeof Home;
    to: string;
    summary: string[];
};

const CATEGORIES: CategoryCard[] = [
    {
        key: 'home',
        title: 'Home Control',
        description: 'Section visibility, ordering, timeline, and live sync for the public home page.',
        icon: Home,
        to: '/__cw_admin__/settings/home-control',
        summary: ['Hero, sections, timeline', 'Live sync toggle', 'Featured ordering'],
    },
    {
        key: 'university',
        title: 'University Settings',
        description: 'Defaults for university listings, featured campuses and cluster feed order.',
        icon: GraduationCap,
        to: '/__cw_admin__/settings/university-settings',
        summary: ['Default filters', 'Cluster ordering', 'Featured selection'],
    },
    {
        key: 'notifications',
        title: 'Notifications',
        description: 'Automation triggers, reminder windows, and provider preferences.',
        icon: BellRing,
        to: '/__cw_admin__/settings/notifications',
        summary: ['Triggers', 'Reminder timing', 'Channel routing'],
    },
    {
        key: 'analytics',
        title: 'Analytics',
        description: 'Event-tracking master switch, anonymization controls, provider scripts.',
        icon: BarChart3,
        to: '/__cw_admin__/settings/analytics',
        summary: ['Event tracking', 'Privacy controls', 'Provider scripts'],
    },
    {
        key: 'security',
        title: 'Security Center',
        description: 'Session timeout, MFA enforcement, and IP / device controls.',
        icon: Shield,
        to: '/__cw_admin__/settings/security-center',
        summary: ['MFA policy', 'Session limits', 'Audit log access'],
    },
    {
        key: 'finance',
        title: 'Finance Settings',
        description: 'Active currencies, tax presets and financial-report defaults.',
        icon: DollarSign,
        to: '/__cw_admin__/settings/finance-settings',
        summary: ['Currency', 'Tax rate', 'COA defaults'],
    },
    {
        key: 'news',
        title: 'News Settings',
        description: 'AI assist toggles, share templates and editorial workflow rules.',
        icon: Newspaper,
        to: '/__cw_admin__/settings/news',
        summary: ['AI generation', 'Share templates', 'Editorial workflow'],
    },
    {
        key: 'resources',
        title: 'Resource Settings',
        description: 'Resources page title, featured set, and view-tracking controls.',
        icon: BookOpen,
        to: '/__cw_admin__/settings/resource-settings',
        summary: ['Page meta', 'Featured items', 'View tracking'],
    },
    {
        key: 'subscription',
        title: 'Subscription Settings',
        description: 'Active plans, feature toggles per plan, and billing cadence defaults.',
        icon: Briefcase,
        to: '/__cw_admin__/settings/subscriptions',
        summary: ['Plan visibility', 'Feature flags', 'Billing cadence'],
    },
    {
        key: 'student',
        title: 'Student Settings',
        description: 'Default student groups, onboarding rules, and engagement defaults.',
        icon: Users,
        to: '/__cw_admin__/students',
        summary: ['Default group', 'Onboarding flow', 'Engagement rules'],
    },
    {
        key: 'questionbank',
        title: 'Question Bank Settings',
        description: 'Categories, organization mode, and AI assist for question authoring.',
        icon: Library,
        to: '/__cw_admin__/question-bank',
        summary: ['Categories', 'Organization', 'Authoring assist'],
    },
    {
        key: 'website',
        title: 'Website / Site Settings',
        description: 'Branding, contact, social links and meta tags surfaced to the public site.',
        icon: Globe,
        to: '/__cw_admin__/settings/site-settings',
        summary: ['Branding', 'Contact', 'SEO meta'],
    },
];

const EXTRA_LINKS: CategoryCard[] = [
    {
        key: 'integrations',
        title: 'Integrations',
        description: 'External services: Meilisearch, imgproxy, SMTP, Listmonk, Mautic, Novu, analytics, B2.',
        icon: Plug,
        to: '/__cw_admin__/settings/integrations',
        summary: ['10 integrations', 'Per-service toggles', 'Connection tests'],
    },
    {
        key: 'banners',
        title: 'Banner Manager',
        description: 'Promotional banners, campaign blocks, and News fallback media.',
        icon: Sparkles,
        to: '/__cw_admin__/settings/banner-manager',
        summary: ['Banners', 'Campaigns', 'Fallback art'],
    },
];

export default function AdminAllSettingsPage() {
    return (
        <AdminGuardShell
            title="All Settings (Unified)"
            description="Every settings category in one place. Each card opens its dedicated editor."
        >
            <div className="space-y-6">
                <section>
                    <header className="mb-3 flex items-baseline justify-between gap-3">
                        <h2 className="text-base font-semibold cw-text">12 settings categories</h2>
                        <span className="text-xs cw-muted">Click any card to edit that category</span>
                    </header>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {CATEGORIES.map((card) => (
                            <Link
                                key={card.key}
                                to={card.to}
                                className="card-flat group flex flex-col gap-3 p-5 transition-all hover:-translate-y-0.5 hover:border-primary/50"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                                        <card.icon className="h-5 w-5" />
                                    </span>
                                    <span className="rounded-full border border-card-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider cw-muted">
                                        {card.key}
                                    </span>
                                </div>
                                <h3 className="text-base font-semibold cw-text">{card.title}</h3>
                                <p className="text-sm cw-muted">{card.description}</p>
                                <ul className="mt-auto flex flex-wrap gap-1.5">
                                    {card.summary.map((tag) => (
                                        <li
                                            key={tag}
                                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800/70 dark:text-slate-300"
                                        >
                                            {tag}
                                        </li>
                                    ))}
                                </ul>
                            </Link>
                        ))}
                    </div>
                </section>

                <section>
                    <header className="mb-3">
                        <h2 className="text-base font-semibold cw-text">Related panels</h2>
                    </header>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {EXTRA_LINKS.map((card) => (
                            <Link
                                key={card.key}
                                to={card.to}
                                className="card-flat group flex flex-col gap-3 border-cyan-500/20 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-500/60"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 transition group-hover:bg-cyan-500/15 dark:text-cyan-300">
                                        <card.icon className="h-5 w-5" />
                                    </span>
                                </div>
                                <h3 className="text-base font-semibold cw-text">{card.title}</h3>
                                <p className="text-sm cw-muted">{card.description}</p>
                                <ul className="mt-auto flex flex-wrap gap-1.5">
                                    {card.summary.map((tag) => (
                                        <li
                                            key={tag}
                                            className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-700 dark:text-cyan-200"
                                        >
                                            {tag}
                                        </li>
                                    ))}
                                </ul>
                            </Link>
                        ))}
                    </div>
                </section>
            </div>
        </AdminGuardShell>
    );
}
