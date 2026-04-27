import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Star, Quote, GraduationCap, Award, Sparkles, Handshake, ExternalLink, Users, MessageCircle } from 'lucide-react';
import PageHeroBanner from '../components/common/PageHeroBanner';
import { getPublicTestimonials, getPublicPartners } from '../services/api';

interface Testimonial { _id: string; name: string; role: string; university?: string; avatarUrl?: string; shortQuote?: string; fullQuote: string; rating: number; featured?: boolean; socialProofLabel?: string; }
interface PartnerItem { _id: string; name: string; logoUrl: string; websiteUrl?: string; tier: string; }

const AG = ['from-indigo-500 to-cyan-500', 'from-violet-500 to-fuchsia-500', 'from-amber-500 to-orange-500', 'from-emerald-500 to-teal-500', 'from-rose-500 to-pink-500', 'from-sky-500 to-blue-500'];
const CB = ['hover:border-indigo-500/30', 'hover:border-violet-500/30', 'hover:border-amber-500/30', 'hover:border-emerald-500/30', 'hover:border-rose-500/30', 'hover:border-sky-500/30'];
const TS: Record<string, string> = { platinum: 'from-slate-200 to-white text-slate-800', gold: 'from-amber-400 to-yellow-300 text-amber-900', silver: 'from-slate-300 to-slate-200 text-slate-700', bronze: 'from-orange-400 to-orange-300 text-orange-900', partner: 'from-indigo-500 to-cyan-500 text-white' };

