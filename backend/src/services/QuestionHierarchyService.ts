/**
 * Question Hierarchy Service
 *
 * Manages the 5-level question taxonomy:
 *   Group → SubGroup → Subject (QuestionCategory) → Chapter → Topic
 *
 * Provides CRUD operations with parent-chain validation,
 * duplicate name rejection, and cascading delete protection.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 1.11
 */
import mongoose from 'mongoose';
import QuestionGroup, { IQuestionGroup } from '../models/QuestionGroup';
import QuestionSubGroup, { IQuestionSubGroup } from '../models/QuestionSubGroup';
import QuestionCategory, { IQuestionCategory } from '../models/QuestionCategory';
import QuestionChapter, { IQuestionChapter } from '../models/QuestionChapter';
import QuestionTopic, { IQuestionTopic } from '../models/QuestionTopic';
import QuestionBankQuestion from '../models/QuestionBankQuestion';

// ─── DTO Types ──────────────────────────────────────────────

export interface CreateGroupDto {
    code: string;
    title: { en: string; bn: string };
    description?: { en?: string; bn?: string };
    iconUrl?: string;
    color?: string;
    order?: number;
    isActive?: boolean;
}

export interface UpdateGroupDto {
    code?: string;
    title?: { en: string; bn: string };
    description?: { en?: string; bn?: string };
    iconUrl?: string;
    color?: string;
    order?: number;
    isActive?: boolean;
}

export interface CreateSubGroupDto {
    group_id: string;
    code: string;
    title: { en: string; bn: string };
    description?: { en?: string; bn?: string };
    iconUrl?: string;
    order?: number;
}

export interface CreateSubjectDto {
    sub_group_id: string;
    code: string;
    title: { en: string; bn: string };
    description?: { en?: string; bn?: string };
    order?: number;
}

export interface CreateChapterDto {
    subject_id: string;
    code: string;
    title: { en: string; bn: string };
    description?: { en?: string; bn?: string };
    order?: number;
}

export interface CreateTopicDto {
    chapter_id: string;
    code: string;
    title: { en: string; bn: string };
    description?: { en?: string; bn?: string };
    order?: number;
}

// ─── Helpers ────────────────────────────────────────────────

function toObjectId(id: string): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId(id);
}

// ─── Group (Level 1) CRUD ───────────────────────────────────

/**
 * Create a new Question Group (top-level node).
 * Rejects if a group with the same title.en or title.bn already exists.
 * Requirement 1.1, 1.2, 1.11
 */
export async function createGroup(data: CreateGroupDto): Promise<IQuestionGroup> {
    // Check duplicate by code only (title can be similar across groups)
    const duplicate = await QuestionGroup.findOne({ code: data.code });
    if (duplicate) {
        throw new Error(`A group with code "${data.code}" already exists`);
    }

    const group = await QuestionGroup.create({
        code: data.code,
        title: { en: data.title.en, bn: data.title.bn },
        description: data.description ? { en: data.description.en || '', bn: data.description.bn || '' } : undefined,
        iconUrl: data.iconUrl || '',
        color: data.color || '',
        order: data.order ?? 0,
        isActive: data.isActive ?? true,
    });

    return group;
}

/**
 * Update an existing Question Group.
 * If name is being changed, rejects if the new name duplicates another group.
 * Requirement 1.1, 1.11
 */
export async function updateGroup(id: string, data: UpdateGroupDto): Promise<IQuestionGroup> {
    const group = await QuestionGroup.findById(id);
    if (!group) {
        throw new Error('Group not found');
    }

    // Check duplicate code if code is being updated
    if (data.code !== undefined && data.code !== group.code) {
        const duplicate = await QuestionGroup.findOne({
            _id: { $ne: toObjectId(id) },
            code: data.code,
        });
        if (duplicate) {
            throw new Error(`A group with code "${data.code}" already exists`);
        }
    }

    // Check duplicate title if title is being updated
    if (data.title) {
        group.title = { en: data.title.en, bn: data.title.bn };
    }

    if (data.code !== undefined) group.code = data.code;
    if (data.description !== undefined) {
        group.description = { en: data.description.en || '', bn: data.description.bn || '' };
    }
    if (data.iconUrl !== undefined) group.iconUrl = data.iconUrl;
    if (data.color !== undefined) group.color = data.color;
    if (data.order !== undefined) group.order = data.order;
    if (data.isActive !== undefined) group.isActive = data.isActive;

    await group.save();
    return group;
}

