import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export type VantaEffect =
    | 'birds' | 'net' | 'globe' | 'waves' | 'fog'
    | 'clouds' | 'cells' | 'trunk' | 'halo' | 'dots'
    | 'rings' | 'topology' | 'none';

export interface HeroCTA {
    label: string;
    url: string;
}

export interface PageHeroBannerProps {
    title?: string;
    subtitle?: string;
    pillText?: string;
    primaryCTA?: HeroCTA;
    secondaryCTA?: HeroCTA;
    vantaEffect?: VantaEffect;
    vantaColor?: string;
    vantaBackgroundColor?: string;
    gradientFrom?: string;
    gradientTo?: string;
    children?: ReactNode;
    className?: string;
}

const VANTA_IMPORT_MAP: Record<string, () => Promise<any>> = {
    birds: () => import('vanta/dist/vanta.birds.min'),
    net: () => import('vanta/dist/vanta.net.min'),
    globe: () => import('vanta/dist/vanta.globe.min'),
    waves: () => import('vanta/dist/vanta.waves.min'),
    fog: () => import('vanta/dist/vanta.fog.min'),
    clouds: () => import('vanta/dist/vanta.clouds.min'),
    cells: () => import('vanta/dist/vanta.cells.min'),
    trunk: () => import('vanta/dist/vanta.trunk.min'),
    halo: () => import('vanta/dist/vanta.halo.min'),
    dots: () => import('vanta/dist/vanta.dots.min'),
    rings: () => import('vanta/dist/vanta.rings.min'),
    topology: () => import('vanta/dist/vanta.topology.min'),
};

function parseColor(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const hex = value.replace('#', '');
    const parsed = parseInt(hex, 16);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export default function PageHeroBanner({
    title,
    subtitle,
    pillText,
    primaryCTA,
    secondaryCTA,
    vantaEffect = 'none',
    vantaColor,
    vantaBackgroundColor,
    gradientFrom = '#4338ca',
    gradientTo = '#7c3aed',
    children,
    className = '',
}: PageHeroBannerProps) {
    const vantaRef = useRef<HTMLDivElement>(null);
    const vantaInstanceRef = useRef<any>(null);
    const [vantaLoaded, setVantaLoaded] = useState(false);

    useEffect(() => {
        if (vantaEffect === 'none' || !VANTA_IMPORT_MAP[vantaEffect]) return;

        let cancelled = false;

        (async () => {
            try {
                const vantaModule = await VANTA_IMPORT_MAP[vantaEffect]();
                if (cancelled || !vantaRef.current) return;

                const effectFn = vantaModule.default || vantaModule;
                const baseColor = parseColor(vantaColor, 0x3b82f6);
                const bgColor = parseColor(vantaBackgroundColor, 0x0f172a);

                vantaInstanceRef.current = effectFn({
                    el: vantaRef.current,
                    THREE: (window as any).THREE,
                    mouseControls: true,
                    touchControls: true,
                    gyroControls: false,
                    minHeight: 200,
                    minWidth: 200,
                    scale: 1.0,
                    scaleMobile: 1.0,
                    color: baseColor,
                    backgroundColor: bgColor,
                    ...(vantaEffect === 'birds' ? { birdSize: 1.2, wingSpan: 20, speedLimit: 4, separation: 30, alignment: 30, cohesion: 25, quantity: 3 } : {}),
                    ...(vantaEffect === 'net' ? { points: 8, maxDistance: 22, spacing: 16, showDots: true } : {}),
                    ...(vantaEffect === 'globe' ? { size: 1.2, color2: 0x6366f1 } : {}),
                    ...(vantaEffect === 'waves' ? { waveHeight: 15, waveSpeed: 0.8, shininess: 40 } : {}),
                    ...(vantaEffect === 'fog' ? { highlightColor: 0x6366f1, midtoneColor: 0x4338ca, lowlightColor: 0x1e1b4b, speed: 1.5 } : {}),
                    ...(vantaEffect === 'dots' ? { size: 2.5, spacing: 30, showLines: true } : {}),
                    ...(vantaEffect === 'topology' ? { color: baseColor, backgroundColor: bgColor } : {}),
                    ...(vantaEffect === 'rings' ? { color: baseColor, backgroundColor: bgColor } : {}),
                    ...(vantaEffect === 'halo' ? { size: 1.5, amplitudeFactor: 1.2 } : {}),
                });
                setVantaLoaded(true);
            } catch (err) {
                // Vanta failed to load — gradient fallback will show
                console.warn('[PageHeroBanner] Vanta init failed:', err);
            }
        })();

        return () => {
            cancelled = true;
            if (vantaInstanceRef.current) {
                vantaInstanceRef.current.destroy();
                vantaInstanceRef.current = null;
            }
            setVantaLoaded(false);
        };
    }, [vantaEffect, vantaColor, vantaBackgroundColor]);

    const fallbackGradient = `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`;

    return (
        <div
            ref={vantaRef}
            className={`relative w-full overflow-hidden ${className}`}
            style={{
                ...(!vantaLoaded ? { background: fallbackGradient } : {}),
            }}
        >
            {/* Dark overlay for text readability */}
            <div className="absolute inset-0 bg-black/30 z-[1]" />

            {/* Content */}
            <div className="relative z-[2] flex items-center justify-center px-4 sm:px-6 md:px-10 py-10 sm:py-12 md:py-16 lg:py-20 min-h-[280px] sm:min-h-[320px] lg:min-h-[360px]">
                <div className="w-full max-w-4xl mx-auto text-center text-white">
                    {pillText && (
                        <motion.span
                            initial={{ opacity: 0, y: -12, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                            className="inline-flex items-center gap-2 px-4 py-1.5 mb-5 text-xs font-semibold rounded-full bg-white/15 backdrop-blur-md border border-white/20 shadow-lg shadow-black/10"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {pillText}
                        </motion.span>
                    )}

                    {title && (
                        <motion.h1
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold leading-[1.1] mb-4 drop-shadow-md"
                        >
                            {title}
                        </motion.h1>
                    )}

                    {subtitle && (
                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="text-sm md:text-base text-white/80 mb-8 max-w-2xl mx-auto leading-relaxed"
                        >
                            {subtitle}
                        </motion.p>
                    )}

                    {(primaryCTA?.label || secondaryCTA?.label) && (
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="flex flex-wrap justify-center gap-3 mb-6"
                        >
                            {primaryCTA?.label && primaryCTA?.url && (
                                <Link to={primaryCTA.url}
                                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-slate-900 font-bold text-sm hover:bg-blue-50 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 shadow-[0_8px_24px_rgba(0,0,0,0.15)]">
                                    {primaryCTA.label}
                                    <ArrowRight className="w-4 h-4" />
                                </Link>
                            )}
                            {secondaryCTA?.label && secondaryCTA?.url && (
                                <Link to={secondaryCTA.url}
                                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-white/30 text-white font-semibold text-sm hover:bg-white/15 hover:border-white/50 transition-all duration-300 backdrop-blur-sm">
                                    {secondaryCTA.label}
                                </Link>
                            )}
                        </motion.div>
                    )}

                    {children}
                </div>
            </div>
        </div>
    );
}