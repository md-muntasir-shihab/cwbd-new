import { useEffect, useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    MapPin, Calendar, Users, Globe, ExternalLink, Share2,
    AlertTriangle, Clock, BookOpen, Phone, Mail, Loader2, ArrowLeft,
    GraduationCap, FileText, HelpCircle, Bell, ChevronRight,
    CheckCircle, Info, Bookmark, Award, Link2,
} from 'lucide-react';
import { useUniversityDetail } from '../hooks/useUniversityQueries';
import { normalizeExternalUrl } from '../utils/url';
import UniversityLogo from '../components/university/UniversityLogo';

/* ── Helpers ── */
function fmtDate(d: string | undefined | null): string {
    if (!d) return 'N/A';
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleDateString('en-BD', { day: 'numeric', month: 'long', year: 'numeric' });
}

function progressPct(start?: string | null, end?: string | null): number {
    if (!start || !end) return 0;
    const s = new Date(start).getTime(), e = new Date(end).getTime(), n = Date.now();
    if (Number.isNaN(s) || Number.isNaN(e)) return 0;
    if (n < s) return 0;
    if (n > e) return 100;
    return Math.round(((n - s) / (e - s)) * 100);
}

function daysUntil(d: string | undefined | null): number | null {
    if (!d) return null;
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / 86_400_000);
}

function countdownLabel(days: number | null): string {
    if (days === null) return '';
    if (days < 0) return 'Ended';
    if (days === 0) return 'Today';
    return `${days} day${days !== 1 ? 's' : ''} left`;
}

function countdownColor(days: number | null): string {
    if (days === null || days < 0) return 'text-slate-400 dark:text-slate-500';
    if (days < 3) return 'text-red-500';
    if (days <= 10) return 'text-amber-500';
    return 'text-emerald-500';
}

function countdownBg(days: number | null): string {
    if (days === null || days < 0) return 'bg-slate-100 dark:bg-slate-800';
    if (days < 3) return 'bg-red-50 dark:bg-red-950/30';
    if (days <= 10) return 'bg-amber-50 dark:bg-amber-950/30';
    return 'bg-emerald-50 dark:bg-emerald-950/30';
}

function seatValue(v: string | number | undefined | null): string {
    if (v === undefined || v === null || v === '') return 'N/A';
    const n = Number(v);
    if (Number.isNaN(n) || n <= 0) return 'N/A';
    return n.toLocaleString();
}

function descriptionBlocks(value: string): string[] {
    const source = String(value || '').trim();
    if (!source) return [];
    const explicitBlocks = source.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    if (explicitBlocks.length > 1) return explicitBlocks;
    const sentences = source.split(/(?<=[.!?\u0964])\s+/).map((item) => item.trim()).filter(Boolean);
    if (sentences.length <= 2) return [source];
    const blocks: string[] = [];
    for (let index = 0; index < sentences.length; index += 2) {
        blocks.push(sentences.slice(index, index + 2).join(' '));
    }
    return blocks;
}

/* ── SEO ── */
function useSEO(title: string, description: string) {
    useEffect(() => {
        if (!title) return;
        document.title = `${title} - CampusWay`;
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute('content', description);
        return () => { document.title = 'CampusWay - Your Admission Gateway'; };
    }, [title, description]);
}

/* ── Skeleton ── */
function DetailSkeleton() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
                <div className="h-10 w-48 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="h-64 rounded-[2rem] bg-slate-200 dark:bg-slate-800 animate-pulse" />
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="h-32 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                    <div className="h-32 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                </div>
                <div className="h-48 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
            </div>
        </div>
    );
}

