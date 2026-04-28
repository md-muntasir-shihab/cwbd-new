import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Flame, Medal, Crown, Sparkles, Loader2 } from 'lucide-react';
import {
    getPublicLeaderboard,
    type PublicLeaderboardEntry,
    type PublicLeaderboardResponse,
} from '../services/api';

type Scope = 'points' | 'streak';

const PAGE_LIMIT = 50;

function RankBadge({ rank }: { rank: number }) {
    if (rank === 1) {
        return (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-2 ring-amber-300 shadow-sm">
                <Crown className="h-5 w-5" />
            </span>
        );
    }
    if (rank === 2) {
        return (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 ring-2 ring-slate-300 shadow-sm">
                <Medal className="h-5 w-5" />
            </span>
        );
    }
    if (rank === 3) {
        return (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-orange-100 text-orange-700 ring-2 ring-orange-300 shadow-sm">
                <Medal className="h-5 w-5" />
            </span>
        );
    }
    return (
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-semibold">
            {rank}
        </span>
    );
}

function formatNumber(n: number): string {
    return new Intl.NumberFormat('en-IN').format(n);
}

function PodiumCard({
    entry,
    scope,
    place,
}: {
    entry: PublicLeaderboardEntry;
    scope: Scope;
    place: 1 | 2 | 3;
}) {
    const accent =
        place === 1
            ? 'from-amber-100 via-amber-50 to-white border-amber-300'
            : place === 2
                ? 'from-slate-100 via-slate-50 to-white border-slate-300'
                : 'from-orange-100 via-orange-50 to-white border-orange-300';
    const heightClass = place === 1 ? 'sm:h-56' : place === 2 ? 'sm:h-48' : 'sm:h-44';
    const orderClass = place === 1 ? 'sm:order-2' : place === 2 ? 'sm:order-1' : 'sm:order-3';
    const valueLabel =
        scope === 'streak'
            ? `${entry.streakCurrent} day${entry.streakCurrent === 1 ? '' : 's'}`
            : `${formatNumber(entry.points)} pts`;

    return (
        <div
            className={`relative flex flex-col items-center justify-end rounded-2xl border bg-gradient-to-b ${accent} px-4 pb-5 pt-6 shadow-sm ${heightClass} ${orderClass}`}
        >
            <div className="absolute -top-7 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-muted shadow-md">
                {entry.avatarUrl ? (
                    <img
                        src={entry.avatarUrl}
                        alt={entry.displayName}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <span className="text-base font-bold text-muted-foreground">
                        {entry.displayName.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>
            <div className="mt-6 flex items-center gap-1.5">
                <RankBadge rank={place} />
            </div>
            <p className="mt-3 line-clamp-1 text-center text-base font-semibold text-foreground">
                {entry.displayName}
            </p>
            {entry.institution && (
                <p className="line-clamp-1 text-center text-xs text-muted-foreground">
                    {entry.institution}
                </p>
            )}
            <p className="mt-2 text-center text-lg font-bold text-foreground">{valueLabel}</p>
        </div>
    );
}

function LeaderboardRow({
    entry,
    scope,
}: {
    entry: PublicLeaderboardEntry;
    scope: Scope;
}) {
    return (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition hover:border-primary/40 hover:shadow-sm">
            <RankBadge rank={entry.rank} />

            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                {entry.avatarUrl ? (
                    <img
                        src={entry.avatarUrl}
                        alt={entry.displayName}
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <span className="text-sm font-semibold text-muted-foreground">
                        {entry.displayName.charAt(0).toUpperCase()}
                    </span>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                    {entry.displayName}
                </p>
                {entry.institution && (
                    <p className="truncate text-xs text-muted-foreground">
                        {entry.institution}
                    </p>
                )}
            </div>

            <div className="flex flex-col items-end gap-0.5">
                {scope === 'streak' ? (
                    <>
                        <span className="inline-flex items-center gap-1 text-sm font-bold text-orange-600">
                            <Flame className="h-4 w-4" />
                            {entry.streakCurrent}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            best {entry.streakLongest}
                        </span>
                    </>
                ) : (
                    <>
                        <span className="text-sm font-bold text-foreground">
                            {formatNumber(entry.points)}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            points
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

export default function Leaderboard() {
    const [scope, setScope] = useState<Scope>('points');
    const [page, setPage] = useState(0);

    const { data, isLoading, isError } = useQuery<PublicLeaderboardResponse>({
        queryKey: ['public-leaderboard', scope, page],
        queryFn: async () => {
            const res = await getPublicLeaderboard({
                scope,
                limit: PAGE_LIMIT,
                offset: page * PAGE_LIMIT,
            });
            return res.data;
        },
        staleTime: 60_000,
        placeholderData: (previousData) => previousData,
    });

    const items = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
    const isFirstPage = page === 0;
    const podium = isFirstPage ? items.slice(0, 3) : [];
    const rest = isFirstPage ? items.slice(3) : items;

    return (
        <div className="min-h-screen bg-background">
            {/* Hero */}
            <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/10 via-background to-background">
                <div className="container mx-auto px-4 py-12 sm:py-16">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                            <Sparkles className="h-3.5 w-3.5" />
                            CampusWay Leaderboard
                        </div>
                        <h1 className="mt-4 text-balance text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl">
                            শীর্ষ পারফর্মাররা
                        </h1>
                        <p className="mt-3 text-pretty text-base text-muted-foreground sm:text-lg">
                            Top performers across CampusWay — earn points by completing exams
                            and practice sets, build daily streaks, and climb the ranks.
                        </p>
                    </div>

                    {/* Scope toggle */}
                    <div className="mx-auto mt-8 flex max-w-md items-center justify-center rounded-full border bg-card p-1 shadow-sm">
                        <button
                            type="button"
                            onClick={() => {
                                setScope('points');
                                setPage(0);
                            }}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${scope === 'points'
                                    ? 'bg-primary text-primary-foreground shadow'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Trophy className="h-4 w-4" />
                            Points
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setScope('streak');
                                setPage(0);
                            }}
                            className={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${scope === 'streak'
                                    ? 'bg-orange-500 text-white shadow'
                                    : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <Flame className="h-4 w-4" />
                            Streaks
                        </button>
                    </div>
                </div>
            </section>

            {/* Body */}
            <section className="container mx-auto px-4 py-10">
                {isLoading ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Loading rankings...
                    </div>
                ) : isError ? (
                    <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
                        Could not load leaderboard. Please try again later.
                    </div>
                ) : items.length === 0 ? (
                    <div className="mx-auto max-w-md rounded-xl border bg-card p-8 text-center">
                        <Trophy className="mx-auto h-10 w-10 text-muted-foreground" />
                        <p className="mt-3 text-sm font-medium text-foreground">
                            No rankings yet
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Be the first to earn points and appear on the leaderboard.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Podium (first page only) */}
                        {isFirstPage && podium.length === 3 && (
                            <div className="mx-auto mb-10 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
                                <PodiumCard entry={podium[1]} scope={scope} place={2} />
                                <PodiumCard entry={podium[0]} scope={scope} place={1} />
                                <PodiumCard entry={podium[2]} scope={scope} place={3} />
                            </div>
                        )}

                        {/* Rest of table */}
                        <div className="mx-auto max-w-3xl space-y-2">
                            {rest.map((entry) => (
                                <LeaderboardRow
                                    key={`${entry.rank}-${entry.displayName}`}
                                    entry={entry}
                                    scope={scope}
                                />
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="mx-auto mt-8 flex max-w-3xl items-center justify-between gap-3 rounded-xl border bg-card p-3">
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={isFirstPage}
                                    className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-muted-foreground">
                                    Page {page + 1} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                    className="rounded-lg border px-4 py-2 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    Next
                                </button>
                            </div>
                        )}

                        {data?.generatedAt && (
                            <p className="mt-6 text-center text-xs text-muted-foreground">
                                Last updated{' '}
                                {new Date(data.generatedAt).toLocaleString('en-GB', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                })}
                            </p>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}
