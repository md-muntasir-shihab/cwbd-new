/**
 * ImportPipelineService
 *
 * Bulk question import from Excel (.xlsx), CSV, and JSON files.
 * Row-level validation: skip invalid rows, record errors, continue processing.
 * Async processing for files > 5000 rows via QuestionImportJob model.
 * Validates hierarchy references exist before insert.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import QuestionImportJob from '../models/QuestionImportJob';
import QuestionGroup from '../models/QuestionGroup';
import QuestionSubGroup from '../models/QuestionSubGroup';
import QuestionCategory from '../models/QuestionCategory';
import QuestionChapter from '../models/QuestionChapter';
import QuestionTopic from '../models/QuestionTopic';

// ─── Types ──────────────────────────────────────────────────

export interface ImportRowError {
    row: number;
    error: string;
}

export interface ImportResult {
    total: number;
    success: number;
    failed: number;
    errors: ImportRowError[];
    hierarchyCreated: number;
    jobId?: string;
}

/**
 * Raw row data parsed from Excel/CSV/JSON before validation.
 * Column mapping per Requirement 10.1:
 *   questionText, option1, option2, option3, option4,
 *   correctOption (1-4), explanation, difficulty,
 *   topic, category, group, tags, year, source
 */
export interface RawImportRow {
    questionText?: string;
    option1?: string;
    option2?: string;
    option3?: string;
    option4?: string;
    correctOption?: string | number;
    explanation?: string;
    difficulty?: string;
    topic?: string;
    category?: string;
    group?: string;
    tags?: string;
    year?: string;
    source?: string;
}

/**
 * Extended raw import row with bilingual content and auto-hierarchy fields.
 * Supports the new template columns for bilingual questions and auto-grouping.
 * 
 * Requirements: 2.1, 2.10
 */
export interface ExtendedRawImportRow extends RawImportRow {
    questionTextBn?: string;
    option1Bn?: string;
    option2Bn?: string;
    option3Bn?: string;
    option4Bn?: string;
    explanationBn?: string;
    subGroup?: string;
    chapter?: string;
    marks?: string;
    negativeMarks?: string;
    questionType?: string;
    subject?: string;
    imageUrl?: string;
}

/**
 * Hierarchy references resolved or created during import.
 * Tracks ObjectIds for each level and counts new nodes created.
 * 
 * Requirements: 2.1, 2.10
 */
export interface HierarchyRefs {
    group_id?: mongoose.Types.ObjectId;
    sub_group_id?: mongoose.Types.ObjectId;
    subject_id?: mongoose.Types.ObjectId;
    chapter_id?: mongoose.Types.ObjectId;
    topic_id?: mongoose.Types.ObjectId;
    hierarchyCreated: number;
    error?: string;
}

// ─── Constants ──────────────────────────────────────────────

const ASYNC_THRESHOLD = 5000;

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const CORRECT_OPTION_MAP: Record<string, 'A' | 'B' | 'C' | 'D'> = {
    '1': 'A',
    '2': 'B',
    '3': 'C',
    '4': 'D',
    a: 'A',
    b: 'B',
    c: 'C',
    d: 'D',
};

