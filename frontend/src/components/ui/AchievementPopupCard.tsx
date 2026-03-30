import { useEffect, useState } from 'react';
import { Trophy, X, Sparkles, Target, TrendingUp } from 'lucide-react';

type AchievementPopupCardProps = {
    open: boolean;
    onClose: () => void;
    score: number;
    rank?: number | null;
    message: string;
    showForSec?: number;
    dismissible?: boolean;
};

export default function AchievementPopupCard({
    open,
    onClose,
    score,
    rank,
    message,
    showForSec = 10,
    dismissible = true,
}: AchievementPopupCardProps) {
    const [visible, setVisible] = useState(false);
    const [render, setRender] = useState(false);

    useEffect(() => {
        if (open) {
            setRender(true);
            setTimeout(() => setVisible(true), 10);
        } else {
            setVisible(false);
            const timer = setTimeout(() => setRender(false), 300);
            return () => clearTimeout(timer);
        }
    }, [open]);

    useEffect(() => {
        if (!visible) return;
        const timer = window.setTimeout(() => {
            setVisible(false);
            setTimeout(() => {
                setRender(false);
                onClose();
            }, 300);
        }, Math.max(3, showForSec) * 1000);
        return () => window.clearTimeout(timer);
    }, [visible, showForSec, onClose]);

    if (!render) return null;

    return (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 transition-all duration-500 backdrop-blur-[8px] ${visible ? 'opacity-100' : 'opacity-0'}`}>
            <div className={`relative w-full max-w-md overflow-hidden rounded-[2.5rem] bg-indigo-950 p-8 text-white shadow-[0_0_80px_rgba(79,70,229,0.4)] transition-all duration-500 transform ${visible ? 'scale-100 translate-y-0 opacity-100' : 'scale-90 translate-y-8 opacity-0'}`}>
                
                {/* Background effects */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:18px_18px] opacity-[0.18] mix-blend-overlay"></div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[120px] bg-gradient-to-b from-indigo-500/40 to-transparent blur-3xl opacity-50"></div>
                <div className="absolute bottom-[-20%] left-[-10%] w-[150%] h-[50%] bg-gradient-to-t from-fuchsia-600/30 to-transparent blur-3xl rounded-full opacity-60"></div>
                
                {/* Border effect */}
                <div className="absolute inset-0 rounded-[2.5rem] border border-white/10 [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none"></div>

                {dismissible && (
                    <button
                        type="button"
                        onClick={() => {
                            setVisible(false);
                            setTimeout(() => {
                                setRender(false);
                                onClose();
                            }, 300);
                        }}
                        className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 hover:bg-white/15 hover:scale-110 transition-all text-slate-300 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}

                <div className="relative z-10 flex flex-col items-center">
                    <div className="relative mb-6">
                        <div className="absolute inset-0 animate-ping rounded-full bg-amber-400/20 blur-md duration-[3000ms]"></div>
                        <div className="absolute inset-[-50%] animate-spin rounded-full bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(251,191,36,0.5)_360deg)] opacity-40 duration-[3000ms]"></div>
                        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 border-amber-300/30 bg-gradient-to-tr from-amber-500/20 to-fuchsia-500/20 shadow-inner backdrop-blur-md">
                            <Trophy className="h-10 w-10 text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]" />
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-fuchsia-300">
                        <Sparkles className="h-3.5 w-3.5" />
                        Achievement Unlocked
                    </div>
                    
                    <h3 className="mt-4 text-center text-3xl font-black tracking-tight text-white drop-shadow-md">
                        {score >= 90 ? 'Outstanding!' : score >= 80 ? 'Excellent Work!' : 'Great Result!'}
                    </h3>
                    <p className="mt-2 text-center text-[15px] font-medium leading-relaxed text-indigo-100/80">
                        {message}
                    </p>

                    <div className="mt-8 flex w-full flex-col gap-3">
                        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition-all hover:bg-white/10">
                            <div className="absolute -right-4 -top-4 rounded-full bg-indigo-500/20 p-6 blur-2xl"></div>
                            <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                                        <Target className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Final Score</p>
                                        <div className="flex items-baseline gap-1.5 pt-0.5">
                                            <p className="font-mono text-2xl font-bold tracking-tight text-white leading-none">{Math.round(score)}</p>
                                            <span className="text-sm font-medium text-slate-400">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="h-12 w-12 text-indigo-400/20">
                                    <svg viewBox="0 0 36 36" className="h-full w-full rotate-[-90deg]">
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                                        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#818cf8" strokeWidth="3" strokeDasharray={`${Math.round(score)}, 100`} className="transition-all duration-1000 ease-out" />
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {rank ? (
                            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition-all hover:bg-white/10">
                                <div className="absolute -right-4 -top-4 rounded-full bg-fuchsia-500/20 p-6 blur-2xl"></div>
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/20 text-fuchsia-300">
                                        <TrendingUp className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Rank Position</p>
                                        <div className="flex items-baseline gap-1 pt-0.5">
                                            <span className="text-sm font-bold text-fuchsia-400 leading-none">#</span>
                                            <p className="font-mono text-2xl font-bold tracking-tight text-white leading-none">{rank}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <button
                        onClick={() => {
                            setVisible(false);
                            setTimeout(() => {
                                setRender(false);
                                onClose();
                            }, 300);
                        }}
                        className="mt-8 w-full rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-indigo-950 transition-all duration-300 hover:bg-slate-200 hover:-translate-y-0.5 shadow-[0_4px_20px_rgba(255,255,255,0.1)] hover:shadow-[0_8px_30px_rgba(255,255,255,0.2)]"
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}