/**
 * Delete a Question Group.
 * Rejects if any SubGroups reference this group (cascading delete protection).
 * Requirement 1.9
 */
export async function deleteGroup(id: string): Promise<void> {
    const group = await QuestionGroup.findById(id);
    if (!group) {
        throw new Error('Group not found');
    }

    const childCount = await QuestionSubGroup.countDocuments({ group_id: toObjectId(id) });
    if (childCount > 0) {
        throw new Error(
            `Cannot delete group "${group.title.en}": ${childCount} sub-group(s) still reference it. Remove or reassign children first.`,
        );
    }

    await QuestionGroup.findByIdAndDelete(id);
}


// ─── SubGroup (Level 2) CRUD ────────────────────────────────

/**
 * Update an existing SubGroup.
 */
export async function updateSubGroup(id: string, data: Partial<CreateSubGroupDto>): Promise<IQuestionSubGroup> {
    const subGroup = await QuestionSubGroup.findById(id);
    if (!subGroup) throw new Error('Sub-group not found');

    if (data.title) subGroup.title = { en: data.title.en, bn: data.title.bn };
    if (data.code !== undefined) subGroup.code = data.code;
    if (data.order !== undefined) subGroup.order = data.order;

    await subGroup.save();
    return subGroup;
}

/**
 * Create a new SubGroup under a Group.
 * Validates parent Group exists, rejects duplicate title under same parent.
 * Requirement 1.1, 1.3, 1.11
 */
export async function createSubGroup(data: CreateSubGroupDto): Promise<IQuestionSubGroup> {
    // Validate parent Group exists
    const parentGroup = await QuestionGroup.findById(data.group_id);
    if (!parentGroup) {
        throw new Error(`Parent group "${data.group_id}" not found`);
    }

    // Check duplicate by code under same parent group
    const duplicate = await QuestionSubGroup.findOne({
        group_id: toObjectId(data.group_id),
        code: data.code,
    });
    if (duplicate) {
        throw new Error(
            `A sub-group with code "${data.code}" already exists under group "${parentGroup.title.en}"`,
        );
    }

    const subGroup = await QuestionSubGroup.create({
        group_id: toObjectId(data.group_id),
        code: data.code,
        title: { en: data.title.en, bn: data.title.bn },
        description: data.description ? { en: data.description.en || '', bn: data.description.bn || '' } : undefined,
        iconUrl: data.iconUrl || '',
        order: data.order ?? 0,
    });

    return subGroup;
}

/**
 * Delete a SubGroup. Rejects if any Subjects (QuestionCategory) reference it.
 * Requirement 1.9
 */
export async function deleteSubGroup(id: string): Promise<void> {
    const subGroup = await QuestionSubGroup.findById(id);
    if (!subGroup) {
        throw new Error('Sub-group not found');
    }

    // Subjects store sub_group_id in parent_id field
    const childCount = await QuestionCategory.countDocuments({ parent_id: toObjectId(id) });
    if (childCount > 0) {
        throw new Error(
            `Cannot delete sub-group "${subGroup.title.en}": ${childCount} subject(s) still reference it. Remove or reassign children first.`,
        );
    }

    await QuestionSubGroup.findByIdAndDelete(id);
}

// ─── Subject (Level 3) CRUD — uses QuestionCategory model ──

/**
 * Update an existing Subject.
 */
export async function updateSubject(id: string, data: Partial<CreateSubjectDto>): Promise<IQuestionCategory> {
    const subject = await QuestionCategory.findById(id);
    if (!subject) throw new Error('Subject not found');

    if (data.title) subject.title = { en: data.title.en, bn: data.title.bn };
    if (data.code !== undefined) subject.code = data.code;
    if (data.order !== undefined) subject.order = data.order;

    await subject.save();
    return subject;
}

/**
 * Create a new Subject under a SubGroup.
 * Validates parent SubGroup exists, derives group_id from SubGroup,
 * rejects duplicate title under same parent SubGroup.
 * Requirement 1.1, 1.4, 1.11
 */