/** Maps lowercase header names to ExtendedRawImportRow property names. */
const HEADER_TO_FIELD: Record<string, keyof ExtendedRawImportRow> = {
    // questionText aliases
    questiontext: 'questionText',
    question: 'questionText',
    questiontexten: 'questionText',
    question_text: 'questionText',
    questiontitle: 'questionText',
    text: 'questionText',
    // questionTextBn aliases (NEW)
    questiontextbn: 'questionTextBn',
    questionbn: 'questionTextBn',
    question_text_bn: 'questionTextBn',
    // option aliases
    option1: 'option1',
    optiona: 'option1',
    option_a: 'option1',
    a: 'option1',
    option2: 'option2',
    optionb: 'option2',
    option_b: 'option2',
    b: 'option2',
    option3: 'option3',
    optionc: 'option3',
    option_c: 'option3',
    c: 'option3',
    option4: 'option4',
    optiond: 'option4',
    option_d: 'option4',
    d: 'option4',
    // option Bengali aliases (NEW)
    option1bn: 'option1Bn',
    option1_bn: 'option1Bn',
    option2bn: 'option2Bn',
    option2_bn: 'option2Bn',
    option3bn: 'option3Bn',
    option3_bn: 'option3Bn',
    option4bn: 'option4Bn',
    option4_bn: 'option4Bn',
    // correctOption aliases
    correctoption: 'correctOption',
    correct: 'correctOption',
    answer: 'correctOption',
    correctanswer: 'correctOption',
    correct_answer: 'correctOption',
    correctkey: 'correctOption',
    ans: 'correctOption',
    // explanation aliases
    explanation: 'explanation',
    explanationen: 'explanation',
    explain: 'explanation',
    solution: 'explanation',
    // explanationBn aliases (NEW)
    explanationbn: 'explanationBn',
    explanation_bn: 'explanationBn',
    explainbn: 'explanationBn',
    // difficulty aliases
    difficulty: 'difficulty',
    difficultylevel: 'difficulty',
    level: 'difficulty',
    // hierarchy aliases
    topic: 'topic',
    topicname: 'topic',
    category: 'category',
    categoryname: 'category',
    subject: 'subject',
    subjectname: 'subject',
    group: 'group',
    groupname: 'group',
    // subGroup aliases (NEW)
    subgroup: 'subGroup',
    sub_group: 'subGroup',
    subgroupname: 'subGroup',
    // chapter aliases (NEW)
    chapter: 'chapter',
    chaptername: 'chapter',
    // marks aliases (NEW)
    marks: 'marks',
    mark: 'marks',
    // negativeMarks aliases (NEW)
    negativemarks: 'negativeMarks',
    negative_marks: 'negativeMarks',
    negativemark: 'negativeMarks',
    // questionType aliases (NEW)
    questiontype: 'questionType',
    type: 'questionType',
    question_type: 'questionType',
    // imageUrl aliases (NEW)
    imageurl: 'imageUrl',
    image_url: 'imageUrl',
    image: 'imageUrl',
    questionimage: 'imageUrl',
    // metadata aliases
    tags: 'tags',
    tag: 'tags',
    year: 'year',
    session: 'year',
    yearorsession: 'year',
    source: 'source',
    sourcelabel: 'source',
    reference: 'source',
};

/** Positional column order (fallback when headers don't match). */
/** Matches the template: questionType, questionText, questionTextBn, ... */
const POSITIONAL_FIELDS: (keyof ExtendedRawImportRow)[] = [
    'questionType', 'questionText', 'questionTextBn',
    'option1', 'option1Bn', 'option2', 'option2Bn',
    'option3', 'option3Bn', 'option4', 'option4Bn',
    'correctOption', 'difficulty', 'marks', 'negativeMarks',
    'group', 'subGroup', 'subject', 'chapter', 'topic',
    'tags', 'explanation', 'explanationBn', 'imageUrl', 'year', 'source',
];

// ─── Utility Functions ──────────────────────────────────────

/**
 * Pure function: generate a URL-safe slug from a string.
 * Lowercases, trims, replaces non-alphanumeric with hyphens.
 * Requirement 2.7
 */
export function slugify(name: string): string {
    if (!name) return 'unnamed';
    const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return slug || 'unnamed';
}

// ─── Row Validation ─────────────────────────────────────────

/**
 * Pure function: validate a single import row.
 * Returns null if valid, or an error message string if invalid.
 *
 * Exported for unit/property testing.
 */
export function validateImportRow(row: RawImportRow): string | null {
    // questionText is required for all question types
    if (!row.questionText || String(row.questionText).trim().length === 0) {
        return 'questionText is required';
    }

    // Determine question type from extended row
    const extRow = row as ExtendedRawImportRow;
    const qType = extRow.questionType
        ? String(extRow.questionType).trim().toLowerCase()
        : 'mcq';

    // MCQ-specific validation: options and correctOption are required
    const isMCQ = qType === 'mcq' || qType === 'image_mcq' || qType === 'true_false';
    if (isMCQ) {
        if (!row.option1 || String(row.option1).trim().length === 0) {
            return 'option1 is required for MCQ questions';
        }
        if (!row.option2 || String(row.option2).trim().length === 0) {
            return 'option2 is required for MCQ questions';
        }

        // correctOption must be 1-4 (or a-d)
        const correctStr = String(row.correctOption ?? '').trim().toLowerCase();
        if (!correctStr || !CORRECT_OPTION_MAP[correctStr]) {
            return 'correctOption must be 1, 2, 3, or 4';
        }

        // Validate correctOption doesn't reference an empty option
        const optionIndex =
            parseInt(correctStr, 10) ||
            (['a', 'b', 'c', 'd'].indexOf(correctStr) + 1);
        const optionFields = [row.option1, row.option2, row.option3, row.option4];
        if (optionIndex >= 1 && optionIndex <= 4) {
            const referencedOption = optionFields[optionIndex - 1];
            if (!referencedOption || String(referencedOption).trim().length === 0) {
                return `correctOption references option${optionIndex} which is empty`;
            }
        }
    }
    // For written / fill_blank: no options or correctOption needed

    // Validate difficulty if provided
    if (row.difficulty) {
        const diff = String(row.difficulty).trim().toLowerCase();
        if (diff && !VALID_DIFFICULTIES.includes(diff as typeof VALID_DIFFICULTIES[number])) {
            return `difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`;
        }
    }

    return null;
}

