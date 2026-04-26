import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Handshake, ExternalLink } from 'lucide-react';
import { getPublicPartners } from '../../services/api';

interface Partner { _id: string; name: string; logoUrl: string; websiteUrl?: string; tier: string; }

const TIER_COLORS: Record<string, string> = {
    platinum: 'from-slate-300 to-slate-100 text-slate-700 border-slate-300/50',
    gold: 'from-amber-400 to-yellow-300 text-amber-900 border-amber-400/50',
    silver: 'from-slate-400 to-slate-300 text-slate-700 border-slate-400/50',
    bronze: 'from-orange-400 to-orange-300 text-orange-900 border-orange-400/50',
    partner: 'from-indigo-400 to-cyan-400 text-white border-indigo-400/50',
};

function resolveLogoUrl(url: string): string {
    if (!url || url === '/logo.svg') return '/logo.svg';
    if (url.startsWith('http')) return url;
    return url.startsWith('/') ? url : `/${url}`;
}

export default function PartnersSection() {
    const { data, isLoading } = useQuery({
        queryKey: ['public-partners'],
        queryFn: async () => {
            const res = await getPublicPartners();
            const p = res.data as any;
            return (p.items || (Array.isArray(p) ? p : [])) as Partner[];
        },
        staleTime: 5 * 60_000,
    });
    const items = data || [];
    if (!isLoading && items.length === 0) return null;

    return (
        <section className="section-container">
            <div className="flex items-center gap-3 mb-8">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/10 ring-1 ring-indigo-500/20">
                    <Handshake className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-extrabold text-text dark:text-dark-text">Our Partners</h2>
                    <p className="text-sm text-text-muted dark:text-dark-text/60">Trusted by leading institutions</p>
                </div>
            </div>
            {isLoading ? (
                <div className="flex gap-6 overflow-hidden">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-20 w-40 rounded-2xl bg-surface2 dark:bg-slate-800/50 animate-pulse flex-shrink-0" />)}
                </div>
            ) : (
                <motion.div initial="hidden" animate="show" variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.08 } } }} className="flex flex-wrap items-center justify-center gap-5">
                    {items.map((p) => {
                        const tierClass = TIER_COLORS[p.tier] || TIER_COLORS.partner;
                        return (
                            <motion.a key={p._id} href={p.websiteUrl || '#'} target={p.websiteUrl ? '_blank' : undefined} rel={p.websiteUrl ? 'noopener noreferrer' : undefined}
                                variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
                                className="group relative flex flex-col items-center gap-2 rounded-2xl border border-card-border/50 dark:border-white/[0.06] bg-white/80 dark:bg-slate-900/50 backdrop-blur-sm px-6 py-4 shadow-sm hover:shadow-lg hover:border-indigo-500/30 transition-all duration-300 min-w-[140px]">
                                <img src={resolveLogoUrl(p.logoUrl)} alt={p.name} className="h-10 w-10 object-contain rounded-lg" onError={(e) => { (e.target as HTMLImageElement).src = '/logo.svg'; }} />
                                <span className="text-xs font-semibold text-text dark:text-dark-text text-center leading-tight">{p.name}</span>
                                <span className={`inline-flex items-center rounded-full bg-gradient-to-r px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider border ${tierClass}`}>{p.tier}</span>
                                {p.websiteUrl && <ExternalLink className="absolute top-2 right-2 h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                            </motion.a>
                        );
                    })}
                </motion.div>
            )}
        </section>
    );
}
