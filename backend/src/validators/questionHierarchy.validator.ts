import { z } from 'zod';

// ── Question Hierarchy Validation Schemas ───────────────
// Zod schemas for the 5-level question taxonomy CRUD, reorder, and merge.
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6

/** Reusable 24-char hex ObjectId string validator. */
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

/** Bilingual text: both en and bn are required, non-empty after trim. */
const bilingualText = z.object({
    en: z.string().trim().min(1, 'English text is required'),
    bn: z.string().trim().min(1, 'Bengali text is required'),
});

/** Optional bilingual text (both fields optional). */
const bilingualTextOptional = z
    .object({
        en: z.string().trim().optional(),
        bn: z.string().trim().optional(),
    })
    .optional();

/** Lowercase alphanumeric code: starts with letter/digit, allows hyphens and underscores. */
const codeField = z
    .string()
    .trim()
    .min(1, 'Code is required')
    .regex(/^[a-z0-9][a-z0-9-_]*$/, 'Code must be lowercase alphanumeric (hyphens/underscores allowed)');

/** Hierarchy levels used in reorder and merge operations. */
const hierarchyLevel = z.enum(['group', 'sub-group', 'subject', 'chapter', 'topic']);

// ── Group (Level 1) ─────────────────────────────────────

export const createGroupSchema = z.object({
    code: codeField,
    title: bilingualText,
    description: bilingualTextOptional,
    iconUrl: z.string().trim().optional(),
    color: z.string().trim().optional(),
    order: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
});

export const updateGroupSchema = createGroupSchema.partial();

// ── Sub-Group (Level 2) ─────────────────────────────────

export const createSubGroupSchema = z.object({
    group_id: objectId,
    code: codeField,
    title: bilingualText,
    description: bilingualTextOptional,
    iconUrl: z.string().trim().optional(),
    order: z.number().int().min(0).optional(),
});


export const updateSubGroupSchema = createSubGroupSchema.partial().omit({ group_id: true });

// ── Subject (Level 3) — uses QuestionCategory model ────

export const createSubjectSchema = z.object({
    sub_group_id: objectId,
    code: codeField,
    title: bilingualText,
    description: bilingualTextOptional,
    order: z.number().int().min(0).optional(),
});

export const updateSubjectSchema = createSubjectSchema.partial().omit({ sub_group_id: true });

// ── Chapter (Level 4) ───────────────────────────────────

export const createChapterSchema = z.object({
    subject_id: objectId,
    code: codeField,
    title: bilingualText,
    description: bilingualTextOptional,
    order: z.number().int().min(0).optional(),
});

export const updateChapterSchema = createChapterSchema.partial().omit({ subject_id: true });

// ── Topic (Level 5) ─────────────────────────────────────

export const createTopicSchema = z.object({
    chapter_id: objectId,
    code: codeField,
    title: bilingualText,
    description: bilingualTextOptional,
    order: z.number().int().min(0).optional(),
});

export const updateTopicSchema = createTopicSchema.partial().omit({ chapter_id: true });

// ── Reorder ─────────────────────────────────────────────

export const reorderSchema = z.object({
    level: hierarchyLevel,
    orderedIds: z.array(objectId).min(1, 'At least one ID is required'),
});

// ── Merge ───────────────────────────────────────────────

export const mergeSchema = z.object({
    level: hierarchyLevel,
    sourceId: objectId,
    targetId: objectId,
}).refine((data) => data.sourceId !== data.targetId, {
    message: 'Source and target must be different nodes',
    path: ['targetId'],
});