// ─── Hierarchy Reference Validation ─────────────────────────

/**
 * Resolve or create hierarchy nodes for a single import row.
 * Uses findOneAndUpdate with upsert:true for idempotency.
 * Updates hierarchy references and count.
 */
export async function resolveOrCreateHierarchy(row: ExtendedRawImportRow): Promise<HierarchyRefs> {
    const refs: HierarchyRefs = { hierarchyCreated: 0 };
    
    // Group level
    if (!row.group || !row.group.trim()) {
        return refs; // Skip if no group
    }

    try {
        const groupName = row.group.trim();
        const groupSlug = slugify(groupName);

        const groupDoc = await QuestionGroup.findOneAndUpdate(
            { 'title.en': { $regex: new RegExp(`^${escapeRegex(groupName)}$`, 'i') } },
            {
                $setOnInsert: {
                    'title.en': groupName,
                    code: groupSlug,
                    isActive: true,
                }
            },
            { upsert: true, new: true, includeResultMetadata: true }
        ) as any;

        if (groupDoc.lastErrorObject && !groupDoc.lastErrorObject.updatedExisting) {
            refs.hierarchyCreated++;
        }
        
        let groupId;
        if (groupDoc.value) {
            groupId = groupDoc.value._id as mongoose.Types.ObjectId;
        } else if (groupDoc._id) {
            groupId = groupDoc._id as mongoose.Types.ObjectId;
        }
        
        if (!groupId) {
             refs.error = `Failed to obtain Group ID for: ${groupName}`;
             return refs;
        }

        refs.group_id = groupId;

        // SubGroup level
        if (row.subGroup && row.subGroup.trim()) {
            const subGroupName = row.subGroup.trim();
            const subGroupSlug = slugify(subGroupName);

            const subGroupDoc = await QuestionSubGroup.findOneAndUpdate(
                { 
                    group_id: refs.group_id,
                    'title.en': { $regex: new RegExp(`^${escapeRegex(subGroupName)}$`, 'i') } 
                },
                {
                    $setOnInsert: {
                        group_id: refs.group_id,
                        'title.en': subGroupName,
                        code: subGroupSlug,
                        isActive: true,
                    }
                },
                { upsert: true, new: true, includeResultMetadata: true }
            ) as any;

            if (subGroupDoc.lastErrorObject && !subGroupDoc.lastErrorObject.updatedExisting) {
                refs.hierarchyCreated++;
            }
            
            let subGroupId;
            if (subGroupDoc.value) {
                subGroupId = subGroupDoc.value._id as mongoose.Types.ObjectId;
            } else if (subGroupDoc._id) {
                subGroupId = subGroupDoc._id as mongoose.Types.ObjectId;
            }

            if (!subGroupId) {
                 refs.error = `Failed to obtain SubGroup ID for: ${subGroupName}`;
                 return refs;
            }

            refs.sub_group_id = subGroupId;

            // Category (Subject) level — prefer row.subject (new template), fall back to row.category (legacy)
            const subjectNameToUse = row.subject || row.category;
            if (subjectNameToUse && String(subjectNameToUse).trim()) {
                const subjectName = String(subjectNameToUse).trim();
                const subjectSlug = slugify(subjectName);

                const subjectDoc = await QuestionCategory.findOneAndUpdate(
                    { 
                        group_id: refs.group_id,
                        sub_group_id: refs.sub_group_id,
                        'title.en': { $regex: new RegExp(`^${escapeRegex(subjectName)}$`, 'i') } 
                    },
                    {
                        $setOnInsert: {
                            group_id: refs.group_id,
                            sub_group_id: refs.sub_group_id,
                            'title.en': subjectName,
                            code: subjectSlug,
                            isActive: true,
                        }
                    },
                    { upsert: true, new: true, includeResultMetadata: true }
                ) as any;

                if (subjectDoc.lastErrorObject && !subjectDoc.lastErrorObject.updatedExisting) {
                    refs.hierarchyCreated++;
                }

                let subjectId;
                if (subjectDoc.value) {
                    subjectId = subjectDoc.value._id as mongoose.Types.ObjectId;
                } else if (subjectDoc._id) {
                    subjectId = subjectDoc._id as mongoose.Types.ObjectId;
                }

                if (!subjectId) {
                     refs.error = `Failed to obtain Subject ID for: ${subjectName}`;
                     return refs;
                }

                refs.subject_id = subjectId;

                // Chapter level
                if (row.chapter && row.chapter.trim()) {
                    const chapterName = row.chapter.trim();
                    const chapterSlug = slugify(chapterName);

                    const chapterDoc = await QuestionChapter.findOneAndUpdate(
                        { 
                            subject_id: refs.subject_id,
                            group_id: refs.group_id,
                            'title.en': { $regex: new RegExp(`^${escapeRegex(chapterName)}$`, 'i') } 
                        },
                        {
                            $setOnInsert: {
                                subject_id: refs.subject_id,
                                group_id: refs.group_id,
                                'title.en': chapterName,
                                code: chapterSlug,
                                isActive: true,
                            }
                        },
                        { upsert: true, new: true, includeResultMetadata: true }
                    ) as any;

                    if (chapterDoc.lastErrorObject && !chapterDoc.lastErrorObject.updatedExisting) {
                        refs.hierarchyCreated++;
                    }

                    let chapterId;
                    if (chapterDoc.value) {
                        chapterId = chapterDoc.value._id as mongoose.Types.ObjectId;
                    } else if (chapterDoc._id) {
                        chapterId = chapterDoc._id as mongoose.Types.ObjectId;
                    }

                    if (!chapterId) {
                         refs.error = `Failed to obtain Chapter ID for: ${chapterName}`;
                         return refs;
                    }
                    
                    refs.chapter_id = chapterId;

                    // Topic level
                    if (row.topic && row.topic.trim()) {
                        const topicName = row.topic.trim();
                        const topicSlug = slugify(topicName);

                        const topicDoc = await QuestionTopic.findOneAndUpdate(
                            { 
                                category_id: refs.subject_id,
                                group_id: refs.group_id,
                                chapter_id: refs.chapter_id,
                                'title.en': { $regex: new RegExp(`^${escapeRegex(topicName)}$`, 'i') } 
                            },
                            {
                                $setOnInsert: {
                                    category_id: refs.subject_id,
                                    group_id: refs.group_id,
                                    chapter_id: refs.chapter_id,
                                    'title.en': topicName,
                                    code: topicSlug,
                                    isActive: true,
                                }
                            },
                            { upsert: true, new: true, includeResultMetadata: true }
                        ) as any;

                        if (topicDoc.lastErrorObject && !topicDoc.lastErrorObject.updatedExisting) {
                            refs.hierarchyCreated++;
                        }

                        let topicId;
                        if (topicDoc.value) {
                            topicId = topicDoc.value._id as mongoose.Types.ObjectId;
                        } else if (topicDoc._id) {
                            topicId = topicDoc._id as mongoose.Types.ObjectId;
                        }

                        if (!topicId) {
                             refs.error = `Failed to obtain Topic ID for: ${topicName}`;
                             return refs;
                        }
                        
                        refs.topic_id = topicId;
                    }
                }
            }
        }
    } catch (err: unknown) {
        refs.error = err instanceof Error ? err.message : 'Error resolving/creating hierarchy';
    }

    return refs;
}

