import { Response } from 'express';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import Exam from '../models/Exam';
import Question from '../models/Question';
import { ExamQuestionModel } from '../models/examQuestion.model';
import ExamResult from '../models/ExamResult';
import ExamSession from '../models/ExamSession';
import ExamEvent from '../models/ExamEvent';
import User from '../models/User';
import StudentGroup from '../models/StudentGroup';
import StudentProfile from '../models/StudentProfile';
import ExternalExamJoinLog from '../models/ExternalExamJoinLog';
import AnnouncementNotice from '../models/AnnouncementNotice';
import Notification from '../models/Notification';
import AuditLog from '../models/AuditLog';
import { getSensitiveActionContext } from '../middlewares/sensitiveAction';
import { broadcastStudentDashboardEvent } from '../realtime/studentDashboardStream';
import { submitExamAsSystem } from './examController';
import { broadcastExamAttemptEventByMeta } from '../realtime/examAttemptStream';
import { addAdminLiveStreamClient, broadcastAdminLiveEvent } from '../realtime/adminLiveStream';
import { getSignedUploadForBanner } from '../services/uploadProvider';
import { getExamCardMetrics } from '../services/examCardMetricsService';
import { computeStudentProfileScore } from '../services/studentProfileScoreService';
import { markExternalExamAttemptImported } from '../services/externalExamAttemptService';
import { syncExamResultToStudentProfile } from '../services/examProfileSyncEngine';
import { getCanonicalSubscriptionSnapshot } from '../services/subscriptionAccessService';
import { VALID_POLICY_KEYS } from '../validators/adminSchemas';
import { validateExamPayload } from '../validators/examValidation';
import { getClientIp, getDeviceInfo } from '../utils/requestMeta';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import {
    adminCommitUniversityImport,
    adminInitUniversityImport,
    adminValidateUniversityImport,
} from './universityImportController';

interface PopulatedStudent { username: string; fullName: string; email: string; }
function asStudent(s: unknown): PopulatedStudent { return s as PopulatedStudent; }
function asRecordObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asStringArray(input: unknown): string[] {
    if (Array.isArray(input)) return input.map((x) => String(x).trim()).filter(Boolean);
    if (typeof input === 'string') return input.split(',').map((x) => x.trim()).filter(Boolean);
    return [];
}

function slugifyText(value: unknown): string {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 120);
}

function generateExamSlugSeed(exam: Record<string, unknown>): string {
    const title = String(exam.title || '').trim();
    const subject = String(exam.subject || '').trim();
    const seed = slugifyText(`${title}-${subject}`);
    return seed || `exam-${Date.now()}`;
}

function createUniqueShareSlug(base: string): string {
    const suffix = Math.random().toString(36).slice(2, 7);
    return `${base}-${suffix}`.replace(/-+/g, '-');
}

function normalizeObjectIdArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.map((item) => String(item || '').trim()).filter(Boolean)));
}

function statusBadgeForExam(exam: Record<string, unknown>, now = new Date()): 'upcoming' | 'live' | 'completed' | 'draft' {
    const isPublished = Boolean(exam.isPublished);
    if (!isPublished) return 'draft';
    const start = new Date(String(exam.startDate || ''));
    const end = new Date(String(exam.endDate || ''));
    if (!Number.isNaN(start.getTime()) && now < start) return 'upcoming';
    if (!Number.isNaN(end.getTime()) && now > end) return 'completed';
    return 'live';
}

function normalizeDeliveryMode(payload: Record<string, unknown>): void {
    const incomingDeliveryMode = String(payload.deliveryMode || '').trim().toLowerCase();
    const normalizedDeliveryMode = incomingDeliveryMode === 'external_link' || incomingDeliveryMode === 'internal'
        ? incomingDeliveryMode
        : (payload.externalExamUrl ? 'external_link' : 'internal');
    payload.deliveryMode = normalizedDeliveryMode;

    const incomingBannerSource = String(payload.bannerSource || '').trim().toLowerCase();
    if (incomingBannerSource === 'upload' || incomingBannerSource === 'url' || incomingBannerSource === 'default') {
        payload.bannerSource = incomingBannerSource;
        return;
    }
    payload.bannerSource = payload.bannerImageUrl ? 'url' : 'default';
}

function normalizeExamPayload(body: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = { ...body };
    const scheduleStartOverride = String(payload.examWindowStartUTC || payload.scheduleStart || '').trim();
    const scheduleEndOverride = String(payload.examWindowEndUTC || payload.scheduleEnd || '').trim();
    const resultPublishOverride = String(payload.resultPublishAtUTC || '').trim();
    if (payload.marksPerQuestion !== undefined && payload.defaultMarksPerQuestion === undefined) {
        payload.defaultMarksPerQuestion = Number(payload.marksPerQuestion || 1);
    }
    if (payload.negativeMarksValue !== undefined && payload.negativeMarkValue === undefined) {
        payload.negativeMarkValue = Number(payload.negativeMarksValue || 0);
    }
    if (payload.maxAnswerChangeLimit !== undefined && payload.answerEditLimitPerQuestion === undefined) {
        payload.answerEditLimitPerQuestion = Number(payload.maxAnswerChangeLimit || 0);
    }
    if (scheduleStartOverride) {
        payload.startDate = scheduleStartOverride;
    } else if (payload.scheduleStart && !payload.startDate) {
        payload.startDate = payload.scheduleStart;
    }
    if (scheduleEndOverride) {
        payload.endDate = scheduleEndOverride;
    } else if (payload.scheduleEnd && !payload.endDate) {
        payload.endDate = payload.scheduleEnd;
    }

    /* ── New admin panel field-name mappings ── */
    if (payload.durationMinutes !== undefined && payload.duration === undefined) {
        payload.duration = Number(payload.durationMinutes || 30);
    }
    if (resultPublishOverride) {
        payload.resultPublishDate = resultPublishOverride;
    } else if (payload.resultPublishAtUTC && !payload.resultPublishDate) {
        payload.resultPublishDate = payload.resultPublishAtUTC;
    }
    if (payload.examCategory && !payload.group_category) {
        payload.group_category = payload.examCategory;
    }
    if (payload.shuffleQuestions !== undefined && payload.randomizeQuestions === undefined) {
        payload.randomizeQuestions = Boolean(payload.shuffleQuestions);
    }
    if (payload.shuffleOptions !== undefined && payload.randomizeOptions === undefined) {
        payload.randomizeOptions = Boolean(payload.shuffleOptions);
    }
    if (payload.negativeMarkingEnabled !== undefined && payload.negativeMarking === undefined) {
        payload.negativeMarking = Boolean(payload.negativeMarkingEnabled);
    }
    if (payload.negativePerWrong !== undefined && payload.negativeMarkValue === undefined) {
        payload.negativeMarkValue = Number(payload.negativePerWrong || 0);
    }
    if (payload.answerChangeLimit !== undefined && payload.answerEditLimitPerQuestion === undefined) {
        payload.answerEditLimitPerQuestion = payload.answerChangeLimit === null ? undefined : Number(payload.answerChangeLimit);
    }
    if (payload.showTimer !== undefined && payload.showRemainingTime === undefined) {
        payload.showRemainingTime = Boolean(payload.showTimer);
    }

    /* ── Defaults for required fields the new form omits ── */
    if (payload.totalQuestions === undefined) payload.totalQuestions = 0;
    if (payload.totalMarks === undefined) payload.totalMarks = 0;

    if (!payload.resultPublishDate && payload.endDate) {
        payload.resultPublishDate = payload.endDate;
    }
    if (payload.branchFilters !== undefined) {
        payload.branchFilters = asStringArray(payload.branchFilters);
    }
    if (payload.batchFilters !== undefined) {
        payload.batchFilters = asStringArray(payload.batchFilters);
    }

    /* ── Visibility & audience fields ── */
    const validVisibilityModes = ['all_students', 'group_only', 'subscription_only', 'custom'];
    if (payload.visibilityMode !== undefined) {
        if (!validVisibilityModes.includes(String(payload.visibilityMode))) {
            payload.visibilityMode = 'all_students';
        }
    }
    if (payload.targetGroupIds !== undefined) {
        payload.targetGroupIds = toObjectIdList(asStringArray(payload.targetGroupIds));
    }
    if (payload.requiresActiveSubscription !== undefined) {
        payload.requiresActiveSubscription = Boolean(payload.requiresActiveSubscription);
    }
    if (payload.requiresPayment !== undefined) {
        payload.requiresPayment = Boolean(payload.requiresPayment);
    }
    if (payload.minimumProfileScore !== undefined) {
        const score = parseNumeric(payload.minimumProfileScore);
        payload.minimumProfileScore = score !== null ? Math.max(0, Math.min(100, score)) : undefined;
    }
    if (payload.displayOnDashboard !== undefined) {
        payload.displayOnDashboard = Boolean(payload.displayOnDashboard);
    }
    if (payload.displayOnPublicList !== undefined) {
        payload.displayOnPublicList = Boolean(payload.displayOnPublicList);
    }
    if (payload.isActive !== undefined) {
        payload.isActive = Boolean(payload.isActive);
    }

    normalizeDeliveryMode(payload);
    return payload;
}

function asObjectId(value: unknown): mongoose.Types.ObjectId | null {
    const raw = String(value || '').trim();
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
    return new mongoose.Types.ObjectId(raw);
}

function toObjectIdList(values: string[]): mongoose.Types.ObjectId[] {
    const dedup = new Set<string>();
    const items: mongoose.Types.ObjectId[] = [];
    for (const value of values) {
        const parsed = asObjectId(value);
        if (!parsed) continue;
        const key = String(parsed);
        if (dedup.has(key)) continue;
        dedup.add(key);
        items.push(parsed);
    }
    return items;
}

function parseLooseDate(value: unknown): Date | null {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function parseNumeric(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeImportKey(value: unknown): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s\-]+/g, '_');
}

function escapeCsvCell(value: unknown): string {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
}

function detectFileFormat(filename: string): 'xlsx' | 'csv' {
    const lower = filename.trim().toLowerCase();
    if (lower.endsWith('.csv')) return 'csv';
    return 'xlsx';
}

function readImportRowsFromBuffer(buffer: Buffer, filename: string): Array<Record<string, unknown>> {
    const format = detectFileFormat(filename);
    if (format === 'csv') {
        const wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
        const firstSheet = wb.SheetNames[0];
        if (!firstSheet) return [];
        return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], { defval: '' });
    }

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], { defval: '' });
}

function hasAnyIntersection(left: string[], right: string[]): boolean {
    if (left.length === 0 || right.length === 0) return false;
    const rightSet = new Set(right);
    return left.some((value) => rightSet.has(value));
}

function computeProfileCompletion(profile: Record<string, unknown>, user?: Record<string, unknown>): number {
    return computeStudentProfileScore(profile, user).score;
}

async function updateStudentPoints(studentId: string): Promise<void> {
    const results = await ExamResult.find({ student: studentId }).lean();
    const totalPoints = results.reduce((sum, item) => {
        const rankBonus = item.rank ? Math.max(0, 100 - Number(item.rank)) : 0;
        return sum + Number(item.percentage || 0) + rankBonus;
    }, 0);

    const allStudents = await StudentProfile.find({}).sort({ points: -1 }).select('user_id points').lean();
    const myIndex = allStudents.findIndex((row) => String(row.user_id) === studentId);

    await StudentProfile.findOneAndUpdate(
        { user_id: studentId },
        {
            points: Math.round(totalPoints),
            rank: myIndex !== -1 ? myIndex + 1 : undefined,
        },
        { upsert: true }
    );
}

type ExternalImportSyncMode = 'none' | 'fill_missing_only' | 'overwrite_mapped_fields';

const EXTERNAL_IMPORT_FIELD_ALIASES: Record<string, string[]> = {
    attempt_ref: ['attempt_ref', 'cw_ref', 'reference', 'ref'],
    registration_id: ['registration_id', 'registration_number', 'registration', 'reg_id', 'reg_no'],
    user_unique_id: ['user_unique_id', 'student_id', 'student_unique_id'],
    username: ['username', 'user_name'],
    email: ['email', 'email_address'],
    phone_number: ['phone_number', 'phone', 'mobile', 'mobile_number'],
    full_name: ['full_name', 'name', 'student_name'],
    obtained_marks: ['obtained_marks', 'obtained_mark', 'marks_obtained', 'score', 'marks'],
    total_marks: ['total_marks', 'full_marks', 'total', 'exam_total'],
    percentage: ['percentage', 'percent', 'result_percentage'],
    time_taken_sec: ['time_taken_sec', 'time_taken_seconds', 'duration_sec', 'spent_seconds'],
    submitted_at: ['submitted_at', 'submitted_at_utc', 'completed_at', 'finished_at', 'submitted_time'],
    attempt_no: ['attempt_no', 'attempt_number', 'attempt'],
    correct_count: ['correct_count', 'correct'],
    wrong_count: ['wrong_count', 'wrong'],
    unanswered_count: ['unanswered_count', 'unanswered', 'unattempted_count', 'skipped_count'],
    exam_name: ['exam_name', 'exam_title', 'title'],
    subject: ['subject', 'subject_name'],
    institution_name: ['institution_name', 'institution', 'college_name'],
    roll_number: ['roll_number', 'roll', 'roll_no'],
    department: ['department', 'dept'],
    ssc_batch: ['ssc_batch'],
    hsc_batch: ['hsc_batch', 'batch'],
    guardian_name: ['guardian_name'],
    guardian_phone: ['guardian_phone', 'guardian_mobile'],
};

function normalizeImportMapping(input: unknown): Record<string, string> {
    if (!input) return {};
    if (typeof input === 'string') {
        try {
            return normalizeImportMapping(JSON.parse(input));
        } catch {
            return {};
        }
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return Object.entries(input as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, value]) => {
        const normalizedKey = normalizeImportKey(key);
        if (!normalizedKey || !EXTERNAL_IMPORT_FIELD_ALIASES[normalizedKey]) return acc;
        const normalizedValue = normalizeImportKey(value);
        if (normalizedValue) acc[normalizedKey] = normalizedValue;
        return acc;
    }, {});
}

function readExternalImportValue(
    row: Record<string, unknown>,
    mapping: Record<string, string>,
    targetField: string,
): unknown {
    const mappedColumn = mapping[targetField];
    if (mappedColumn && row[mappedColumn] !== undefined && row[mappedColumn] !== null && row[mappedColumn] !== '') {
        return row[mappedColumn];
    }
    if (row[targetField] !== undefined && row[targetField] !== null && row[targetField] !== '') {
        return row[targetField];
    }
    const aliases = EXTERNAL_IMPORT_FIELD_ALIASES[targetField] || [];
    for (const alias of aliases) {
        const normalizedAlias = normalizeImportKey(alias);
        if (row[normalizedAlias] !== undefined && row[normalizedAlias] !== null && row[normalizedAlias] !== '') {
            return row[normalizedAlias];
        }
    }
    return '';
}

function buildCanonicalExternalImportRow(
    row: Record<string, unknown>,
    mapping: Record<string, string>,
): Record<string, unknown> {
    const canonical: Record<string, unknown> = {};
    for (const field of Object.keys(EXTERNAL_IMPORT_FIELD_ALIASES)) {
        canonical[field] = readExternalImportValue(row, mapping, field);
    }
    return canonical;
}

