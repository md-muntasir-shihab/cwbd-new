import { Link } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowLeft,
    Award,
    Bell,
    BookOpen,
    Database,
    Eye,
    FileText,
    Globe,
    GraduationCap,
    Heart,
    Info,
    Lock,
    Mail,
    Shield,
    Target,
    Users,
} from 'lucide-react';
import { useWebsiteSettings } from '../../hooks/useWebsiteSettings';
import { mergeWebsiteStaticPages, sortByOrder } from '../../lib/websiteStaticPages';
import PageHeroBanner from '../common/PageHeroBanner';
import { usePageHeroSettings } from '../../hooks/usePageHeroSettings';
import type { PageHeroKey } from '../../services/api';

type StaticPageKey = 'about' | 'terms' | 'privacy';

const PAGE_HERO_KEY_MAP: Record<StaticPageKey, PageHeroKey> = {
    about: 'about',
    terms: 'terms',
    privacy: 'privacy',
};

const ICON_MAP = {
    info: Info,
    target: Target,
    globe: Globe,
    heart: Heart,
    'graduation-cap': GraduationCap,
    'book-open': BookOpen,
    users: Users,
    award: Award,
    'file-text': FileText,
    shield: Shield,
    'alert-triangle': AlertTriangle,
    mail: Mail,
    eye: Eye,
    database: Database,
    lock: Lock,
    bell: Bell,
} as const;

const TONE_CLASS_MAP = {
    neutral: 'from-slate-500 to-slate-700',
    info: 'from-blue-500 to-blue-700',
    success: 'from-emerald-500 to-emerald-700',
    warning: 'from-amber-500 to-orange-600',
    accent: 'from-fuchsia-500 to-violet-700',
} as const;

function getIcon(iconKey: string) {
    return ICON_MAP[iconKey as keyof typeof ICON_MAP] || Info;
}

type StaticContentPageProps = {
    page: StaticPageKey;
};

export default function StaticContentPage({ page }: StaticContentPageProps) {
    const { data: websiteSettings } = useWebsiteSettings();
    const staticPages = mergeWebsiteStaticPages(websiteSettings?.staticPages);
    const pageConfig = staticPages[page];
    const sortedSections = sortByOrder(pageConfig.sections.filter((item) => item.enabled));
    const featureCards = page === 'about'
        ? sortByOrder(staticPages.about.featureCards.filter((item) => item.enabled))
        : [];
    const founderProfiles = page === 'about'
        ? sortByOrder(staticPages.about.founderProfiles.filter((item) => item.enabled))
        : [];
    const isAboutPage = page === 'about';
    const heroKey = PAGE_HERO_KEY_MAP[page];
    const hero = usePageHeroSettings(heroKey);

    return (
        <div className="min-h-screen">
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

            <div className="section-container py-10 lg:py-14">
                <div className={isAboutPage ? 'space-y-10' : 'mx-auto max-w-4xl space-y-6'}>
                    {pageConfig.lastUpdatedLabel ? (
                        <p className="text-center text-xs uppercase tracking-[0.22em] text-text-muted dark:text-dark-text/60">
                            {pageConfig.lastUpdatedLabel}
                        </p>
                    ) : null}
                    <div className={isAboutPage ? 'grid gap-6 md:grid-cols-2' : 'space-y-6'}>
                        {sortedSections.map((section) => {
                            const SectionIcon = getIcon(section.iconKey);
                            const toneClasses = TONE_CLASS_MAP[section.tone] || TONE_CLASS_MAP.neutral;
                            return (
                                <section key={`${section.title}-${section.order}`} className="card p-6 sm:p-8">
                                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${toneClasses}`}>
                                        <SectionIcon className="h-6 w-6 text-white" />
                                    </div>
                                    <h2 className="mb-3 text-xl font-bold text-text dark:text-dark-text">{section.title}</h2>
                                    <p className="whitespace-pre-line text-sm leading-relaxed text-text-muted dark:text-dark-text/65">
                                        {section.body}
                                    </p>
                                    {section.bullets.length ? (
                                        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-text-muted dark:text-dark-text/65">
                                            {section.bullets.map((bullet, index) => (
                                                <li key={`${section.title}-bullet-${index}`}>{bullet}</li>
                                            ))}
                                        </ul>
                                    ) : null}
                                </section>
                            );
                        })}
                    </div>

                    {featureCards.length ? (
                        <section className="space-y-5">
                            <div className="text-center">
                                <h2 className="section-title">Platform Highlights</h2>
                                <p className="mx-auto mt-2 max-w-2xl text-sm text-text-muted dark:text-dark-text/65">
                                    These blocks are fully admin-controlled from Site Settings and help explain what CampusWay offers.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {featureCards.map((card) => {
                                    const CardIcon = getIcon(card.iconKey);
                                    return (
                                        <div key={`${card.title}-${card.order}`} className="card p-5 text-center">
                                            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500">
                                                <CardIcon className="h-6 w-6 text-white" />
                                            </div>
                                            <h3 className="text-sm font-bold text-text dark:text-dark-text">{card.title}</h3>
                                            <p className="mt-1 text-xs leading-relaxed text-text-muted dark:text-dark-text/60">
                                                {card.description}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ) : null}

                    {founderProfiles.length ? (
                        <section className="space-y-5">
                            <div className="text-center">
                                <h2 className="section-title">{founderProfiles.length > 1 ? 'Founders' : 'Founder'}</h2>
                                <p className="mx-auto mt-2 max-w-2xl text-sm text-text-muted dark:text-dark-text/65">
                                    Admin can update founder identity, bio, ordering, visibility, and outbound contact links from Site Settings.
                                </p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                {founderProfiles.map((founder) => (
                                    <article key={`${founder.name}-${founder.order}`} className="card p-6 sm:p-7">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                                            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-900/60">
                                                {founder.photoUrl ? (
                                                    <img src={founder.photoUrl} alt={founder.name || 'Founder'} className="h-full w-full object-cover" />
                                                ) : (
                                                    <Users className="h-8 w-8 text-primary" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-lg font-bold text-text dark:text-dark-text">
                                                    {founder.name || 'Founder Name'}
                                                </h3>
                                                {founder.title ? (
                                                    <p className="mt-1 text-sm font-medium text-primary">{founder.title}</p>
                                                ) : null}
                                                {founder.shortBio ? (
                                                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-muted dark:text-dark-text/65">
                                                        {founder.shortBio}
                                                    </p>
                                                ) : null}
                                                {founder.contactLinks.length ? (
                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        {founder.contactLinks.map((link, index) => (
                                                            <a
                                                                key={`${founder.name}-contact-${index}`}
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-flex items-center gap-2 rounded-full border border-card-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
                                                            >
                                                                <Mail className="h-3.5 w-3.5" />
                                                                {link.label}
                                                            </a>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    ) : null}

                    <div className="pt-2 text-center">
                        <Link to={pageConfig.backLinkUrl || '/'} className="btn-primary inline-flex items-center gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            {pageConfig.backLinkLabel || 'Back to Home'}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