/** Escape special regex characters to prevent regex injection. */
/** Escape special regex characters to prevent regex injection. */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Validate that referenced topic, category, and group values exist in the database.
 * Uses name-based lookup (case-insensitive) since import files use human-readable names.
 *
 * Requirement 10.7
 */
async function resolveHierarchyRefs(row: RawImportRow): Promise<{
    group_id?: mongoose.Types.ObjectId;
    subject_id?: mongoose.Types.ObjectId;
    topic_id?: mongoose.Types.ObjectId;
    error?: string;
}> {
    const result: {
        group_id?: mongoose.Types.ObjectId;
        subject_id?: mongoose.Types.ObjectId;
        topic_id?: mongoose.Types.ObjectId;
        error?: string;
    } = {};

    // Resolve group by name (title.en or title.bn) or code
    if (row.group && String(row.group).trim()) {
        const groupName = String(row.group).trim();
        const group = await QuestionGroup.findOne({
            $or: [
                { code: groupName.toLowerCase() },
                { 'title.en': { $regex: new RegExp(`^${escapeRegex(groupName)}$`, 'i') } },
                { 'title.bn': groupName },
            ],
            isActive: true,
        });
        if (!group) {
            result.error = `Group "${groupName}" not found`;
            return result;
        }
        result.group_id = group._id as mongoose.Types.ObjectId;
    }

    // Resolve category (subject) by name
    if (row.category && String(row.category).trim()) {
        const categoryName = String(row.category).trim();
        const query: Record<string, unknown> = {
            $or: [
                { code: categoryName.toLowerCase() },
                { 'title.en': { $regex: new RegExp(`^${escapeRegex(categoryName)}$`, 'i') } },
                { 'title.bn': categoryName },
            ],
            isActive: true,
        };
        if (result.group_id) {
            query.group_id = result.group_id;
        }
        const category = await QuestionCategory.findOne(query);
        if (!category) {
            result.error = `Category "${categoryName}" not found`;
            return result;
        }
        result.subject_id = category._id as mongoose.Types.ObjectId;
    }

    // Resolve topic by name
    if (row.topic && String(row.topic).trim()) {
        const topicName = String(row.topic).trim();
        const query: Record<string, unknown> = {
            $or: [
                { code: topicName.toLowerCase() },
                { 'title.en': { $regex: new RegExp(`^${escapeRegex(topicName)}$`, 'i') } },
                { 'title.bn': topicName },
            ],
            isActive: true,
        };
        if (result.subject_id) {
            query.category_id = result.subject_id;
        }
        const topic = await QuestionTopic.findOne(query);
        if (!topic) {
            result.error = `Topic "${topicName}" not found`;
            return result;
        }
        result.topic_id = topic._id as mongoose.Types.ObjectId;
    }

    return result;
}