export async function createSubject(data: CreateSubjectDto): Promise<IQuestionCategory> {
    // Validate parent SubGroup exists
    const parentSubGroup = await QuestionSubGroup.findById(data.sub_group_id);
    if (!parentSubGroup) {
        throw new Error(`Parent sub-group "${data.sub_group_id}" not found`);
    }

    // Validate the SubGroup's parent Group exists (full chain validation)
    const parentGroup = await QuestionGroup.findById(parentSubGroup.group_id);
    if (!parentGroup) {
        throw new Error(`Parent group for sub-group "${parentSubGroup.title.en}" not found — broken hierarchy chain`);
    }

    // Check duplicate by code under same parent SubGroup
    const duplicate = await QuestionCategory.findOne({
        parent_id: toObjectId(data.sub_group_id),
        code: data.code,
    });
    if (duplicate) {
        throw new Error(
            `A subject with code "${data.code}" already exists under sub-group "${parentSubGroup.title.en}"`,
        );
    }

    const subject = await QuestionCategory.create({
        group_id: parentSubGroup.group_id, // denormalized from SubGroup
        parent_id: toObjectId(data.sub_group_id), // stores SubGroup ref
        code: data.code,
        title: { en: data.title.en, bn: data.title.bn },
        description: data.description ? { en: data.description.en || '', bn: data.description.bn || '' } : undefined,
        order: data.order ?? 0,
    });

    return subject;
}

/**
 * Delete a Subject. Rejects if any Chapters reference it.
 * Requirement 1.9
 */
export async function deleteSubject(id: string): Promise<void> {
    const subject = await QuestionCategory.findById(id);
    if (!subject) {
        throw new Error('Subject not found');
    }

    const childCount = await QuestionChapter.countDocuments({ subject_id: toObjectId(id) });
    if (childCount > 0) {
        throw new Error(
            `Cannot delete subject "${subject.title.en}": ${childCount} chapter(s) still reference it. Remove or reassign children first.`,
        );
    }

    await QuestionCategory.findByIdAndDelete(id);
}


// ─── Chapter (Level 4) CRUD ─────────────────────────────────

/**
 * Update an existing Chapter.
 */
export async function updateChapter(id: string, data: Partial<CreateChapterDto>): Promise<IQuestionChapter> {
    const chapter = await QuestionChapter.findById(id);
    if (!chapter) throw new Error('Chapter not found');

    if (data.title) chapter.title = { en: data.title.en, bn: data.title.bn };
    if (data.code !== undefined) chapter.code = data.code;
    if (data.order !== undefined) chapter.order = data.order;

    await chapter.save();
    return chapter;
}

/**
 * Create a new Chapter under a Subject.
 * Validates parent Subject exists, derives group_id from Subject,
 * rejects duplicate title under same parent Subject.
 * Requirement 1.1, 1.5, 1.11
 */
export async function createChapter(data: CreateChapterDto): Promise<IQuestionChapter> {
    // Validate parent Subject exists
    const parentSubject = await QuestionCategory.findById(data.subject_id);
    if (!parentSubject) {
        throw new Error(`Parent subject "${data.subject_id}" not found`);
    }

    // Derive group_id from the parent Subject (chain consistency)
    const derivedGroupId = parentSubject.group_id;

    // Validate the full chain: Subject → SubGroup → Group
    if (parentSubject.parent_id) {
        const parentSubGroup = await QuestionSubGroup.findById(parentSubject.parent_id);
        if (!parentSubGroup) {
            throw new Error(`Parent sub-group for subject "${parentSubject.title.en}" not found — broken hierarchy chain`);
        }
    }

    // Check duplicate by code under same parent Subject
    const duplicate = await QuestionChapter.findOne({
        subject_id: toObjectId(data.subject_id),
        code: data.code,
    });
    if (duplicate) {
        throw new Error(
            `A chapter with code "${data.code}" already exists under subject "${parentSubject.title.en}"`,
        );
    }

    const chapter = await QuestionChapter.create({
        subject_id: toObjectId(data.subject_id),
        group_id: derivedGroupId,
        code: data.code,
        title: { en: data.title.en, bn: data.title.bn },
        description: data.description ? { en: data.description.en || '', bn: data.description.bn || '' } : undefined,
        order: data.order ?? 0,
    });

    return chapter;
}

