import { parseUniversityDate } from '../../../lib/universityPresentation';

/* ─── Types ─── */

export interface ProgressBarProps {
    startDate: string | undefined;
    endDate: string | undefined;
    closingSoonDays: number;
    className?: string;
}

export interface ProgressResult {
    /** Elapsed percentage clamped to [0, 100] */
    percentage: number;
    /** Remaining calendar days (0 when passed) */
    remainingDays: number;
    /** Color bucket based on closingSoonDays threshold */
    color: 'emerald' | 'amber' | 'gray';
}

/* ─── Pure calculation helper (exported for property testing) ─── */

export function calculateProgress(
    startDate: string | undefined,
    endDate: string | undefined,
    closingSoonDays: number,
    now: Date = new Date(),
): ProgressResult | null {
    const start = parseUniversityDate(startDate);
    const end = parseUniversityDate(endDate);

    if (!start || !end) return null;

    const startMs = start.getTime();
    const endMs = end.getTime();
    const nowMs = now.getTime();

    const total = endMs - startMs;
    if (total <= 0) return null;

    const elapsed = nowMs - startMs;
    const percentage = Math.min(100, Math.max(0, (elapsed / total) * 100));

    const diffMs = endMs - nowMs;
    const remainingDays = diffMs > 0 ? Math.ceil(diffMs / (24 * 60 * 60 * 1000)) : 0;

    const safeThreshold = Math.max(1, closingSoonDays);

    let color: ProgressResult['color'];
    if (remainingDays <= 0) {
        color = 'gray';
    } else if (remainingDays <= safeThreshold) {
        color = 'amber';
    } else {
        color = 'emerald';
    }

    return { percentage, remainingDays, color };
}


/* ─── Color maps ─── */

const barColors: Record<ProgressResult['color'], string> = {
    emerald: 'bg-emerald-500 dark:bg-emerald-400',
    amber: 'bg-amber-500 dark:bg-amber-400',
    gray: 'bg-gray-400 dark:bg-gray-500',
};

const textColors: Record<ProgressResult['color'], string> = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    gray: 'text-gray-500 dark:text-gray-400',
};

/* ─── Component ─── */

export default function ProgressBar({
    startDate,
    endDate,
    closingSoonDays,
    className = '',
}: ProgressBarProps) {
    const result = calculateProgress(startDate, endDate, closingSoonDays);
    if (!result) return null;

    const { percentage, remainingDays, color } = result;

    const label =
        remainingDays <= 0
            ? 'Closed'
            : remainingDays === 1
                ? '1 day left'
                : `${remainingDays} days left`;

    return (
        <div className={`w-full ${className}`}>
            <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                        className={`h-full rounded-full transition-all duration-500 ${barColors[color]}`}
                        style={{ width: `${remainingDays <= 0 ? 100 : percentage}%` }}
                    />
                </div>
                <span
                    className={`shrink-0 text-[10px] font-semibold ${textColors[color]}`}
                >
                    {label}
                </span>
            </div>
        </div>
    );
}