// ─── Row to Document Conversion ─────────────────────────────

function buildQuestionDoc(
    row: ExtendedRawImportRow,
    adminId: string,
    refs: HierarchyRefs
) {
    const correctStr = String(row.correctOption ?? '').trim().toLowerCase();
    const correctKey = CORRECT_OPTION_MAP[correctStr] || 'A';

    const options: { key: 'A' | 'B' | 'C' | 'D'; text_en: string; text_bn?: string; isCorrect: boolean }[] = [
        { key: 'A', text_en: String(row.option1 || '').trim(), text_bn: row.option1Bn ? String(row.option1Bn).trim() : undefined, isCorrect: correctKey === 'A' },
        { key: 'B', text_en: String(row.option2 || '').trim(), text_bn: row.option2Bn ? String(row.option2Bn).trim() : undefined, isCorrect: correctKey === 'B' },
    ];

    if (row.option3 && String(row.option3).trim()) {
        options.push({ key: 'C', text_en: String(row.option3).trim(), text_bn: row.option3Bn ? String(row.option3Bn).trim() : undefined, isCorrect: correctKey === 'C' });
    }
    if (row.option4 && String(row.option4).trim()) {
        options.push({ key: 'D', text_en: String(row.option4).trim(), text_bn: row.option4Bn ? String(row.option4Bn).trim() : undefined, isCorrect: correctKey === 'D' });
    }

    const difficulty = row.difficulty
        ? (String(row.difficulty).trim().toLowerCase() as 'easy' | 'medium' | 'hard')
        : 'medium';

    const questionType = row.questionType 
        ? String(row.questionType).trim().toLowerCase()
        : 'mcq';

    const tags = row.tags
        ? String(row.tags).split(',').map((t) => t.trim()).filter(Boolean)
        : [];

    // Collect images from imageUrl field
    const images: string[] = [];
    if (row.imageUrl && String(row.imageUrl).trim()) {
        images.push(String(row.imageUrl).trim());
    }

    // Use subject field (from template) or fall back to category (legacy)
    const subjectName = row.subject
        ? String(row.subject).trim()
        : row.category
            ? String(row.category).trim()
            : 'Imported';

    return {
        question_en: String(row.questionText || '').trim(),
        question_bn: row.questionTextBn ? String(row.questionTextBn).trim() : undefined,
        question_type: questionType,
        explanation_en: row.explanation ? String(row.explanation).trim() : undefined,
        explanation_bn: row.explanationBn ? String(row.explanationBn).trim() : undefined,
        marks: row.marks ? Number(row.marks) : 1,
        negativeMarks: row.negativeMarks ? Number(row.negativeMarks) : 0,
        options,
        correctKey,
        difficulty,
        tags,
        images,
        yearOrSession: row.year ? String(row.year).trim() : undefined,
        sourceLabel: row.source ? String(row.source).trim() : undefined,
        subject: subjectName,
        moduleCategory: row.subGroup ? String(row.subGroup).trim() : 'Imported',
        chapter: row.chapter ? String(row.chapter).trim() : undefined,
        topic: row.topic ? String(row.topic).trim() : undefined,
        group_id: refs.group_id,
        sub_group_id: refs.sub_group_id,
        subject_id: refs.subject_id,
        chapter_id: refs.chapter_id,
        topic_id: refs.topic_id,
        created_by: adminId,
        updatedByAdminId: adminId,
        isActive: true,
        isArchived: false,
        status: 'draft',
        review_status: 'pending',
    };
}

