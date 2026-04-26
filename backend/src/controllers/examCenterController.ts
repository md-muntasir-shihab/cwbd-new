import crypto from 'crypto';
import { Response } from 'express';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { AuthRequest } from '../middlewares/auth';
import Exam from '../models/Exam';
import ExamCenter from '../models/ExamCenter';
import ExamImportJob, { ExamImportSyncMode } from '../models/ExamImportJob';
import ExamImportRowIssue from '../models/ExamImportRowIssue';
import ExamImportTemplate from '../models/ExamImportTemplate';
import ExamMappingProfile from '../models/ExamMappingProfile';
import ExamProfileSyncLog from '../models/ExamProfileSyncLog';
import ExamResult from '../models/ExamResult';
import ExternalExamJoinLog from '../models/ExternalExamJoinLog';
import SiteSettings from '../models/Settings';
import StudentProfile from '../models/StudentProfile';
import User from '../models/User';
import { markExternalExamAttemptImported } from '../services/externalExamAttemptService';
import { syncExamResultToStudentProfile } from '../services/examProfileSyncEngine';
import { getCanonicalSubscriptionSnapshot } from '../services/subscriptionAccessService';
import { ResponseBuilder } from '../utils/responseBuilder';

type CanonicalRow = Record<string, unknown>;
type LookupUser = Record<string, unknown>;
type LookupProfile = Record<string, unknown>;
type LookupLog = Record<string, unknown>;

const DEFAULT_MATCH_PRIORITY = ['user_id', 'student_phone', 'roll_number', 'student_email', 'username', 'registration_number'];
const DEFAULT_PROFILE_UPDATE_FIELDS = ['serial_id', 'roll_number', 'registration_number', 'admit_card_number', 'exam_center', 'profile_update_note'];
const CANONICAL_IMPORT_FIELDS = [
    'attempt_ref',
    'user_id',
    'serial_id',
    'roll_number',
    'registration_number',
    'admit_card_number',
    'student_phone',
    'student_email',
    'username',
    'full_name',
    'score',
    'total_marks',
    'percentage',
    'rank',
    'pass_fail',
    'attendance_status',
    'subject_marks',
    'exam_center',
    'exam_center_code',
    'exam_center_address',
    'exam_result_note',
    'profile_update_note',
    'attempt_no',
    'submitted_at',
    'time_taken_sec',
    'correct_count',
    'wrong_count',
    'skipped_count',
    'exam_status',
] as const;

const IMPORT_FIELD_ALIASES: Record<string, string[]> = {
    attempt_ref: ['attempt_ref', 'cw_ref', 'reference', 'ref'],
    user_id: ['user_id', 'user_unique_id', 'student_id', 'student_unique_id'],
    serial_id: ['serial_id', 'serial', 'serial_no'],
    roll_number: ['roll_number', 'roll', 'roll_no'],
    registration_number: ['registration_number', 'registration_id', 'registration', 'reg_no', 'reg_id'],
    admit_card_number: ['admit_card_number', 'admit_card', 'admit_no'],
    student_phone: ['student_phone', 'phone', 'phone_number', 'mobile', 'mobile_number'],
    student_email: ['student_email', 'email', 'email_address'],
    username: ['username', 'user_name'],
    full_name: ['full_name', 'student_name', 'name'],
    score: ['score', 'obtained_marks', 'marks', 'obtained_mark'],
    total_marks: ['total_marks', 'full_marks', 'maximum_marks', 'max_marks'],
    percentage: ['percentage', 'percent', 'result_percentage'],
    rank: ['rank', 'merit', 'merit_rank'],
    pass_fail: ['pass_fail', 'result_status', 'passfail'],
    attendance_status: ['attendance_status', 'attendance'],
    subject_marks: ['subject_marks', 'subject_wise_marks'],
    exam_center: ['exam_center', 'center_name'],
    exam_center_code: ['exam_center_code', 'center_code'],
    exam_center_address: ['exam_center_address', 'center_address'],
    exam_result_note: ['exam_result_note', 'result_note', 'remarks', 'note'],
    profile_update_note: ['profile_update_note', 'profile_note'],
    attempt_no: ['attempt_no', 'attempt_number', 'attempt'],
    submitted_at: ['submitted_at', 'completed_at', 'finished_at', 'submitted_time'],
    time_taken_sec: ['time_taken_sec', 'time_taken_seconds', 'duration_sec', 'spent_seconds'],
    correct_count: ['correct_count', 'correct'],
    wrong_count: ['wrong_count', 'wrong'],
    skipped_count: ['skipped_count', 'unanswered_count', 'unattempted_count'],
    exam_status: ['exam_status', 'status'],
};

type LookupContext = {
    usersById: Map<string, LookupUser[]>;
    usersByUsername: Map<string, LookupUser[]>;
    usersByEmail: Map<string, LookupUser[]>;
    usersByPhone: Map<string, LookupUser[]>;
    profilesByUserId: Map<string, LookupProfile[]>;
    profilesByUserUniqueId: Map<string, LookupProfile[]>;
    profilesByRollNumber: Map<string, LookupProfile[]>;
    profilesByRegistration: Map<string, LookupProfile[]>;
    profilesByPhone: Map<string, LookupProfile[]>;
    profilesByEmail: Map<string, LookupProfile[]>;
    profilesByUsername: Map<string, LookupProfile[]>;
    logsByAttemptRef: Map<string, LookupLog[]>;
};

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
    return String(value ?? '').trim();
}

function asLowerString(value: unknown): string {
    return asString(value).toLowerCase();
}

function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
    return [];
}

function asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeImportKey(value: unknown): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function normalizeIdentityValue(value: unknown): string {
    return normalizeImportKey(value);
}

function pushToMap<T>(map: Map<string, T[]>, key: string, value: T): void {
    if (!key) return;
    const existing = map.get(key) || [];
    existing.push(value);
    map.set(key, existing);
}

function normalizeObjectIdArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.map((item) => String(item || '').trim()).filter(Boolean)));
}

function hasAnyIntersection(left: string[], right: string[]): boolean {
    if (left.length === 0 || right.length === 0) return false;
    const rightSet = new Set(right);
    return left.some((value) => rightSet.has(value));
}

