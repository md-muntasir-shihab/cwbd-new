import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import StudentProfile from '../models/StudentProfile';
import AdminProfile from '../models/AdminProfile';
import Exam from '../models/Exam';
import ExamResult from '../models/ExamResult';
import ExamSession from '../models/ExamSession';
import LoginActivity from '../models/LoginActivity';
import AuditLog from '../models/AuditLog';
import { getStudentDashboardAggregate } from '../services/studentDashboardService';
import StudentDashboardConfig from '../models/StudentDashboardConfig';
import StudentResult from '../models/ExamResult';
import { computeStudentProfileScore } from '../services/studentProfileScoreService';

/* ─────────────────────────────────────────
   Helpers
──────────────────────────────────────────*/

function computeProfileCompletion(profile: Record<string, unknown>): number {
    return computeStudentProfileScore(profile).score;
}

function isProfileComplete(profile: Record<string, unknown>): boolean {
    return computeStudentProfileScore(profile).eligible;
}

const DEFAULT_CELEBRATION_RULES = {
    enabled: true,
    windowDays: 7,
    minPercentage: 80,
    maxRank: 10,
    ruleMode: 'score_or_rank',
    showForSec: 10,
    dismissible: true,
    maxShowsPerDay: 2,
    messageTemplates: ['Excellent performance! Keep it up.'],
} as const;

async function resolveCelebration(userId: string) {
    const config = await StudentDashboardConfig.findOne().select('celebrationRules').lean();
    const rulesRaw = (config as Record<string, unknown> | null)?.celebrationRules as Record<string, unknown> | undefined;
    const rules = { ...DEFAULT_CELEBRATION_RULES, ...(rulesRaw || {}) };

    const windowDays = Math.max(1, Number(rules.windowDays || DEFAULT_CELEBRATION_RULES.windowDays));
    const minPercentage = Math.max(0, Number(rules.minPercentage || DEFAULT_CELEBRATION_RULES.minPercentage));
    const maxRank = Math.max(1, Number(rules.maxRank || DEFAULT_CELEBRATION_RULES.maxRank));
    const ruleMode = String(rules.ruleMode || DEFAULT_CELEBRATION_RULES.ruleMode);
    const showForSec = Math.max(3, Number(rules.showForSec || DEFAULT_CELEBRATION_RULES.showForSec));
    const dismissible = rules.dismissible === undefined ? DEFAULT_CELEBRATION_RULES.dismissible : Boolean(rules.dismissible);
    const messageTemplates = Array.isArray(rules.messageTemplates)
        ? rules.messageTemplates.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

    const fallback = {
        eligible: false,
        reasonCodes: ['disabled'],
        topPercentage: 0,
        bestRank: null as number | null,
        message: '',
        showForSec,
        dismissible,
        windowDays,
        maxShowsPerDay: Math.max(1, Number(rules.maxShowsPerDay || DEFAULT_CELEBRATION_RULES.maxShowsPerDay)),
    };

    if (!Boolean(rules.enabled)) return fallback;

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - windowDays);

    const results = await StudentResult.find({
        student: userId,
        submittedAt: { $gte: fromDate },
    })
        .select('percentage rank submittedAt')
        .sort({ submittedAt: -1 })
        .limit(50)
        .lean();

    if (!results.length) {
        return { ...fallback, reasonCodes: ['no_recent_results'] };
    }

    const topPercentage = results.reduce((best, item) => Math.max(best, Number(item.percentage || 0)), 0);
    const rankCandidates = results
        .map((item) => Number(item.rank || 0))
        .filter((rank) => Number.isFinite(rank) && rank > 0);
    const bestRank = rankCandidates.length ? Math.min(...rankCandidates) : null;
    const scoreQualified = topPercentage >= minPercentage;
    const rankQualified = bestRank !== null && bestRank <= maxRank;
    const eligible = ruleMode === 'score_and_rank'
        ? (scoreQualified && rankQualified)
        : (scoreQualified || rankQualified);
    const reasonCodes = [] as string[];
    if (scoreQualified) reasonCodes.push('score_threshold');
    if (rankQualified) reasonCodes.push('rank_threshold');
    if (!reasonCodes.length) reasonCodes.push('below_threshold');

    return {
        ...fallback,
        eligible,
        reasonCodes,
        topPercentage,
        bestRank,
        message: messageTemplates[0] || `Great progress! Best score ${Math.round(topPercentage)}%.`,
    };
}