export default function TestimonialsPage() {
    const { data: tData } = useQuery({ queryKey: ['public-testimonials'], queryFn: async () => { const r = await getPublicTestimonials(); const p = r.data as any; return (p.items || (Array.isArray(p) ? p : [])) as Testimonial[]; }, staleTime: 300000 });
    const { data: pData } = useQuery({ queryKey: ['public-partners'], queryFn: async () => { const r = await getPublicPartners(); const p = r.data as any; return (p.items || (Array.isArray(p) ? p : [])) as PartnerItem[]; }, staleTime: 300000 });
    const testimonials = tData || [];
    const partners = pData || [];
    const featured = testimonials.filter(t => t.featured);
    const regular = testimonials.filter(t => !t.featured);

    return (
        <>
            <PageHeroBanner title="Student Voices & Partners" subtitle="Real stories from students who achieved their dreams with CampusWay" pillText="Testimonials" vantaEffect="dots" vantaColor="#f59e0b" vantaBackgroundColor="#1a0f00" gradientFrom="#78350f" gradientTo="#92400e" />
            <div className="min-h-screen bg-background dark:bg-[#081322]">
                {/* Stats */}
                <div className="section-container py-8">
                    <div className="flex flex-wrap items-center justify-center gap-4">
                        {[{ icon: MessageCircle, label: 'Reviews', value: testimonials.length, color: 'text-amber-400 bg-amber-500/10' }, { icon: Award, label: 'Featured', value: featured.length, color: 'text-indigo-400 bg-indigo-500/10' }, { icon: Handshake, label: 'Partners', value: partners.length, color: 'text-cyan-400 bg-cyan-500/10' }].map(s => (
                            <div key={s.label} className="flex items-center gap-3 rounded-2xl border border-card-border/40 dark:border-white/[0.06] bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm px-5 py-3 shadow-sm">
                                <div className={`rounded-xl p-2.5 ${s.color}`}><s.icon className="h-5 w-5" /></div>
                                <div><p className="text-2xl font-black text-text dark:text-dark-text">{s.value}</p><p className="text-[10px] text-text-muted dark:text-dark-text/50 uppercase tracking-wider font-semibold">{s.label}</p></div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Featured */}
                {featured.length > 0 && (
                    <div className="section-container pb-10">
                        <div className="flex items-center gap-3 mb-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25"><Award className="h-5 w-5 text-white" /></div><div><h2 className="text-2xl font-black text-text dark:text-dark-text">Featured Reviews</h2><p className="text-sm text-text-muted dark:text-dark-text/50">Hand-picked success stories</p></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{featured.map((t, i) => (
                            <motion.div key={t._id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                                className="group relative rounded-3xl border-2 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.03] to-transparent dark:from-amber-500/[0.05] p-8 shadow-lg hover:shadow-xl hover:border-amber-500/40 transition-all duration-500 hover:-translate-y-1">
                                <div className="absolute top-5 right-5"><Quote className="h-20 w-20 text-amber-500/[0.06] group-hover:text-amber-500/[0.12] transition-colors" /></div>
                                <div className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 shadow-lg shadow-amber-500/30"><Award className="h-3.5 w-3.5 text-white" /><span className="text-[11px] font-bold text-white">Featured</span></div>
                                <div className="flex gap-1 mb-4 mt-8">{Array.from({ length: 5 }).map((_, j) => <Star key={j} className={`h-5 w-5 ${j < t.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-700'}`} />)}</div>
                                <blockquote className="text-base leading-relaxed text-text/90 dark:text-dark-text/85 font-medium mb-6 relative z-10">&ldquo;{t.shortQuote || t.fullQuote}&rdquo;</blockquote>
                                <div className="flex items-center gap-4 pt-5 border-t border-amber-500/10">
                                    <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${AG[i % AG.length]} flex items-center justify-center text-white text-lg font-black shadow-lg`}>{t.name.charAt(0)}</div>
                                    <div><p className="text-base font-bold text-text dark:text-dark-text">{t.name}</p><p className="text-sm text-text-muted dark:text-dark-text/50">{t.role}{t.university ? ` • ${t.university}` : ''}</p>
                                        {t.socialProofLabel && <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-2 py-0.5"><Sparkles className="h-3 w-3" />{t.socialProofLabel}</span>}
                                    </div>
                                </div>
                            </motion.div>
                        ))}</div>
                    </div>
                )}

                {/* All Reviews */}
                <div className="section-container pb-12">
                    <div className="flex items-center gap-3 mb-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-600 shadow-lg shadow-indigo-500/25"><Quote className="h-5 w-5 text-white" /></div><div><h2 className="text-2xl font-black text-text dark:text-dark-text">All Student Reviews</h2><p className="text-sm text-text-muted dark:text-dark-text/50">{testimonials.length} reviews from real students</p></div></div>
                    <motion.div initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {(regular.length > 0 ? regular : testimonials).map((t, i) => (
                            <motion.div key={t._id} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
                                className={`group relative rounded-3xl border border-card-border/50 dark:border-white/[0.06] bg-white dark:bg-slate-900/70 backdrop-blur-xl p-7 shadow-sm hover:shadow-2xl ${CB[i % CB.length]} transition-all duration-500 hover:-translate-y-1 overflow-hidden`}>
                                <div className="absolute top-5 right-5"><Quote className="h-14 w-14 text-primary/[0.04] dark:text-white/[0.03] group-hover:text-primary/[0.08] transition-colors duration-500" /></div>
                                <div className="flex gap-1 mb-4">{Array.from({ length: 5 }).map((_, j) => <Star key={j} className={`h-[18px] w-[18px] transition-transform duration-300 group-hover:scale-110 ${j < t.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200 dark:text-slate-700'}`} style={{ transitionDelay: `${j * 40}ms` }} />)}</div>
                                <blockquote className="relative z-10 mb-6"><p className="text-[15px] leading-[1.75] text-text/85 dark:text-dark-text/80 font-medium line-clamp-4">&ldquo;{t.shortQuote || t.fullQuote}&rdquo;</p></blockquote>
                                <div className="relative z-10 flex items-center gap-3.5 pt-5 border-t border-card-border/30 dark:border-white/[0.04]">
                                    <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${AG[i % AG.length]} flex items-center justify-center text-white text-base font-black shadow-lg`}>{t.name.charAt(0)}</div>
                                    <div className="min-w-0 flex-1"><p className="text-sm font-bold text-text dark:text-dark-text truncate">{t.name}</p><div className="flex items-center gap-1.5 text-[11px] text-text-muted dark:text-dark-text/45 mt-0.5"><span className="font-medium">{t.role}</span>{t.university && (<><span className="text-primary/40">•</span><span className="flex items-center gap-1 truncate"><GraduationCap className="h-3 w-3 flex-shrink-0 text-primary/50" />{t.university}</span></>)}</div></div>
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>

                {/* Partners */}
                {partners.length > 0 && (
                    <div className="section-container pb-16">
                        <div className="flex items-center gap-3 mb-8"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 shadow-lg shadow-cyan-500/25"><Handshake className="h-5 w-5 text-white" /></div><div><h2 className="text-2xl font-black text-text dark:text-dark-text">Our Partners</h2><p className="text-sm text-text-muted dark:text-dark-text/50">Trusted by leading institutions</p></div></div>
                        <motion.div initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                            {partners.map((p) => (
                                <motion.a key={p._id} href={p.websiteUrl || '#'} target={p.websiteUrl ? '_blank' : undefined} rel={p.websiteUrl ? 'noopener noreferrer' : undefined}
                                    variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
                                    className="group relative flex flex-col items-center gap-3 rounded-2xl border border-card-border/40 dark:border-white/[0.06] bg-white/90 dark:bg-slate-900/60 backdrop-blur-sm p-5 shadow-sm hover:shadow-xl hover:border-cyan-500/30 hover:-translate-y-1 transition-all duration-300">
                                    <div className="h-16 w-16 rounded-2xl bg-white dark:bg-slate-800 border border-card-border/30 dark:border-white/[0.08] flex items-center justify-center p-2 shadow-sm group-hover:shadow-md transition-shadow">
                                        <img src={p.logoUrl.startsWith('http') ? p.logoUrl : '/logo.svg'} alt={p.name} className="h-full w-full object-contain" onError={e => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
                                    </div>
                                    <span className="text-xs font-bold text-text dark:text-dark-text text-center leading-tight">{p.name}</span>
                                    <span className={`inline-flex items-center rounded-full bg-gradient-to-r px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm ${TS[p.tier] || TS.partner}`}>{p.tier}</span>
                                    {p.websiteUrl && <ExternalLink className="absolute top-2 right-2 h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                </motion.a>
                            ))}
                        </motion.div>
                    </div>
                )}
            </div>
        </>
    );
}