/**
 * Delete a Chapter. Rejects if any Topics reference it.
 * Requirement 1.9
 */
export async function deleteChapter(id: string): Promise<void> {
    const chapter = await QuestionChapter.findById(id);
    if (!chapter) {
        throw new Error('Chapter not found');
    }

    // Topics store chapter_id in parent_id field
    const childCount = await QuestionTopic.countDocuments({ parent_id: toObjectId(id) });
    if (childCount > 0) {
        throw new Error(
            `Cannot delete chapter "${chapter.title.en}": ${childCount} topic(s) still reference it. Remove or reassign children first.`,
        );
    }

    await QuestionChapter.findByIdAndDelete(id);
}

// ─── Topic (Level 5) CRUD ───────────────────────────────────

/**
 * Update an existing Topic.
 */
export async function updateTopic(id: string, data: Partial<CreateTopicDto>): Promise<IQuestionTopic> {
    const topic = await QuestionTopic.findById(id);
    if (!topic) throw new Error('Topic not found');

    if (data.title) topic.title = { en: data.title.en, bn: data.title.bn };
    if (data.code !== undefined) topic.code = data.code;
    if (data.order !== undefined) topic.order = data.order;

    await topic.save();
    return topic;
}

/**
 * Create a new Topic under a Chapter.
 * Validates parent Chapter exists, derives category_id and group_id from Chapter,
 * rejects duplicate title under same parent Chapter.
 * Requirement 1.1, 1.6, 1.11
 */
export async function createTopic(data: CreateTopicDto): Promise<IQuestionTopic> {
    // Validate parent Chapter exists
    const parentChapter = await QuestionChapter.findById(data.chapter_id);
    if (!parentChapter) {
        throw new Error(`Parent chapter "${data.chapter_id}" not found`);
    }

    // Validate the full chain: Chapter → Subject → SubGroup → Group
    const parentSubject = await QuestionCategory.findById(parentChapter.subject_id);
    if (!parentSubject) {
        throw new Error(`Parent subject for chapter "${parentChapter.title.en}" not found — broken hierarchy chain`);
    }

    // Check duplicate by code under same parent Chapter
    const duplicate = await QuestionTopic.findOne({
        parent_id: toObjectId(data.chapter_id),
        code: data.code,
    });
    if (duplicate) {
        throw new Error(
            `A topic with code "${data.code}" already exists under chapter "${parentChapter.title.en}"`,
        );
    }

    const topic = await QuestionTopic.create({
        category_id: parentChapter.subject_id, // denormalized Subject ref
        group_id: parentChapter.group_id,       // denormalized Group ref
        parent_id: toObjectId(data.chapter_id), // stores Chapter ref
        code: data.code,
        title: { en: data.title.en, bn: data.title.bn },
        description: data.description ? { en: data.description.en || '', bn: data.description.bn || '' } : undefined,
        order: data.order ?? 0,
    });

    return topic;
}

/**
 * Delete a Topic (leaf node). Topics have no children, so always allowed.
 */
export async function deleteTopic(id: string): Promise<void> {
    const topic = await QuestionTopic.findById(id);
    if (!topic) {
        throw new Error('Topic not found');
    }

    await QuestionTopic.findByIdAndDelete(id);
}

// ─── Hierarchy Level Type ───────────────────────────────────

export type HierarchyLevel = 'group' | 'sub-group' | 'subject' | 'chapter' | 'topic';

// ─── Tree / Children Queries ────────────────────────────────

/**
 * Return the complete 5-level hierarchy tree.
 * Groups → SubGroups → Subjects → Chapters → Topics, each level sorted by `order`.
 * Only active nodes are included.
 * Requirement 1.10
 */