// ─── Core Processing ────────────────────────────────────────

/**
 * Process an array of parsed rows: validate each, resolve hierarchy refs, insert valid ones.
 * Returns ImportResult with row-level error details.
 *
 * Requirements 10.4, 10.5, 10.7
 */
async function processRows(rows: ExtendedRawImportRow[], adminId: string): Promise<ImportResult> {
    const importResult: ImportResult = {
        total: rows.length,
        success: 0,
        failed: 0,
        errors: [],
        hierarchyCreated: 0,
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1; // 1-indexed for user-facing errors

        // Step 1: Validate row structure
        const validationError = validateImportRow(row);
        if (validationError) {
            importResult.failed++;
            importResult.errors.push({ row: rowNumber, error: validationError });
            continue;
        }

        // Step 2: Resolve or create hierarchy references
        const refs = await resolveOrCreateHierarchy(row);
        if (refs.hierarchyCreated) {
            importResult.hierarchyCreated += refs.hierarchyCreated;
        }

        if (refs.error) {
            importResult.failed++;
            importResult.errors.push({ row: rowNumber, error: refs.error });
            continue;
        }

        // Step 3: Build and insert document
        try {
            const doc = buildQuestionDoc(row, adminId, refs);
            await QuestionBankQuestion.create(doc);
            importResult.success++;
        } catch (err: unknown) {
            importResult.failed++;
            const message = err instanceof Error ? err.message : 'Unknown insertion error';
            importResult.errors.push({ row: rowNumber, error: message });
        }
    }

    return importResult;
}

// ─── Header Matching ────────────────────────────────────────

/**
 * Match a raw header string to an ExtendedRawImportRow field name.
 * Tries custom mapping first, then exact lowercase match.
 */
function matchHeader(header: string, customMapping?: Record<string, string>): keyof ExtendedRawImportRow | undefined {
    // Check custom mapping first (user-provided header-to-field mappings)
    if (customMapping) {
        const customField = customMapping[header] || customMapping[header.trim()];
        if (customField) {
            const normalizedCustom = customField.trim().toLowerCase().replace(/[\s_-]+/g, '');
            if (HEADER_TO_FIELD[normalizedCustom]) return HEADER_TO_FIELD[normalizedCustom];
            // Also check if the custom field IS a valid field name directly
            const directMatch = Object.values(HEADER_TO_FIELD).find((f) => f === customField);
            if (directMatch) return directMatch;
        }
    }
    const lower = header.trim().toLowerCase().replace(/[\s_-]+/g, '');
    return HEADER_TO_FIELD[lower];
}

// ─── Excel Import ───────────────────────────────────────────

/**
 * Parse rows from an Excel (.xlsx) buffer.
 * First row is treated as header. Columns mapped by header name or position.
 *
 * Requirement 10.1
 */