function normalizeExternalImportSyncMode(value: unknown): ExternalImportSyncMode {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'none' || normalized === 'overwrite_mapped_fields') return normalized;
    return 'fill_missing_only';
}

function normalizeLookupValue(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function normalizeExternalImportRegistrationId(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function shouldApplyImportedValue(currentValue: unknown, nextValue: unknown, mode: ExternalImportSyncMode): boolean {
    if (nextValue === null || nextValue === undefined || nextValue === '') return false;
    if (mode === 'overwrite_mapped_fields') return true;
    return String(currentValue || '').trim() === '';
}

async function syncImportedStudentProfile(input: {
    user: Record<string, unknown>;
    profile: Record<string, unknown> | null;
    row: Record<string, unknown>;
    mode: ExternalImportSyncMode;
}): Promise<boolean> {
    if (input.mode === 'none') return false;

    const userId = String(input.user._id || '');
    if (!mongoose.Types.ObjectId.isValid(userId)) return false;

    const userUpdates: Record<string, unknown> = {};
    const profileUpdates: Record<string, unknown> = {};
    const profileSource = input.profile || {};

    const fullName = String(input.row.full_name || '').trim();
    const email = String(input.row.email || '').trim().toLowerCase();
    const phoneNumber = String(input.row.phone_number || '').trim();
    const registrationId = String(input.row.registration_id || '').trim();
    const institutionName = String(input.row.institution_name || '').trim();
    const rollNumber = String(input.row.roll_number || '').trim();
    const department = String(input.row.department || '').trim().toLowerCase();
    const sscBatch = String(input.row.ssc_batch || '').trim();
    const hscBatch = String(input.row.hsc_batch || '').trim();
    const guardianName = String(input.row.guardian_name || '').trim();
    const guardianPhone = String(input.row.guardian_phone || '').trim();

    if (shouldApplyImportedValue(input.user.full_name, fullName, input.mode)) {
        userUpdates.full_name = fullName;
    }
    if (shouldApplyImportedValue(input.user.email, email, input.mode)) {
        userUpdates.email = email;
    }
    if (shouldApplyImportedValue(input.user.phone_number, phoneNumber, input.mode)) {
        userUpdates.phone_number = phoneNumber;
    }

    if (shouldApplyImportedValue(profileSource.full_name, fullName, input.mode)) profileUpdates.full_name = fullName;
    if (shouldApplyImportedValue(profileSource.email, email, input.mode)) profileUpdates.email = email;
    if (shouldApplyImportedValue(profileSource.phone_number, phoneNumber, input.mode)) profileUpdates.phone_number = phoneNumber;
    if (shouldApplyImportedValue(profileSource.phone, phoneNumber, input.mode)) profileUpdates.phone = phoneNumber;
    if (shouldApplyImportedValue(profileSource.registration_id, registrationId, input.mode)) profileUpdates.registration_id = registrationId;
    if (shouldApplyImportedValue(profileSource.institution_name, institutionName, input.mode)) profileUpdates.institution_name = institutionName;
    if (shouldApplyImportedValue(profileSource.roll_number, rollNumber, input.mode)) profileUpdates.roll_number = rollNumber;
    if (shouldApplyImportedValue(profileSource.ssc_batch, sscBatch, input.mode)) profileUpdates.ssc_batch = sscBatch;
    if (shouldApplyImportedValue(profileSource.hsc_batch, hscBatch, input.mode)) profileUpdates.hsc_batch = hscBatch;
    if (shouldApplyImportedValue(profileSource.guardian_name, guardianName, input.mode)) profileUpdates.guardian_name = guardianName;
    if (shouldApplyImportedValue(profileSource.guardian_phone, guardianPhone, input.mode)) profileUpdates.guardian_phone = guardianPhone;
    if (['science', 'arts', 'commerce'].includes(department) && shouldApplyImportedValue(profileSource.department, department, input.mode)) {
        profileUpdates.department = department;
    }

    let userDoc = input.user;
    if (Object.keys(userUpdates).length > 0) {
        userDoc = await User.findByIdAndUpdate(userId, { $set: userUpdates }, { new: true, lean: true }) as unknown as Record<string, unknown>;
    }

    const nextProfile = {
        ...profileSource,
        ...profileUpdates,
        user_id: new mongoose.Types.ObjectId(userId),
        full_name: String(profileUpdates.full_name || profileSource.full_name || userDoc.full_name || ''),
        email: String(profileUpdates.email || profileSource.email || userDoc.email || ''),
        phone_number: String(profileUpdates.phone_number || profileSource.phone_number || userDoc.phone_number || ''),
        phone: String(profileUpdates.phone || profileSource.phone || userDoc.phone_number || ''),
    };
    const nextCompletion = computeProfileCompletion(nextProfile, userDoc);

    await StudentProfile.findOneAndUpdate(
        { user_id: new mongoose.Types.ObjectId(userId) },
        {
            $set: {
                ...profileUpdates,
                full_name: nextProfile.full_name,
                email: nextProfile.email,
                phone_number: nextProfile.phone_number,
                phone: nextProfile.phone,
                profile_completion_percentage: nextCompletion,
            },
            $setOnInsert: {
                user_id: new mongoose.Types.ObjectId(userId),
                groupIds: Array.isArray((profileSource as { groupIds?: unknown[] }).groupIds) ? (profileSource as { groupIds?: unknown[] }).groupIds : [],
            },
        },
        { upsert: true }
    );

    return Object.keys(userUpdates).length > 0 || Object.keys(profileUpdates).length > 0;
}

async function isStudentEligibleForExamImport(
    exam: Record<string, unknown>,
    user: Record<string, unknown>,
    profile: Record<string, unknown> | null,
): Promise<{ allowed: boolean; reason?: string }> {
    const studentId = String(user._id || '');
    const accessControl = (exam.accessControl && typeof exam.accessControl === 'object')
        ? (exam.accessControl as Record<string, unknown>)
        : {};
    const requiredUserIds = normalizeObjectIdArray(accessControl.allowedUserIds);
    const requiredGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
    const requiredPlanCodes = asStringArray(accessControl.allowedPlanCodes).map((item) => item.toLowerCase());
    const studentGroupIds = normalizeObjectIdArray((profile as { groupIds?: unknown[] } | null)?.groupIds || []);
    const subscriptionSnapshot = await getCanonicalSubscriptionSnapshot(
        studentId,
        (user.subscription as Record<string, unknown> | undefined),
    );
    const studentPlanCode = subscriptionSnapshot.planCode;
    const subscriptionActive = subscriptionSnapshot.isActive && subscriptionSnapshot.allowsExams !== false;

    if (String(exam.accessMode || 'all') === 'specific') {
        const allowedUsers = Array.isArray(exam.allowedUsers) ? (exam.allowedUsers as unknown[]).map((item) => String(item)) : [];
        if (!allowedUsers.includes(studentId)) {
            return { allowed: false, reason: 'student_not_assigned_to_exam' };
        }
    }
    if (requiredUserIds.length > 0 && !requiredUserIds.includes(studentId)) {
        return { allowed: false, reason: 'student_not_in_allowed_users' };
    }
    if (requiredGroupIds.length > 0 && !hasAnyIntersection(requiredGroupIds, studentGroupIds)) {
        return { allowed: false, reason: 'student_not_in_allowed_groups' };
    }

    const visibilityMode = String(exam.visibilityMode || 'all_students');
    if (visibilityMode === 'group_only' || visibilityMode === 'custom') {
        const targetGroupIds = normalizeObjectIdArray(exam.targetGroupIds || []);
        if (targetGroupIds.length > 0 && !hasAnyIntersection(targetGroupIds, studentGroupIds)) {
            return { allowed: false, reason: 'student_not_in_target_groups' };
        }
    }
    if ((visibilityMode === 'subscription_only' || Boolean(exam.requiresActiveSubscription)) && !subscriptionActive) {
        return { allowed: false, reason: 'student_subscription_inactive' };
    }
    if (requiredPlanCodes.length > 0 && !requiredPlanCodes.includes(studentPlanCode)) {
        return { allowed: false, reason: 'student_plan_mismatch' };
    }
    return { allowed: true };
}

async function recomputeGlobalExamRanks(examId: string): Promise<void> {
    const rows = await ExamResult.find({ exam: examId })
        .sort({ obtainedMarks: -1, timeTaken: 1, submittedAt: 1 })
        .select('_id')
        .lean();
    if (!rows.length) return;
    const ops = rows.map((row, idx) => ({
        updateOne: {
            filter: { _id: row._id },
            update: { $set: { rank: idx + 1 } },
        },
    }));
    await ExamResult.bulkWrite(ops, { ordered: false });
}

async function createExamAudienceNotice(examDoc: Record<string, unknown>, actorId: mongoose.Types.ObjectId, action: 'published' | 'updated'): Promise<void> {
    const examId = String(examDoc._id || '');
    if (!mongoose.Types.ObjectId.isValid(examId)) return;

    const title = String(examDoc.title || 'Exam').trim() || 'Exam';
    const startDate = examDoc.startDate ? new Date(String(examDoc.startDate)) : null;
    const startLabel = startDate && !Number.isNaN(startDate.getTime()) ? startDate.toLocaleString() : 'soon';
    const actionLabel = action === 'published' ? 'published' : 'updated';
    const noticeTitle = `Exam ${actionLabel}: ${title}`;
    const noticeMessage = `Exam "${title}" is ${actionLabel}. Start time: ${startLabel}.`;

    const accessControl = (examDoc.accessControl && typeof examDoc.accessControl === 'object')
        ? (examDoc.accessControl as Record<string, unknown>)
        : {};
    const allowedGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
    const target = allowedGroupIds.length > 0 ? 'groups' : 'all';

    const notice = await AnnouncementNotice.create({
        title: noticeTitle,
        message: noticeMessage,
        target,
        targetIds: target === 'groups' ? allowedGroupIds : [],
        startAt: new Date(),
        endAt: null,
        isActive: true,
        createdBy: actorId,
    });

    let targetUserIds: mongoose.Types.ObjectId[] = [];
    if (target === 'groups') {
        const profiles = await StudentProfile.find({ groupIds: { $in: toObjectIdList(allowedGroupIds) } })
            .select('user_id')
            .lean();
        targetUserIds = toObjectIdList(profiles.map((profile) => String(profile.user_id || '')).filter(Boolean));
    }

    await Notification.updateOne(
        { reminderKey: `notice:${String(notice._id)}` },
        {
            $set: {
                title: noticeTitle,
                message: noticeMessage,
                category: 'exam',
                publishAt: notice.startAt,
                expireAt: notice.endAt || null,
                isActive: true,
                linkUrl: `/exam/${examId}`,
                attachmentUrl: '',
                targetRole: 'student',
                targetUserIds,
                createdBy: actorId,
                updatedBy: actorId,
            },
            $setOnInsert: { reminderKey: `notice:${String(notice._id)}` },
        },
        { upsert: true },
    );
}

async function broadcastExamMetricsSnapshot(examId: string, source: string): Promise<void> {
    try {
        const exam = await Exam.findById(examId)
            .select('_id accessControl allowedUsers allowed_user_ids')
            .lean();
        if (!exam) return;
        const metricsMap = await getExamCardMetrics([exam as unknown as Record<string, unknown>]);
        const metrics = metricsMap.get(String(exam._id)) || {
            examId: String(exam._id),
            totalParticipants: 0,
            attemptedUsers: 0,
            remainingUsers: 0,
            activeUsers: 0,
        };
        broadcastAdminLiveEvent('exam-metrics-updated', {
            source,
            ...metrics,
        });
    } catch {
        // non-blocking metrics broadcast
    }
}

/* ─────── EXAM CRUD ─────── */

export async function adminGetExams(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { page = '1', limit = '20', q, search, subject, status, groupCategory, includeMetrics, view, groupBy } = req.query;
        const pageNum = Math.max(1, parseInt(page as string));
        const limitNum = Math.min(100, parseInt(limit as string));
        const filter: Record<string, unknown> = {};
        const queryText = String(q || search || '').trim();
        if (queryText) {
            filter.$or = [
                { title: { $regex: queryText, $options: 'i' } },
                { subject: { $regex: queryText, $options: 'i' } },
                { subjectBn: { $regex: queryText, $options: 'i' } },
                { group_category: { $regex: queryText, $options: 'i' } },
            ];
        }
        if (subject) filter.subject = subject;
        if (groupCategory) filter.group_category = groupCategory;
        if (status && String(status).toLowerCase() === 'draft') filter.isPublished = false;
        if (status && String(status).toLowerCase() !== 'draft') {
            const now = new Date();
            if (String(status).toLowerCase() === 'upcoming') {
                filter.isPublished = true;
                filter.startDate = { $gt: now };
            } else if (String(status).toLowerCase() === 'completed') {
                filter.isPublished = true;
                filter.endDate = { $lt: now };
            } else if (String(status).toLowerCase() === 'live') {
                filter.isPublished = true;
                filter.startDate = { $lte: now };
                filter.endDate = { $gte: now };
            }
        }

        const total = await Exam.countDocuments(filter);
        const examsRaw = await Exam.find(filter)
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .populate('createdBy', 'username fullName')
            .lean();

        const shouldIncludeMetrics = String(includeMetrics || '').toLowerCase() === 'true' || String(view || '').toLowerCase() === 'cards';
        const metrics = shouldIncludeMetrics ? await getExamCardMetrics(examsRaw as Array<Record<string, unknown>>) : new Map();

        const groupIdSet = new Set<string>();
        for (const exam of examsRaw as Array<Record<string, unknown>>) {
            const accessControl = (exam.accessControl as Record<string, unknown> | undefined) || {};
            for (const groupId of normalizeObjectIdArray(accessControl.allowedGroupIds)) {
                groupIdSet.add(groupId);
            }
        }
        const groupRows = groupIdSet.size > 0
            ? await StudentGroup.find({ _id: { $in: Array.from(groupIdSet) } }).select('name slug').lean()
            : [];
        const groupNameMap = new Map<string, string>(
            groupRows.map((group) => [String(group._id), String(group.name || group.slug || '')]),
        );

        const now = new Date();
        const exams: Array<Record<string, unknown>> = (examsRaw as Array<Record<string, unknown>>).map((exam) => {
            const examId = String(exam._id || '');
            const accessControl = (exam.accessControl as Record<string, unknown> | undefined) || {};
            const allowedGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
            const groupNames = allowedGroupIds
                .map((id) => groupNameMap.get(id))
                .filter(Boolean) as string[];
            const metric = metrics.get(examId) || {
                examId,
                totalParticipants: 0,
                attemptedUsers: 0,
                remainingUsers: 0,
                activeUsers: 0,
            };
            return {
                ...exam,
                accessControl: {
                    ...(exam.accessControl as Record<string, unknown> || {}),
                    allowedGroupIds,
                },
                groupNames,
                statusBadge: statusBadgeForExam(exam, now),
                totalParticipants: Number(metric.totalParticipants || 0),
                attemptedUsers: Number(metric.attemptedUsers || 0),
                remainingUsers: Number(metric.remainingUsers || 0),
                activeUsers: Number(metric.activeUsers || 0),
                shareUrl: exam.share_link ? `/exam/take/${String(exam.share_link)}` : '',
            };
        });

        if (String(groupBy || '').toLowerCase() === 'category') {
            const groupedByCategory = exams.reduce<Record<string, Record<string, unknown>[]>>((acc, exam) => {
                const key = String(exam.group_category || 'Custom');
                if (!acc[key]) acc[key] = [];
                acc[key].push(exam);
                return acc;
            }, {});
            res.json({
                exams,
                grouped: { byCategory: groupedByCategory },
                pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
            });
            return;
        }
        if (String(groupBy || '').toLowerCase() === 'status') {
            const groupedByStatus = exams.reduce<Record<string, Record<string, unknown>[]>>((acc, exam) => {
                const key = String((exam as Record<string, unknown>).statusBadge || 'draft');
                if (!acc[key]) acc[key] = [];
                acc[key].push(exam);
                return acc;
            }, {});
            res.json({
                exams,
                grouped: { byStatus: groupedByStatus },
                pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
            });
            return;
        }

        res.json({ exams, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } });
    } catch (err) {
        console.error('[adminGetExams]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetExamById(req: AuthRequest, res: Response): Promise<void> {
    try {
        const exam = await Exam.findById(req.params.id).populate('createdBy', 'username fullName').lean();
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }
        const questionCount = await Question.countDocuments({ exam: req.params.id });
        const accessControl = (exam.accessControl as Record<string, unknown> | undefined) || {};
        const allowedGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
        const allowedGroups = allowedGroupIds.length > 0
            ? await StudentGroup.find({ _id: { $in: allowedGroupIds } }).select('name slug').lean()
            : [];
        res.json({
            exam: {
                ...exam,
                questionCount,
                accessControl: {
                    ...(exam.accessControl as Record<string, unknown> || {}),
                    allowedGroupIds,
                },
                allowedGroups,
                shareUrl: (exam as Record<string, unknown>).share_link ? `/exam/take/${String((exam as Record<string, unknown>).share_link)}` : '',
            }
        });
    } catch (err) {
        console.error('[adminGetExamById]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminCreateExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const payload = normalizeExamPayload(req.body as Record<string, unknown>);

        const validation = validateExamPayload(payload);
        if (!validation.valid) {
            res.status(400).json({ success: false, message: 'Validation failed', errors: validation.errors });
            return;
        }

        const incomingShareLink = String(payload.share_link || '').trim();
        payload.share_link = incomingShareLink || await ensureUniqueExamShareLink(generateExamSlugSeed(payload));
        payload.short_link = String(payload.short_link || payload.share_link || '');
        const exam = await Exam.create({ ...payload, createdBy: req.user!._id });
        broadcastStudentDashboardEvent({ type: 'exam_updated', meta: { action: 'create', examId: String(exam._id) } });
        void broadcastExamMetricsSnapshot(String(exam._id), 'exam_create');
        res.status(201).json({ exam, message: 'Exam created successfully.' });
    } catch (err) {
        console.error('[adminCreateExam]', err);
        res.status(500).json({
            message: 'Server error',
            ...(process.env.NODE_ENV === 'production'
                ? {}
                : { error: err instanceof Error ? err.message : String(err) }),
        });
    }
}

export async function adminUpdateExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const payload = normalizeExamPayload(req.body as Record<string, unknown>);

        const validation = validateExamPayload(payload);
        if (!validation.valid) {
            res.status(400).json({ success: false, message: 'Validation failed', errors: validation.errors });
            return;
        }

        // Validate antiCheatOverrides — reject unknown keys (Req 11.6)
        if (payload.antiCheatOverrides !== undefined && payload.antiCheatOverrides !== null) {
            if (typeof payload.antiCheatOverrides !== 'object' || Array.isArray(payload.antiCheatOverrides)) {
                res.status(400).json({ message: 'antiCheatOverrides must be an object', code: 'VALIDATION_ERROR' });
                return;
            }
            const overrideKeys = Object.keys(payload.antiCheatOverrides as Record<string, unknown>);
            const unknownKeys = overrideKeys.filter((key) => !(VALID_POLICY_KEYS as readonly string[]).includes(key));
            if (unknownKeys.length > 0) {
                res.status(400).json({
                    message: `Unknown antiCheatOverrides keys: ${unknownKeys.join(', ')}`,
                    code: 'UNKNOWN_OVERRIDE_KEY',
                });
                return;
            }
        }

        if (payload.share_link !== undefined) {
            const requestedShareLink = String(payload.share_link || '').trim();
            payload.share_link = requestedShareLink
                ? await ensureUniqueExamShareLink(slugifyText(requestedShareLink) || generateExamSlugSeed(payload), String(req.params.id || ''))
                : '';
        }
        const exam = await Exam.findByIdAndUpdate(
            req.params.id,
            { ...payload, updatedAt: new Date() },
            { new: true, runValidators: true }
        );
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }
        broadcastStudentDashboardEvent({ type: 'exam_updated', meta: { action: 'update', examId: String(exam._id) } });
        void broadcastExamMetricsSnapshot(String(exam._id), 'exam_update');
        if (exam.isPublished) {
            const actorId = asObjectId(req.user?._id);
            if (actorId) {
                void createExamAudienceNotice(exam.toObject() as unknown as Record<string, unknown>, actorId, 'updated')
                    .catch((noticeErr) => console.warn('[adminUpdateExam notice]', noticeErr));
            }
        }
        res.json({ exam, message: 'Exam updated successfully.' });
    } catch (err) {
        console.error('[adminUpdateExam]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminAssignExamGroups(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || '');
        const { targetGroupIds, visibilityMode } = req.body as { targetGroupIds?: string[]; visibilityMode?: string };

        if (!examId) { res.status(400).json({ message: 'Exam ID is required' }); return; }

        const updatePayload: Record<string, unknown> = {};
        if (Array.isArray(targetGroupIds)) {
            updatePayload.targetGroupIds = targetGroupIds;
        }
        if (visibilityMode && ['all_students', 'group_only', 'subscription_only', 'custom'].includes(visibilityMode)) {
            updatePayload.visibilityMode = visibilityMode;
        }

        const exam = await Exam.findByIdAndUpdate(examId, updatePayload, { new: true, runValidators: true });
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }

        broadcastStudentDashboardEvent({ type: 'exam_updated', meta: { action: 'assign_groups', examId } });
        res.json({ exam, message: 'Exam group assignment updated successfully.' });
    } catch (err) {
        console.error('[adminAssignExamGroups]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminDeleteExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }
        await Promise.all([
            Exam.findByIdAndDelete(req.params.id),
            Question.deleteMany({ exam: req.params.id }),
            ExamResult.deleteMany({ exam: req.params.id }),
            ExamSession.deleteMany({ exam: req.params.id }),
        ]);
        broadcastStudentDashboardEvent({ type: 'exam_updated', meta: { action: 'delete', examId: req.params.id } });
        res.json({ message: 'Exam and all related data deleted.' });
    } catch (err) {
        console.error('[adminDeleteExam]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminPublishExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examDoc = await Exam.findById(req.params.id);
        if (!examDoc) { res.status(404).json({ message: 'Exam not found' }); return; }

        const deliveryMode = String(examDoc.deliveryMode || 'internal').trim().toLowerCase();
        const questionCount = deliveryMode === 'external_link'
            ? 0
            : await Question.countDocuments({
                $or: [{ exam: req.params.id }, { examId: req.params.id }],
            });
        if (deliveryMode !== 'external_link' && questionCount === 0) {
            res.status(400).json({ message: 'Cannot publish an exam with no questions. Add at least one question first.' });
            return;
        }
        const exam = await Exam.findByIdAndUpdate(req.params.id, { isPublished: true }, { new: true });
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }
        broadcastStudentDashboardEvent({ type: 'exam_updated', meta: { action: 'publish', examId: String(exam._id) } });
        const actorId = asObjectId(req.user?._id);
        if (actorId) {
            void createExamAudienceNotice(exam.toObject() as unknown as Record<string, unknown>, actorId, 'published')
                .catch((noticeErr) => console.warn('[adminPublishExam notice]', noticeErr));
        }
        res.json({ message: 'Exam published.', exam });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminCloneExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const source = await Exam.findById(req.params.id).lean();
        if (!source) {
            res.status(404).json({ message: 'Exam not found' });
            return;
        }

        const clonedExamPayload = {
            ...source,
            _id: undefined,
            title: `${String(source.title || 'Exam')} (Copy)`,
            isPublished: false,
            status: 'draft',
            share_link: '',
            short_link: '',
            createdBy: req.user?._id,
            createdAt: undefined,
            updatedAt: undefined,
        };
        const clonedExam = await Exam.create(clonedExamPayload);

        // Duplicate legacy Question records
        const sourceQuestions = await Question.find({ exam: source._id }).lean();
        if (sourceQuestions.length > 0) {
            await Question.insertMany(sourceQuestions.map((q) => ({
                ...q,
                _id: undefined,
                exam: clonedExam._id,
                createdAt: undefined,
                updatedAt: undefined,
            })));
        }

        // Duplicate ExamQuestion records, preserving orderIndex and marks
        const sourceExamQuestions = await ExamQuestionModel.find({ examId: String(source._id) }).lean();
        if (sourceExamQuestions.length > 0) {
            await ExamQuestionModel.insertMany(sourceExamQuestions.map((eq) => ({
                ...eq,
                _id: undefined,
                examId: String(clonedExam._id),
                createdAt: undefined,
                updatedAt: undefined,
            })));
        }

        // Update totalQuestions on the cloned exam based on all duplicated questions
        const totalQ = Math.max(sourceQuestions.length, sourceExamQuestions.length);
        if (totalQ > 0) {
            const totalMarks = sourceExamQuestions.reduce((sum, eq) => sum + ((eq as any).marks || 0), 0);
            await Exam.findByIdAndUpdate(clonedExam._id, {
                totalQuestions: totalQ,
                ...(totalMarks > 0 ? { totalMarks } : {}),
            });
        }

        broadcastStudentDashboardEvent({ type: 'exam_updated', meta: { action: 'clone', examId: String(clonedExam._id) } });
        res.status(201).json({ exam: clonedExam, message: 'Exam cloned successfully.' });
    } catch (err) {
        console.error('[adminCloneExam]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── AUTO-GENERATE ─────── */

export async function adminAutoGenerateExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const body = (req.body || {}) as Record<string, unknown>;
        const distribution = body.distribution as Record<string, unknown> | undefined;

        if (!distribution || typeof distribution !== 'object') {
            res.status(400).json({ message: 'distribution object with easy, medium, hard counts is required.' });
            return;
        }

        const easy = Number(distribution.easy) || 0;
        const medium = Number(distribution.medium) || 0;
        const hard = Number(distribution.hard) || 0;

        if (easy < 0 || medium < 0 || hard < 0) {
            res.status(400).json({ message: 'Distribution counts must be non-negative.' });
            return;
        }

        if (easy + medium + hard === 0) {
            res.status(400).json({ message: 'At least one question must be requested.' });
            return;
        }

        const subject = body.subject ? String(body.subject).trim() : undefined;
        const moduleCategory = body.moduleCategory ? String(body.moduleCategory).trim() : undefined;
        const defaultMarksPerQuestion = Number(body.defaultMarksPerQuestion) || 1;

        const baseFilter: Record<string, unknown> = { isActive: true, isArchived: false };
        if (subject) baseFilter.subject = subject;
        if (moduleCategory) baseFilter.moduleCategory = moduleCategory;

        const selectedQuestions: unknown[] = [];
        const distReport: Record<string, { requested: number; available: number; selected: number }> = {};

        for (const level of ['easy', 'medium', 'hard'] as const) {
            const count = level === 'easy' ? easy : level === 'medium' ? medium : hard;

            if (count <= 0) {
                distReport[level] = { requested: 0, available: 0, selected: 0 };
                continue;
            }

            const available = await QuestionBankQuestion.countDocuments({
                ...baseFilter,
                difficulty: level,
            });

            if (available < count) {
                res.status(400).json({
                    message: `Insufficient ${level} questions: requested ${count}, available ${available}`,
                    shortage: {
                        level,
                        requested: count,
                        available,
                    },
                    distribution: {
                        easy: { requested: easy, available: level === 'easy' ? available : undefined },
                        medium: { requested: medium, available: level === 'medium' ? available : undefined },
                        hard: { requested: hard, available: level === 'hard' ? available : undefined },
                    },
                });
                return;
            }

            const selected = await QuestionBankQuestion.aggregate([
                { $match: { ...baseFilter, difficulty: level } },
                { $sample: { size: count } },
            ]);

            selectedQuestions.push(...selected);
            distReport[level] = { requested: count, available, selected: selected.length };
        }

        res.json({
            questions: selectedQuestions,
            distribution: distReport,
            defaultMarksPerQuestion,
        });
    } catch (err) {
        console.error('[adminAutoGenerateExam]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── BULK-ATTACH BANK QUESTIONS TO EXAM ─────── */

export async function adminBulkAttachQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '');
        if (!examId || !mongoose.Types.ObjectId.isValid(examId)) {
            res.status(400).json({ message: 'Invalid exam id.' });
            return;
        }

        const exam = await Exam.findById(examId);
        if (!exam) {
            res.status(404).json({ message: 'Exam not found.' });
            return;
        }

        const body = (req.body || {}) as Record<string, unknown>;
        const questions = body.questions as Array<{ bankQuestionId: string; marks: number; orderIndex: number }>;

        if (!Array.isArray(questions) || questions.length === 0) {
            res.status(400).json({ message: 'questions array is required and must not be empty.' });
            return;
        }

        // Validate each entry
        for (const q of questions) {
            if (!q.bankQuestionId || !mongoose.Types.ObjectId.isValid(q.bankQuestionId)) {
                res.status(400).json({ message: `Invalid bankQuestionId: ${q.bankQuestionId}` });
                return;
            }
            if (typeof q.marks !== 'number' || q.marks <= 0) {
                res.status(400).json({ message: `marks must be a positive number for bankQuestionId: ${q.bankQuestionId}` });
                return;
            }
            if (typeof q.orderIndex !== 'number' || q.orderIndex < 0) {
                res.status(400).json({ message: `orderIndex must be a non-negative number for bankQuestionId: ${q.bankQuestionId}` });
                return;
            }
        }

        // Look up all bank questions
        const bankQuestionIds = questions.map(q => q.bankQuestionId);
        const bankQuestions = await QuestionBankQuestion.find({ _id: { $in: bankQuestionIds } }).lean();

        if (bankQuestions.length !== bankQuestionIds.length) {
            const foundIds = new Set(bankQuestions.map(bq => String(bq._id)));
            const missing = bankQuestionIds.filter(id => !foundIds.has(id));
            res.status(404).json({ message: `Bank questions not found: ${missing.join(', ')}` });
            return;
        }

        // Build a lookup map
        const bankMap = new Map(bankQuestions.map(bq => [String(bq._id), bq]));

        // Create ExamQuestion snapshots
        const examQuestionDocs = questions.map(q => {
            const bq = bankMap.get(q.bankQuestionId)!;
            return {
                examId,
                fromBankQuestionId: q.bankQuestionId,
                orderIndex: q.orderIndex,
                marks: q.marks,
                question_en: bq.question_en || '',
                question_bn: bq.question_bn || '',
                questionImageUrl: bq.questionImageUrl || '',
                options: (bq.options || []).map((opt: Record<string, unknown>) => ({
                    key: opt.key,
                    text_en: opt.text_en || '',
                    text_bn: opt.text_bn || '',
                    imageUrl: opt.imageUrl || '',
                })),
                correctKey: bq.correctKey,
                explanation_en: bq.explanation_en || '',
                explanation_bn: bq.explanation_bn || '',
                explanationImageUrl: bq.explanationImageUrl || '',
                difficulty: bq.difficulty || 'medium',
                topic: bq.topic || '',
                tags: bq.tags || [],
            };
        });

        const created = await ExamQuestionModel.insertMany(examQuestionDocs);

        // Update parent Exam totalQuestions and totalMarks
        const allExamQuestions = await ExamQuestionModel.find({ examId }).lean();
        const totalQuestions = allExamQuestions.length;
        const totalMarks = allExamQuestions.reduce((sum, eq) => sum + (Number(eq.marks) || 0), 0);

        await Exam.findByIdAndUpdate(examId, { totalQuestions, totalMarks });

        res.status(201).json({
            attached: created.length,
            examQuestions: created,
        });
    } catch (err) {
        console.error('[adminBulkAttachQuestions]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function ensureUniqueExamShareLink(baseSlug: string, excludeExamId?: string): Promise<string> {
    const normalizedBase = slugifyText(baseSlug) || `exam-${Date.now()}`;
    let candidate = normalizedBase;
    let attempt = 0;
    while (attempt < 15) {
        const conflict = await Exam.exists({
            share_link: candidate,
            ...(excludeExamId ? { _id: { $ne: excludeExamId } } : {}),
        });
        if (!conflict) return candidate;
        candidate = createUniqueShareSlug(normalizedBase);
        attempt += 1;
    }
    return `${normalizedBase}-${Date.now()}`;
}

export async function adminRegenerateExamShareLink(req: AuthRequest, res: Response): Promise<void> {
    try {
        const exam = await Exam.findById(req.params.id);
        if (!exam) {
            res.status(404).json({ message: 'Exam not found' });
            return;
        }

        const base = generateExamSlugSeed(exam.toObject() as unknown as Record<string, unknown>);
        const share_link = await ensureUniqueExamShareLink(base, String(exam._id));
        exam.share_link = share_link;
        exam.short_link = share_link;
        await exam.save();

        broadcastStudentDashboardEvent({ type: 'exam_updated', meta: { action: 'share_link_regenerated', examId: String(exam._id) } });
        void broadcastExamMetricsSnapshot(String(exam._id), 'share_link_regenerated');
        res.json({
            message: 'Share URL regenerated.',
            share_link,
            shareUrl: `/exam/take/${share_link}`,
            examId: String(exam._id),
        });
    } catch (err) {
        console.error('[adminRegenerateExamShareLink]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminSignExamBannerUpload(req: AuthRequest, res: Response): Promise<void> {
    try {
        const filename = String(req.body?.filename || '').trim();
        const mimeType = String(req.body?.mimeType || 'application/octet-stream');
        if (!filename) {
            res.status(400).json({ message: 'filename is required.' });
            return;
        }
        const signed = await getSignedUploadForBanner(filename, mimeType);
        res.json(signed);
    } catch (err) {
        console.error('[adminSignExamBannerUpload]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminForceSubmit(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.examId || '');
        const studentId = String(req.params.studentId || '');
        const submitResult = await submitExamAsSystem({
            examId,
            studentId,
            sourceReq: req,
            reason: `admin_force_submit:${req.user?._id || 'unknown'}`,
            submissionType: 'forced',
        });

        if (submitResult.statusCode >= 400) {
            res.status(submitResult.statusCode).json(submitResult.body);
            return;
        }

        broadcastExamAttemptEventByMeta(
            { studentId, examId },
            'forced-submit',
            {
                source: 'admin',
                actorId: String(req.user?._id || ''),
            },
        );
        broadcastAdminLiveEvent('forced-submit', {
            examId,
            studentId,
            actorId: String(req.user?._id || ''),
        });
        void broadcastExamMetricsSnapshot(examId, 'admin_force_submit');

        res.json({
            message: 'Session force-submitted.',
            ...(submitResult.body as Record<string, unknown>),
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminGetExamResults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const results = await ExamResult.find({ exam: req.params.examId })
            .populate('student', 'fullName username email phone')
            .sort({ obtainedMarks: -1 })
            .lean();
        res.json({ results, count: results.length });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminPublishResult(req: AuthRequest, res: Response): Promise<void> {
    try {
        const exam = await Exam.findByIdAndUpdate(
            req.params.id,
            { resultPublishDate: new Date() },
            { new: true }
        );
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }
        res.json({ message: 'Result published immediately.', exam });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminEvaluateResult(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { resultId } = req.params;
        const { obtainedMarks, correctCount, wrongCount, status } = req.body;

        const result = await ExamResult.findById(resultId);
        if (!result) { res.status(404).json({ message: 'Result not found' }); return; }

        if (obtainedMarks !== undefined) result.obtainedMarks = obtainedMarks;
        if (correctCount !== undefined) result.correctCount = correctCount;
        if (wrongCount !== undefined) result.wrongCount = wrongCount;
        if (status) (result as any).status = status;

        if (obtainedMarks !== undefined && result.totalMarks > 0) {
            result.percentage = (result.obtainedMarks / result.totalMarks) * 100;
        }

        await result.save();
        res.json({ message: 'Result evaluated successfully.', result });
    } catch (err) {
        console.error('[adminEvaluateResult]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── QUESTION CRUD ─────── */

export async function adminGetQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { examId } = req.params;
        // Legacy questions (Question model — "questions" collection)
        const legacyQuestions = await Question.find({ exam: examId }).sort({ order: 1 }).lean();
        // QB-attached questions (ExamQuestionModel — "exam_questions" collection)
        const bankQuestions = await ExamQuestionModel.find({ examId }).sort({ orderIndex: 1 }).lean();
        // Normalize bank questions to match legacy shape for frontend
        const normalizedBank = bankQuestions.map((bq: any) => ({
            ...bq,
            exam: examId,
            question: bq.question_en,
            question_en: bq.question_en,
            optionA: bq.options?.[0]?.text_en ?? '',
            optionB: bq.options?.[1]?.text_en ?? '',
            optionC: bq.options?.[2]?.text_en ?? '',
            optionD: bq.options?.[3]?.text_en ?? '',
            correctAnswer: bq.correctKey,
            correctKey: bq.correctKey,
            order: bq.orderIndex ?? 999,
            explanation: bq.explanation_en ?? '',
            fromBank: true,
        }));
        const allQuestions = [...legacyQuestions, ...normalizedBank];
        res.json({ questions: allQuestions, count: allQuestions.length });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

function normalizeQuestionPayload(body: Record<string, unknown>): Record<string, unknown> {
    const p = { ...body };
    // Map frontend field names → Question model field names
    if (p.question_en !== undefined && p.question === undefined) p.question = p.question_en;
    if (p.question_bn !== undefined && !p.questionText) p.questionText = { en: String(p.question_en ?? ''), bn: String(p.question_bn ?? '') };
    if (p.optionA_en !== undefined && p.optionA === undefined) p.optionA = p.optionA_en;
    if (p.optionB_en !== undefined && p.optionB === undefined) p.optionB = p.optionB_en;
    if (p.optionC_en !== undefined && p.optionC === undefined) p.optionC = p.optionC_en;
    if (p.optionD_en !== undefined && p.optionD === undefined) p.optionD = p.optionD_en;
    if (p.correctKey !== undefined && p.correctAnswer === undefined) p.correctAnswer = p.correctKey;
    if (p.orderIndex !== undefined && p.order === undefined) p.order = p.orderIndex;
    if (p.explanation_en !== undefined && p.explanation === undefined) p.explanation = p.explanation_en;
    if (!p.questionType) p.questionType = 'mcq';
    if (p.difficulty === undefined) p.difficulty = 'medium';
    if (p.active === undefined) p.active = true;
    return p;
}

export async function adminCreateQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { examId } = req.params;
        const count = await Question.countDocuments({ exam: examId });
        const payload = normalizeQuestionPayload(req.body);
        const question = await Question.create({ ...payload, exam: examId, order: payload.order ?? count + 1 });
        // Update totalQuestions count on exam
        await Exam.findByIdAndUpdate(examId, { $inc: { totalQuestions: 1 } });
        res.status(201).json({ question, message: 'Question created.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminUpdateQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        const payload = normalizeQuestionPayload(req.body);
        const question = await Question.findByIdAndUpdate(req.params.questionId, payload, { new: true });
        if (!question) { res.status(404).json({ message: 'Question not found' }); return; }
        res.json({ question, message: 'Question updated.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminDeleteQuestion(req: AuthRequest, res: Response): Promise<void> {
    try {
        const question = await Question.findByIdAndDelete(req.params.questionId);
        if (!question) { res.status(404).json({ message: 'Question not found' }); return; }
        await Exam.findByIdAndUpdate(question.exam, { $inc: { totalQuestions: -1 } });
        res.json({ message: 'Question deleted.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminReorderQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { examId } = req.params;
        const { questions } = req.body as { questions: Array<{ questionId: string; orderIndex: number }> };

        if (!Array.isArray(questions) || questions.length === 0) {
            res.status(400).json({ message: 'questions array is required and must not be empty.' });
            return;
        }

        const exam = await Exam.findById(examId);
        if (!exam) {
            res.status(404).json({ message: 'Exam not found.' });
            return;
        }

        const updates = questions.map(q =>
            ExamQuestionModel.findOneAndUpdate(
                { _id: q.questionId, examId },
                { orderIndex: q.orderIndex }
            )
        );
        await Promise.all(updates);

        res.json({ message: 'Questions reordered.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── EXCEL IMPORT ─────── */

export async function adminImportQuestionsFromExcel(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { examId } = req.params;
        const exam = await Exam.findById(examId);
        if (!exam) { res.status(404).json({ message: 'Exam not found.' }); return; }

        const questionsList = req.body;
        if (!Array.isArray(questionsList) || questionsList.length === 0) {
            res.status(400).json({ message: 'Payload must be a non-empty array of mapped questions.' });
            return;
        }

        const existingCount = await Question.countDocuments({ exam: examId });
        let currentOrder = existingCount + 1;

        const toInsert = questionsList.map(q => ({
            exam: new mongoose.Types.ObjectId(examId as string),
            question: q.question,
            optionA: q.options?.A || q.optionA || '',
            optionB: q.options?.B || q.optionB || '',
            optionC: q.options?.C || q.optionC || '',
            optionD: q.options?.D || q.optionD || '',
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || q.explanation_text || '',
            marks: Number(q.marks) || 1,
            subject: q.subject || '',
            chapter: q.chapter || '',
            difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
            category: ['Science', 'Arts', 'Commerce', 'Mixed'].includes(q.category) ? q.category : 'Mixed',
            tags: Array.isArray(q.tags) ? q.tags : (typeof q.tags === 'string' ? q.tags.split(',').map((t: string) => t.trim()) : []),
            active: true,
            order: currentOrder++
        }));

        await Question.insertMany(toInsert);
        await Exam.findByIdAndUpdate(examId, { $inc: { totalQuestions: toInsert.length } });

        res.status(201).json({
            message: `Import complete. ${toInsert.length} questions added.`,
            imported: toInsert.length,
            duplicatesSkipped: 0,
            duplicateRows: []
        });
    } catch (err) {
        console.error('[adminImportQuestionsFromExcel]', err);
        res.status(500).json({ message: 'Server error during import.' });
    }
}

/* ─────── ANALYTICS ─────── */

export async function adminGetExamAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { examId } = req.params;
        const exam = await Exam.findById(examId).lean();
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }

        const results = await ExamResult.find({ exam: examId })
            .populate('student', 'username fullName email')
            .lean();

        const questions = await Question.find({ exam: examId }).select('question totalAttempted totalCorrect').lean();
        const questionAccuracy = questions.map(q => ({
            question: q.question.substring(0, 80) + (q.question.length > 80 ? '…' : ''),
            totalAttempted: q.totalAttempted,
            totalCorrect: q.totalCorrect,
            accuracy: q.totalAttempted > 0 ? ((q.totalCorrect / q.totalAttempted) * 100).toFixed(1) + '%' : 'N/A',
        }));

        const deviceBreakdown: Record<string, number> = {};
        const browserBreakdown: Record<string, number> = {};
        let totalTabSwitches = 0;

        results.forEach(r => {
            deviceBreakdown[r.deviceInfo || 'Unknown'] = (deviceBreakdown[r.deviceInfo || 'Unknown'] || 0) + 1;
            browserBreakdown[r.browserInfo || 'Unknown'] = (browserBreakdown[r.browserInfo || 'Unknown'] || 0) + 1;
            totalTabSwitches += r.tabSwitchCount || 0;
        });

        res.json({
            exam,
            totalParticipants: results.length,
            avgScore: exam.avgScore,
            highestScore: exam.highestScore,
            lowestScore: exam.lowestScore,
            questionAccuracy,
            deviceBreakdown,
            browserBreakdown,
            totalTabSwitches,
            students: results.map(r => ({
                attemptNo: Number((r as Record<string, unknown>).attemptNo || 1),
                username: asStudent(r.student)?.username,
                fullName: asStudent(r.student)?.fullName,
                obtainedMarks: r.obtainedMarks,
                totalMarks: r.totalMarks,
                percentage: r.percentage,
                rank: r.rank,
                correctCount: r.correctCount,
                wrongCount: r.wrongCount,
                timeTaken: r.timeTaken,
                deviceInfo: r.deviceInfo,
                browserInfo: r.browserInfo,
                ipAddress: r.ipAddress,
                tabSwitchCount: r.tabSwitchCount,
                submittedAt: r.submittedAt,
                isAutoSubmitted: r.isAutoSubmitted,
                cheat_flags: (r as any).cheat_flags || [],
                writtenUploads: Array.isArray(r.answers)
                    ? r.answers
                        .map((ans) => (ans as unknown as Record<string, unknown>).writtenAnswerUrl)
                        .filter(Boolean)
                    : [],
                answers: r.answers,
                status: (r as any).status || 'evaluated',
                _id: r._id,
            })),
        });
    } catch (err) {
        console.error('[adminGetExamAnalytics]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

async function writeExamExportAuditLog(
    req: AuthRequest,
    params: {
        action: 'exam_results_exported' | 'exam_report_exported';
        examId: string;
        examTitle: string;
        format: 'xlsx' | 'csv' | 'pdf';
        exportedCount: number;
        groupId?: string;
    },
): Promise<void> {
    const actorId = String(req.user?._id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(actorId)) {
        return;
    }

    const sensitiveContext = getSensitiveActionContext(req);
    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(actorId),
        actor_role: String(req.user?.role || '').trim(),
        action: params.action,
        module: 'reports',
        status: 'success',
        target_id: mongoose.Types.ObjectId.isValid(params.examId) ? new mongoose.Types.ObjectId(params.examId) : undefined,
        target_type: 'Exam',
        requestId: String((req as AuthRequest & { requestId?: string }).requestId || '').trim(),
        sessionId: String(req.user?.sessionId || '').trim(),
        device: getDeviceInfo(req),
        reason: sensitiveContext?.reason || '',
        after: {
            examId: params.examId,
            examTitle: params.examTitle,
            format: params.format,
            exportedCount: params.exportedCount,
            groupId: params.groupId || '',
            usedTwoFactor: Boolean(sensitiveContext?.usedTwoFactor),
        },
        ip_address: getClientIp(req),
        details: {
            examId: params.examId,
            examTitle: params.examTitle,
            format: params.format,
            exportedCount: params.exportedCount,
            groupId: params.groupId || '',
        },
    });
}

/* ─────── EXCEL EXPORT ─────── */

export async function adminExportExamResults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.examId || '');
        const exam = await Exam.findById(examId).lean();
        if (!exam) { res.status(404).json({ message: 'Exam not found' }); return; }

        const results = await ExamResult.find({ exam: examId })
            .populate('student', 'username fullName email')
            .lean();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CampusWay Admin';
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Results');
        sheet.columns = [
            { header: 'Rank', key: 'rank', width: 10 },
            { header: 'User ID', key: 'userId', width: 28 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Username', key: 'username', width: 20 },
            { header: 'Full Name', key: 'fullName', width: 25 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Marks', key: 'marks', width: 12 },
            { header: 'Obtained Marks', key: 'obtainedMarks', width: 15 },
            { header: 'Total Marks', key: 'totalMarks', width: 15 },
            { header: 'Percentage', key: 'percentage', width: 15 },
            { header: 'Correct', key: 'correctCount', width: 10 },
            { header: 'Wrong', key: 'wrongCount', width: 10 },
            { header: 'Unanswered', key: 'unansweredCount', width: 15 },
            { header: 'Time Taken (s)', key: 'timeTaken', width: 15 },
            { header: 'Device', key: 'deviceInfo', width: 20 },
            { header: 'Browser', key: 'browserInfo', width: 20 },
            { header: 'IP Address', key: 'ipAddress', width: 15 },
            { header: 'Tab Switches', key: 'tabSwitchCount', width: 15 },
            { header: 'Auto Submitted', key: 'isAutoSubmitted', width: 15 },
            { header: 'Submitted At', key: 'submittedAt', width: 25 }
        ];

        // Styling the header row
        sheet.getRow(1).font = { bold: true };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

        results.forEach((r, i) => {
            const userId = (typeof r.student === 'object' && r.student && '_id' in (r.student as object))
                ? String((r.student as { _id?: unknown })._id || '')
                : String(r.student || '');
            const fullName = asStudent(r.student)?.fullName || '';
            sheet.addRow({
                rank: r.rank || i + 1,
                userId,
                name: fullName || asStudent(r.student)?.username || '',
                username: asStudent(r.student)?.username || '',
                fullName,
                email: asStudent(r.student)?.email || '',
                marks: r.obtainedMarks,
                obtainedMarks: r.obtainedMarks,
                totalMarks: r.totalMarks,
                percentage: r.percentage + '%',
                correctCount: r.correctCount,
                wrongCount: r.wrongCount,
                unansweredCount: r.unansweredCount,
                timeTaken: r.timeTaken,
                deviceInfo: r.deviceInfo || '',
                browserInfo: r.browserInfo || '',
                ipAddress: r.ipAddress || '',
                tabSwitchCount: r.tabSwitchCount || 0,
                isAutoSubmitted: r.isAutoSubmitted ? 'Yes' : 'No',
                submittedAt: r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ''
            });
        });

        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 30 }
        ];
        summarySheet.getRow(1).font = { bold: true };
        summarySheet.addRows([
            { metric: 'Exam Title', value: exam.title },
            { metric: 'Subject', value: exam.subject },
            { metric: 'Total Participants', value: results.length },
            { metric: 'Average Score', value: exam.avgScore },
            { metric: 'Highest Score', value: exam.highestScore },
            { metric: 'Lowest Score', value: exam.lowestScore },
            { metric: 'Export Date', value: new Date().toLocaleString() }
        ]);

        await writeExamExportAuditLog(req, {
            action: 'exam_results_exported',
            examId,
            examTitle: String(exam.title || ''),
            format: 'xlsx',
            exportedCount: results.length,
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-z0-9]/gi, '_')}_results.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('[adminExportExamResults]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

type ExamReportExportRow = {
    serialNo: number;
    resultId: string;
    studentId: string;
    registration_id: string;
    roll_number: string;
    username: string;
    fullName: string;
    email: string;
    groupId: string;
    groupName: string;
    obtainedMarks: number;
    totalMarks: number;
    percentage: number;
    globalRank: number;
    groupRank: number | null;
    submittedAt: string;
    timeTakenSec: number;
};

type RankComparableRow = {
    obtainedMarks?: number;
    timeTaken?: number;
    submittedAt?: Date | string;
};

function compareResultsForRank(a: RankComparableRow, b: RankComparableRow): number {
    if (Number(b.obtainedMarks || 0) !== Number(a.obtainedMarks || 0)) {
        return Number(b.obtainedMarks || 0) - Number(a.obtainedMarks || 0);
    }
    if (Number(a.timeTaken || 0) !== Number(b.timeTaken || 0)) {
        return Number(a.timeTaken || 0) - Number(b.timeTaken || 0);
    }
    return new Date(String(a.submittedAt || 0)).getTime() - new Date(String(b.submittedAt || 0)).getTime();
}

function normalizeRegistrationId(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

async function buildExamReportRows(examId: string, groupIdFilter = ''): Promise<{ rows: ExamReportExportRow[]; examTitle: string }> {
    const exam = await Exam.findById(examId).select('title totalMarks').lean();
    if (!exam) {
        throw new Error('Exam not found');
    }

    const allResults = await ExamResult.find({ exam: examId })
        .populate('student', 'username full_name fullName email')
        .lean();

    const studentIds = Array.from(new Set(
        allResults
            .map((row) => {
                const studentObj = asRecordObject(row.student);
                return String(studentObj?._id || row.student || '');
            })
            .filter(Boolean),
    ));
    const profiles = studentIds.length > 0
        ? await StudentProfile.find({ user_id: { $in: studentIds } })
            .select('user_id registration_id roll_number groupIds')
            .lean()
        : [];

    const profileMap = new Map<string, Record<string, unknown>>();
    const groupIdSet = new Set<string>();
    for (const profile of profiles as Array<Record<string, unknown>>) {
        const userId = String(profile.user_id || '');
        if (!userId) continue;
        profileMap.set(userId, profile);
        for (const groupId of normalizeObjectIdArray(profile.groupIds || [])) {
            groupIdSet.add(groupId);
        }
    }

    const groups = groupIdSet.size > 0
        ? await StudentGroup.find({ _id: { $in: Array.from(groupIdSet) } }).select('name').lean()
        : [];
    const groupMap = new Map<string, string>(groups.map((group) => [String(group._id || ''), String(group.name || '')]));

    const globalSorted = [...allResults].sort(compareResultsForRank);
    const globalRankMap = new Map<string, number>();
    globalSorted.forEach((row, idx) => {
        globalRankMap.set(String(row._id || ''), idx + 1);
    });

    const rowsBase = allResults
        .map((result) => {
            const userRecord = asRecordObject(result.student) || {};
            const studentId = String(userRecord._id || result.student || '');
            const profile = profileMap.get(studentId) || {};
            const groupIds = normalizeObjectIdArray(profile.groupIds || []);
            const primaryGroupId = groupIdFilter
                ? (groupIds.includes(groupIdFilter) ? groupIdFilter : '')
                : (groupIds[0] || '');

            return {
                result,
                studentId,
                profile,
                primaryGroupId,
            };
        })
        .filter((row) => {
            if (!groupIdFilter) return true;
            return row.primaryGroupId === groupIdFilter;
        });

    const bucketMap = new Map<string, Array<{ resultId: string; obtainedMarks: number; timeTaken: number; submittedAt: Date | string }>>();
    for (const row of rowsBase) {
        const bucketKey = row.primaryGroupId || '__ungrouped__';
        if (!bucketMap.has(bucketKey)) bucketMap.set(bucketKey, []);
        bucketMap.get(bucketKey)!.push({
            resultId: String(row.result._id || ''),
            obtainedMarks: Number(row.result.obtainedMarks || 0),
            timeTaken: Number(row.result.timeTaken || 0),
            submittedAt: row.result.submittedAt,
        });
    }

    const groupRankMap = new Map<string, number>();
    for (const [, bucketRows] of bucketMap) {
        bucketRows
            .sort((a, b) => compareResultsForRank(a, b))
            .forEach((entry, idx) => {
                groupRankMap.set(entry.resultId, idx + 1);
            });
    }

    const rows = rowsBase
        .sort((a, b) => compareResultsForRank(a.result, b.result))
        .map((entry, index) => {
            const result = entry.result;
            const userRecord = asRecordObject(result.student) || {};
            const fullName = String(userRecord.full_name || userRecord.fullName || '');
            const totalMarks = Number(result.totalMarks || exam.totalMarks || 0);
            const obtainedMarks = Number(result.obtainedMarks || 0);
            const percentage = totalMarks > 0 ? Number(((obtainedMarks / totalMarks) * 100).toFixed(2)) : 0;
            const resultId = String(result._id || '');

            return {
                serialNo: index + 1,
                resultId,
                studentId: entry.studentId,
                registration_id: String(entry.profile.registration_id || ''),
                roll_number: String(entry.profile.roll_number || ''),
                username: String(userRecord.username || ''),
                fullName,
                email: String(userRecord.email || ''),
                groupId: entry.primaryGroupId || '',
                groupName: entry.primaryGroupId ? String(groupMap.get(entry.primaryGroupId) || '') : '',
                obtainedMarks,
                totalMarks,
                percentage,
                globalRank: Number(globalRankMap.get(resultId) || 0),
                groupRank: groupRankMap.has(resultId) ? Number(groupRankMap.get(resultId) || 0) : null,
                submittedAt: result.submittedAt ? new Date(result.submittedAt).toISOString() : '',
                timeTakenSec: Number(result.timeTaken || 0),
            } as ExamReportExportRow;
        });

    return { rows, examTitle: String(exam.title || 'exam') };
}

export async function adminDownloadExamResultsImportTemplate(req: AuthRequest, res: Response): Promise<void> {
    try {
        const format = String(req.query.format || 'xlsx').trim().toLowerCase() === 'csv' ? 'csv' : 'xlsx';
        const mode = String(req.query.mode || '').trim().toLowerCase() === 'external' ? 'external' : 'internal';
        const rows = mode === 'external'
            ? [
                {
                    cw_ref: 'cwref_67f0a0example',
                    username: 'student_username',
                    email: 'student@example.com',
                    registration_id: 'REG-1001',
                    obtained_marks: 78,
                    total_marks: 100,
                    percentage: 78,
                    time_taken_sec: 3200,
                    submitted_at: new Date().toISOString(),
                    attempt_no: 1,
                    full_name: 'Student Name',
                    institution_name: 'College Name',
                    roll_number: '12345',
                    department: 'science',
                    guardian_phone: '01700000000',
                    remarks: 'external provider import',
                },
            ]
            : [
                {
                    registration_id: 'REG-1001',
                    obtained_marks: 78,
                    submitted_at: new Date().toISOString(),
                    time_taken_sec: 3200,
                    remarks: 'manual import',
                },
            ];

        if (format === 'csv') {
            const headers = Object.keys(rows[0] || {});
            const csv = [
                headers.join(','),
                ...rows.map((row) => headers.map((key) => escapeCsvCell((row as Record<string, unknown>)[key])).join(',')),
            ].join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="exam_results_import_template_${mode}.csv"`);
            res.send(csv);
            return;
        }

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'template');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="exam_results_import_template_${mode}.xlsx"`);
        res.send(buffer);
    } catch (err) {
        console.error('[adminDownloadExamResultsImportTemplate]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminImportExamResults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            res.status(400).json({ message: 'Invalid exam id.' });
            return;
        }
        if (!req.file?.buffer || !req.file?.originalname) {
            res.status(400).json({ message: 'No file uploaded.' });
            return;
        }

        const exam = await Exam.findById(examId).select('title totalMarks').lean();
        if (!exam) {
            res.status(404).json({ message: 'Exam not found.' });
            return;
        }

        const rawRows = readImportRowsFromBuffer(req.file.buffer, req.file.originalname);
        if (!rawRows.length) {
            res.status(400).json({ message: 'No data rows found in the uploaded file.' });
            return;
        }

        const normalizedRows = rawRows.map((row, idx) => {
            const next: Record<string, unknown> = {};
            Object.entries(row || {}).forEach(([key, value]) => {
                next[normalizeImportKey(key)] = value;
            });
            return { rowNo: idx + 2, data: next };
        });

        const requestedRegIdsRaw = Array.from(new Set(
            normalizedRows
                .map((row) => String(row.data.registration_id || '').trim())
                .filter(Boolean),
        ));
        const profiles = requestedRegIdsRaw.length > 0
            ? await StudentProfile.find({
                $or: [
                    { registration_id: { $in: requestedRegIdsRaw } },
                    { registration_id: { $in: requestedRegIdsRaw.map((value) => value.toLowerCase()) } },
                    { registration_id: { $in: requestedRegIdsRaw.map((value) => value.toUpperCase()) } },
                ],
            })
                .select('user_id registration_id')
                .lean()
            : [];

        const profileMap = new Map<string, { userId: string; registrationId: string }>();
        for (const profile of profiles as Array<Record<string, unknown>>) {
            const normalizedRegId = normalizeRegistrationId(profile.registration_id);
            const userId = String(profile.user_id || '');
            if (!normalizedRegId || !mongoose.Types.ObjectId.isValid(userId)) continue;
            profileMap.set(normalizedRegId, { userId, registrationId: String(profile.registration_id || '') });
        }

        const errors: Array<{ rowNo: number; registration_id: string; reason: string }> = [];
        const ops: any[] = [];
        const totalMarks = Math.max(0, Number(exam.totalMarks || 0));

        for (const row of normalizedRows) {
            const registrationIdRaw = String(row.data.registration_id || '').trim();
            const registrationId = normalizeRegistrationId(registrationIdRaw);
            const obtainedRaw = parseNumeric(row.data.obtained_marks);

            if (!registrationId) {
                errors.push({ rowNo: row.rowNo, registration_id: '', reason: 'registration_id is required' });
                continue;
            }
            if (obtainedRaw === null) {
                errors.push({ rowNo: row.rowNo, registration_id: registrationIdRaw, reason: 'obtained_marks is required and must be numeric' });
                continue;
            }

            const profile = profileMap.get(registrationId);
            if (!profile) {
                errors.push({ rowNo: row.rowNo, registration_id: registrationIdRaw, reason: 'registration_id not found' });
                continue;
            }

            const submittedAt = parseLooseDate(row.data.submitted_at) || new Date();
            const timeTakenSec = Math.max(0, Number(parseNumeric(row.data.time_taken_sec) || 0));
            const obtainedMarks = Math.min(totalMarks, Math.max(0, Number(obtainedRaw)));
            const percentage = totalMarks > 0 ? Number(((obtainedMarks / totalMarks) * 100).toFixed(2)) : 0;

            ops.push({
                updateOne: {
                    filter: {
                        exam: new mongoose.Types.ObjectId(examId),
                        student: new mongoose.Types.ObjectId(profile.userId),
                        attemptNo: 1,
                    },
                    update: {
                        $set: {
                            exam: new mongoose.Types.ObjectId(examId),
                            student: new mongoose.Types.ObjectId(profile.userId),
                            attemptNo: 1,
                            answers: [],
                            totalMarks,
                            obtainedMarks,
                            correctCount: 0,
                            wrongCount: 0,
                            unansweredCount: 0,
                            percentage,
                            pointsEarned: Math.round(percentage),
                            timeTaken: timeTakenSec,
                            deviceInfo: 'manual_import',
                            browserInfo: 'manual_import',
                            ipAddress: '',
                            tabSwitchCount: 0,
                            submittedAt,
                            isAutoSubmitted: false,
                            status: 'evaluated',
                        },
                    },
                    upsert: true,
                },
            });
        }

        if (!ops.length) {
            res.status(400).json({
                message: 'No valid rows found to import.',
                imported: 0,
                errors,
            });
            return;
        }

        const bulkResult = await ExamResult.bulkWrite(ops, { ordered: false });
        await recomputeGlobalExamRanks(examId);
        const impactedStudentIds = Array.from(new Set(ops
            .map((op) => String(op.updateOne?.filter?.student || ''))
            .filter((id) => mongoose.Types.ObjectId.isValid(id))));
        await Promise.all(impactedStudentIds.map((studentId) => updateStudentPoints(studentId)));

        res.json({
            message: 'Exam results imported successfully.',
            examId,
            examTitle: exam.title,
            imported: Number(bulkResult.upsertedCount || 0) + Number(bulkResult.modifiedCount || 0),
            inserted: Number(bulkResult.upsertedCount || 0),
            updated: Number(bulkResult.modifiedCount || 0),
            invalid: errors.length,
            errors,
        });
    } catch (err) {
        console.error('[adminImportExamResults]', err);
        res.status(500).json({ message: 'Server error during import.' });
    }
}

export async function adminImportExternalExamResults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            res.status(400).json({ message: 'Invalid exam id.' });
            return;
        }
        if (!req.file?.buffer || !req.file?.originalname) {
            res.status(400).json({ message: 'No file uploaded.' });
            return;
        }

        const exam = await Exam.findById(examId)
            .select('title totalMarks deliveryMode accessMode allowedUsers accessControl visibilityMode targetGroupIds requiresActiveSubscription subscriptionRequired')
            .lean();
        if (!exam) {
            res.status(404).json({ message: 'Exam not found.' });
            return;
        }
        if (String((exam as Record<string, unknown>).deliveryMode || 'internal') !== 'external_link') {
            res.status(400).json({ message: 'This exam is not configured as an external-link exam.' });
            return;
        }

        const rawRows = readImportRowsFromBuffer(req.file.buffer, req.file.originalname);
        if (!rawRows.length) {
            res.status(400).json({ message: 'No data rows found in the uploaded file.' });
            return;
        }

        const mapping = normalizeImportMapping(req.body.mapping);
        const syncProfileMode = normalizeExternalImportSyncMode(req.body.syncProfileMode);
        const normalizedRows = rawRows.map((row, idx) => {
            const next: Record<string, unknown> = {};
            Object.entries(row || {}).forEach(([key, value]) => {
                next[normalizeImportKey(key)] = value;
            });
            return {
                rowNo: idx + 2,
                raw: next,
                data: buildCanonicalExternalImportRow(next, mapping),
            };
        });

        const attemptRefs = Array.from(new Set(
            normalizedRows
                .map((row) => normalizeLookupValue(row.data.attempt_ref))
                .filter(Boolean),
        ));
        const registrationIds = Array.from(new Set(
            normalizedRows
                .map((row) => normalizeExternalImportRegistrationId(row.data.registration_id))
                .filter(Boolean),
        ));
        const userUniqueIds = Array.from(new Set(
            normalizedRows
                .map((row) => String(row.data.user_unique_id || '').trim())
                .filter(Boolean),
        ));
        const usernames = Array.from(new Set(
            normalizedRows
                .map((row) => normalizeLookupValue(row.data.username))
                .filter(Boolean),
        ));
        const emails = Array.from(new Set(
            normalizedRows
                .map((row) => normalizeLookupValue(row.data.email))
                .filter(Boolean),
        ));
        const phones = Array.from(new Set(
            normalizedRows
                .map((row) => String(row.data.phone_number || '').trim())
                .filter(Boolean),
        ));

        const logsByRef = attemptRefs.length > 0
            ? await ExternalExamJoinLog.find({
                examId: new mongoose.Types.ObjectId(examId),
                attemptRef: { $in: attemptRefs },
            })
                .sort({ joinedAt: -1 })
                .select('_id attemptRef studentId attemptNo joinedAt')
                .lean()
            : [];

        const profileClauses: Record<string, unknown>[] = [];
        if (registrationIds.length > 0) {
            profileClauses.push({
                registration_id: {
                    $in: Array.from(new Set([
                        ...registrationIds,
                        ...registrationIds.map((value) => value.toUpperCase()),
                        ...registrationIds.map((value) => value.toLowerCase()),
                    ])),
                },
            });
        }
        if (userUniqueIds.length > 0) profileClauses.push({ user_unique_id: { $in: userUniqueIds } });
        if (phones.length > 0) {
            profileClauses.push({ phone_number: { $in: phones } });
            profileClauses.push({ phone: { $in: phones } });
        }

        const profilesByIdentifiers = profileClauses.length > 0
            ? await StudentProfile.find({ $or: profileClauses })
                .select('user_id user_unique_id registration_id phone_number phone full_name groupIds email institution_name roll_number department ssc_batch hsc_batch guardian_name guardian_phone')
                .lean()
            : [];

        const seededUserIds = Array.from(new Set([
            ...logsByRef.map((item) => String(item.studentId || '')),
            ...profilesByIdentifiers.map((item) => String(item.user_id || '')),
        ].filter((value) => mongoose.Types.ObjectId.isValid(value))));

        const userClauses: Record<string, unknown>[] = [];
        if (seededUserIds.length > 0) {
            userClauses.push({ _id: { $in: seededUserIds.map((value) => new mongoose.Types.ObjectId(value)) } });
        }
        if (usernames.length > 0) userClauses.push({ username: { $in: usernames } });
        if (emails.length > 0) userClauses.push({ email: { $in: emails } });
        if (phones.length > 0) userClauses.push({ phone_number: { $in: phones } });

        const users = userClauses.length > 0
            ? await User.find({ $or: userClauses })
                .select('_id username email phone_number full_name subscription')
                .lean()
            : [];

        const allUserIds = Array.from(new Set([
            ...seededUserIds,
            ...users.map((item) => String(item._id || '')),
        ].filter((value) => mongoose.Types.ObjectId.isValid(value))));

        const profiles = allUserIds.length > 0
            ? await StudentProfile.find({ user_id: { $in: allUserIds.map((value) => new mongoose.Types.ObjectId(value)) } })
                .select('user_id user_unique_id registration_id phone_number phone full_name groupIds email institution_name roll_number department ssc_batch hsc_batch guardian_name guardian_phone')
                .lean()
            : [];

        const attemptLogs = allUserIds.length > 0
            ? await ExternalExamJoinLog.find({
                examId: new mongoose.Types.ObjectId(examId),
                studentId: { $in: allUserIds.map((value) => new mongoose.Types.ObjectId(value)) },
            })
                .sort({ joinedAt: -1 })
                .select('_id attemptRef studentId attemptNo status joinedAt')
                .lean()
            : [];

        const userById = new Map<string, Record<string, unknown>>();
        const userByUsername = new Map<string, Record<string, unknown>>();
        const userByEmail = new Map<string, Record<string, unknown>>();
        const userByPhone = new Map<string, Record<string, unknown>>();
        for (const user of users as Array<Record<string, unknown>>) {
            const userId = String(user._id || '');
            userById.set(userId, user);
            const username = normalizeLookupValue(user.username);
            const email = normalizeLookupValue(user.email);
            const phone = String(user.phone_number || '').trim();
            if (username) userByUsername.set(username, user);
            if (email) userByEmail.set(email, user);
            if (phone) userByPhone.set(phone, user);
        }

        const profileByUserId = new Map<string, Record<string, unknown>>();
        const profileByRegistrationId = new Map<string, Record<string, unknown>>();
        const profileByUniqueId = new Map<string, Record<string, unknown>>();
        const profileByPhone = new Map<string, Record<string, unknown>>();
        for (const profile of profiles as Array<Record<string, unknown>>) {
            const userId = String(profile.user_id || '');
            if (userId) profileByUserId.set(userId, profile);
            const registrationId = normalizeExternalImportRegistrationId(profile.registration_id);
            const userUniqueId = String(profile.user_unique_id || '').trim();
            const phone = String(profile.phone_number || profile.phone || '').trim();
            if (registrationId) profileByRegistrationId.set(registrationId, profile);
            if (userUniqueId) profileByUniqueId.set(userUniqueId, profile);
            if (phone) profileByPhone.set(phone, profile);
        }

        const logByAttemptRef = new Map<string, Record<string, unknown>>();
        const logByStudentAttempt = new Map<string, Record<string, unknown>>();
        for (const log of attemptLogs as Array<Record<string, unknown>>) {
            const attemptRef = normalizeLookupValue(log.attemptRef);
            const studentId = String(log.studentId || '');
            const attemptNo = Math.max(1, Number(log.attemptNo || 1));
            if (attemptRef && !logByAttemptRef.has(attemptRef)) logByAttemptRef.set(attemptRef, log);
            const compositeKey = `${studentId}:${attemptNo}`;
            if (studentId && !logByStudentAttempt.has(compositeKey)) logByStudentAttempt.set(compositeKey, log);
        }
        for (const log of logsByRef as Array<Record<string, unknown>>) {
            const attemptRef = normalizeLookupValue(log.attemptRef);
            if (attemptRef && !logByAttemptRef.has(attemptRef)) logByAttemptRef.set(attemptRef, log);
        }

        const errors: Array<{ rowNo: number; identifier: string; reason: string }> = [];
        const examTotalMarks = Math.max(0, Number((exam as Record<string, unknown>).totalMarks || 0));
        const impactedStudentIds = new Set<string>();
        let inserted = 0;
        let updated = 0;
        let profileUpdates = 0;

        for (const row of normalizedRows) {
            const attemptRef = normalizeLookupValue(row.data.attempt_ref);
            const registrationId = normalizeExternalImportRegistrationId(row.data.registration_id);
            const userUniqueId = String(row.data.user_unique_id || '').trim();
            const username = normalizeLookupValue(row.data.username);
            const email = normalizeLookupValue(row.data.email);
            const phoneNumber = String(row.data.phone_number || '').trim();
            const identifier = attemptRef || registrationId || userUniqueId || username || email || phoneNumber;

            if (!identifier) {
                errors.push({ rowNo: row.rowNo, identifier: '', reason: 'At least one identifier is required: cw_ref, registration_id, user_unique_id, username, email, or phone_number.' });
                continue;
            }

            let matchedBy = '';
            let matchedLog = attemptRef ? logByAttemptRef.get(attemptRef) || null : null;
            let user = matchedLog ? userById.get(String(matchedLog.studentId || '')) || null : null;
            let profile = matchedLog ? profileByUserId.get(String(matchedLog.studentId || '')) || null : null;

            if (!user && registrationId) {
                profile = profileByRegistrationId.get(registrationId) || null;
                user = profile ? userById.get(String(profile.user_id || '')) || null : null;
                if (user) matchedBy = 'registration_id';
            }
            if (!user && userUniqueId) {
                profile = profileByUniqueId.get(userUniqueId) || null;
                user = profile ? userById.get(String(profile.user_id || '')) || null : null;
                if (user) matchedBy = 'user_unique_id';
            }
            if (!user && username) {
                user = userByUsername.get(username) || null;
                profile = user ? profileByUserId.get(String(user._id || '')) || null : null;
                if (user) matchedBy = 'username';
            }
            if (!user && email) {
                user = userByEmail.get(email) || null;
                profile = user ? profileByUserId.get(String(user._id || '')) || null : null;
                if (user) matchedBy = 'email';
            }
            if (!user && phoneNumber) {
                profile = profileByPhone.get(phoneNumber) || null;
                user = profile
                    ? userById.get(String(profile.user_id || '')) || null
                    : userByPhone.get(phoneNumber) || null;
                if (!profile && user) profile = profileByUserId.get(String(user._id || '')) || null;
                if (user) matchedBy = 'phone_number';
            }

            if (!matchedBy && matchedLog) matchedBy = 'attempt_ref';
            if (!user) {
                errors.push({ rowNo: row.rowNo, identifier, reason: 'No student matched the provided identifiers.' });
                continue;
            }

            const requestedAttemptNo = Math.max(0, Number(parseNumeric(row.data.attempt_no) || 0));
            const studentId = String(user._id || '');
            const attemptNo = requestedAttemptNo || Math.max(1, Number(matchedLog?.attemptNo || 1));
            if (!matchedLog) {
                matchedLog = logByStudentAttempt.get(`${studentId}:${attemptNo}`) || null;
            }

            const importEligibility = await isStudentEligibleForExamImport(exam as Record<string, unknown>, user, profile);
            if (!importEligibility.allowed) {
                errors.push({ rowNo: row.rowNo, identifier, reason: importEligibility.reason || 'Matched student is outside the exam audience.' });
                continue;
            }

            const importedTotalMarks = parseNumeric(row.data.total_marks);
            const importedObtainedMarks = parseNumeric(row.data.obtained_marks);
            const importedPercentage = parseNumeric(row.data.percentage);
            const totalMarks = importedTotalMarks !== null
                ? Math.max(0, Number(importedTotalMarks))
                : examTotalMarks;

            if (importedObtainedMarks === null && importedPercentage === null) {
                errors.push({ rowNo: row.rowNo, identifier, reason: 'obtained_marks or percentage is required.' });
                continue;
            }
            if (totalMarks <= 0 && importedPercentage !== null) {
                errors.push({ rowNo: row.rowNo, identifier, reason: 'total_marks is required when percentage is provided and exam total marks is not set.' });
                continue;
            }

            const obtainedMarksRaw = importedObtainedMarks !== null
                ? Number(importedObtainedMarks)
                : Number(((totalMarks * Number(importedPercentage || 0)) / 100).toFixed(2));
            const obtainedMarks = totalMarks > 0
                ? Math.min(totalMarks, Math.max(0, obtainedMarksRaw))
                : Math.max(0, obtainedMarksRaw);
            const percentage = importedPercentage !== null
                ? Math.max(0, Math.min(100, Number(importedPercentage)))
                : (totalMarks > 0 ? Number(((obtainedMarks / totalMarks) * 100).toFixed(2)) : 0);
            const submittedAt = parseLooseDate(row.data.submitted_at) || new Date();
            const timeTakenSec = Math.max(0, Number(parseNumeric(row.data.time_taken_sec) || 0));
            const correctCount = Math.max(0, Number(parseNumeric(row.data.correct_count) || 0));
            const wrongCount = Math.max(0, Number(parseNumeric(row.data.wrong_count) || 0));
            const unansweredCount = Math.max(0, Number(parseNumeric(row.data.unanswered_count) || 0));

            const filter = {
                exam: new mongoose.Types.ObjectId(examId),
                student: new mongoose.Types.ObjectId(studentId),
                attemptNo,
            };
            const existing = await ExamResult.findOne(filter).select('_id').lean();
            const resultDoc = await ExamResult.findOneAndUpdate(
                filter,
                {
                    $set: {
                        exam: new mongoose.Types.ObjectId(examId),
                        student: new mongoose.Types.ObjectId(studentId),
                        attemptNo,
                        sourceType: 'external_import',
                        syncStatus: syncProfileMode === 'none' ? 'pending' : 'synced',
                        answers: [],
                        totalMarks,
                        obtainedMarks,
                        correctCount,
                        wrongCount,
                        unansweredCount,
                        percentage,
                        pointsEarned: Math.round(percentage),
                        serialId: String(row.data.serial_id || ''),
                        rollNumber: String(row.data.roll_number || ''),
                        registrationNumber: String(row.data.registration_id || ''),
                        admitCardNumber: String(row.data.admit_card_number || ''),
                        attendanceStatus: String(row.data.attendance_status || ''),
                        passFail: String(row.data.pass_fail || ''),
                        resultNote: String(row.data.exam_result_note || ''),
                        profileUpdateNote: String(row.data.profile_update_note || ''),
                        examCenterName: String(row.data.exam_center || ''),
                        examCenterCode: String(row.data.exam_center_code || ''),
                        subjectMarks: Array.isArray(row.data.subject_marks) ? row.data.subject_marks : [],
                        timeTaken: timeTakenSec,
                        deviceInfo: 'external_import',
                        browserInfo: 'external_import',
                        ipAddress: '',
                        tabSwitchCount: 0,
                        submittedAt,
                        isAutoSubmitted: false,
                        status: 'evaluated',
                    },
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true,
                },
            ).lean();

            if (!resultDoc?._id) {
                errors.push({ rowNo: row.rowNo, identifier, reason: 'Failed to save imported result.' });
                continue;
            }

            if (existing?._id) updated++;
            else inserted++;
            impactedStudentIds.add(studentId);

            if (matchedLog?._id || attemptRef) {
                await markExternalExamAttemptImported({
                    attemptId: String(matchedLog?._id || ''),
                    attemptRef: attemptRef || String(matchedLog?.attemptRef || ''),
                    resultId: String(resultDoc._id),
                    matchedBy: matchedBy || 'attempt_ref',
                });
            }

            const syncResult = await syncExamResultToStudentProfile({
                exam: exam as Record<string, unknown>,
                result: resultDoc,
                studentId,
                source: 'external_import',
                syncMode: syncProfileMode,
                createdBy: String(req.user?._id || ''),
                candidates: {
                    serialId: row.data.serial_id,
                    rollNumber: row.data.roll_number,
                    registrationNumber: row.data.registration_id,
                    admitCardNumber: row.data.admit_card_number,
                    fullName: row.data.full_name,
                    email: row.data.email,
                    phoneNumber: row.data.phone_number,
                    institutionName: row.data.institution_name,
                    department: row.data.department,
                    sscBatch: row.data.ssc_batch,
                    hscBatch: row.data.hsc_batch,
                    guardianName: row.data.guardian_name,
                    guardianPhone: row.data.guardian_phone,
                    examCenter: row.data.exam_center,
                    examResultNote: row.data.exam_result_note,
                    profileUpdateNote: row.data.profile_update_note,
                    userUniqueId: row.data.user_unique_id,
                    attendanceStatus: row.data.attendance_status,
                    passFail: row.data.pass_fail,
                },
                notifyStudent: true,
            });
            if (syncResult.changed) profileUpdates++;
        }

        if (inserted === 0 && updated === 0) {
            res.status(400).json({
                message: 'No valid rows found to import.',
                imported: 0,
                errors,
            });
            return;
        }

        await recomputeGlobalExamRanks(examId);
        await Promise.all(Array.from(impactedStudentIds).map((studentId) => updateStudentPoints(studentId)));

        res.json({
            message: 'External exam results imported successfully.',
            examId,
            examTitle: (exam as Record<string, unknown>).title,
            imported: inserted + updated,
            inserted,
            updated,
            profileUpdates,
            invalid: errors.length,
            errors,
            syncProfileMode,
        });
    } catch (err) {
        console.error('[adminImportExternalExamResults]', err);
        res.status(500).json({ message: 'Server error during external import.' });
    }
}

export async function adminExportExamReport(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            res.status(400).json({ message: 'Invalid exam id.' });
            return;
        }

        const groupId = String(req.query.groupId || '').trim();
        if (groupId && !mongoose.Types.ObjectId.isValid(groupId)) {
            res.status(400).json({ message: 'Invalid groupId.' });
            return;
        }

        const formatRaw = String(req.query.format || 'xlsx').trim().toLowerCase();
        const format = formatRaw === 'csv' || formatRaw === 'pdf' ? formatRaw : 'xlsx';

        const { rows, examTitle } = await buildExamReportRows(examId, groupId);
        const safeTitle = examTitle.replace(/[^a-z0-9]/gi, '_') || `exam_${examId}`;
        const auditPayload = {
            action: 'exam_report_exported' as const,
            examId,
            examTitle,
            exportedCount: rows.length,
            groupId: groupId || undefined,
        };

        if (format === 'csv') {
            const headers = [
                'serialNo', 'registration_id', 'roll_number', 'studentId', 'username', 'fullName', 'email',
                'groupId', 'groupName', 'obtainedMarks', 'totalMarks', 'percentage', 'globalRank', 'groupRank',
                'submittedAt', 'timeTakenSec',
            ];
            const csvRows = [
                headers.join(','),
                ...rows.map((row) => headers.map((key) => escapeCsvCell((row as Record<string, unknown>)[key])).join(',')),
            ];
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_report.csv"`);
            await writeExamExportAuditLog(req, {
                ...auditPayload,
                format: 'csv',
            });
            res.send(csvRows.join('\n'));
            return;
        }

        if (format === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_report.pdf"`);
            await writeExamExportAuditLog(req, {
                ...auditPayload,
                format: 'pdf',
            });
            const doc = new PDFDocument({ size: 'A4', margin: 40 });
            doc.pipe(res);
            doc.fontSize(14).text(`Exam Report: ${examTitle}`, { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(10).text(`Total rows: ${rows.length}`);
            if (groupId) doc.text(`Filtered by groupId: ${groupId}`);
            doc.text(`Generated at: ${new Date().toISOString()}`);
            doc.moveDown(0.8);
            doc.fontSize(9);
            rows.forEach((row) => {
                doc.text(
                    `#${row.serialNo} | ${row.registration_id || '-'} | ${row.fullName || row.username || row.studentId} | ${row.obtainedMarks}/${row.totalMarks} (${row.percentage}%) | GR:${row.globalRank} | Group:${row.groupName || '-'} | G-Rank:${row.groupRank ?? '-'}`
                );
            });
            doc.end();
            return;
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CampusWay Admin';
        const sheet = workbook.addWorksheet('Exam Report');
        sheet.columns = [
            { header: 'Serial', key: 'serialNo', width: 10 },
            { header: 'Registration ID', key: 'registration_id', width: 18 },
            { header: 'Roll', key: 'roll_number', width: 14 },
            { header: 'Student ID', key: 'studentId', width: 28 },
            { header: 'Username', key: 'username', width: 18 },
            { header: 'Full Name', key: 'fullName', width: 26 },
            { header: 'Email', key: 'email', width: 30 },
            { header: 'Group ID', key: 'groupId', width: 28 },
            { header: 'Group Name', key: 'groupName', width: 24 },
            { header: 'Obtained Marks', key: 'obtainedMarks', width: 14 },
            { header: 'Total Marks', key: 'totalMarks', width: 14 },
            { header: 'Percentage', key: 'percentage', width: 12 },
            { header: 'Global Rank', key: 'globalRank', width: 12 },
            { header: 'Group Rank', key: 'groupRank', width: 12 },
            { header: 'Submitted At', key: 'submittedAt', width: 26 },
            { header: 'Time Taken (s)', key: 'timeTakenSec', width: 14 },
        ];
        sheet.getRow(1).font = { bold: true };
        rows.forEach((row) => sheet.addRow(row));

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_report.xlsx"`);
        await writeExamExportAuditLog(req, {
            ...auditPayload,
            format: 'xlsx',
        });
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('[adminExportExamReport]', err);
        const message = err instanceof Error && err.message === 'Exam not found' ? 'Exam not found' : 'Server error';
        res.status(message === 'Exam not found' ? 404 : 500).json({ message });
    }
}

export async function adminExportExamEvents(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '');
        const format = String(req.query.format || 'csv').toLowerCase();
        const exam = await Exam.findById(examId).lean();
        if (!exam) {
            res.status(404).json({ message: 'Exam not found' });
            return;
        }

        const events = await ExamEvent.find({ exam: examId })
            .sort({ createdAt: -1 })
            .lean();

        const rows = events.map((event) => ({
            eventId: String(event._id),
            attemptId: String(event.attempt),
            studentId: String(event.student),
            eventType: String(event.eventType),
            createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : '',
            ip: String(event.ip || ''),
            userAgent: String(event.userAgent || ''),
            metadata: JSON.stringify(event.metadata || {}),
        }));

        if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'CampusWay Admin';
            const sheet = workbook.addWorksheet('Event Logs');
            sheet.columns = [
                { header: 'Event ID', key: 'eventId', width: 28 },
                { header: 'Attempt ID', key: 'attemptId', width: 28 },
                { header: 'Student ID', key: 'studentId', width: 28 },
                { header: 'Event Type', key: 'eventType', width: 18 },
                { header: 'Created At', key: 'createdAt', width: 28 },
                { header: 'IP', key: 'ip', width: 18 },
                { header: 'User Agent', key: 'userAgent', width: 40 },
                { header: 'Metadata', key: 'metadata', width: 80 },
            ];
            sheet.getRow(1).font = { bold: true };
            rows.forEach((row) => sheet.addRow(row));

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-z0-9]/gi, '_')}_events.xlsx"`);
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        const header = ['eventId', 'attemptId', 'studentId', 'eventType', 'createdAt', 'ip', 'userAgent', 'metadata'];
        const csvRows = [
            header.join(','),
            ...rows.map((row) => header
                .map((key) => {
                    const value = String((row as Record<string, unknown>)[key] || '');
                    const escaped = value.replace(/"/g, '""');
                    return `"${escaped}"`;
                })
                .join(',')),
        ];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-z0-9]/gi, '_')}_events.csv"`);
        res.send(csvRows.join('\n'));
    } catch (err) {
        console.error('[adminExportExamEvents]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

function sanitizeQuestionForPreview(question: Record<string, unknown>): Record<string, unknown> {
    const {
        correctAnswer,
        explanation,
        solutionImage,
        solution,
        explanation_text,
        explanation_image_url,
        explanation_formula,
        negativeMarks,
        ...safe
    } = question;
    return {
        ...safe,
        questionType: String(safe.questionType || '').toLowerCase() === 'written' ? 'written' : 'mcq',
    };
}

export async function adminStartExamPreview(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '');
        const adminId = String(req.user?._id || '');
        const exam = await Exam.findById(examId).lean();
        if (!exam) {
            res.status(404).json({ message: 'Exam not found' });
            return;
        }

        let session = await ExamSession.findOne({
            exam: examId,
            student: adminId,
            isActive: true,
            attemptNo: 0,
        });

        const now = new Date();
        const expiresAt = new Date(now.getTime() + Number(exam.duration || 0) * 60 * 1000);
        const rawQuestions = await Question.find({ exam: examId, active: { $ne: false } })
            .sort({ order: 1 })
            .lean();
        const questions = rawQuestions.map((q) => sanitizeQuestionForPreview(q as unknown as Record<string, unknown>));

        if (!session) {
            session = await ExamSession.create({
                exam: examId,
                student: adminId,
                attemptNo: 0,
                attemptRevision: 0,
                startedAt: now,
                expiresAt,
                ipAddress: req.ip || '',
                userAgent: req.get('User-Agent') || '',
                deviceInfo: 'Admin Preview',
                browserInfo: 'Admin Preview',
                deviceFingerprint: `admin-preview:${adminId}`,
                sessionLocked: false,
                isActive: true,
                status: 'in_progress',
                answers: questions.map((q) => ({
                    questionId: String(q._id || ''),
                    selectedAnswer: '',
                    changeCount: 0,
                })),
                cheat_flags: [{ reason: 'admin_preview', timestamp: now }],
            });
        }

        res.json({
            preview: true,
            exam: {
                _id: exam._id,
                title: exam.title,
                subject: exam.subject,
                duration: exam.duration,
                totalQuestions: exam.totalQuestions,
                totalMarks: exam.totalMarks,
                instructions: exam.instructions || '',
                require_instructions_agreement: Boolean((exam as any).require_instructions_agreement),
                security_policies: (exam as any).security_policies || {},
            },
            session: {
                sessionId: session._id,
                startedAt: session.startedAt,
                expiresAt: session.expiresAt,
                attemptNo: 0,
                attemptRevision: Number((session as any).attemptRevision || 0),
                isPreview: true,
            },
            questions,
            serverNow: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[adminStartExamPreview]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── EXAM PREVIEW (student-view) ─────── */

export async function adminGetExamPreview(req: AuthRequest, res: Response): Promise<void> {
    try {
        const examId = String(req.params.id || req.params.examId || '');
        const exam = await Exam.findById(examId).lean();
        if (!exam) {
            res.status(404).json({ message: 'Exam not found' });
            return;
        }

        const questions = await ExamQuestionModel.find({ examId })
            .sort({ orderIndex: 1 })
            .lean();

        const previewQuestions = questions.map((q) => ({
            orderIndex: q.orderIndex,
            question_en: q.question_en,
            question_bn: q.question_bn,
            questionImageUrl: q.questionImageUrl,
            options: (q.options || []).map((opt: any) => ({
                key: opt.key,
                text_en: opt.text_en,
                text_bn: opt.text_bn,
            })),
            marks: q.marks,
        }));

        res.json({
            exam: {
                title: exam.title,
                subject: exam.subject,
                duration: exam.duration,
                totalMarks: exam.totalMarks,
                totalQuestions: exam.totalQuestions,
                negativeMarking: exam.negativeMarking,
                negativeMarkValue: exam.negativeMarkValue,
            },
            questions: previewQuestions,
        });
    } catch (err) {
        console.error('[adminGetExamPreview]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── DAILY REPORT ─────── */

export async function adminDailyReport(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date as string) : new Date();
        const start = new Date(targetDate.setHours(0, 0, 0, 0));
        const end = new Date(targetDate.setHours(23, 59, 59, 999));

        const [examsCount, submissions] = await Promise.all([
            Exam.countDocuments({ startDate: { $gte: start, $lte: end } }),
            ExamResult.find({ submittedAt: { $gte: start, $lte: end } }).lean(),
        ]);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'CampusWay Admin';
        const sheet = workbook.addWorksheet('Daily Report');

        sheet.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 25 },
        ];
        sheet.getRow(1).font = { bold: true };

        const avgScore = submissions.length > 0
            ? (submissions.reduce((a, s) => a + s.percentage, 0) / submissions.length).toFixed(1) + '%'
            : 'N/A';

        sheet.addRows([
            { metric: 'Date', value: start.toLocaleDateString() },
            { metric: 'Exams Conducted', value: examsCount },
            { metric: 'Total Submissions', value: submissions.length },
            { metric: 'Unique Participants', value: new Set(submissions.map(s => s.student.toString())).size },
            { metric: 'Average Score', value: avgScore }
        ]);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="daily_report_${start.toISOString().split('T')[0]}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('[adminDailyReport]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── USER MANAGEMENT ─────── */

export async function adminGetUsers(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { page = '1', limit = '20', q, role } = req.query;
        const pageNum = Math.max(1, parseInt(page as string));
        const limitNum = Math.min(100, parseInt(limit as string));
        const filter: Record<string, unknown> = {};
        if (role) filter.role = role;
        if (q) filter.$or = [
            { username: { $regex: q, $options: 'i' } },
            { fullName: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } },
        ];
        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select('-password -twoFactorSecret')
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();
        res.json({ users, pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminUpdateUserSubscription(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { userId } = req.params;
        const {
            plan,
            planCode,
            planName,
            startDate,
            expiryDate,
            isActive,
        } = req.body as {
            plan?: string;
            planCode?: string;
            planName?: string;
            startDate?: string | Date;
            expiryDate?: string | Date;
            isActive?: boolean;
        };
        const normalizedPlanCode = String(planCode || plan || '').trim().toLowerCase();
        const normalizedPlanName = String(planName || plan || '').trim();
        const user = await User.findByIdAndUpdate(
            userId,
            {
                subscription: {
                    plan: normalizedPlanCode,
                    planCode: normalizedPlanCode,
                    planName: normalizedPlanName,
                    startDate: startDate ? new Date(startDate) : undefined,
                    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                    isActive: Boolean(isActive),
                    assignedBy: req.user?._id,
                    assignedAt: new Date(),
                }
            },
            { new: true }
        ).select('-password');
        if (!user) { res.status(404).json({ message: 'User not found' }); return; }
        res.json({ user, message: 'Subscription updated.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminToggleUserStatus(req: AuthRequest, res: Response): Promise<void> {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) { res.status(404).json({ message: 'User not found' }); return; }
        user.status = user.status === 'active' ? 'suspended' : 'active';
        await user.save();
        res.json({ message: `User status changed to ${user.status}.`, status: user.status });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminResetExamAttempt(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { examId, userId } = req.params;
        await Promise.all([
            ExamResult.deleteOne({ exam: examId, student: userId }),
            ExamSession.deleteOne({ exam: examId, student: userId }),
        ]);
        res.json({ message: 'Exam attempt reset for student.' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── STUDENT REPORT ─────── */
export async function adminGetStudentReport(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { userId } = req.params;
        const student = await User.findById(userId).select('username fullName email phone role').lean();
        if (!student) { res.status(404).json({ message: 'Student not found.' }); return; }

        const results = await ExamResult.find({ student: userId })
            .populate('exam', 'title subject totalMarks duration negativeMarking startDate endDate')
            .sort({ submittedAt: -1 })
            .lean();

        const sessions = await ExamSession.find({ student: userId }).lean();
        const sessionMap = new Map(sessions.map(s => [s.exam.toString(), s]));

        const report = results.map(r => {
            const s = sessionMap.get(r.exam.toString());
            return {
                examId: (r.exam as unknown as Record<string, unknown>)?._id || r.exam,
                examTitle: (r.exam as unknown as Record<string, unknown>)?.title || 'Unknown',
                obtainedMarks: r.obtainedMarks,
                totalMarks: r.totalMarks,
                percentage: r.percentage,
                rank: r.rank,
                correctCount: r.correctCount,
                wrongCount: r.wrongCount,
                unansweredCount: r.unansweredCount,
                timeTaken: r.timeTaken,
                tabSwitchCount: r.tabSwitchCount || 0,
                isAutoSubmitted: r.isAutoSubmitted,
                submittedAt: r.submittedAt,
                sessionStartedAt: s?.startedAt,
                autoSaves: s?.autoSaves || 0,
            };
        });

        const totalExams = results.length;
        const avgPercentage = totalExams > 0 ? Math.round((results.reduce((s, r) => s + r.percentage, 0) / totalExams) * 10) / 10 : 0;

        res.json({
            student,
            summary: { totalExams, avgPercentage },
            exams: report,
        });
    } catch (err) {
        console.error('[adminGetStudentReport]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

/* ─────── BULK UNIVERSITY IMPORT ─────── */
export async function adminBulkImportUniversities(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.file) {
            res.status(400).json({ message: 'No file uploaded.' });
            return;
        }

        const legacyBody = asRecordObject(req.body) || {};
        const requestedMapping = Object.entries(asRecordObject(legacyBody.mapping) || {}).reduce<Record<string, string>>((acc, [key, value]) => {
            const normalizedKey = String(key || '').trim();
            const normalizedValue = String(value || '').trim();
            if (!normalizedKey || !normalizedValue) return acc;
            acc[normalizedKey] = normalizedValue;
            return acc;
        }, {});
        const requestedDefaults = asRecordObject(legacyBody.defaults) || {};
        const modeRaw = String(legacyBody.mode || 'update-existing').trim().toLowerCase();
        const mode = modeRaw === 'insert-only' ? 'insert-only' : 'update-existing';

        const initResult: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
        const initRes = {
            status(code: number) {
                initResult.statusCode = code;
                return this;
            },
            json(payload: unknown) {
                initResult.body = payload;
                return this;
            },
            send(payload: unknown) {
                initResult.body = payload;
                return this;
            },
        } as unknown as Response;
        await adminInitUniversityImport(req, initRes);
        if (initResult.statusCode >= 400) {
            const payload = asRecordObject(initResult.body) || { message: 'Failed to initialize import.' };
            res.status(initResult.statusCode || 500).json(payload);
            return;
        }

        const initBody = asRecordObject(initResult.body) || {};
        const jobId = String(initBody.importJobId || '').trim();
        if (!jobId) {
            res.status(500).json({ message: 'Legacy import failed to initialize an import job.' });
            return;
        }

        const suggestedMapping = Object.entries(asRecordObject(initBody.suggestedMapping) || {}).reduce<Record<string, string>>((acc, [key, value]) => {
            const normalizedKey = String(key || '').trim();
            const normalizedValue = String(value || '').trim();
            if (!normalizedKey || !normalizedValue) return acc;
            acc[normalizedKey] = normalizedValue;
            return acc;
        }, {});
        const mapping = Object.keys(requestedMapping).length > 0 ? requestedMapping : suggestedMapping;

        const validateResult: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
        const validateRes = {
            status(code: number) {
                validateResult.statusCode = code;
                return this;
            },
            json(payload: unknown) {
                validateResult.body = payload;
                return this;
            },
            send(payload: unknown) {
                validateResult.body = payload;
                return this;
            },
        } as unknown as Response;
        const validateReq = {
            ...req,
            params: { ...(req.params || {}), jobId },
            body: { mapping, defaults: requestedDefaults },
        } as unknown as AuthRequest;
        await adminValidateUniversityImport(validateReq, validateRes);
        if (validateResult.statusCode >= 400) {
            const payload = asRecordObject(validateResult.body) || { message: 'Failed to validate import data.' };
            res.status(validateResult.statusCode || 500).json(payload);
            return;
        }
        const validateBody = asRecordObject(validateResult.body) || {};

        const commitResult: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
        const commitRes = {
            status(code: number) {
                commitResult.statusCode = code;
                return this;
            },
            json(payload: unknown) {
                commitResult.body = payload;
                return this;
            },
            send(payload: unknown) {
                commitResult.body = payload;
                return this;
            },
        } as unknown as Response;
        const commitReq = {
            ...req,
            params: { ...(req.params || {}), jobId },
            body: { mode },
        } as unknown as AuthRequest;
        await adminCommitUniversityImport(commitReq, commitRes);
        if (commitResult.statusCode >= 400) {
            const payload = asRecordObject(commitResult.body) || { message: 'Failed to commit import.' };
            res.status(commitResult.statusCode || 500).json(payload);
            return;
        }

        const commitBody = asRecordObject(commitResult.body) || {};
        const commitSummary = asRecordObject(commitBody.commitSummary) || {};
        const legacyImported = Number(commitSummary.inserted || 0);
        const legacyUpdated = Number(commitSummary.updated || 0);
        const failedRows = Array.isArray(commitBody.failedRows) ? commitBody.failedRows : [];
        const legacyErrors = failedRows
            .map((item) => {
                const normalized = asRecordObject(item) || {};
                return {
                    row: Number(normalized.rowNumber || 0),
                    reason: String(normalized.reason || 'Validation failed'),
                };
            })
            .filter((item) => item.row > 0);

        res.json({
            message: `Import complete. ${legacyImported} added, ${legacyUpdated} updated.`,
            imported: legacyImported,
            updated: legacyUpdated,
            errors: legacyErrors,
            importJobId: jobId,
            validationSummary: validateBody.validationSummary || null,
            commitSummary,
            warnings: Array.isArray(commitBody.warnings) ? commitBody.warnings : [],
        });
        return;
    } catch (err) {
        console.error('[adminBulkImportUniversities]', err);
        res.status(500).json({ message: 'Server error during import.' });
    }
}

export const adminGetLiveExamSessions = async (req: AuthRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const examId = req.query.examId as string;

        const q: any = { isActive: true, status: 'in_progress' };
        if (examId) q.exam = examId;

        const total = await ExamSession.countDocuments(q);
        const rawSessions = await ExamSession.find(q)
            .populate('student', 'username fullName email')
            .populate('exam', 'title subject')
            .sort({ lastSavedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const sessions = rawSessions.map((session: any) => {
            const cheatFlags = Array.isArray(session.cheat_flags) ? session.cheat_flags : [];
            const copyPasteViolations = cheatFlags.filter((flag: any) =>
                String(flag?.reason || '').startsWith('copy_attempt')
            ).length;
            const fullscreenExits = cheatFlags.filter((flag: any) =>
                String(flag?.reason || '').startsWith('fullscreen_exit')
            ).length;
            const answers = Array.isArray(session.answers) ? session.answers : [];
            const answered = answers.filter((a: any) => Boolean(a?.selectedAnswer || a?.writtenAnswerUrl)).length;
            const progressPercent = answers.length > 0 ? Math.round((answered / answers.length) * 100) : 0;
            return {
                ...session,
                copyPasteViolations,
                fullscreenExits,
                currentQuestionId: session.currentQuestionId || '',
                violationsCount: Number(session.violationsCount || 0),
                progressPercent,
                deviceIp: String(session.ipAddress || ''),
                isSuspicious: copyPasteViolations > 0 || fullscreenExits > 0 || Number(session.tabSwitchCount || 0) > 0,
            };
        });

        res.json({
            sessions,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (err) {
        console.error('[adminGetLiveExamSessions]', err);
        res.status(500).json({ message: 'Server error fetching live exam sessions.' });
    }
};

export async function adminLiveStream(req: AuthRequest, res: Response): Promise<void> {
    try {
        addAdminLiveStreamClient(res);
    } catch (err) {
        console.error('[adminLiveStream]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminLiveAttemptAction(req: AuthRequest, res: Response): Promise<void> {
    try {
        const attemptId = String(req.params.attemptId || '');
        if (!attemptId || !mongoose.Types.ObjectId.isValid(attemptId)) {
            res.status(400).json({ message: 'Invalid attempt id.' });
            return;
        }

        const body = (req.body || {}) as Record<string, unknown>;
        const action = String(body.action || '').trim().toLowerCase();
        if (!['warn', 'force_submit', 'lock', 'message'].includes(action)) {
            res.status(400).json({ message: 'Invalid action.' });
            return;
        }

        const session = await ExamSession.findById(attemptId).lean();
        if (!session) {
            res.status(404).json({ message: 'Attempt not found.' });
            return;
        }

        const examId = String(session.exam || '');
        const studentId = String(session.student || '');
        const actorId = String(req.user?._id || '');

        if (action === 'force_submit') {
            const submitResult = await submitExamAsSystem({
                examId,
                studentId,
                sourceReq: req,
                reason: `admin_live_force_submit:${actorId}`,
                submissionType: 'forced',
            });
            if (submitResult.statusCode >= 400) {
                res.status(submitResult.statusCode).json(submitResult.body);
                return;
            }
            broadcastExamAttemptEventByMeta({ examId, studentId }, 'forced-submit', { source: 'admin', actorId });
            broadcastAdminLiveEvent('forced-submit', { attemptId, examId, studentId, actorId });
            void broadcastExamMetricsSnapshot(examId, 'live_force_submit');
            await ExamEvent.create({
                attempt: attemptId,
                student: studentId,
                exam: examId,
                eventType: 'admin_action',
                metadata: { action, actorId },
                ip: req.ip || '',
                userAgent: req.get('User-Agent') || '',
            });
            res.json({ action, status: 'ok', message: 'Attempt force-submitted.' });
            return;
        }

        if (action === 'lock') {
            await ExamSession.updateOne(
                { _id: attemptId },
                { $set: { sessionLocked: true, lockReason: `admin_lock:${actorId}` }, $inc: { violationsCount: 1 } },
            );
            broadcastExamAttemptEventByMeta({ examId, studentId }, 'attempt-locked', { source: 'admin', actorId, reason: `admin_lock:${actorId}` });
            broadcastAdminLiveEvent('attempt-locked', { attemptId, examId, studentId, actorId });
            void broadcastExamMetricsSnapshot(examId, 'live_lock');
            await ExamEvent.create({
                attempt: attemptId,
                student: studentId,
                exam: examId,
                eventType: 'admin_action',
                metadata: { action, actorId },
                ip: req.ip || '',
                userAgent: req.get('User-Agent') || '',
            });
            res.json({ action, status: 'ok', message: 'Attempt locked.' });
            return;
        }

        if (action === 'warn') {
            const message = String(body.message || 'Security warning from proctor.');
            broadcastExamAttemptEventByMeta({ examId, studentId }, 'policy-warning', { source: 'admin', actorId, message });
            broadcastAdminLiveEvent('warn-sent', { attemptId, examId, studentId, actorId, message });
            await ExamEvent.create({
                attempt: attemptId,
                student: studentId,
                exam: examId,
                eventType: 'warn_sent',
                metadata: { action, actorId, message },
                ip: req.ip || '',
                userAgent: req.get('User-Agent') || '',
            });
            res.json({ action, status: 'ok', message: 'Warning sent.' });
            return;
        }

        const message = String(body.message || '').trim();
        if (!message) {
            res.status(400).json({ message: 'Message is required.' });
            return;
        }
        broadcastExamAttemptEventByMeta({ examId, studentId }, 'policy-warning', { source: 'admin_message', actorId, message });
        broadcastAdminLiveEvent('attempt-updated', { attemptId, examId, studentId, actorId, message });
        await ExamEvent.create({
            attempt: attemptId,
            student: studentId,
            exam: examId,
            eventType: 'message_sent',
            metadata: { action, actorId, message },
            ip: req.ip || '',
            userAgent: req.get('User-Agent') || '',
        });
        res.json({ action, status: 'ok', message: 'Message sent.' });
    } catch (err) {
        console.error('[adminLiveAttemptAction]', err);
        res.status(500).json({ message: 'Server error' });
    }
}