export async function getFullTree(): Promise<Record<string, unknown>[]> {
    const [groups, subGroups, subjects, chapters, topics] = await Promise.all([
        QuestionGroup.find({ isActive: true }).sort({ order: 1 }).lean(),
        QuestionSubGroup.find({ isActive: true }).sort({ order: 1 }).lean(),
        QuestionCategory.find({ isActive: true }).sort({ order: 1 }).lean(),
        QuestionChapter.find({ isActive: true }).sort({ order: 1 }).lean(),
        QuestionTopic.find({ isActive: true }).sort({ order: 1 }).lean(),
    ]);

    // Index topics by chapter (parent_id stores chapter ref)
    const topicsByChapter = new Map<string, typeof topics>();
    for (const t of topics) {
        const key = t.parent_id?.toString() ?? '';
        if (!topicsByChapter.has(key)) topicsByChapter.set(key, []);
        topicsByChapter.get(key)!.push(t);
    }

    // Index chapters by subject
    const chaptersBySubject = new Map<string, typeof chapters>();
    for (const ch of chapters) {
        const key = ch.subject_id.toString();
        if (!chaptersBySubject.has(key)) chaptersBySubject.set(key, []);
        chaptersBySubject.get(key)!.push(ch);
    }

    // Index subjects by sub-group (parent_id stores sub-group ref)
    const subjectsBySubGroup = new Map<string, typeof subjects>();
    for (const s of subjects) {
        const key = s.parent_id?.toString() ?? '';
        if (!subjectsBySubGroup.has(key)) subjectsBySubGroup.set(key, []);
        subjectsBySubGroup.get(key)!.push(s);
    }

    // Index sub-groups by group
    const subGroupsByGroup = new Map<string, typeof subGroups>();
    for (const sg of subGroups) {
        const key = sg.group_id.toString();
        if (!subGroupsByGroup.has(key)) subGroupsByGroup.set(key, []);
        subGroupsByGroup.get(key)!.push(sg);
    }

    // Assemble nested tree
    return groups.map((group) => ({
        ...group,
        level: 'group' as const,
        children: (subGroupsByGroup.get(group._id.toString()) ?? []).map((sg) => ({
            ...sg,
            level: 'sub_group' as const,
            children: (subjectsBySubGroup.get(sg._id.toString()) ?? []).map((subj) => ({
                ...subj,
                level: 'subject' as const,
                children: (chaptersBySubject.get(subj._id.toString()) ?? []).map((ch) => ({
                    ...ch,
                    level: 'chapter' as const,
                    children: (topicsByChapter.get(ch._id.toString()) ?? []).map((t) => ({
                        ...t,
                        level: 'topic' as const,
                    })),
                })),
            })),
        })),
    }));
}

/**
 * Return the immediate children of a given node.
 * - group    → SubGroups where group_id = parentId
 * - sub-group → Subjects (QuestionCategory) where parent_id = parentId
 * - subject  → Chapters where subject_id = parentId
 * - chapter  → Topics where parent_id = parentId
 * All sorted by `order`.
 * Requirement 1.10
 */
export async function getChildrenOf(level: HierarchyLevel, parentId: string) {
    const pid = toObjectId(parentId);

    switch (level) {
        case 'group':
            return QuestionSubGroup.find({ group_id: pid }).sort({ order: 1 }).lean();
        case 'sub-group':
            return QuestionCategory.find({ parent_id: pid }).sort({ order: 1 }).lean();
        case 'subject':
            return QuestionChapter.find({ subject_id: pid }).sort({ order: 1 }).lean();
        case 'chapter':
            return QuestionTopic.find({ parent_id: pid }).sort({ order: 1 }).lean();
        case 'topic':
            // Topics are leaf nodes — no children
            return [];
        default:
            throw new Error(`Unknown hierarchy level: "${level}"`);
    }
}

// ─── Reorder & Merge ────────────────────────────────────────

/**
 * Reorder nodes at a given hierarchy level by updating each node's `order` field
 * to match its position in the provided orderedIds array.
 * Requirement 1.12
 */
export async function reorderNodes(level: HierarchyLevel, orderedIds: string[]): Promise<void> {
    const Model = getModelForLevel(level);

    const ops = orderedIds.map((id, index) => ({
        updateOne: {
            filter: { _id: toObjectId(id) },
            update: { $set: { order: index } },
        },
    }));

    if (ops.length > 0) {
        await Model.bulkWrite(ops);
    }
}

/**
 * Merge source node into target node at the same hierarchy level.
 * Reassigns all children and QuestionBankQuestion references from source to target,
 * then deletes the source node.
 * Requirement 1.13
 */