async function parseExcelRows(file: Buffer, customMapping?: Record<string, string>): Promise<ExtendedRawImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as unknown as Buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const rows: ExtendedRawImportRow[] = [];
    let columnMap: (keyof ExtendedRawImportRow | undefined)[] = [];

    worksheet.eachRow((row, rowNumber) => {
        const values = row.values
            ? (row.values as (string | number | undefined | null)[]).slice(1)
            : [];

        if (rowNumber === 1) {
            // Build column mapping from header row
            columnMap = values.map((v) => {
                if (v == null) return undefined;
                return matchHeader(String(v), customMapping);
            });

            // If no headers matched, use positional mapping
            const matchedCount = columnMap.filter(Boolean).length;
            if (matchedCount === 0) {
                columnMap = POSITIONAL_FIELDS.slice(0, values.length) as (keyof ExtendedRawImportRow | undefined)[];
            }
            return;
        }

        const rawRow: Partial<ExtendedRawImportRow> = {};
        for (let col = 0; col < values.length && col < columnMap.length; col++) {
            const field = columnMap[col];
            if (field && values[col] != null) {
                (rawRow as Record<string, unknown>)[field] = String(values[col]);
            }
        }

        // Only add rows that have at least some data
        if (Object.keys(rawRow).length > 0) {
            rows.push(rawRow as ExtendedRawImportRow);
        }
    });

    return rows;
}

/**
 * Import questions from an Excel (.xlsx) file.
 * For files > 5000 rows, creates a QuestionImportJob for async processing.
 *
 * Requirements 10.1, 10.6
 */
export async function importExcel(file: Buffer, adminId: string, customMapping?: Record<string, string>): Promise<ImportResult> {
    const rows = await parseExcelRows(file, customMapping);

    if (rows.length > ASYNC_THRESHOLD) {
        return createAsyncJob(rows, adminId, 'excel');
    }

    return processRows(rows, adminId);
}

// ─── CSV Import ─────────────────────────────────────────────

/**
 * Parse rows from a CSV buffer.
 * Uses the same column mapping as Excel imports.
 *
 * Requirement 10.2
 */
async function parseCSVRows(file: Buffer, customMapping?: Record<string, string>): Promise<ExtendedRawImportRow[]> {
    const rows: ExtendedRawImportRow[] = [];

    return new Promise((resolve, reject) => {
        const stream = Readable.from(file);
        stream
            .pipe(
                csvParser({
                    mapHeaders: ({ header }: { header: string }) => {
                        const field = matchHeader(header, customMapping);
                        return field || header.trim().toLowerCase();
                    },
                }),
            )
            .on('data', (data: Record<string, string>) => {
                const rawRow: Partial<ExtendedRawImportRow> = {};
                for (const [key, value] of Object.entries(data)) {
                    const field = HEADER_TO_FIELD[key] || matchHeader(key, customMapping);
                    if (field && value != null && String(value).trim()) {
                        (rawRow as Record<string, unknown>)[field] = value;
                    }
                }
                if (Object.keys(rawRow).length > 0) {
                    rows.push(rawRow as ExtendedRawImportRow);
                }
            })
            .on('end', () => resolve(rows))
            .on('error', (err: Error) => reject(err));
    });
}

/**
 * Import questions from a CSV file.
 * Same column mapping as Excel imports.
 * For files > 5000 rows, creates a QuestionImportJob for async processing.
 *
 * Requirements 10.2, 10.6
 */
export async function importCSV(file: Buffer, adminId: string, customMapping?: Record<string, string>): Promise<ImportResult> {
    const rows = await parseCSVRows(file, customMapping);

    if (rows.length > ASYNC_THRESHOLD) {
        return createAsyncJob(rows, adminId, 'csv');
    }

    return processRows(rows, adminId);
}

// ─── JSON Import ────────────────────────────────────────────

/**
 * Parse and validate rows from a JSON buffer.
 * Expects an array of objects matching the ExtendedRawImportRow schema.
 *
 * Requirement 10.3
 */