async function isStudentEligibleForExamImport(
    exam: Record<string, unknown>,
    user: Record<string, unknown>,
    profile: Record<string, unknown> | null,
): Promise<{ allowed: boolean; reason?: string }> {
    const studentId = String(user._id || '');
    const accessControl = asRecord(exam.accessControl);
    const requiredUserIds = normalizeObjectIdArray(accessControl.allowedUserIds);
    const requiredGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
    const requiredPlanCodes = asStringArray(accessControl.allowedPlanCodes).map((item) => item.toLowerCase());
    const studentGroupIds = normalizeObjectIdArray(profile?.groupIds || []);
    const subscriptionSnapshot = await getCanonicalSubscriptionSnapshot(
        studentId,
        asRecord(user.subscription),
    );
    const studentPlanCode = subscriptionSnapshot.planCode;
    const subscriptionActive = subscriptionSnapshot.isActive && subscriptionSnapshot.allowsExams !== false;

    if (String(exam.accessMode || 'all') === 'specific') {
        const allowedUsers = Array.isArray(exam.allowedUsers) ? (exam.allowedUsers as unknown[]).map((item) => String(item)) : [];
        if (!allowedUsers.includes(studentId)) return { allowed: false, reason: 'student_not_assigned_to_exam' };
    }
    if (requiredUserIds.length > 0 && !requiredUserIds.includes(studentId)) {
        return { allowed: false, reason: 'student_not_in_allowed_users' };
    }
    if (requiredGroupIds.length > 0 && !hasAnyIntersection(requiredGroupIds, studentGroupIds)) {
        return { allowed: false, reason: 'student_not_in_allowed_groups' };
    }

    const visibilityMode = String(exam.visibilityMode || 'all_students');
    const targetGroupIds = normalizeObjectIdArray(exam.targetGroupIds || []);
    if ((visibilityMode === 'group_only' || visibilityMode === 'custom') && targetGroupIds.length > 0 && !hasAnyIntersection(targetGroupIds, studentGroupIds)) {
        return { allowed: false, reason: 'student_not_in_target_groups' };
    }
    if ((visibilityMode === 'subscription_only' || Boolean(exam.requiresActiveSubscription)) && !subscriptionActive) {
        return { allowed: false, reason: 'student_subscription_inactive' };
    }
    if (requiredPlanCodes.length > 0 && !requiredPlanCodes.includes(studentPlanCode)) {
        return { allowed: false, reason: 'student_plan_mismatch' };
    }

    return { allowed: true };
}

function readImportRowsFromBuffer(buffer: Buffer): { headers: string[]; rows: Array<Record<string, unknown>> } {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    const headers = (Array.isArray(headerRows[0]) ? headerRows[0] : []).map((value) => asString(value)).filter(Boolean);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    return { headers, rows };
}

function normalizeMapping(input: unknown): Record<string, string> {
    if (!input) return {};
    if (typeof input === 'string') {
        try {
            return normalizeMapping(JSON.parse(input));
        } catch {
            return {};
        }
    }
    if (typeof input !== 'object' || Array.isArray(input)) return {};
    return Object.entries(input as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
        const normalizedKey = normalizeImportKey(key);
        const normalizedValue = asString(value);
        if (normalizedKey && normalizedValue) acc[normalizedKey] = normalizedValue;
        return acc;
    }, {});
}

function autoDetectMapping(headers: string[]): Record<string, string> {
    const normalizedHeaders = new Map(headers.map((header) => [normalizeImportKey(header), header]));
    return CANONICAL_IMPORT_FIELDS.reduce<Record<string, string>>((acc, field) => {
        const aliases = IMPORT_FIELD_ALIASES[field] || [];
        const match = aliases.find((alias) => normalizedHeaders.has(normalizeImportKey(alias)));
        if (match) {
            const header = normalizedHeaders.get(normalizeImportKey(match));
            if (header) acc[field] = header;
        }
        return acc;
    }, {});
}

function resolveMapping(
    headers: string[],
    templateMapping: Record<string, string>,
    profileMapping: Record<string, string>,
    manualMapping: Record<string, string>,
): Record<string, string> {
    return {
        ...autoDetectMapping(headers),
        ...templateMapping,
        ...profileMapping,
        ...manualMapping,
    };
}

function getMappedValue(row: Record<string, unknown>, mapping: Record<string, string>, field: string): unknown {
    const mappedColumn = normalizeImportKey(mapping[field]);
    if (mappedColumn && row[mappedColumn] !== undefined && row[mappedColumn] !== null && row[mappedColumn] !== '') {
        return row[mappedColumn];
    }
    const aliases = IMPORT_FIELD_ALIASES[field] || [];
    for (const alias of aliases) {
        const normalized = normalizeImportKey(alias);
        if (row[normalized] !== undefined && row[normalized] !== null && row[normalized] !== '') return row[normalized];
    }
    return '';
}

function buildCanonicalRow(row: Record<string, unknown>, mapping: Record<string, string>): CanonicalRow {
    return CANONICAL_IMPORT_FIELDS.reduce<CanonicalRow>((acc, field) => {
        acc[field] = getMappedValue(row, mapping, field);
        return acc;
    }, {});
}

function normalizeMatchPriority(input: unknown, fallback?: string[]): string[] {
    const normalized = asStringArray(input).map((item) => normalizeImportKey(item)).filter(Boolean);
    if (normalized.length > 0) return Array.from(new Set(normalized));
    const base = fallback && fallback.length > 0 ? fallback : DEFAULT_MATCH_PRIORITY;
    return Array.from(new Set(base.map((item) => normalizeImportKey(item))));
}

function normalizeFieldList(input: unknown, fallback: string[]): string[] {
    const normalized = asStringArray(input).map((item) => normalizeImportKey(item)).filter(Boolean);
    return normalized.length > 0 ? Array.from(new Set(normalized)) : fallback;
}

async function getSettingsDoc(actorId?: string): Promise<Record<string, unknown>> {
    let settings = await SiteSettings.findOne();
    if (!settings) {
        settings = await SiteSettings.create({
            updatedBy: actorId && mongoose.Types.ObjectId.isValid(actorId) ? new mongoose.Types.ObjectId(actorId) : undefined,
        });
    }
    return settings.toObject() as unknown as Record<string, unknown>;
}

