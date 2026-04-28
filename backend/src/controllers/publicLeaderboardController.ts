// ─── publicLeaderboardController — Privacy-aware public leaderboard ──────────
//
// Exposes a *public* leaderboard for visitors without revealing PII. Names are
// masked (first name + last-name initial), and email/phone are never returned.
//
// Two scopes:
//   • points  — lifetime engagement (StudentProfile.points)
//   • streak  — current streak in days (StudentProfile.streak_current)
//
// Endpoints:
//   GET /api/public/leaderboard?scope=points|streak&limit=&offset=
//   GET /api/public/leaderboard/streak?limit=&offset=  (alias)

import type { Request, Response } from 'express';
import StudentProfile from '../models/StudentProfile';
import ResponseBuilder from '../utils/ResponseBuilder';

type LeaderboardScope = 'points' | 'streak';

function maskName(fullName: string | undefined): string {
    if (!fullName || typeof fullName !== 'string') return 'Anonymous';
    const trimmed = fullName.trim();
    if (!trimmed) return 'Anonymous';

    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) {
        const w = parts[0];
        return w.length <= 2 ? w : `${w[0]}${w[1]}***`;
    }

    const first = parts[0];
    const lastInitial = parts[parts.length - 1][0] || '';
    return `${first} ${lastInitial}.`;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const n = parseInt(String(value ?? ''), 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

export async function getPublicLeaderboard(req: Request, res: Response): Promise<void> {
    try {
        const scopeRaw = String(req.query.scope || 'points').toLowerCase();
        const scope: LeaderboardScope = scopeRaw === 'streak' ? 'streak' : 'points';

        const limit = clampInt(req.query.limit, 1, 100, 50);
        const offset = clampInt(req.query.offset, 0, 10_000, 0);

        const sortField = scope === 'streak' ? 'streak_current' : 'points';
        const filter: Record<string, unknown> =
            scope === 'streak'
                ? { streak_current: { $gt: 0 } }
                : { points: { $gt: 0 } };

        const [rows, total] = await Promise.all([
            StudentProfile.find(filter)
                .sort({ [sortField]: -1, _id: 1 })
                .skip(offset)
                .limit(limit)
                .select(
                    'full_name profile_photo_url points streak_current streak_longest institution_name'
                )
                .lean(),
            StudentProfile.countDocuments(filter),
        ]);

        const items = rows.map((row, idx) => ({
            rank: offset + idx + 1,
            displayName: maskName(row.full_name as string | undefined),
            avatarUrl: row.profile_photo_url || null,
            institution: row.institution_name || null,
            points: row.points || 0,
            streakCurrent: row.streak_current || 0,
            streakLongest: row.streak_longest || 0,
        }));

        ResponseBuilder.send(
            res,
            200,
            ResponseBuilder.success({
                scope,
                items,
                total,
                limit,
                offset,
                generatedAt: new Date().toISOString(),
            })
        );
    } catch (error) {
        console.error('[publicLeaderboard] error:', error);
        ResponseBuilder.send(
            res,
            500,
            ResponseBuilder.error('SERVER_ERROR', 'Could not load leaderboard')
        );
    }
}