function parseJSONRows(file: Buffer): ExtendedRawImportRow[] {
    const text = file.toString('utf-8');
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
        throw new Error('JSON import file must contain an array of question objects');
    }

    return parsed.map((item: Record<string, unknown>) => ({
        questionType: item.questionType != null ? String(item.questionType) : undefined,
        questionText: item.questionText != null ? String(item.questionText) : undefined,
        questionTextBn: item.questionTextBn != null ? String(item.questionTextBn) : undefined,
        option1: item.option1 != null ? String(item.option1) : undefined,
        option1Bn: item.option1Bn != null ? String(item.option1Bn) : undefined,
        option2: item.option2 != null ? String(item.option2) : undefined,
        option2Bn: item.option2Bn != null ? String(item.option2Bn) : undefined,
        option3: item.option3 != null ? String(item.option3) : undefined,
        option3Bn: item.option3Bn != null ? String(item.option3Bn) : undefined,
        option4: item.option4 != null ? String(item.option4) : undefined,
        option4Bn: item.option4Bn != null ? String(item.option4Bn) : undefined,
        correctOption: item.correctOption != null ? String(item.correctOption) : undefined,
        explanation: item.explanation != null ? String(item.explanation) : undefined,
        explanationBn: item.explanationBn != null ? String(item.explanationBn) : undefined,
        difficulty: item.difficulty != null ? String(item.difficulty) : undefined,
        topic: item.topic != null ? String(item.topic) : undefined,
        category: item.category != null ? String(item.category) : undefined,
        subject: item.subject != null ? String(item.subject) : undefined,
        group: item.group != null ? String(item.group) : undefined,
        subGroup: item.subGroup != null ? String(item.subGroup) : undefined,
        chapter: item.chapter != null ? String(item.chapter) : undefined,
        marks: item.marks != null ? String(item.marks) : undefined,
        negativeMarks: item.negativeMarks != null ? String(item.negativeMarks) : undefined,
        tags: item.tags != null ? String(item.tags) : undefined,
        imageUrl: item.imageUrl != null ? String(item.imageUrl) : undefined,
        year: item.year != null ? String(item.year) : undefined,
        source: item.source != null ? String(item.source) : undefined,
    }));
}

/**
 * Import questions from a JSON file.
 * Validates each object against the expected schema.
 * For files > 5000 rows, creates a QuestionImportJob for async processing.
 *
 * Requirements 10.3, 10.6
 */
export async function importJSON(file: Buffer, adminId: string, _customMapping?: Record<string, string>): Promise<ImportResult> {
    let rows: RawImportRow[];
    try {
        rows = parseJSONRows(file);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Invalid JSON format';
        return { total: 0, success: 0, failed: 0, errors: [{ row: 0, error: message }], hierarchyCreated: 0 };
    }

    if (rows.length > ASYNC_THRESHOLD) {
        return createAsyncJob(rows, adminId, 'json');
    }

    return processRows(rows, adminId);
}

// ─── Async Job Processing ───────────────────────────────────

/**
 * Create a QuestionImportJob for async processing of large files (> 5000 rows).
 * Stores the rows in the job options and returns immediately with the job ID.
 *
 * Requirement 10.6
 */
async function createAsyncJob(
    rows: ExtendedRawImportRow[],
    adminId: string,
    format: string,
): Promise<ImportResult> {
    const job = await QuestionImportJob.create({
        status: 'pending',
        sourceFileName: `import.${format}`,
        createdBy: new mongoose.Types.ObjectId(adminId),
        totalRows: rows.length,
        options: { rows, adminId, format },
    });

    return {
        total: rows.length,
        success: 0,
        failed: 0,
        errors: [],
        hierarchyCreated: 0,
        jobId: (job._id as mongoose.Types.ObjectId).toString(),
    };
}

/**
 * Process an async import job. Called by a background worker/cron.
 * Updates the QuestionImportJob document with progress and results.
 *
 * Requirement 10.6
 */
export async function processAsyncImport(jobId: string): Promise<void> {
    const job = await QuestionImportJob.findById(jobId);
    if (!job) throw new Error(`Import job "${jobId}" not found`);
    if (job.status !== 'pending') throw new Error(`Import job "${jobId}" is not in pending status`);

    const opts = job.options as { rows: ExtendedRawImportRow[]; adminId: string } | undefined;
    if (!opts?.rows || !opts?.adminId) {
        job.status = 'failed';
        job.rowErrors = [{ rowNumber: 0, reason: 'Missing job options (rows or adminId)' }];
        job.finishedAt = new Date();
        await job.save();
        return;
    }

    job.status = 'processing';
    job.startedAt = new Date();
    await job.save();

    try {
        const importResult = await processRows(opts.rows, opts.adminId);

        job.status = 'completed';
        job.importedRows = importResult.success;
        job.failedRows = importResult.failed;
        job.totalRows = importResult.total;
        job.rowErrors = importResult.errors.map((e) => ({
            rowNumber: e.row,
            reason: e.error,
        }));
        job.finishedAt = new Date();
        await job.save();
    } catch (err: unknown) {
        job.status = 'failed';
        job.rowErrors = [{
            rowNumber: 0,
            reason: err instanceof Error ? err.message : 'Unknown processing error',
        }];
        job.finishedAt = new Date();
        await job.save();
    }
}