async function buildLookupContext(examId: string, rows: CanonicalRow[]): Promise<LookupContext> {
    const attemptRefs = Array.from(new Set(rows.map((row) => normalizeIdentityValue(row.attempt_ref)).filter(Boolean)));
    const directUserIds = Array.from(new Set(rows.map((row) => asString(row.user_id)).filter((value) => mongoose.Types.ObjectId.isValid(value))));
    const userUniqueIds = Array.from(new Set(rows.map((row) => asString(row.user_id)).filter((value) => !mongoose.Types.ObjectId.isValid(value))));
    const rollNumbers = Array.from(new Set(rows.map((row) => normalizeIdentityValue(row.roll_number)).filter(Boolean)));
    const registrationNumbers = Array.from(new Set(rows.map((row) => normalizeIdentityValue(row.registration_number)).filter(Boolean)));
    const phones = Array.from(new Set(rows.map((row) => asString(row.student_phone)).filter(Boolean)));
    const emails = Array.from(new Set(rows.map((row) => asLowerString(row.student_email)).filter(Boolean)));
    const usernames = Array.from(new Set(rows.map((row) => asLowerString(row.username)).filter(Boolean)));

    const logs = attemptRefs.length > 0
        ? await ExternalExamJoinLog.find({
            examId: new mongoose.Types.ObjectId(examId),
            attemptRef: { $in: attemptRefs },
        }).lean()
        : [];

    const profileClauses: Record<string, unknown>[] = [];
    if (userUniqueIds.length > 0) profileClauses.push({ user_unique_id: { $in: userUniqueIds } });
    if (rollNumbers.length > 0) profileClauses.push({ roll_number: { $in: rollNumbers } });
    if (registrationNumbers.length > 0) profileClauses.push({ registration_id: { $in: registrationNumbers } });
    if (phones.length > 0) {
        profileClauses.push({ phone_number: { $in: phones } });
        profileClauses.push({ phone: { $in: phones } });
    }
    if (emails.length > 0) profileClauses.push({ email: { $in: emails } });
    if (usernames.length > 0) profileClauses.push({ username: { $in: usernames } });

    const profiles = profileClauses.length > 0
        ? await StudentProfile.find({ $or: profileClauses })
            .select('user_id user_unique_id registration_id roll_number phone phone_number email username full_name groupIds institution_name department ssc_batch hsc_batch guardian_name guardian_phone')
            .lean()
        : [];

    const allUserIds = Array.from(new Set([
        ...directUserIds,
        ...logs.map((item) => String(item.studentId || '')),
        ...profiles.map((item) => String(item.user_id || '')),
    ].filter((value) => mongoose.Types.ObjectId.isValid(value))));

    const userClauses: Record<string, unknown>[] = [];
    if (allUserIds.length > 0) userClauses.push({ _id: { $in: allUserIds.map((value) => new mongoose.Types.ObjectId(value)) } });
    if (emails.length > 0) userClauses.push({ email: { $in: emails } });
    if (usernames.length > 0) userClauses.push({ username: { $in: usernames } });
    if (phones.length > 0) userClauses.push({ phone_number: { $in: phones } });

    const users = userClauses.length > 0
        ? await User.find({ $or: userClauses })
            .select('_id username email phone_number full_name subscription')
            .lean()
        : [];

    const usersById = new Map<string, LookupUser[]>();
    const usersByUsername = new Map<string, LookupUser[]>();
    const usersByEmail = new Map<string, LookupUser[]>();
    const usersByPhone = new Map<string, LookupUser[]>();
    const profilesByUserId = new Map<string, LookupProfile[]>();
    const profilesByUserUniqueId = new Map<string, LookupProfile[]>();
    const profilesByRollNumber = new Map<string, LookupProfile[]>();
    const profilesByRegistration = new Map<string, LookupProfile[]>();
    const profilesByPhone = new Map<string, LookupProfile[]>();
    const profilesByEmail = new Map<string, LookupProfile[]>();
    const profilesByUsername = new Map<string, LookupProfile[]>();
    const logsByAttemptRef = new Map<string, LookupLog[]>();

    for (const log of logs as unknown as LookupLog[]) {
        pushToMap(logsByAttemptRef, normalizeIdentityValue(log.attemptRef), log);
    }
    for (const user of users as unknown as LookupUser[]) {
        pushToMap(usersById, asString(user._id), user);
        pushToMap(usersByUsername, asLowerString(user.username), user);
        pushToMap(usersByEmail, asLowerString(user.email), user);
        pushToMap(usersByPhone, asString(user.phone_number), user);
    }
    for (const profile of profiles as unknown as LookupProfile[]) {
        pushToMap(profilesByUserId, asString(profile.user_id), profile);
        pushToMap(profilesByUserUniqueId, asString(profile.user_unique_id), profile);
        pushToMap(profilesByRollNumber, normalizeIdentityValue(profile.roll_number), profile);
        pushToMap(profilesByRegistration, normalizeIdentityValue(profile.registration_id), profile);
        pushToMap(profilesByPhone, asString(profile.phone_number || profile.phone), profile);
        pushToMap(profilesByEmail, asLowerString(profile.email), profile);
        pushToMap(profilesByUsername, asLowerString(profile.username), profile);
    }

    return {
        usersById,
        usersByUsername,
        usersByEmail,
        usersByPhone,
        profilesByUserId,
        profilesByUserUniqueId,
        profilesByRollNumber,
        profilesByRegistration,
        profilesByPhone,
        profilesByEmail,
        profilesByUsername,
        logsByAttemptRef,
    };
}

function pickSingleCandidate<T>(items: T[]): { item?: T; duplicate: boolean } {
    if (items.length === 0) return { duplicate: false };
    if (items.length > 1) return { duplicate: true };
    return { item: items[0], duplicate: false };
}

function resolveUserAndProfileFromLog(log: LookupLog | undefined, context: LookupContext): { user?: LookupUser; profile?: LookupProfile } {
    if (!log) return {};
    const studentId = asString(log.studentId);
    return {
        user: (context.usersById.get(studentId) || [])[0],
        profile: (context.profilesByUserId.get(studentId) || [])[0],
    };
}

