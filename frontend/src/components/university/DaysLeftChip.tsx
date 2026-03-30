import type { UrgencyState } from '../../lib/apiClient';

interface DaysLeftChipProps {
    daysLeft: number | null;
    urgencyState: UrgencyState;
    className?: string;
}

export default function DaysLeftChip({ daysLeft, urgencyState, className = '' }: DaysLeftChipProps) {
    if (urgencyState === 'unknown') {
        return <span className={`text-[11px] text-slate-500 dark:text-slate-400 ${className}`}>N/A</span>;
    }
    if (urgencyState === 'closed') {
        return <span className={`text-[11px] font-semibold text-rose-600 dark:text-rose-400 ${className}`}>Closed</span>;
    }
    if (urgencyState === 'upcoming') {
        return (
            <span className={`text-[11px] font-semibold text-sky-600 dark:text-sky-400 ${className}`}>
                {daysLeft !== null ? `Starts in ${daysLeft} days` : 'Starts soon'}
            </span>
        );
    }
    if (daysLeft === null) {
        return <span className={`text-[11px] text-slate-500 dark:text-slate-400 ${className}`}>Open</span>;
    }
    if (daysLeft <= 0) {
        return <span className={`text-[11px] font-semibold text-amber-600 dark:text-amber-400 ${className}`}>Closes today</span>;
    }
    return (
        <span className={`text-[11px] font-semibold ${urgencyState === 'closing_soon' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'} ${className}`}>
            {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
        </span>
    );
}