/* ── Section wrapper ── */
function Section({ title, icon: Icon, badge, children, className = '' }: {
    title: string;
    icon: React.FC<{ className?: string }>;
    badge?: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`rounded-[1.75rem] bg-white p-4 sm:p-5 md:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)] ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] ${className}`}
        >
            <div className="flex items-center justify-between gap-2 sm:gap-3 mb-4 sm:mb-5 pb-3 sm:pb-4 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30">
                        <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px] text-primary-600 dark:text-primary-400" />
                    </div>
                    <h2 className="text-base sm:text-lg font-bold font-heading text-slate-900 dark:text-white">{title}</h2>
                </div>
                {badge && (
                    <span className="shrink-0 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[max(9px,0.5625rem)] sm:text-[max(10px,0.625rem)] font-bold uppercase tracking-wider bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                        {badge}
                    </span>
                )}
            </div>
            {children}
        </motion.section>
    );
}

/* ── Info Pill ── */
function InfoPill({ icon: Icon, label, value, href }: {
    icon: React.FC<{ className?: string }>;
    label: string;
    value: string;
    href?: string;
}) {
    const content = (
        <div className="flex items-start gap-3 rounded-xl bg-slate-50/80 p-3 sm:p-3.5 ring-1 ring-slate-100 transition hover:ring-slate-200 dark:bg-slate-800/40 dark:ring-slate-800 dark:hover:ring-slate-700">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
                <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[max(10px,0.625rem)] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">{label}</p>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-all sm:break-normal sm:truncate">{value}</p>
            </div>
        </div>
    );
    if (href) return <a href={href} className="block no-underline">{content}</a>;
    return content;
}

/* ── Exam Center Item ── */
function ExamCenterItem({ center }: { center: string | { city: string; address?: string } }) {
    const label = typeof center === 'string' ? center : `${center.city}${center.address ? ` — ${center.address}` : ''}`;
    return (
        <div className="flex items-start gap-3 rounded-xl bg-slate-50/80 p-3.5 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
            <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
                <MapPin className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
            </div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        </div>
    );
}

/* ── Social Icon ── */
function SocialIcon({ platform }: { platform: string }) {
    const p = platform.toLowerCase();
    if (p.includes('facebook')) return <span>📘</span>;
    if (p.includes('youtube')) return <span>▶️</span>;
    if (p.includes('twitter') || p.includes('x.com')) return <span>🐦</span>;
    if (p.includes('instagram')) return <span>📷</span>;
    if (p.includes('linkedin')) return <span>💼</span>;
    return <Link2 className="h-4 w-4" />;
}

