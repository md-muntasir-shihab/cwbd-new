// Unit tests for Zod validation schemas
// Validates: Requirements 2.2, 6.2, 7.4

import { describe, it, expect } from 'vitest';
import { gradeWrittenAnswerSchema } from '../validators/examGrading.validator';
import {
    updateNotificationDefaultsSchema,
    sendAnnouncementSchema,
} from '../validators/notificationManagement.validator';

// ── Helpers ─────────────────────────────────────────────────────────────────

const VALID_OBJECT_ID = 'aabbccddeeff00112233aabb';

function makeValidGradePayload(overrides: Record<string, unknown> = {}) {
    return {
        questionId: VALID_OBJECT_ID,
        marks: 5,
        maxMarks: 10,
        feedback: 'Good answer',
        ...overrides,
    };
}

function makeValidDefaultEntry(overrides: Record<string, unknown> = {}) {
    return {
        eventType: 'exam_published' as const,
        label: 'Exam Published',
        inApp: true,
        email: false,
        push: false,
        sms: false,
        ...overrides,
    };
}

function makeValidAnnouncement(overrides: Record<string, unknown> = {}) {
    return {
        title: 'Important Update',
        message: 'Please check the new schedule.',
        targetRole: 'student',
        ...overrides,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// gradeWrittenAnswerSchema
// ═══════════════════════════════════════════════════════════════════════════

describe('gradeWrittenAnswerSchema', () => {
    // ── Valid inputs ────────────────────────────────────────────────────

    it('accepts a valid grade payload', () => {
        const result = gradeWrittenAnswerSchema.safeParse(makeValidGradePayload());
        expect(result.success).toBe(true);
    });

    it('accepts marks = 0 (lower boundary)', () => {
        const result = gradeWrittenAnswerSchema.safeParse(makeValidGradePayload({ marks: 0 }));
        expect(result.success).toBe(true);
    });

    it('accepts marks = maxMarks (upper boundary)', () => {
        const result = gradeWrittenAnswerSchema.safeParse(makeValidGradePayload({ marks: 10, maxMarks: 10 }));
        expect(result.success).toBe(true);
    });

    it('defaults feedback to empty string when omitted', () => {
        const { feedback, ...rest } = makeValidGradePayload();
        const result = gradeWrittenAnswerSchema.safeParse(rest);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.feedback).toBe('');
        }
    });

    it('accepts feedback exactly 2000 chars', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ feedback: 'a'.repeat(2000) }),
        );
        expect(result.success).toBe(true);
    });

    // ── Invalid inputs ──────────────────────────────────────────────────

    it('rejects marks > maxMarks', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ marks: 10.01, maxMarks: 10 }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects marks = maxMarks + 0.01', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ marks: 10.01, maxMarks: 10 }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects negative marks (marks = -1)', () => {
        const result = gradeWrittenAnswerSchema.safeParse(makeValidGradePayload({ marks: -1 }));
        expect(result.success).toBe(false);
    });

    it('rejects maxMarks = 0', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ marks: 0, maxMarks: 0 }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects negative maxMarks', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ marks: 0, maxMarks: -5 }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects invalid ObjectId (too short)', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ questionId: 'abc123' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects invalid ObjectId (non-hex chars)', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ questionId: 'zzzzzzzzzzzzzzzzzzzzzzzz' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects feedback > 2000 chars (2001 chars)', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ feedback: 'a'.repeat(2001) }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects missing questionId', () => {
        const { questionId, ...rest } = makeValidGradePayload();
        const result = gradeWrittenAnswerSchema.safeParse(rest);
        expect(result.success).toBe(false);
    });

    it('rejects missing marks', () => {
        const { marks, ...rest } = makeValidGradePayload();
        const result = gradeWrittenAnswerSchema.safeParse(rest);
        expect(result.success).toBe(false);
    });

    it('rejects missing maxMarks', () => {
        const { maxMarks, ...rest } = makeValidGradePayload();
        const result = gradeWrittenAnswerSchema.safeParse(rest);
        expect(result.success).toBe(false);
    });

    it('rejects marks as a string', () => {
        const result = gradeWrittenAnswerSchema.safeParse(
            makeValidGradePayload({ marks: '5' }),
        );
        expect(result.success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// updateNotificationDefaultsSchema
// ═══════════════════════════════════════════════════════════════════════════

describe('updateNotificationDefaultsSchema', () => {
    // ── Valid inputs ────────────────────────────────────────────────────

    it('accepts a valid defaults array with one entry', () => {
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [makeValidDefaultEntry()],
        });
        expect(result.success).toBe(true);
    });

    it('accepts a valid defaults array with multiple entries', () => {
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [
                makeValidDefaultEntry({ eventType: 'exam_published' }),
                makeValidDefaultEntry({ eventType: 'result_published', email: true }),
                makeValidDefaultEntry({ eventType: 'streak_warning', push: true }),
            ],
        });
        expect(result.success).toBe(true);
    });

    it('accepts all valid event types', () => {
        const eventTypes = [
            'exam_published', 'exam_starting_soon', 'result_published',
            'streak_warning', 'group_membership', 'battle_challenge',
            'payment_confirmation', 'routine_reminder', 'doubt_reply',
        ];
        const defaults = eventTypes.map((et) => makeValidDefaultEntry({ eventType: et }));
        const result = updateNotificationDefaultsSchema.safeParse({ defaults });
        expect(result.success).toBe(true);
    });

    // ── Invalid inputs ──────────────────────────────────────────────────

    it('rejects empty defaults array', () => {
        const result = updateNotificationDefaultsSchema.safeParse({ defaults: [] });
        expect(result.success).toBe(false);
    });

    it('rejects missing defaults field', () => {
        const result = updateNotificationDefaultsSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('rejects entry with missing eventType', () => {
        const { eventType, ...rest } = makeValidDefaultEntry();
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [rest],
        });
        expect(result.success).toBe(false);
    });

    it('rejects entry with invalid eventType', () => {
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [makeValidDefaultEntry({ eventType: 'invalid_event' })],
        });
        expect(result.success).toBe(false);
    });

    it('rejects entry with missing label', () => {
        const { label, ...rest } = makeValidDefaultEntry();
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [rest],
        });
        expect(result.success).toBe(false);
    });

    it('rejects entry with empty label', () => {
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [makeValidDefaultEntry({ label: '' })],
        });
        expect(result.success).toBe(false);
    });

    it('rejects entry with missing boolean channel fields', () => {
        const { inApp, ...rest } = makeValidDefaultEntry();
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [rest],
        });
        expect(result.success).toBe(false);
    });

    it('rejects entry with non-boolean channel value', () => {
        const result = updateNotificationDefaultsSchema.safeParse({
            defaults: [makeValidDefaultEntry({ inApp: 'yes' })],
        });
        expect(result.success).toBe(false);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// sendAnnouncementSchema
// ═══════════════════════════════════════════════════════════════════════════

describe('sendAnnouncementSchema', () => {
    // ── Valid inputs — targeting modes ───────────────────────────────────

    it('accepts with targetRole only', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ targetRole: 'student' }),
        );
        expect(result.success).toBe(true);
    });

    it('accepts with targetGroupId only', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({
                targetRole: undefined,
                targetGroupId: VALID_OBJECT_ID,
            }),
        );
        expect(result.success).toBe(true);
    });

    it('accepts with targetUserIds only', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({
                targetRole: undefined,
                targetUserIds: ['user1', 'user2'],
            }),
        );
        expect(result.success).toBe(true);
    });

    it('accepts with multiple targeting fields', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({
                targetRole: 'student',
                targetGroupId: VALID_OBJECT_ID,
            }),
        );
        expect(result.success).toBe(true);
    });

    // ── Valid inputs — boundary lengths ──────────────────────────────────

    it('accepts title exactly 200 chars', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ title: 'a'.repeat(200) }),
        );
        expect(result.success).toBe(true);
    });

    it('accepts message exactly 2000 chars', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ message: 'a'.repeat(2000) }),
        );
        expect(result.success).toBe(true);
    });

    it('defaults type to announcement when omitted', () => {
        const result = sendAnnouncementSchema.safeParse(makeValidAnnouncement());
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.type).toBe('announcement');
        }
    });

    // ── Invalid inputs — missing targeting ───────────────────────────────

    it('rejects when no targeting field is provided', () => {
        const result = sendAnnouncementSchema.safeParse({
            title: 'Test',
            message: 'Test message',
        });
        expect(result.success).toBe(false);
    });

    it('rejects when all targeting fields are explicitly undefined', () => {
        const result = sendAnnouncementSchema.safeParse({
            title: 'Test',
            message: 'Test message',
            targetRole: undefined,
            targetGroupId: undefined,
            targetUserIds: undefined,
        });
        expect(result.success).toBe(false);
    });

    // ── Invalid inputs — title boundaries ────────────────────────────────

    it('rejects empty title', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ title: '' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects whitespace-only title (trimmed to empty)', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ title: '   ' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects title 201 chars', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ title: 'a'.repeat(201) }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects missing title', () => {
        const { title, ...rest } = makeValidAnnouncement();
        const result = sendAnnouncementSchema.safeParse(rest);
        expect(result.success).toBe(false);
    });

    // ── Invalid inputs — message boundaries ──────────────────────────────

    it('rejects empty message', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ message: '' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects whitespace-only message (trimmed to empty)', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ message: '   ' }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects message 2001 chars', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({ message: 'a'.repeat(2001) }),
        );
        expect(result.success).toBe(false);
    });

    it('rejects missing message', () => {
        const { message, ...rest } = makeValidAnnouncement();
        const result = sendAnnouncementSchema.safeParse(rest);
        expect(result.success).toBe(false);
    });

    // ── Invalid inputs — targetGroupId format ────────────────────────────

    it('rejects invalid targetGroupId (not a valid ObjectId)', () => {
        const result = sendAnnouncementSchema.safeParse(
            makeValidAnnouncement({
                targetRole: undefined,
                targetGroupId: 'not-a-valid-id',
            }),
        );
        expect(result.success).toBe(false);
    });
});
