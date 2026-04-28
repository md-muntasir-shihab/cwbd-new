import { type ReactNode, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Facebook,
    Instagram,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Send,
    Twitter,
    User,
    Youtube,
} from 'lucide-react';
import { getHome, type HomeApiResponse } from '../../services/api';
import { useWebsiteSettings } from '../../hooks/useWebsiteSettings';
import { buildMediaUrl } from '../../utils/mediaUrl';

const FounderPanel = lazy(() => import('./FounderPanel'));

const iconByPlatform = {
    facebook: Facebook,
    whatsapp: MessageCircle,
    telegram: Send,
    twitter: Twitter,
    youtube: Youtube,
    instagram: Instagram,
} as const;

function isExternal(url: string): boolean {
    return /^https?:\/\//i.test(url);
}

type FooterLink = { label: string; url: string };
type FooterAccordionKey = 'quick-links' | 'legal' | 'contact';
type FooterContactItem = {
    key: 'address' | 'phone' | 'email';
    value: string;
};

function normalizeLegalLinks(links?: FooterLink[]): FooterLink[] {
    const fallbackLinks: FooterLink[] = [
        { label: 'About', url: '/about' },
        { label: 'Terms', url: '/terms' },
        { label: 'Privacy', url: '/privacy' },
    ];

    if (!Array.isArray(links) || links.length === 0) {
        return fallbackLinks;
    }

    const normalized = links
        .filter((item) => item && item.label && item.url)
        .map((item) => ({ label: String(item.label).trim(), url: String(item.url).trim() }))
        .filter((item) => Boolean(item.label) && Boolean(item.url));

    const hasAbout = normalized.some((item) => item.url === '/about' || item.label.toLowerCase() === 'about');
    const hasTerms = normalized.some((item) => item.url === '/terms' || item.label.toLowerCase() === 'terms');
    const hasPrivacy = normalized.some((item) => item.url === '/privacy' || item.label.toLowerCase() === 'privacy');

    if (!hasAbout && normalized.length === 2 && hasTerms && hasPrivacy) {
        return [fallbackLinks[0], ...normalized];
    }

    return normalized;
}

function FooterNavLink({
    link,
    compact = false,
}: {
    link: FooterLink;
    compact?: boolean;
}) {
    const content = compact ? (
        <span className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] font-medium text-white/74 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white">
            <span className="truncate">{link.label}</span>
            {isExternal(link.url) ? (
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-white/38 transition group-hover:text-cyan-200" />
            ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/34 transition group-hover:text-cyan-200" />
            )}
        </span>
    ) : (
        <span className="flex items-center gap-1.5 text-sm text-white/60 transition hover:text-cyan-200">
            <ExternalLink className="h-3 w-3" />
            {link.label}
        </span>
    );

    if (isExternal(link.url)) {
        return (
            <a href={link.url} target="_blank" rel="noopener noreferrer">
                {content}
            </a>
        );
    }

    return <Link to={link.url}>{content}</Link>;
}

function FooterAccordionSection({
    id,
    title,
    isOpen,
    onToggle,
    children,
}: {
    id: FooterAccordionKey;
    title: string;
    isOpen: boolean;
    onToggle: (key: FooterAccordionKey) => void;
    children: ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-sm">
            <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`footer-panel-${id}`}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                onClick={() => onToggle(id)}
            >
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/80">{title}</span>
                <ChevronDown
                    className={`h-4 w-4 shrink-0 text-white/60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            <div
                id={`footer-panel-${id}`}
                className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className="border-t border-white/10 px-3 pb-3 pt-2">{children}</div>
                </div>
            </div>
        </section>
    );
}

function FooterSocialButtons({
    socialItems,
    compact = false,
}: {
    socialItems: Array<{
        platform: keyof typeof iconByPlatform;
        label: string;
        url: string;
        iconUrl: string;
    }>;
    compact?: boolean;
}) {
    return (
        <>
            {socialItems.map(({ platform, url, iconUrl, label }) => {
                const Icon = iconByPlatform[platform as keyof typeof iconByPlatform];
                return (
                    <a
                        key={`${platform}-${url}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label}
                        className={`inline-flex items-center justify-center border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white ${compact ? 'h-8 w-8 rounded-lg md:h-9 md:w-9 md:rounded-xl lg:h-10 lg:w-10 lg:rounded-2xl' : 'h-9 w-9 rounded-xl sm:h-10 sm:w-10 sm:rounded-2xl'
                            }`}
                    >
                        {iconUrl ? (
                            <img src={iconUrl} alt={label} className="h-4 w-4 object-contain" />
                        ) : Icon ? (
                            <Icon className="h-4 w-4" />
                        ) : (
                            <ExternalLink className="h-4 w-4" />
                        )}
                    </a>
                );
            })}
        </>
    );
}