/* ══════════════════════════════════ MAIN PAGE ══════════════════════════════════ */
export default function UniversityDetailsPage() {
    const { slug } = useParams<{ slug: string }>();
    const { data: uni, isLoading, isError, refetch } = useUniversityDetail(slug);
    const [shareMsg, setShareMsg] = useState('');
    const [faqOpen, setFaqOpen] = useState<number | null>(null);

    useSEO(
        uni ? `${uni.name} (${uni.shortForm}) Admission ${new Date().getFullYear()}` : 'University Details',
        uni?.description || uni?.shortDescription || ''
    );

    const handleShare = useCallback(() => {
        if (navigator.share && uni) {
            navigator.share({ title: uni.name, url: window.location.href }).catch(() => { });
        } else {
            navigator.clipboard?.writeText(window.location.href).then(() => {
                setShareMsg('Copied!');
                setTimeout(() => setShareMsg(''), 2000);
            });
        }
    }, [uni]);

    if (isLoading) return <DetailSkeleton />;

    if (isError || !uni) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 gap-5 text-center bg-slate-50 dark:bg-slate-950">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-xl font-heading font-bold text-slate-900 dark:text-white">University Not Found</h1>
                <p className="text-sm text-slate-500 max-w-sm">The university page doesn't exist or has been removed.</p>
                <div className="flex gap-3 mt-4">
                    <button onClick={() => refetch()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Loader2 className="w-4 h-4" /> Retry
                    </button>
                    <Link to="/universities" className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
                        <ArrowLeft className="w-4 h-4" /> Back to list
                    </Link>
                </div>
            </div>
        );
    }

    /* ── Derived values ── */
    const appStart = uni.applicationStartDate || uni.applicationStart;
    const appEnd = uni.applicationEndDate || uni.applicationEnd;
    const appProgress = progressPct(appStart, appEnd);
    const appDaysLeft = daysUntil(appEnd);
    const durationDays = (() => {
        if (!appStart || !appEnd) return null;
        const s = new Date(appStart).getTime(), e = new Date(appEnd).getTime();
        if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
        return Math.ceil((e - s) / 86_400_000);
    })();

    const sciExam = uni.examDateScience || uni.scienceExamDate;
    const artsExam = uni.examDateArts || uni.artsExamDate;
    const bizExam = uni.examDateBusiness || uni.businessExamDate;
    const totalSeats = seatValue(uni.totalSeats);
    const sciSeats = seatValue(uni.seatsScienceEng || uni.scienceSeats);
    const artsSeats = seatValue(uni.seatsArtsHum || uni.artsSeats);
    const bizSeats = seatValue(uni.seatsBusiness || uni.businessSeats);
    const websiteUrl = normalizeExternalUrl(uni.websiteUrl || uni.website);
    const admissionUrl = normalizeExternalUrl(uni.admissionUrl || uni.admissionWebsite);
    const established = uni.establishedYear || uni.established;
    const contact = uni.contactNumber || '';
    const email = uni.email || '';
    const leadDescription = String(uni.shortDescription || '').trim();
    const fullDescription = String(uni.description || '').trim();
    const hasFullDescription = fullDescription.length > 0;
    const readableDescription = descriptionBlocks(fullDescription);
    const descriptionIntro = hasFullDescription ? (readableDescription[0] || '') : leadDescription;
    const descriptionBodyBlocks = hasFullDescription ? readableDescription.slice(1) : [];
    const examCenters: Array<string | { city: string; address?: string }> = uni.examCenters ?? [];
    const socialLinks = (uni.socialLinks || []).filter(l => l.url);
    const faqs = (uni.faqs || []).filter(f => f.q && f.a);
    const notices = (uni.notices || []).filter(n => n.title);
    const applicationSteps = (uni.applicationSteps || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const relatedUniversities = (uni.relatedUniversities || []).filter(r => r.slug);
    const units = (uni.units || []).filter(u => u.name);
    const hasEligibility = Boolean(uni.minGpa || uni.requiredBackground || uni.ageLimit || uni.specialQuota);
    const requiredDocs = (uni.requiredDocuments || []).filter(Boolean);

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,rgba(241,245,249,0.8),rgba(248,250,252,1)_50%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(15,23,42,0.9),rgba(2,6,23,1)_50%)]">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 space-y-6">

                {/* Back link */}
                <Link to="/universities" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-primary-600 transition dark:text-slate-400 dark:hover:text-primary-400">
                    <ArrowLeft className="w-4 h-4" /> Back to Universities
                </Link>

                {/* ═══ 1. HERO HEADER ═══ */}
                <motion.header
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-[2rem] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.06)] ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 dark:shadow-[0_8px_40px_rgba(0,0,0,0.3)]"
                >
                    {/* Gradient accent bar */}
                    <div className="h-1.5 bg-gradient-to-r from-primary-500 via-cyan-500 to-emerald-500" />

                    <div className="p-4 sm:p-6 md:p-8">
                        <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-8">
                            <UniversityLogo
                                name={uni.name || ''}
                                shortForm={uni.shortForm || ''}
                                logoUrl={uni.logoUrl || ''}
                                alt={`${uni.shortForm || uni.name} logo`}
                                containerClassName="h-20 w-20 sm:h-[7rem] sm:w-[7rem] flex-shrink-0 overflow-hidden rounded-2xl border-2 border-slate-100 shadow-md dark:border-slate-800"
                                imageClassName="h-full w-full rounded-2xl bg-white dark:bg-slate-900 object-contain p-2.5"
                                fallbackTextClassName="text-3xl sm:text-4xl"
                            />

                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <span className="px-2.5 py-0.5 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 rounded-full text-[max(10px,0.625rem)] font-bold uppercase tracking-[0.12em]">
                                        {uni.category}
                                    </span>
                                    {uni.clusterGroup && (
                                        <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded-full text-[max(10px,0.625rem)] font-bold uppercase tracking-[0.12em]">
                                            {uni.clusterGroup}
                                        </span>
                                    )}
                                    {uni.isAdmissionOpen && (
                                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-full text-[max(10px,0.625rem)] font-bold uppercase tracking-[0.12em] flex items-center gap-1">
                                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Admission Open
                                        </span>
                                    )}
                                </div>

                                <h1 className="text-xl sm:text-2xl md:text-[2.2rem] font-heading font-black text-slate-900 dark:text-white leading-tight tracking-[-0.02em]">
                                    {uni.name}
                                </h1>
                                {uni.shortForm && (
                                    <p className="mt-1 text-base font-bold text-primary-600 dark:text-primary-400">{uni.shortForm}</p>
                                )}
                                {!hasFullDescription && leadDescription ? (
                                    <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-600 dark:text-slate-300">{leadDescription}</p>
                                ) : null}

                                {/* Action buttons */}
                                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-slate-100 dark:border-slate-800">
                                    {admissionUrl ? (
                                        <a href={admissionUrl} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700 hover:shadow-md hover:shadow-primary-600/25">
                                            Apply Now <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                    ) : (
                                        <button disabled className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500">
                                            Apply N/A
                                        </button>
                                    )}
                                    {websiteUrl ? (
                                        <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                                            <Globe className="w-3.5 h-3.5" /> Official Site
                                        </a>
                                    ) : null}
                                    <button onClick={handleShare} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                                        <Share2 className="w-3.5 h-3.5" /> {shareMsg || 'Share'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.header>

                {/* ═══ 2. OVERVIEW ═══ */}
                <Section title="Overview" icon={BookOpen}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {established ? <InfoPill icon={Calendar} label="Established" value={`${established}`} /> : null}
                        {uni.address ? <InfoPill icon={MapPin} label="Location" value={uni.address} /> : null}
                        {contact ? <InfoPill icon={Phone} label="Phone" value={contact} href={`tel:${contact}`} /> : null}
                        {email ? <InfoPill icon={Mail} label="Email" value={email} href={`mailto:${email}`} /> : null}
                    </div>
                    {!established && !uni.address && !contact && !email && (
                        <p className="text-sm text-slate-500 italic">No overview information available.</p>
                    )}
                </Section>

                {/* ═══ 3. DESCRIPTION ═══ */}
                {(fullDescription || leadDescription) && (
                    <Section title="Description" icon={BookOpen}>
                        <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-3 sm:px-5 sm:py-4 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/80">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-600 dark:text-primary-400">University Profile</p>
                                <p className="mt-2 max-w-3xl text-sm sm:text-[15px] leading-6 sm:leading-7 text-slate-700 dark:text-slate-300">
                                    {descriptionIntro || 'Description will appear here when the university profile is updated.'}
                                </p>
                            </div>
                            {descriptionBodyBlocks.length > 0 && (
                                <div className="px-4 py-4 sm:px-5 sm:py-5 space-y-3">
                                    {descriptionBodyBlocks.map((block, index) => (
                                        <p key={`desc-${index}`} className="max-w-4xl text-sm sm:text-[15px] leading-7 sm:leading-[1.9] text-slate-600 dark:text-slate-300">{block}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Section>
                )}

                {/* ═══ 4. SEATS ═══ */}
                <Section title="Available Seats" icon={Users} badge={totalSeats !== 'N/A' ? `${totalSeats} total` : undefined}>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                        {[
                            { label: 'Science & Engineering', value: sciSeats, color: 'from-blue-500 to-cyan-500' },
                            { label: 'Humanities', value: artsSeats, color: 'from-violet-500 to-purple-500' },
                            { label: 'Business Studies', value: bizSeats, color: 'from-amber-500 to-orange-500' },
                        ].map(row => (
                            <div key={row.label} className="relative overflow-hidden rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                                <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${row.color}`} />
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{row.label}</p>
                                <p className={`mt-1.5 text-2xl font-black tracking-tight ${row.value === 'N/A' ? 'text-slate-300 dark:text-slate-600' : 'text-slate-900 dark:text-white'}`}>
                                    {row.value}
                                </p>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* ═══ 5. APPLICATION TIMELINE ═══ */}
                <Section title="Application Timeline" icon={Clock}>
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Opens</p>
                                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">{fmtDate(appStart)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Closes</p>
                                <p className="mt-1 text-base font-bold text-slate-900 dark:text-white">{fmtDate(appEnd)}</p>
                            </div>
                        </div>

                        {(appStart || appEnd) && (
                            <div>
                                <div className="flex items-center justify-between mb-2 text-xs font-semibold">
                                    <span className="text-slate-500">Progress</span>
                                    <span className={countdownColor(appDaysLeft)}>
                                        {appDaysLeft !== null ? countdownLabel(appDaysLeft) : 'Dates N/A'}
                                    </span>
                                </div>
                                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-primary-400 to-primary-600 rounded-full transition-all duration-700"
                                        style={{ width: `${appProgress}%` }}
                                    />
                                </div>
                                {durationDays !== null && (
                                    <p className="mt-1.5 text-right text-[11px] font-medium text-slate-400">
                                        {durationDays} day window
                                    </p>
                                )}
                            </div>
                        )}
                        {!appStart && !appEnd && (
                            <p className="text-sm font-medium italic text-slate-500">Application dates not yet published.</p>
                        )}
                    </div>
                </Section>

                {/* ═══ 6. EXAM SCHEDULE ═══ */}
                <Section title="Exam Schedule" icon={Calendar}>
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                        {[
                            { label: 'Science / Eng.', date: sciExam },
                            { label: 'Humanities', date: artsExam },
                            { label: 'Business', date: bizExam },
                        ].map(row => {
                            const days = daysUntil(row.date);
                            return (
                                <div key={row.label} className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{row.label}</p>
                                    <p className="mt-1.5 text-sm font-bold text-slate-900 dark:text-white">{fmtDate(row.date)}</p>
                                    <span className={`mt-2 inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${countdownBg(days)} ${countdownColor(days)}`}>
                                        {row.date ? countdownLabel(days) : 'TBA'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </Section>

                {/* ═══ 7. ELIGIBILITY & REQUIREMENTS ═══ */}
                {(hasEligibility || requiredDocs.length > 0) && (
                    <Section title="Eligibility & Requirements" icon={GraduationCap}>
                        <div className="space-y-4">
                            {hasEligibility && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {uni.minGpa ? <InfoPill icon={Award} label="Minimum GPA" value={`${uni.minGpa}`} /> : null}
                                    {uni.requiredBackground ? <InfoPill icon={BookOpen} label="Required Background" value={uni.requiredBackground} /> : null}
                                    {uni.ageLimit ? <InfoPill icon={Users} label="Age Limit" value={uni.ageLimit} /> : null}
                                    {uni.specialQuota ? <InfoPill icon={Bookmark} label="Special Quota" value={uni.specialQuota} /> : null}
                                </div>
                            )}
                            {requiredDocs.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-2">Required Documents</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {requiredDocs.map((doc, i) => (
                                            <div key={i} className="flex items-center gap-2.5 rounded-lg bg-slate-50/80 px-3.5 py-2.5 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                                                <CheckCircle className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                                                <span className="text-sm text-slate-700 dark:text-slate-300">{doc}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </Section>
                )}

                {/* ═══ 8. APPLICATION STEPS ═══ */}
                {applicationSteps.length > 0 && (
                    <Section title="How to Apply" icon={FileText}>
                        <div className="space-y-3">
                            {applicationSteps.map((step, i) => (
                                <div key={i} className="flex gap-3 sm:gap-4 rounded-xl bg-slate-50/80 p-3 sm:p-4 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-black text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                                        {step.order || i + 1}
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{step.title}</p>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{step.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ═══ 9. UNITS ═══ */}
                {units.length > 0 && (
                    <Section title="Academic Units" icon={GraduationCap} badge={`${units.length} units`}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {units.map((unit, i) => (
                                <div key={i} className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{unit.name}</p>
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {unit.seats > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">{unit.seats} seats</span>}
                                        {unit.notes && <span className="text-[11px] text-slate-500">{unit.notes}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ═══ 10. EXAM CENTERS ═══ */}
                <Section title="Exam Centers" icon={MapPin} badge={examCenters.length > 0 ? `${examCenters.length} centers` : undefined}>
                    {examCenters.length > 0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {examCenters.map((c, i) => <ExamCenterItem key={i} center={c} />)}
                        </div>
                    ) : (
                        <p className="text-sm font-medium italic text-slate-500">No exam center data announced yet.</p>
                    )}
                </Section>

                {/* ═══ 11. NOTICES ═══ */}
                {notices.length > 0 && (
                    <Section title="Notices" icon={Bell} badge={`${notices.length}`}>
                        <div className="space-y-3">
                            {notices.map((n, i) => (
                                <div key={i} className={`rounded-xl p-4 ring-1 ${n.isImportant ? 'bg-amber-50/80 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-800/40' : 'bg-slate-50/80 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                {n.isImportant && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">{n.title}</p>
                                            </div>
                                            {n.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{n.description}</p>}
                                        </div>
                                        <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap sm:whitespace-normal shrink-0">{fmtDate(n.publishDate)}</span>
                                    </div>
                                    {(n.fileUrl || n.link) && (
                                        <a href={n.fileUrl || n.link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400">
                                            View details <ChevronRight className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ═══ 12. FAQ ═══ */}
                {faqs.length > 0 && (
                    <Section title="Frequently Asked Questions" icon={HelpCircle} badge={`${faqs.length}`}>
                        <div className="space-y-2">
                            {faqs.map((faq, i) => (
                                <div key={i} className="rounded-xl ring-1 ring-slate-100 dark:ring-slate-800 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                                        className="flex items-center justify-between gap-3 w-full px-4 py-3.5 text-left bg-slate-50/80 hover:bg-slate-100/80 transition dark:bg-slate-800/40 dark:hover:bg-slate-800/60"
                                    >
                                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 text-left">{faq.q}</span>
                                        <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${faqOpen === i ? 'rotate-90' : ''}`} />
                                    </button>
                                    {faqOpen === i && (
                                        <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                                            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{faq.a}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ═══ 13. ADDITIONAL NOTES ═══ */}
                {uni.additionalNotes && (
                    <Section title="Additional Notes" icon={Info}>
                        <div className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100 dark:bg-slate-800/40 dark:ring-slate-800">
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{uni.additionalNotes}</p>
                        </div>
                    </Section>
                )}

                {/* ═══ 14. SOCIAL LINKS ═══ */}
                {socialLinks.length > 0 && (
                    <Section title="Connect" icon={Globe}>
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
                            {socialLinks.map((link, i) => (
                                <a key={i} href={normalizeExternalUrl(link.url) || '#'} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
                                    <SocialIcon platform={link.platform} />
                                    <span className="capitalize">{link.platform}</span>
                                </a>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ═══ 15. RELATED UNIVERSITIES ═══ */}
                {relatedUniversities.length > 0 && (
                    <Section title="Related Universities" icon={GraduationCap}>
                        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                            {relatedUniversities.map((rel, i) => (
                                <Link key={i} to={`/universities/${rel.slug}`}
                                    className="flex items-center gap-3 rounded-xl bg-slate-50/80 p-3.5 ring-1 ring-slate-100 transition hover:ring-primary-200 hover:bg-primary-50/30 dark:bg-slate-800/40 dark:ring-slate-800 dark:hover:ring-primary-800 dark:hover:bg-primary-950/20">
                                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-slate-100 text-sm font-black text-primary-600 dark:bg-slate-800 dark:ring-slate-700 dark:text-primary-400">
                                        {rel.shortForm?.slice(0, 3) || (rel.name || '').charAt(0) || '?'}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{rel.name}</p>
                                        <p className="text-[11px] text-slate-500 uppercase tracking-wider">{rel.category}</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </Section>
                )}

            </div>
        </div>
    );
}