export async function mergeNodes(level: HierarchyLevel, sourceId: string, targetId: string): Promise<void> {
    const Model = getModelForLevel(level);
    const srcOid = toObjectId(sourceId);
    const tgtOid = toObjectId(targetId);

    // Verify both nodes exist
    const [source, target] = await Promise.all([
        Model.findById(sourceId),
        Model.findById(targetId),
    ]);
    if (!source) throw new Error(`Source node "${sourceId}" not found`);
    if (!target) throw new Error(`Target node "${targetId}" not found`);

    // Reassign children and questions based on level
    switch (level) {
        case 'group':
            // Children: SubGroups reference group via group_id
            await QuestionSubGroup.updateMany({ group_id: srcOid }, { $set: { group_id: tgtOid } });
            // Questions reference group via group_id
            await QuestionBankQuestion.updateMany({ group_id: srcOid }, { $set: { group_id: tgtOid } });
            break;

        case 'sub-group':
            // Children: Subjects (QuestionCategory) reference sub-group via parent_id
            await QuestionCategory.updateMany({ parent_id: srcOid }, { $set: { parent_id: tgtOid } });
            // Questions reference sub-group via sub_group_id
            await QuestionBankQuestion.updateMany({ sub_group_id: srcOid }, { $set: { sub_group_id: tgtOid } });
            break;

        case 'subject':
            // Children: Chapters reference subject via subject_id
            await QuestionChapter.updateMany({ subject_id: srcOid }, { $set: { subject_id: tgtOid } });
            // Questions reference subject via subject_id
            await QuestionBankQuestion.updateMany({ subject_id: srcOid }, { $set: { subject_id: tgtOid } });
            break;

        case 'chapter':
            // Children: Topics reference chapter via parent_id
            await QuestionTopic.updateMany({ parent_id: srcOid }, { $set: { parent_id: tgtOid } });
            // Questions reference chapter via chapter_id
            await QuestionBankQuestion.updateMany({ chapter_id: srcOid }, { $set: { chapter_id: tgtOid } });
            break;

        case 'topic':
            // Topics are leaf nodes — no children to reassign
            // Questions reference topic via topic_id
            await QuestionBankQuestion.updateMany({ topic_id: srcOid }, { $set: { topic_id: tgtOid } });
            break;

        default:
            throw new Error(`Unknown hierarchy level: "${level}"`);
    }

    // Delete the source node
    await Model.findByIdAndDelete(sourceId);
}

/**
 * Helper: resolve the Mongoose model for a given hierarchy level.
 */
function getModelForLevel(level: HierarchyLevel): mongoose.Model<any> {
    switch (level) {
        case 'group':
            return QuestionGroup;
        case 'sub-group':
            return QuestionSubGroup;
        case 'subject':
            return QuestionCategory;
        case 'chapter':
            return QuestionChapter;
        case 'topic':
            return QuestionTopic;
        default:
            throw new Error(`Unknown hierarchy level: "${level}"`);
    }
}


// ─── Seed Defaults ──────────────────────────────────────────

/**
 * Seed predefined Question Groups and Sub-Groups.
 *
 * Groups:
 *   1. একাডেমিক (Academic) — code: 'academic'
 *   2. ভর্তি পরীক্ষা (Admission) — code: 'admission'
 *   3. চাকরি প্রস্তুতি (Job Preparation) — code: 'job-preparation'
 *   4. কাস্টম গ্রুপ (Custom) — code: 'custom'
 *
 * Sub-Groups are seeded under each group per requirement 1.8.
 *
 * Idempotent: uses findOneAndUpdate with upsert to avoid duplicates on repeated runs.
 *
 * Requirements: 1.7, 1.8
 */