/* ─────────────────────────────────────────
   GET /api/profile/me
──────────────────────────────────────────*/
export async function getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
        const user = await User.findById(req.user!._id)
            .select('-password -twoFactorSecret')
            .lean();

        if (!user) { res.status(404).json({ message: 'User not found.' }); return; }

        let profileData: any = null;
        if (user.role === 'student') {
            profileData = await StudentProfile.findOne({ user_id: user._id }).lean();
        } else {
            profileData = await AdminProfile.findOne({ user_id: user._id }).lean();
        }

        const [loginHistory, actionHistory] = await Promise.all([
            LoginActivity.find({ user_id: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
            user.role === 'student'
                ? Promise.resolve([])
                : AuditLog.find({ actor_id: user._id }).sort({ timestamp: -1 }).limit(20).lean(),
        ]);

        const celebration = user.role === 'student' ? await resolveCelebration(String(user._id)) : null;

        res.json({
            user: {
                ...user,
                profile: user.role === 'student'
                    ? {
                        ...(profileData || {}),
                        profile_photo_url: profileData?.profile_photo_url || user.profile_photo || '',
                    }
                    : {
                        ...(profileData || {}),
                        profile_photo: profileData?.profile_photo || user.profile_photo || '',
                    },
                fullName: user.role === 'student'
                    ? (profileData?.full_name || user.full_name)
                    : (profileData?.admin_name || user.full_name),
            },
            loginHistory,
            actionHistory,
            celebration,
        });
    } catch (err) {
        console.error('getProfile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────────────────────────────────────────
   PUT /api/profile/update
──────────────────────────────────────────*/
export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = req.user!._id;
        const user = await User.findById(userId);
        if (!user) { res.status(404).json({ message: 'User not found.' }); return; }

        if (user.role === 'student') {
            const allowed = [
                'full_name', 'phone', 'guardian_phone', 'ssc_batch', 'hsc_batch',
                'department', 'college_name', 'college_address', 'dob',
                'profile_photo_url', 'present_address', 'district', 'permanent_address', 'gender'
            ];

            const updates: Record<string, unknown> = {};
            for (const key of allowed) {
                if (req.body[key] !== undefined) updates[key] = req.body[key];
            }

            const profile = await StudentProfile.findOne({ user_id: userId });
            if (!profile) {
                res.status(404).json({ message: 'Profile not found.' });
                return;
            }

            // Update profile
            Object.assign(profile, updates);
            profile.profile_completion_percentage = computeProfileCompletion(profile.toObject() as any);
            await profile.save();
            const normalizedFullName = typeof updates.full_name === 'string'
                ? String(updates.full_name).trim()
                : '';
            const normalizedProfilePhoto = typeof updates.profile_photo_url === 'string'
                ? String(updates.profile_photo_url).trim()
                : undefined;

            const userPatch: Record<string, unknown> = {};
            if (normalizedFullName) {
                userPatch.full_name = normalizedFullName;
            }
            if (typeof normalizedProfilePhoto === 'string') {
                userPatch.profile_photo = normalizedProfilePhoto;
            }

            const updatedUser = Object.keys(userPatch).length > 0
                ? await User.findByIdAndUpdate(
                    userId,
                    { $set: userPatch },
                    { new: true },
                ).select('full_name profile_photo')
                : await User.findById(userId).select('full_name profile_photo');

            res.json({
                message: 'Profile updated.',
                profile,
                user: {
                    full_name: updatedUser?.full_name || normalizedFullName || user.full_name,
                    profile_photo: updatedUser?.profile_photo || normalizedProfilePhoto || '',
                },
            });
        } else {
            const allowed = ['admin_name', 'profile_photo'];
            const updates: Record<string, unknown> = {};
            for (const key of allowed) {
                if (req.body[key] !== undefined) updates[key] = req.body[key];
            }

            const normalizedAdminName = typeof updates.admin_name === 'string'
                ? String(updates.admin_name).trim()
                : '';
            const normalizedProfilePhoto = typeof updates.profile_photo === 'string'
                ? String(updates.profile_photo).trim()
                : undefined;

            const profilePatch: Record<string, unknown> = {
                role_level: ['superadmin', 'admin', 'moderator', 'editor', 'viewer'].includes(user.role)
                    ? user.role
                    : 'viewer',
            };
            if (typeof updates.admin_name === 'string') {
                profilePatch.admin_name = normalizedAdminName || user.full_name || user.username;
            }
            if (typeof normalizedProfilePhoto === 'string') {
                profilePatch.profile_photo = normalizedProfilePhoto;
            }

            let profile = await AdminProfile.findOne({ user_id: userId });
            if (!profile) {
                profile = await AdminProfile.create({
                    user_id: userId,
                    admin_name: String(profilePatch.admin_name || user.full_name || user.username).trim() || user.username,
                    role_level: profilePatch.role_level,
                    permissions: user.permissions || {},
                    profile_photo: typeof profilePatch.profile_photo === 'string' ? profilePatch.profile_photo : '',
                });
            } else {
                Object.assign(profile, profilePatch);
                if (!profile.permissions) {
                    profile.permissions = user.permissions || {};
                }
                await profile.save();
            }

            const userPatch: Record<string, unknown> = {};
            if (normalizedAdminName) {
                userPatch.full_name = normalizedAdminName;
            }
            if (typeof normalizedProfilePhoto === 'string') {
                userPatch.profile_photo = normalizedProfilePhoto;
            }

            const updatedUser = Object.keys(userPatch).length > 0
                ? await User.findByIdAndUpdate(
                    userId,
                    { $set: userPatch },
                    { new: true },
                ).select('full_name profile_photo')
                : await User.findById(userId).select('full_name profile_photo');

            res.json({
                message: 'Profile updated.',
                profile,
                user: {
                    full_name: updatedUser?.full_name || normalizedAdminName || user.full_name,
                    profile_photo: updatedUser?.profile_photo || normalizedProfilePhoto || '',
                },
            });
        }
    } catch (err) {
        console.error('updateProfile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────────────────────────────────────────
   GET /api/profile/dashboard
   Single endpoint → all exam data for the student
──────────────────────────────────────────*/
export async function getProfileDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Not authenticated' });
            return;
        }

        const payload = await getStudentDashboardAggregate(req.user._id);
        const nowIso = new Date().toISOString();

        const liveExams = payload.upcomingExams.filter((e) => e.status === 'live' && !e.externalExamUrl);
        const upcomingExams = payload.upcomingExams.filter((e) => e.status === 'upcoming' && !e.externalExamUrl);
        const externalExams = payload.upcomingExams.filter((e) => Boolean(e.externalExamUrl));
        const missedExams = payload.upcomingExams.filter((e) => e.status === 'completed');
        const completedExams = payload.examHistory.map((h) => ({
            resultId: h.resultId,
            exam: {
                _id: h.examId,
                title: h.examTitle,
                subject: h.subject,
            },
            obtainedMarks: h.obtainedMarks,
            totalMarks: h.totalMarks,
            percentage: h.percentage,
            rank: h.rank,
            submittedAt: h.submittedAt,
            attemptNo: h.attemptNo,
            resultPublished: true,
        }));

        res.json({
            user: {
                _id: payload.header.userId,
                fullName: payload.header.name,
                email: payload.header.email,
                profile: payload.header.profile,
                profileCompletionPct: payload.header.profileCompletionPercentage,
                profile_completion_percentage: payload.header.profileCompletionPercentage,
                profileComplete: payload.header.isProfileEligible,
                overallRank: payload.header.overallRank,
                welcomeMessage: payload.header.welcomeMessage,
            },
            upcomingExams,
            liveExams,
            completedExams,
            missedExams,
            externalExams,
            analytics: {
                totalAttempted: payload.progress.totalExams,
                avgScore: payload.progress.avgScore,
                bestScore: payload.progress.bestScore,
                accuracy: 0,
            },
            examHistory: payload.examHistory.map((h) => ({
                date: h.submittedAt,
                examTitle: h.examTitle,
                obtainedMarks: h.obtainedMarks,
                totalMarks: h.totalMarks,
                status: 'completed',
                attemptNo: h.attemptNo,
            })),
            notifications: payload.notifications,
            featuredUniversities: payload.featuredUniversities,
            badges: payload.badges,
            progress: payload.progress,
            lastUpdatedAt: payload.lastUpdatedAt || nowIso,
        });
    } catch (err) {
        console.error('getProfileDashboard error:', err);
        res.status(500).json({ message: 'Server error' });
    }
}
