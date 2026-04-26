import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Star, Quote, GraduationCap } from 'lucide-react';
import { getPublicTestimonials } from '../../services/api';

interface Testimonial {
    _id: string;
    name: string;
    role: string;
    university?: string;
    avatarUrl?: string;
    quote: string;
    rating: number;
}

export default function TestimonialsSection() {
    const { data, isLoading } = useQuery({
        queryKey: ['public-testimonials'],
        queryFn: async () => {
            const res = await getPublicTestimonials();
            const p = res.data as any;
            return (p.items || (Array.isArray(p) ? p : [])) as Testimonial[];
        },
        staleTime: 5 * 60_000,
    });

    const items = data || [];
    if (!isLoading && items.length === 0) return null;

    return (
        <section className="section-container">
            <div className="flex items-center gap-3 mb-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 ring-1 ring-amber-500/20">
                    <Quote className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-extrabold text-text dark:text-dark-text">Student Voices</h2>
                    <p className="text-sm text-text-muted dark:text-dark-text/60">What our students say about CampusWay</p>
                </div>
            </div>

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-56 rounded-2xl bg-surface2 dark:bg-slate-800/50 animate-pulse" />
                    ))}
                </div>
            ) : (
                <motion.div
                    initial="hidden" animate="show"
                    variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
                >
                    {items.map((t) => (
                        <motion.div
                            key={t._id}
                            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
                            className="group relative rounded-2xl border border-card-border/60 dark:border-white/[0.06] bg-white/80 dark:bg-slate-900/60 backdrop-blur-sm p-6 shadow-sm hover:shadow-lg hover:border-amber-500/30 dark:hover:border-amber-400/20 transition-all duration-300"
                        >
                            <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Quote className="h-10 w-10 text-amber-500" />
                            </div>
                            <div className="flex gap-0.5 mb-4">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <Star key={i} className={`h-4 w-4 ${i < t.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />
                                ))}
                            </div>
                            <p className="text-sm leading-relaxed text-text-muted dark:text-dark-text/75 mb-5 line-clamp-4">&ldquo;{t.quote}&rdquo;</p>
                            <div className="flex items-center gap-3 mt-auto pt-4 border-t border-card-border/40 dark:border-white/[0.04]">
                                {t.avatarUrl ? (
                                    <img src={t.avatarUrl} alt={t.name} className="h-10 w-10 rounded-full object-cover ring-2 ring-amber-500/20" />
                                ) : (
                                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white text-sm font-bold shadow-md">{t.name.charAt(0)}</div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-text dark:text-dark-text truncate">{t.name}</p>
                                    <div className="flex items-center gap-1.5 text-xs text-text-muted dark:text-dark-text/50">
                                        <span>{t.role}</span>
                                        {t.university && (<><span className="text-amber-400">•</span><span className="flex items-center gap-1 truncate"><GraduationCap className="h-3 w-3 flex-shrink-0" />{t.university}</span></>)}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </section>
    );
}