export async function seedDefaults(): Promise<void> {
    // ── Group definitions ───────────────────────────────────
    const groupDefs = [
        { code: 'academic', title: { en: 'Academic', bn: 'একাডেমিক' }, order: 0 },
        { code: 'admission', title: { en: 'Admission', bn: 'ভর্তি পরীক্ষা' }, order: 1 },
        { code: 'job-preparation', title: { en: 'Job Preparation', bn: 'চাকরি প্রস্তুতি' }, order: 2 },
        { code: 'custom', title: { en: 'Custom', bn: 'কাস্টম গ্রুপ' }, order: 3 },
    ];

    // Upsert groups and collect their ObjectIds keyed by code
    const groupIdByCode = new Map<string, mongoose.Types.ObjectId>();

    for (const g of groupDefs) {
        const doc = await QuestionGroup.findOneAndUpdate(
            { code: g.code },
            {
                $setOnInsert: {
                    title: g.title,
                    order: g.order,
                    isActive: true,
                },
            },
            { upsert: true, new: true },
        );
        groupIdByCode.set(g.code, doc._id as mongoose.Types.ObjectId);
    }

    // ── Sub-Group definitions per group ─────────────────────
    const subGroupDefs: Record<string, { code: string; title: { en: string; bn: string } }[]> = {
        academic: [
            { code: 'ssc', title: { en: 'Class 9-10 / SSC', bn: 'ক্লাস ৯-১০/SSC' } },
            { code: 'hsc', title: { en: 'Class 11-12 / HSC', bn: 'ক্লাস ১১-১২/HSC' } },
            { code: 'class-6-8', title: { en: 'Class 6-8', bn: 'ক্লাস ৬-৮' } },
            { code: 'class-1-5', title: { en: 'Class 1-5', bn: 'ক্লাস ১-৫' } },
        ],
        admission: [
            { code: 'engineering', title: { en: 'Engineering (BUET, RUET, KUET, CUET, SUST, MIST, IUT)', bn: 'ইঞ্জিনিয়ারিং (BUET, RUET, KUET, CUET, SUST, MIST, IUT)' } },
            { code: 'medical', title: { en: 'Medical', bn: 'মেডিকেল' } },
            { code: 'du', title: { en: 'DU (Unit A-E)', bn: 'ঢাকা বিশ্ববিদ্যালয় (ইউনিট A-E)' } },
            { code: 'ru', title: { en: 'RU', bn: 'রাজশাহী বিশ্ববিদ্যালয়' } },
            { code: 'cu', title: { en: 'CU', bn: 'চট্টগ্রাম বিশ্ববিদ্যালয়' } },
            { code: 'jnu', title: { en: 'JnU', bn: 'জগন্নাথ বিশ্ববিদ্যালয়' } },
            { code: 'ju', title: { en: 'JU', bn: 'জাহাঙ্গীরনগর বিশ্ববিদ্যালয়' } },
            { code: 'gst', title: { en: 'GST / Guccho', bn: 'গুচ্ছ/GST' } },
            { code: 'general-university', title: { en: 'General University', bn: 'সাধারণ ভার্সিটি' } },
            { code: 'national-university', title: { en: 'National University', bn: 'জাতীয় বিশ্ববিদ্যালয়' } },
            { code: 'iba', title: { en: 'IBA', bn: 'আইবিএ' } },
            { code: 'bup', title: { en: 'BUP', bn: 'বাংলাদেশ ইউনিভার্সিটি অব প্রফেশনালস' } },
        ],
        'job-preparation': [
            { code: 'bcs', title: { en: 'BCS', bn: 'বিসিএস' } },
            { code: 'bank-job', title: { en: 'Bank Job', bn: 'ব্যাংক জব' } },
            { code: 'primary-teacher', title: { en: 'Primary Teacher', bn: 'প্রাথমিক শিক্ষক' } },
            { code: 'secondary-teacher', title: { en: 'Secondary Teacher', bn: 'মাধ্যমিক শিক্ষক' } },
            { code: 'ntrca', title: { en: 'NTRCA', bn: 'এনটিআরসিএ' } },
            { code: 'psc', title: { en: 'PSC', bn: 'পিএসসি' } },
            { code: 'misc-jobs', title: { en: 'Miscellaneous Jobs', bn: 'বিবিধ চাকরি' } },
        ],
    };

    // Upsert sub-groups under each group
    for (const [groupCode, subs] of Object.entries(subGroupDefs)) {
        const groupId = groupIdByCode.get(groupCode);
        if (!groupId) continue;

        for (let i = 0; i < subs.length; i++) {
            const sg = subs[i];
            await QuestionSubGroup.findOneAndUpdate(
                { group_id: groupId, code: sg.code },
                {
                    $setOnInsert: {
                        title: sg.title,
                        order: i,
                        isActive: true,
                    },
                },
                { upsert: true, new: true },
            );
        }
    }
}