export default function Footer() {
    const [openSection, setOpenSection] = useState<FooterAccordionKey | null>(null);
    const [founderPanelOpen, setFounderPanelOpen] = useState(false);
    const { data: websiteSettings } = useWebsiteSettings();
    const homeQuery = useQuery<HomeApiResponse>({
        queryKey: ['home'],
        queryFn: async () => (await getHome()).data,
        staleTime: 60_000,
        refetchInterval: 90_000,
        refetchIntervalInBackground: true,
    });

    const home = homeQuery.data;
    const footer = home?.homeSettings?.footer;
    const footerEnabled = footer?.enabled ?? true;
    if (!footerEnabled) return null;

    const quickLinks = footer?.quickLinks?.length
        ? footer.quickLinks
        : [
            { label: 'Home', url: '/' },
            { label: 'Universities', url: '/universities' },
            { label: 'Exams', url: '/exams' },
            { label: 'News', url: '/news' },
            { label: 'Resources', url: '/resources' },
            { label: 'Contact', url: '/contact' },
        ];

    const legalLinks = normalizeLegalLinks(footer?.legalLinks);
    const footerContactInfo: FooterContactItem[] = [
        { key: 'address' as const, value: String(footer?.contactInfo?.address || '').trim() },
        {
            key: 'phone' as const,
            value: String(footer?.contactInfo?.phone || home?.globalSettings?.contactPhone || websiteSettings?.contactPhone || '').trim(),
        },
        {
            key: 'email' as const,
            value: String(footer?.contactInfo?.email || home?.globalSettings?.contactEmail || websiteSettings?.contactEmail || '').trim(),
        },
    ].filter((item) => Boolean(item.value));

    const normalizedManagedSocialItems = (websiteSettings?.socialLinksList || [])
        .filter((item) => item.enabled !== false && item.placements?.includes('footer') && item.targetUrl)
        .map((item) => {
            const normalizedPlatform = String(item.platformName || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
            return {
                platform: normalizedPlatform as keyof typeof iconByPlatform,
                label: item.platformName || normalizedPlatform,
                url: item.targetUrl,
                iconUrl: item.iconUploadOrUrl || '',
            };
        });

    const social = home?.socialLinks || websiteSettings?.socialLinks || {};
    const fallbackSocialItems = (Object.keys(iconByPlatform) as Array<keyof typeof iconByPlatform>)
        .map((platform) => ({ platform, label: platform, url: String(social?.[platform] || '').trim(), iconUrl: '' }))
        .filter((item) => Boolean(item.url));

    const socialItems = normalizedManagedSocialItems.length > 0 ? normalizedManagedSocialItems : fallbackSocialItems;
    const brandLogoUrl = buildMediaUrl(websiteSettings?.logoUrl || '/logo.svg');
    const brandName = home?.globalSettings?.websiteName || websiteSettings?.websiteName || 'CampusWay';
    const brandMotto = home?.globalSettings?.motto || websiteSettings?.motto || '';
    const footerAboutText = footer?.aboutText || 'CampusWay helps students manage admissions, exams, and resources in one place.';
    const showFounderButton = footer?.showFounderButton ?? true;

    const toggleSection = (key: FooterAccordionKey) => {
        setOpenSection((current) => (current === key ? null : key));
    };

    const contactIconByType = {
        address: MapPin,
        phone: Phone,
        email: Mail,
    } as const;

    return (
        <footer className="bg-[linear-gradient(135deg,#052960_0%,#073A8D_42%,#0D5FDB_76%,#0EA5E9_100%)] text-white/85 mt-auto border-t border-white/10">
            <div className="section-container py-5 md:hidden">
                <div className="space-y-3.5">
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.06] px-4 py-4 shadow-[0_20px_50px_rgba(2,8,23,0.18)] backdrop-blur-sm">
                        <Link to="/" className="flex items-center gap-2.5">
                            <img src={brandLogoUrl} alt={brandName} className="h-7 w-auto max-w-[112px] object-contain" />
                            <div className="min-w-0">
                                <span className="block truncate text-[15px] font-heading font-bold leading-tight text-white">
                                    {brandName}
                                </span>
                                {brandMotto ? (
                                    <span className="mt-0.5 block truncate text-[10px] uppercase tracking-[0.2em] text-white/45">
                                        {brandMotto}
                                    </span>
                                ) : null}
                            </div>
                        </Link>
                        <p className="mt-3 sm:line-clamp-2 text-[12px] leading-5 text-white/62">
                            {footerAboutText}
                        </p>
                    </div>

                    <div className="space-y-2.5">
                        <FooterAccordionSection
                            id="quick-links"
                            title="Quick Links"
                            isOpen={openSection === 'quick-links'}
                            onToggle={toggleSection}
                        >
                            <ul className="space-y-2">
                                {quickLinks.map((link) => (
                                    <li key={`${link.label}-${link.url}`}>
                                        <FooterNavLink link={link} compact />
                                    </li>
                                ))}
                            </ul>
                        </FooterAccordionSection>

                        <FooterAccordionSection
                            id="legal"
                            title="Legal"
                            isOpen={openSection === 'legal'}
                            onToggle={toggleSection}
                        >
                            <ul className="space-y-2">
                                {legalLinks.map((link) => (
                                    <li key={`${link.label}-${link.url}`}>
                                        <FooterNavLink link={link} compact />
                                    </li>
                                ))}
                            </ul>
                        </FooterAccordionSection>

                        <FooterAccordionSection
                            id="contact"
                            title="Contact"
                            isOpen={openSection === 'contact'}
                            onToggle={toggleSection}
                        >
                            {footerContactInfo.length > 0 ? (
                                <ul className="space-y-2">
                                    {footerContactInfo.map((item, index) => {
                                        const Icon = contactIconByType[item.key];
                                        const href = item.key === 'phone' ? `tel:${item.value.replace(/\s+/g, '')}` : item.key === 'email' ? `mailto:${item.value}` : undefined;
                                        const inner = (
                                            <>
                                                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-200/80" />
                                                <span className="min-w-0 break-words">{item.value}</span>
                                            </>
                                        );
                                        return (
                                            <li
                                                key={`${item.key}-${index}`}
                                                className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] leading-5 text-white/72"
                                            >
                                                {href ? <a href={href} className="flex items-start gap-2.5 min-w-0 transition hover:text-cyan-200">{inner}</a> : inner}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : (
                                <p className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] leading-5 text-white/68">
                                    Use the contact form for support.
                                </p>
                            )}
                        </FooterAccordionSection>
                    </div>
                </div>
            </div>

            <div className="hidden md:block">
                <div className="section-container py-8 sm:py-10 lg:py-16">
                    <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-10">
                        <div className="lg:pr-4">
                            <Link to="/" className="mb-3 flex items-center gap-2.5">
                                <img
                                    src={brandLogoUrl}
                                    alt={brandName}
                                    className="h-8 w-auto max-w-[128px] object-contain sm:h-10 sm:max-w-[140px]"
                                />
                                <div>
                                    <span className="block text-lg font-heading font-bold leading-tight text-white sm:text-xl">
                                        {brandName}
                                    </span>
                                    <span className="text-[11px] text-white/55 sm:text-xs">
                                        {brandMotto}
                                    </span>
                                </div>
                            </Link>
                            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/65">{footerAboutText}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:contents">
                            <div className="col-span-1">
                                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white">Quick Links</h4>
                                <ul className="space-y-2">
                                    {quickLinks.map((link) => (
                                        <li key={`${link.label}-${link.url}`}>
                                            <FooterNavLink link={link} />
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="col-span-1">
                                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white">Legal</h4>
                                <ul className="space-y-2">
                                    {legalLinks.map((link) => (
                                        <li key={`${link.label}-${link.url}`}>
                                            <FooterNavLink link={link} />
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="col-span-2 lg:col-span-1">
                                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white">Contact</h4>
                                <ul className="space-y-2 text-sm text-white/60">
                                    {footerContactInfo.length > 0 ? footerContactInfo.map((item, index) => {
                                        const href = item.key === 'phone' ? `tel:${item.value.replace(/\s+/g, '')}` : item.key === 'email' ? `mailto:${item.value}` : undefined;
                                        return (
                                            <li key={`${item.key}-${index}`}>
                                                {href ? <a href={href} className="transition hover:text-cyan-200">{item.value}</a> : item.value}
                                            </li>
                                        );
                                    }) : (
                                        <li>Use the contact form for support.</li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="border-t border-white/10">
                <div className="section-container flex flex-col items-start justify-between gap-2.5 py-3.5 md:flex-row md:items-center md:gap-4 md:py-5">
                    <p className="text-[11px] leading-relaxed text-white/45 md:text-xs">
                        &copy; {new Date().getFullYear()} {brandName}. All rights reserved.
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 md:justify-end md:gap-2">
                        {showFounderButton && (
                            <button
                                type="button"
                                onClick={() => setFounderPanelOpen(true)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/80 transition hover:bg-white/20 hover:text-white md:text-xs"
                            >
                                <User className="h-3.5 w-3.5" />
                                Founder
                            </button>
                        )}
                        <FooterSocialButtons socialItems={socialItems} compact />
                    </div>
                </div>
            </div>

            {showFounderButton && (
                <Suspense fallback={null}>
                    {founderPanelOpen && (
                        <FounderPanel
                            open={founderPanelOpen}
                            onClose={() => setFounderPanelOpen(false)}
                        />
                    )}
                </Suspense>
            )}
        </footer>
    );
}