async function matchPreviewRow(
    exam: Record<string, unknown>,
    row: CanonicalRow,
    context: LookupContext,
    matchPriority: string[],
): Promise<{
    matchedUser?: LookupUser;
    matchedProfile?: LookupProfile;
    matchedLog?: LookupLog;
    matchedBy?: string;
    issues: Array<{ issueType: string; reason: string; blocking: boolean }>;
}> {
    const issues: Array<{ issueType: string; reason: string; blocking: boolean }> = [];
    let matchedUser: LookupUser | undefined;
    let matchedProfile: LookupProfile | undefined;
    let matchedLog: LookupLog | undefined;
    let matchedBy = '';

    for (const priority of matchPriority) {
        if (priority === 'attempt_ref') {
            const key = normalizeIdentityValue(row.attempt_ref);
            if (!key) continue;
            const logs = context.logsByAttemptRef.get(key) || [];
            const picked = pickSingleCandidate(logs);
            if (picked.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple attempts matched by ${priority}.`, blocking: true }] };
            matchedLog = picked.item;
            const resolved = resolveUserAndProfileFromLog(matchedLog, context);
            matchedUser = resolved.user;
            matchedProfile = resolved.profile;
            if (matchedUser) {
                matchedBy = priority;
                break;
            }
        }

        if (priority === 'user_id') {
            const raw = asString(row.user_id);
            if (!raw) continue;
            if (mongoose.Types.ObjectId.isValid(raw)) {
                const users = context.usersById.get(raw) || [];
                const picked = pickSingleCandidate(users);
                if (picked.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
                matchedUser = picked.item;
                matchedProfile = matchedUser ? (context.profilesByUserId.get(asString(matchedUser._id)) || [])[0] : undefined;
            } else {
                const profiles = context.profilesByUserUniqueId.get(raw) || [];
                const picked = pickSingleCandidate(profiles);
                if (picked.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
                matchedProfile = picked.item;
                matchedUser = matchedProfile ? (context.usersById.get(asString(matchedProfile.user_id)) || [])[0] : undefined;
            }
            if (matchedUser) {
                matchedBy = priority;
                break;
            }
        }

        if (priority === 'student_phone') {
            const key = asString(row.student_phone);
            if (!key) continue;
            const profiles = context.profilesByPhone.get(key) || [];
            const profilePick = pickSingleCandidate(profiles);
            if (profilePick.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
            matchedProfile = profilePick.item;
            matchedUser = matchedProfile ? (context.usersById.get(asString(matchedProfile.user_id)) || [])[0] : undefined;
            if (!matchedUser) {
                const users = context.usersByPhone.get(key) || [];
                const userPick = pickSingleCandidate(users);
                if (userPick.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
                matchedUser = userPick.item;
                matchedProfile = matchedUser ? (context.profilesByUserId.get(asString(matchedUser._id)) || [])[0] : undefined;
            }
            if (matchedUser) {
                matchedBy = priority;
                break;
            }
        }

        if (priority === 'roll_number') {
            const key = normalizeIdentityValue(row.roll_number);
            if (!key) continue;
            const profiles = context.profilesByRollNumber.get(key) || [];
            const picked = pickSingleCandidate(profiles);
            if (picked.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
            matchedProfile = picked.item;
            matchedUser = matchedProfile ? (context.usersById.get(asString(matchedProfile.user_id)) || [])[0] : undefined;
            if (matchedUser) {
                matchedBy = priority;
                break;
            }
        }

        if (priority === 'student_email') {
            const key = asLowerString(row.student_email);
            if (!key) continue;
            const users = context.usersByEmail.get(key) || [];
            const userPick = pickSingleCandidate(users);
            if (userPick.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
            matchedUser = userPick.item;
            matchedProfile = matchedUser ? (context.profilesByUserId.get(asString(matchedUser._id)) || [])[0] : undefined;
            if (!matchedUser) {
                const profiles = context.profilesByEmail.get(key) || [];
                const profilePick = pickSingleCandidate(profiles);
                if (profilePick.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
                matchedProfile = profilePick.item;
                matchedUser = matchedProfile ? (context.usersById.get(asString(matchedProfile.user_id)) || [])[0] : undefined;
            }
            if (matchedUser) {
                matchedBy = priority;
                break;
            }
        }

        if (priority === 'username') {
            const key = asLowerString(row.username);
            if (!key) continue;
            const users = context.usersByUsername.get(key) || [];
            const userPick = pickSingleCandidate(users);
            if (userPick.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
            matchedUser = userPick.item;
            matchedProfile = matchedUser ? (context.profilesByUserId.get(asString(matchedUser._id)) || [])[0] : undefined;
            if (!matchedUser) {
                const profiles = context.profilesByUsername.get(key) || [];
                const profilePick = pickSingleCandidate(profiles);
                if (profilePick.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
                matchedProfile = profilePick.item;
                matchedUser = matchedProfile ? (context.usersById.get(asString(matchedProfile.user_id)) || [])[0] : undefined;
            }
            if (matchedUser) {
                matchedBy = priority;
                break;
            }
        }

        if (priority === 'registration_number') {
            const key = normalizeIdentityValue(row.registration_number);
            if (!key) continue;
            const profiles = context.profilesByRegistration.get(key) || [];
            const picked = pickSingleCandidate(profiles);
            if (picked.duplicate) return { issues: [{ issueType: 'duplicate_match', reason: `Multiple students matched by ${priority}.`, blocking: true }] };
            matchedProfile = picked.item;
            matchedUser = matchedProfile ? (context.usersById.get(asString(matchedProfile.user_id)) || [])[0] : undefined;
            if (matchedUser) {
                matchedBy = priority;
                break;
            }
        }
    }

    if (!matchedUser) return { issues: [{ issueType: 'unmatched', reason: 'No student matched the configured identity strategy.', blocking: true }] };
    const eligibility = await isStudentEligibleForExamImport(exam, matchedUser, matchedProfile || null);
    if (!eligibility.allowed) {
        return { issues: [{ issueType: 'unmatched', reason: eligibility.reason || 'Matched student is outside the exam audience.', blocking: true }] };
    }

    return { matchedUser, matchedProfile, matchedLog, matchedBy, issues };
}

function parseSubjectMarks(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
        return value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
    }
    if (typeof value !== 'string') return [];
    const raw = value.trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
    } catch {
        // ignore and continue with loose parsing
    }

    return raw.split('|')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const [subject, marks] = entry.split(':');
            return {
                subject: asString(subject),
                marks: asNumber(marks) ?? asString(marks),
            };
        });
}

function escapeCsvCell(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

function buildFailedRowsCsv(rows: Array<{ rowNumber: number; identifier: string; reason: string }>): string {
    const lines = ['rowNumber,identifier,reason'];
    rows.forEach((row) => lines.push([
        row.rowNumber,
        escapeCsvCell(row.identifier),
        escapeCsvCell(row.reason),
    ].join(',')));
    return lines.join('\n');
}

function selectProfileSyncCandidates(row: CanonicalRow, allowedFields: string[]): Record<string, unknown> {
    const allow = new Set(allowedFields);
    const maybe = (field: string, value: unknown): unknown => (allow.has(field) ? value : undefined);

    return {
        serialId: maybe('serial_id', row.serial_id),
        rollNumber: maybe('roll_number', row.roll_number),
        registrationNumber: maybe('registration_number', row.registration_number),
        admitCardNumber: maybe('admit_card_number', row.admit_card_number),
        examCenter: maybe('exam_center', row.exam_center),
        profileUpdateNote: maybe('profile_update_note', row.profile_update_note),
        fullName: maybe('full_name', row.full_name),
        email: maybe('student_email', row.student_email),
        phoneNumber: maybe('student_phone', row.student_phone),
        userUniqueId: maybe('user_id', row.user_id),
    };
}

async function previewImportInternal(req: AuthRequest): Promise<Record<string, unknown>> {
    const examId = String(req.params.id || req.params.examId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(examId)) throw new Error('Invalid exam id.');
    if (!req.file?.buffer || !req.file?.originalname) throw new Error('No file uploaded.');

    const [exam, settings] = await Promise.all([
        Exam.findById(examId).lean(),
        getSettingsDoc(String(req.user?._id || '')),
    ]);
    if (!exam) throw new Error('Exam not found.');
    if (String((exam as Record<string, unknown>).deliveryMode || 'internal') !== 'external_link') {
        throw new Error('This exam is not configured as an external-link exam.');
    }
    if (asRecord(settings.examCenterSettings).allowExternalImports === false) {
        throw new Error('External exam imports are disabled in settings.');
    }

    const { headers, rows } = readImportRowsFromBuffer(req.file.buffer);
    if (!rows.length) throw new Error('No data rows found in the uploaded file.');

    const templateId = asString(req.body.templateId);
    const mappingProfileId = asString(req.body.mappingProfileId);
    const [template, mappingProfile] = await Promise.all([
        mongoose.Types.ObjectId.isValid(templateId) ? ExamImportTemplate.findById(templateId).lean() : null,
        mongoose.Types.ObjectId.isValid(mappingProfileId) ? ExamMappingProfile.findById(mappingProfileId).lean() : null,
    ]);

    const resolvedMapping = resolveMapping(
        headers,
        normalizeMapping(template?.columnMapping),
        normalizeMapping(mappingProfile?.fieldMapping),
        normalizeMapping(req.body.mapping),
    );
    const matchPriority = normalizeMatchPriority(req.body.matchPriority, [
        ...asStringArray(mappingProfile?.matchPriority),
        ...asStringArray(template?.matchPriority),
    ]);
    const requiredColumns = normalizeFieldList(template?.requiredColumns, []);
    const profileUpdateFields = normalizeFieldList(template?.profileUpdateFields, DEFAULT_PROFILE_UPDATE_FIELDS);
    const recordOnlyFields = normalizeFieldList(template?.recordOnlyFields, []);
    const syncProfileMode = (asString(req.body.syncProfileMode) === 'fill_missing_only' || asString(req.body.syncProfileMode) === 'none')
        ? asString(req.body.syncProfileMode) as ExamImportSyncMode
        : (asRecord(settings.examCenterSettings).defaultSyncMode === 'fill_missing_only' ? 'fill_missing_only' : 'overwrite_mapped_fields');

    const normalizedRows = rows.map((row, index) => {
        const normalizedRaw = Object.entries(row).reduce<Record<string, unknown>>((acc, [key, value]) => {
            acc[normalizeImportKey(key)] = value;
            return acc;
        }, {});
        return {
            rowNumber: index + 2,
            mapped: buildCanonicalRow(normalizedRaw, resolvedMapping),
        };
    });

    const lookupContext = await buildLookupContext(examId, normalizedRows.map((row) => row.mapped));
    const issuesToPersist: Array<Record<string, unknown>> = [];
    const previewRows = await Promise.all(normalizedRows.map(async (row) => {
        const issues: Array<{ issueType: string; reason: string; blocking: boolean }> = [];
        const requiredMissing = requiredColumns.filter((field) => !asString(row.mapped[field]));
        requiredMissing.forEach((field) => issues.push({ issueType: 'missing_required', reason: `${field} is required.`, blocking: true }));

        const identityPresent = ['attempt_ref', 'user_id', 'student_phone', 'roll_number', 'student_email', 'username', 'registration_number']
            .some((field) => asString(row.mapped[field]));
        if (!identityPresent) {
            issues.push({ issueType: 'missing_required', reason: 'At least one identity field is required to match a student.', blocking: true });
        }

        const score = asNumber(row.mapped.score);
        const percentage = asNumber(row.mapped.percentage);
        const totalMarks = asNumber(row.mapped.total_marks);
        if (score === null && percentage === null) {
            issues.push({ issueType: 'missing_required', reason: 'score or percentage is required.', blocking: true });
        }
        if (percentage !== null && totalMarks === null && !asNumber((exam as Record<string, unknown>).totalMarks)) {
            issues.push({ issueType: 'invalid_value', reason: 'total_marks is required when percentage is supplied and exam total marks is not set.', blocking: true });
        }
        if (percentage !== null && (percentage < 0 || percentage > 100)) {
            issues.push({ issueType: 'invalid_value', reason: 'percentage must be between 0 and 100.', blocking: true });
        }

        const matchResult = issues.some((issue) => issue.blocking)
            ? { issues: [] as Array<{ issueType: string; reason: string; blocking: boolean }> }
            : await matchPreviewRow(exam as Record<string, unknown>, row.mapped, lookupContext, ['attempt_ref', ...matchPriority.filter((item) => item !== 'attempt_ref')]);

        const allIssues = [...issues, ...matchResult.issues];
        const identifier = asString(row.mapped.attempt_ref || row.mapped.user_id || row.mapped.registration_number || row.mapped.student_email || row.mapped.student_phone || row.mapped.username);
        allIssues.forEach((issue) => {
            issuesToPersist.push({
                rowNumber: row.rowNumber,
                issueType: issue.issueType,
                reason: issue.reason,
                blocking: issue.blocking,
                identifier,
                payload: row.mapped,
            });
        });

        return {
            rowNumber: row.rowNumber,
            mappedData: row.mapped,
            matchedStudentId: asString(matchResult.matchedUser?._id),
            matchedStudentLabel: asString(matchResult.matchedProfile?.full_name || matchResult.matchedUser?.full_name || matchResult.matchedUser?.username),
            matchedBy: asString(matchResult.matchedBy),
            matchedLogId: asString(matchResult.matchedLog?._id),
            issues: allIssues,
            blocking: allIssues.some((issue) => issue.blocking),
        };
    }));

    const summary = previewRows.reduce((acc, row) => {
        acc.totalRows += 1;
        if (!row.blocking && row.matchedStudentId) acc.matchedRows += 1;
        if (row.issues.some((issue) => issue.issueType === 'unmatched')) acc.unmatchedRows += 1;
        if (row.issues.some((issue) => issue.issueType === 'duplicate_match')) acc.duplicateMatches += 1;
        if (row.issues.some((issue) => issue.issueType === 'missing_required' || issue.issueType === 'invalid_value')) acc.invalidRows += 1;
        return acc;
    }, {
        totalRows: 0,
        matchedRows: 0,
        unmatchedRows: 0,
        duplicateMatches: 0,
        invalidRows: 0,
        committedRows: 0,
        updatedProfiles: 0,
        failedRows: 0,
    });

    const job = await ExamImportJob.create({
        examId: new mongoose.Types.ObjectId(examId),
        templateId: template?._id || null,
        mappingProfileId: mappingProfile?._id || null,
        previewToken: crypto.randomBytes(16).toString('hex'),
        status: 'previewed',
        sourceFileName: req.file.originalname || 'import',
        mimeType: req.file.mimetype || '',
        headers,
        resolvedMapping,
        matchPriority,
        profileUpdateFields,
        recordOnlyFields,
        syncProfileMode,
        previewRows,
        summary,
        uploadedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
    });

    if (issuesToPersist.length > 0) {
        await ExamImportRowIssue.insertMany(issuesToPersist.map((issue) => ({
            ...issue,
            jobId: job._id,
            examId: job.examId,
        })));
    }

    return {
        message: 'Import preview generated.',
        job: {
            _id: String(job._id),
            previewToken: job.previewToken,
            status: job.status,
            summary: job.summary,
            headers,
            resolvedMapping,
            matchPriority,
            profileUpdateFields,
            recordOnlyFields,
            rows: previewRows.slice(0, 25),
            totalPreviewRows: previewRows.length,
        },
    };
}

export async function adminPreviewExamImport(req: AuthRequest, res: Response): Promise<void> {
    try {
        ResponseBuilder.send(res, 200, ResponseBuilder.success(await previewImportInternal(req)));
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate import preview.';
        const statusCode = message.includes('not found') ? 404 : 400;
        const code = message.includes('not found') ? 'NOT_FOUND' : 'VALIDATION_ERROR';
        ResponseBuilder.send(res, statusCode, ResponseBuilder.error(code, message));
    }
}

export async function adminCommitExamImport(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam id.'));
            return;
        }

        const previewToken = asString(req.body.previewToken);
        if (!previewToken) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'previewToken is required.'));
            return;
        }

        const [exam, job, settings] = await Promise.all([
            Exam.findById(examId).lean(),
            ExamImportJob.findOne({ examId: new mongoose.Types.ObjectId(examId), previewToken }),
            getSettingsDoc(String(req.user?._id || '')),
        ]);
        if (!exam) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }
        if (!job) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Preview job not found.'));
            return;
        }

        const profileUpdateFields = normalizeFieldList(job.profileUpdateFields, DEFAULT_PROFILE_UPDATE_FIELDS);
        const syncProfileMode = (asString(req.body.syncProfileMode) === 'fill_missing_only' || asString(req.body.syncProfileMode) === 'none')
            ? asString(req.body.syncProfileMode) as ExamImportSyncMode
            : job.syncProfileMode;

        const resultIssues: Array<{ rowNumber: number; identifier: string; reason: string }> = [];
        let committedRows = 0;
        let updatedProfiles = 0;

        for (const previewRow of job.previewRows as Array<Record<string, unknown>>) {
            const mappedData = asRecord(previewRow.mappedData);
            const blocking = Boolean(previewRow.blocking);
            const matchedStudentId = asString(previewRow.matchedStudentId);
            const identifier = asString(
                mappedData.attempt_ref || mappedData.user_id || mappedData.registration_number || mappedData.student_email || mappedData.student_phone || mappedData.username
            );

            if (blocking || !mongoose.Types.ObjectId.isValid(matchedStudentId)) {
                resultIssues.push({
                    rowNumber: Number(previewRow.rowNumber || 0),
                    identifier,
                    reason: 'Skipped because the preview contained blocking issues.',
                });
                continue;
            }

            const totalMarks = asNumber(mappedData.total_marks) ?? Math.max(0, Number((exam as Record<string, unknown>).totalMarks || 0));
            const importedScore = asNumber(mappedData.score);
            const importedPercentage = asNumber(mappedData.percentage);
            const obtainedMarks = importedScore !== null
                ? Math.max(0, Math.min(totalMarks > 0 ? totalMarks : importedScore, importedScore))
                : (totalMarks > 0 && importedPercentage !== null ? Number(((totalMarks * importedPercentage) / 100).toFixed(2)) : 0);
            const percentage = importedPercentage !== null
                ? Math.max(0, Math.min(100, importedPercentage))
                : (totalMarks > 0 ? Number(((obtainedMarks / totalMarks) * 100).toFixed(2)) : 0);
            const submittedAt = asString(mappedData.submitted_at) ? new Date(asString(mappedData.submitted_at)) : new Date();
            const attemptNo = Math.max(1, Number(asNumber(mappedData.attempt_no) || 1));
            const matchedLogId = asString(previewRow.matchedLogId);

            let resultDoc;
            try {
                resultDoc = await ExamResult.findOneAndUpdate(
                    {
                        exam: new mongoose.Types.ObjectId(examId),
                        student: new mongoose.Types.ObjectId(matchedStudentId),
                        attemptNo,
                    },
                    {
                        $set: {
                            exam: new mongoose.Types.ObjectId(examId),
                            student: new mongoose.Types.ObjectId(matchedStudentId),
                            attemptNo,
                            sourceType: 'external_import',
                            importJobId: job._id,
                            syncStatus: syncProfileMode === 'none' ? 'pending' : 'synced',
                            answers: [],
                            totalMarks,
                            obtainedMarks,
                            correctCount: Math.max(0, Number(asNumber(mappedData.correct_count) || 0)),
                            wrongCount: Math.max(0, Number(asNumber(mappedData.wrong_count) || 0)),
                            unansweredCount: Math.max(0, Number(asNumber(mappedData.skipped_count) || 0)),
                            percentage,
                            rank: asNumber(mappedData.rank) ?? undefined,
                            serialId: asString(mappedData.serial_id),
                            rollNumber: asString(mappedData.roll_number),
                            registrationNumber: asString(mappedData.registration_number),
                            admitCardNumber: asString(mappedData.admit_card_number),
                            attendanceStatus: asString(mappedData.attendance_status),
                            passFail: asString(mappedData.pass_fail),
                            resultNote: asString(mappedData.exam_result_note),
                            profileUpdateNote: asString(mappedData.profile_update_note),
                            examCenterName: asString(mappedData.exam_center || asRecord((exam as Record<string, unknown>).examCenterSnapshot).name),
                            examCenterCode: asString(mappedData.exam_center_code || asRecord((exam as Record<string, unknown>).examCenterSnapshot).code),
                            subjectMarks: parseSubjectMarks(mappedData.subject_marks),
                            pointsEarned: Math.round(percentage),
                            timeTaken: Math.max(0, Number(asNumber(mappedData.time_taken_sec) || 0)),
                            deviceInfo: 'external_import_preview_commit',
                            browserInfo: 'external_import_preview_commit',
                            ipAddress: '',
                            tabSwitchCount: 0,
                            submittedAt,
                            isAutoSubmitted: false,
                            status: 'evaluated',
                        },
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true },
                );
            } catch (error) {
                resultIssues.push({
                    rowNumber: Number(previewRow.rowNumber || 0),
                    identifier,
                    reason: error instanceof Error ? error.message : 'Failed to save result.',
                });
                continue;
            }

            committedRows += 1;

            if (asRecord(settings.examCenterSettings).autoCreateExamCenters !== false && asString(mappedData.exam_center)) {
                const centerName = asString(mappedData.exam_center);
                const centerCode = asString(mappedData.exam_center_code);
                const centerAddress = asString(mappedData.exam_center_address);
                await ExamCenter.findOneAndUpdate(
                    centerCode ? { code: centerCode } : { name: centerName },
                    {
                        $set: {
                            name: centerName,
                            code: centerCode,
                            address: centerAddress,
                            note: asString(mappedData.exam_result_note),
                            updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
                        },
                        $setOnInsert: {
                            createdBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
                        },
                    },
                    { upsert: true, new: true },
                );
            }

            const syncResult = await syncExamResultToStudentProfile({
                exam: exam as Record<string, unknown>,
                result: resultDoc.toObject() as unknown as Record<string, unknown>,
                studentId: matchedStudentId,
                source: 'external_import',
                syncMode: syncProfileMode,
                createdBy: String(req.user?._id || ''),
                importJobId: String(job._id),
                candidates: selectProfileSyncCandidates(mappedData, profileUpdateFields),
                notifyStudent: asRecord(settings.examCenterSettings).notifyStudentsOnSync !== false,
            });
            if (syncResult.changed) updatedProfiles += 1;

            if (matchedLogId || asString(mappedData.attempt_ref)) {
                await markExternalExamAttemptImported({
                    attemptId: matchedLogId,
                    attemptRef: asString(mappedData.attempt_ref),
                    resultId: String(resultDoc._id),
                    matchedBy: asString(previewRow.matchedBy),
                });
            }
        }

        job.status = committedRows === 0 ? 'failed' : resultIssues.length > 0 ? 'partial' : 'committed';
        job.summary.committedRows = committedRows;
        job.summary.updatedProfiles = updatedProfiles;
        job.summary.failedRows = resultIssues.length;
        job.failedRowsCsv = buildFailedRowsCsv(resultIssues);
        job.committedBy = mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null;
        job.committedAt = new Date();
        await job.save();

        if (resultIssues.length > 0) {
            await ExamImportRowIssue.insertMany(resultIssues.map((issue) => ({
                jobId: job._id,
                examId: job.examId,
                rowNumber: issue.rowNumber,
                issueType: 'save_failed',
                identifier: issue.identifier,
                reason: issue.reason,
                blocking: true,
                payload: null,
            })));
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            message: job.status === 'committed' ? 'Import committed successfully.' : 'Import committed with issues.',
            job: {
                _id: String(job._id),
                previewToken: job.previewToken,
                status: job.status,
                summary: job.summary,
                failedRowsCsv: job.failedRowsCsv,
            },
        }));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to commit import.'));
    }
}

export async function adminGetExamImportLogs(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam id.'));
            return;
        }

        const jobs = await ExamImportJob.find({ examId: new mongoose.Types.ObjectId(examId) })
            .sort({ createdAt: -1 })
            .limit(25)
            .lean();
        const jobIds = jobs.map((job) => job._id);
        const issues = jobIds.length > 0
            ? await ExamImportRowIssue.find({ jobId: { $in: jobIds } })
                .sort({ createdAt: -1 })
                .limit(100)
                .lean()
            : [];

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            logs: jobs.map((job) => ({
                ...job,
                _id: String(job._id),
                examId: String(job.examId),
                templateId: job.templateId ? String(job.templateId) : null,
                mappingProfileId: job.mappingProfileId ? String(job.mappingProfileId) : null,
                uploadedBy: job.uploadedBy ? String(job.uploadedBy) : null,
                committedBy: job.committedBy ? String(job.committedBy) : null,
            })),
            issues: issues.map((issue) => ({
                ...issue,
                _id: String(issue._id),
                jobId: String(issue.jobId),
                examId: String(issue.examId),
            })),
        }));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to load import logs.'));
    }
}

export async function adminGetExamImportTemplates(_req: AuthRequest, res: Response): Promise<void> {
    try {
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ templates: await ExamImportTemplate.find({}).sort({ updatedAt: -1 }).lean() }));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to load templates.'));
    }
}

export async function adminCreateExamImportTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
        const template = await ExamImportTemplate.create({
            name: asString(req.body.name),
            description: asString(req.body.description),
            expectedColumns: normalizeFieldList(req.body.expectedColumns, []),
            requiredColumns: normalizeFieldList(req.body.requiredColumns, []),
            columnMapping: normalizeMapping(req.body.columnMapping || req.body.mapping),
            matchPriority: normalizeMatchPriority(req.body.matchPriority),
            profileUpdateFields: normalizeFieldList(req.body.profileUpdateFields, DEFAULT_PROFILE_UPDATE_FIELDS),
            recordOnlyFields: normalizeFieldList(req.body.recordOnlyFields, []),
            isActive: req.body.isActive !== false,
            createdBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
            updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
        });
        ResponseBuilder.send(res, 201, ResponseBuilder.created({ template }, 'Template created.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to create template.'));
    }
}

export async function adminUpdateExamImportTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
        const template = await ExamImportTemplate.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    name: req.body.name !== undefined ? asString(req.body.name) : undefined,
                    description: req.body.description !== undefined ? asString(req.body.description) : undefined,
                    expectedColumns: req.body.expectedColumns !== undefined ? normalizeFieldList(req.body.expectedColumns, []) : undefined,
                    requiredColumns: req.body.requiredColumns !== undefined ? normalizeFieldList(req.body.requiredColumns, []) : undefined,
                    columnMapping: req.body.columnMapping !== undefined || req.body.mapping !== undefined ? normalizeMapping(req.body.columnMapping || req.body.mapping) : undefined,
                    matchPriority: req.body.matchPriority !== undefined ? normalizeMatchPriority(req.body.matchPriority) : undefined,
                    profileUpdateFields: req.body.profileUpdateFields !== undefined ? normalizeFieldList(req.body.profileUpdateFields, DEFAULT_PROFILE_UPDATE_FIELDS) : undefined,
                    recordOnlyFields: req.body.recordOnlyFields !== undefined ? normalizeFieldList(req.body.recordOnlyFields, []) : undefined,
                    isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
                    updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
                },
            },
            { new: true },
        );
        if (!template) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Template not found.'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ template }, 'Template updated.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to update template.'));
    }
}

export async function adminDeleteExamImportTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
        const deleted = await ExamImportTemplate.findByIdAndDelete(req.params.id);
        if (!deleted) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Template not found.'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Template deleted.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to delete template.'));
    }
}

export async function adminGetExamMappingProfiles(_req: AuthRequest, res: Response): Promise<void> {
    try {
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ profiles: await ExamMappingProfile.find({}).sort({ updatedAt: -1 }).lean() }));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to load mapping profiles.'));
    }
}

export async function adminCreateExamMappingProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
        const profile = await ExamMappingProfile.create({
            name: asString(req.body.name),
            description: asString(req.body.description),
            matchPriority: normalizeMatchPriority(req.body.matchPriority),
            fieldMapping: normalizeMapping(req.body.fieldMapping || req.body.mapping),
            requiredColumns: normalizeFieldList(req.body.requiredColumns, []),
            isActive: req.body.isActive !== false,
            createdBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
            updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
        });
        ResponseBuilder.send(res, 201, ResponseBuilder.created({ profile }, 'Mapping profile created.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to create mapping profile.'));
    }
}

export async function adminUpdateExamMappingProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
        const profile = await ExamMappingProfile.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    name: req.body.name !== undefined ? asString(req.body.name) : undefined,
                    description: req.body.description !== undefined ? asString(req.body.description) : undefined,
                    matchPriority: req.body.matchPriority !== undefined ? normalizeMatchPriority(req.body.matchPriority) : undefined,
                    fieldMapping: req.body.fieldMapping !== undefined || req.body.mapping !== undefined ? normalizeMapping(req.body.fieldMapping || req.body.mapping) : undefined,
                    requiredColumns: req.body.requiredColumns !== undefined ? normalizeFieldList(req.body.requiredColumns, []) : undefined,
                    isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
                    updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
                },
            },
            { new: true },
        );
        if (!profile) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Mapping profile not found.'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ profile }, 'Mapping profile updated.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to update mapping profile.'));
    }
}

export async function adminDeleteExamMappingProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
        const deleted = await ExamMappingProfile.findByIdAndDelete(req.params.id);
        if (!deleted) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Mapping profile not found.'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Mapping profile deleted.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to delete mapping profile.'));
    }
}

export async function adminGetExamCenters(_req: AuthRequest, res: Response): Promise<void> {
    try {
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ centers: await ExamCenter.find({}).sort({ updatedAt: -1 }).lean() }));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to load exam centers.'));
    }
}

export async function adminCreateExamCenter(req: AuthRequest, res: Response): Promise<void> {
    try {
        const center = await ExamCenter.create({
            name: asString(req.body.name),
            address: asString(req.body.address),
            code: asString(req.body.code),
            note: asString(req.body.note),
            isActive: req.body.isActive !== false,
            createdBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
            updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
        });
        ResponseBuilder.send(res, 201, ResponseBuilder.created({ center }, 'Exam center created.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to create exam center.'));
    }
}

export async function adminUpdateExamCenter(req: AuthRequest, res: Response): Promise<void> {
    try {
        const center = await ExamCenter.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    name: req.body.name !== undefined ? asString(req.body.name) : undefined,
                    address: req.body.address !== undefined ? asString(req.body.address) : undefined,
                    code: req.body.code !== undefined ? asString(req.body.code) : undefined,
                    note: req.body.note !== undefined ? asString(req.body.note) : undefined,
                    isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined,
                    updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : null,
                },
            },
            { new: true },
        );
        if (!center) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam center not found.'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ center }, 'Exam center updated.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to update exam center.'));
    }
}

export async function adminDeleteExamCenter(req: AuthRequest, res: Response): Promise<void> {
    try {
        const deleted = await ExamCenter.findByIdAndDelete(req.params.id);
        if (!deleted) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam center not found.'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(null, 'Exam center deleted.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to delete exam center.'));
    }
}

export async function adminRunExamProfileSync(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam id.'));
            return;
        }
        const exam = await Exam.findById(examId).lean();
        if (!exam) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }
        const results = await ExamResult.find({ exam: new mongoose.Types.ObjectId(examId) }).sort({ submittedAt: -1 }).limit(200).lean();
        let synced = 0;
        let failed = 0;

        for (const result of results as Array<Record<string, unknown>>) {
            const syncResult = await syncExamResultToStudentProfile({
                exam: exam as Record<string, unknown>,
                result,
                studentId: asString(result.student),
                source: 'manual_resync',
                syncMode: 'overwrite_mapped_fields',
                createdBy: String(req.user?._id || ''),
                notifyStudent: false,
                candidates: {
                    serialId: result.serialId,
                    rollNumber: result.rollNumber,
                    registrationNumber: result.registrationNumber,
                    admitCardNumber: result.admitCardNumber,
                    examCenter: result.examCenterName,
                    profileUpdateNote: result.profileUpdateNote,
                },
            });
            if (syncResult.status === 'failed') failed += 1;
            else synced += 1;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ synced, failed }, 'Profile sync run completed.'));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to run profile sync.'));
    }
}

export async function adminGetExamProfileSyncLogs(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid exam id.'));
            return;
        }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            logs: await ExamProfileSyncLog.find({ examId: new mongoose.Types.ObjectId(examId) })
                .sort({ createdAt: -1 })
                .limit(100)
                .populate('studentId', 'full_name username email')
                .lean(),
        }));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to load sync logs.'));
    }
}

export async function adminGetExamCenterSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
        const settings = await getSettingsDoc(String(req.user?._id || ''));
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ settings: asRecord(settings.examCenterSettings) }));
    } catch (error) {
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', error instanceof Error ? error.message : 'Failed to load exam settings.'));
    }
}

export async function adminUpdateExamCenterSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
        let settings = await SiteSettings.findOne();
        if (!settings) {
            settings = await SiteSettings.create({
                updatedBy: mongoose.Types.ObjectId.isValid(String(req.user?._id || '')) ? new mongoose.Types.ObjectId(String(req.user?._id)) : undefined,
            });
        }

        settings.examCenterSettings = {
            defaultSyncMode: asString(req.body.defaultSyncMode) === 'fill_missing_only' ? 'fill_missing_only' : 'overwrite_mapped_fields',
            autoCreateExamCenters: req.body.autoCreateExamCenters !== false,
            notifyStudentsOnSync: req.body.notifyStudentsOnSync !== false,
            notifyGuardiansOnResult: req.body.notifyGuardiansOnResult === true,
            allowExternalImports: req.body.allowExternalImports !== false,
        };
        if (mongoose.Types.ObjectId.isValid(String(req.user?._id || ''))) {
            settings.updatedBy = new mongoose.Types.ObjectId(String(req.user?._id));
        }
        await settings.save();

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ settings: settings.examCenterSettings }, 'Exam settings updated.'));
    } catch (error) {
        ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', error instanceof Error ? error.message : 'Failed to update exam settings.'));
    }
}
