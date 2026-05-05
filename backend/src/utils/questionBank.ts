import mongoose from 'mongoose';
import type { IBankQuestionOption } from '../models/QuestionBankQuestion';

const BANGLA_STOPWORDS = new Set([
    'এবং',
    'কোন',
    'কোনটি',
    'যে',
    'এই',
    'সেই',
    'কি',
    'কী',
    'একটি',
    'হলো',
    'হয়',
    'নিম্নের',
    'নিম্নোক্ত',
    'উত্তর',
    'সঠিক',
    'ভুল',
]);

const EN_STOPWORDS = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'of',
    'to',
    'for',
    'and',
    'or',
    'in',
    'on',
    'with',
    'which',
    'what',
    'true',
    'false',
]);

const VALID_CORRECT_KEYS = new Set(['A', 'B', 'C', 'D', 'TRUE', 'FALSE']);

export type QBankQuestionType = 'MCQ' | 'MULTI' | 'WRITTEN' | 'TF';
export type LegacyQuestionType = 'mcq' | 'written';

export interface NormalizedQuestionOption {
    key: string;
    text: string;
    media_id?: mongoose.Types.ObjectId | null;
}

export interface LocalizedTextValue {
    en: string;
    bn: string;
}

export interface LocalizedOptionValue {
    key: string;
    text: LocalizedTextValue;
    media_id?: mongoose.Types.ObjectId | null;
}

export interface NormalizedQuestionPayload {
    class_level: string;
    department: string;
    subject: string;
    chapter: string;
    topic: string;
    question: string;
    question_text: string;
    questionText: LocalizedTextValue;
    question_html: string;
    question_type: QBankQuestionType;
    questionType: LegacyQuestionType;
    options: NormalizedQuestionOption[];
    optionsLocalized: LocalizedOptionValue[];
    correct_answer: string[];
    correctAnswer?: 'A' | 'B' | 'C' | 'D';
    explanation: string;
    explanation_text: string;
    explanationText: LocalizedTextValue;
    languageMode: 'EN' | 'BN' | 'BOTH';
    difficulty: 'easy' | 'medium' | 'hard';
    tags: string[];
    estimated_time: number;
    skill_tags: string[];
    has_explanation: boolean;
    optionA: string;
    optionB: string;
    optionC: string;
    optionD: string;
    marks: number;
    negative_marks: number;
    negativeMarks: number;
    image_media_id?: mongoose.Types.ObjectId | null;
    media_alt_text_bn: string;
    media_status?: 'pending' | 'approved' | 'rejected';
    status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived';
    manual_flags: string[];
    questionImage?: string;
}

export interface SimilarityMatch {
    questionId: string;
    questionText: string;
    score: number;
    tokenOverlap: number;
    levenshteinRatio: number;
    optionSimilarity: number;
}

export interface QualityResult {
    score: number;
    flags: string[];
}

function clamp(num: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, num));
}

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((entry) => String(entry || '').trim())
            .filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return [];
}

function asLocalizedText(value: unknown): LocalizedTextValue {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const row = value as Record<string, unknown>;
        return {
            en: String(row.en || '').trim(),
            bn: String(row.bn || '').trim(),
        };
    }

    const text = String(value || '').trim();
    return { en: text, bn: '' };
}

function normalizeLocalizedOptionText(value: unknown): LocalizedTextValue {
    return asLocalizedText(value);
}

function normalizeLanguageMode(
    payload: Record<string, unknown>,
    localized: {
        questionText: LocalizedTextValue;
        explanationText: LocalizedTextValue;
        optionsLocalized: LocalizedOptionValue[];
    },
): 'EN' | 'BN' | 'BOTH' {
    const explicit = String(payload.languageMode || payload.language_mode || '').trim().toUpperCase();
    if (explicit === 'EN' || explicit === 'BN' || explicit === 'BOTH') {
        return explicit;
    }

    const hasBn =
        Boolean(localized.questionText.bn) ||
        Boolean(localized.explanationText.bn) ||
        localized.optionsLocalized.some((item) => Boolean(item.text.bn));
    const hasEn =
        Boolean(localized.questionText.en) ||
        Boolean(localized.explanationText.en) ||
        localized.optionsLocalized.some((item) => Boolean(item.text.en));

    if (hasBn && hasEn) return 'BOTH';
    if (hasBn) return 'BN';
    return 'EN';
}

function normalizeOptionsLocalized(payload: Record<string, unknown>): LocalizedOptionValue[] {
    const keyOrder = new Map([
        ['A', 0],
        ['B', 1],
        ['C', 2],
        ['D', 3],
    ]);

    if (Array.isArray(payload.optionsLocalized)) {
        const rows = payload.optionsLocalized
            .map((entry, index) => {
                const row = entry as Record<string, unknown>;
                const key = String(row.key || String.fromCharCode(65 + index))
                    .trim()
                    .toUpperCase();
                const text = normalizeLocalizedOptionText(row.text ?? row.value ?? row.option ?? '');
                if (!text.en && !text.bn && row.text && typeof row.text === 'string') {
                    text.en = String(row.text).trim();
                }
                return {
                    key,
                    text,
                    media_id:
                        row.media_id && mongoose.Types.ObjectId.isValid(String(row.media_id))
                            ? new mongoose.Types.ObjectId(String(row.media_id))
                            : null,
                };
            })
            .filter((entry) => entry.key && (entry.text.en || entry.text.bn))
            .sort((a, b) => (keyOrder.get(a.key) ?? 999) - (keyOrder.get(b.key) ?? 999));
        if (rows.length > 0) return rows;
    }

    if (Array.isArray(payload.options)) {
        const rows = payload.options
            .map((entry, index) => {
                const row = entry as Record<string, unknown>;
                const key = String(row.key || String.fromCharCode(65 + index))
                    .trim()
                    .toUpperCase();
                const text = normalizeLocalizedOptionText(row.text);
                const banglaFallback = String(row.text_bn || row.textBn || '').trim();
                if (banglaFallback && !text.bn) {
                    text.bn = banglaFallback;
                }
                return {
                    key,
                    text,
                    media_id:
                        row.media_id && mongoose.Types.ObjectId.isValid(String(row.media_id))
                            ? new mongoose.Types.ObjectId(String(row.media_id))
                            : null,
                };
            })
            .filter((entry) => entry.key && (entry.text.en || entry.text.bn))
            .sort((a, b) => (keyOrder.get(a.key) ?? 999) - (keyOrder.get(b.key) ?? 999));
        if (rows.length > 0) return rows;
    }

    const legacy = ['A', 'B', 'C', 'D']
        .map((key) => {
            const en = String(
                payload[`option${key}`] ||
                payload[`option_${key.toLowerCase()}`] ||
                '',
            ).trim();
            const bn = String(
                payload[`option${key}_bn`] ||
                payload[`option_${key.toLowerCase()}_bn`] ||
                '',
            ).trim();
            return {
                key,
                text: { en, bn },
                media_id: null,
            } as LocalizedOptionValue;
        })
        .filter((entry) => entry.text.en || entry.text.bn);

    return legacy;
}

export function sanitizeRichHtml(raw: unknown): string {
    const html = String(raw || '');
    if (!html) return '';

    return html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/\son\w+='[^']*'/gi, '')
        .replace(/\s(href|src)\s*=\s*(['"])javascript:[^'"]*\2/gi, ' $1="#"')
        .trim();
}

export function normalizeForSimilarity(raw: unknown): string {
    const input = String(raw || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!input) return '';

    return input
        .split(' ')
        .filter((token) => token && !BANGLA_STOPWORDS.has(token) && !EN_STOPWORDS.has(token))
        .join(' ');
}

export function tokenize(raw: unknown): Set<string> {
    const normalized = normalizeForSimilarity(raw);
    if (!normalized) return new Set();
    return new Set(normalized.split(' ').filter(Boolean));
}

function tokenOverlap(a: string, b: string): number {
    const setA = tokenize(a);
    const setB = tokenize(b);
    if (setA.size === 0 || setB.size === 0) return 0;
    const intersection = [...setA].filter((item) => setB.has(item)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

function levenshteinDistance(a: string, b: string): number {
    const left = normalizeForSimilarity(a);
    const right = normalizeForSimilarity(b);
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    const matrix: number[][] = Array.from({ length: left.length + 1 }, () => []);
    for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= left.length; i += 1) {
        for (let j = 1; j <= right.length; j += 1) {
            const cost = left[i - 1] === right[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }
    return matrix[left.length][right.length];
}

function levenshteinRatio(a: string, b: string): number {
    const left = normalizeForSimilarity(a);
    const right = normalizeForSimilarity(b);
    const maxLen = Math.max(left.length, right.length);
    if (maxLen === 0) return 1;
    const dist = levenshteinDistance(left, right);
    return clamp(1 - dist / maxLen, 0, 1);
}

function normalizeQuestionType(payload: Record<string, unknown>): QBankQuestionType {
    const explicit = String(payload.question_type || '').trim().toUpperCase();
    if (explicit === 'MCQ' || explicit === 'MULTI' || explicit === 'WRITTEN' || explicit === 'TF') {
        return explicit;
    }
    const legacy = String(payload.questionType || '').trim().toLowerCase();
    if (legacy === 'written') return 'WRITTEN';
    return 'MCQ';
}

function normalizeLegacyType(questionType: QBankQuestionType): LegacyQuestionType {
    return questionType === 'WRITTEN' ? 'written' : 'mcq';
}

function normalizeDifficulty(payload: Record<string, unknown>): 'easy' | 'medium' | 'hard' {
    const raw = String(payload.difficulty || '')
        .trim()
        .toLowerCase();
    if (raw === 'easy' || raw === 'hard') return raw;
    return 'medium';
}

function normalizeOptions(payload: Record<string, unknown>): NormalizedQuestionOption[] {
    if (Array.isArray(payload.options)) {
        const fromArray = payload.options
            .map((entry, index) => {
                const row = entry as Record<string, unknown>;
                const key = String(row.key || String.fromCharCode(65 + index))
                    .trim()
                    .toUpperCase();
                return {
                    key,
                    text: String(row.text || '').trim(),
                    media_id:
                        row.media_id && mongoose.Types.ObjectId.isValid(String(row.media_id))
                            ? new mongoose.Types.ObjectId(String(row.media_id))
                            : null,
                };
            })
            .filter((entry) => entry.text);
        if (fromArray.length > 0) return fromArray;
    }

    const legacy = [
        { key: 'A', text: String(payload.optionA || payload.option_a || '').trim() },
        { key: 'B', text: String(payload.optionB || payload.option_b || '').trim() },
        { key: 'C', text: String(payload.optionC || payload.option_c || '').trim() },
        { key: 'D', text: String(payload.optionD || payload.option_d || '').trim() },
    ].filter((entry) => entry.text);
    return legacy;
}

function normalizeCorrectAnswers(payload: Record<string, unknown>): string[] {
    const explicit = Array.isArray(payload.correct_answer)
        ? payload.correct_answer
        : toStringArray(payload.correct_answer);
    if (explicit.length > 0) {
        return explicit
            .map((answer) => String(answer || '').trim().toUpperCase())
            .filter((answer) => VALID_CORRECT_KEYS.has(answer));
    }

    const legacy = String(payload.correctAnswer || payload.correct_option || '')
        .split(',')
        .map((answer) => answer.trim().toUpperCase())
        .filter(Boolean);
    return legacy.filter((answer) => VALID_CORRECT_KEYS.has(answer));
}

export function normalizeQuestionPayload(
    payload: Record<string, unknown>,
    fallbackStatus: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived' = 'draft',
): { normalized: NormalizedQuestionPayload; errors: string[] } {
    const questionType = normalizeQuestionType(payload);
    const optionsLocalizedFromPayload = normalizeOptionsLocalized(payload);
    let options: NormalizedQuestionOption[] = optionsLocalizedFromPayload.map((opt) => ({
        key: opt.key,
        text: opt.text.en || opt.text.bn || '',
        media_id: opt.media_id || null,
    }));
    if (options.length === 0) {
        options = normalizeOptions(payload);
    }

    const optionsLocalized: LocalizedOptionValue[] = optionsLocalizedFromPayload.length > 0
        ? optionsLocalizedFromPayload
        : options.map((opt) => ({
            key: opt.key,
            text: { en: String(opt.text || '').trim(), bn: '' },
            media_id: opt.media_id || null,
        }));

    const correctAnswers = normalizeCorrectAnswers(payload);
    const questionTextLocalizedInput = asLocalizedText(payload.questionText || payload.question_text_localized || '');
    const questionTextEn = questionTextLocalizedInput.en || String(payload.question_text || payload.question || '').trim();
    const questionTextBn = questionTextLocalizedInput.bn || String(payload.question_text_bn || payload.question_bn || '').trim();
    const questionTextLocalized: LocalizedTextValue = {
        en: questionTextEn,
        bn: questionTextBn,
    };
    const questionText = questionTextLocalized.en || questionTextLocalized.bn;

    const sanitizedHtml = sanitizeRichHtml(payload.question_html || '');
    const explanationTextLocalizedInput = asLocalizedText(payload.explanationText || payload.explanation_text_localized || '');
    const explanationEn = explanationTextLocalizedInput.en || String(payload.explanation || payload.explanation_text || '').trim();
    const explanationBn = explanationTextLocalizedInput.bn || String(payload.explanation_bn || '').trim();
    const explanationTextLocalized: LocalizedTextValue = {
        en: explanationEn,
        bn: explanationBn,
    };
    const explanation = explanationTextLocalized.en || explanationTextLocalized.bn;

    const marks = Number(payload.marks || 1);
    const negative = Number(payload.negative_marks ?? payload.negativeMarks ?? 0);
    const estimated = Number(payload.estimated_time || 60);
    const tags = toStringArray(payload.tags);
    const skillTags = toStringArray(payload.skill_tags);
    const statusRaw = String(payload.status || fallbackStatus).trim().toLowerCase();
    const status =
        statusRaw === 'pending_review' || statusRaw === 'approved' || statusRaw === 'rejected' || statusRaw === 'archived'
            ? statusRaw
            : 'draft';
    const languageMode = normalizeLanguageMode(payload, {
        questionText: questionTextLocalized,
        explanationText: explanationTextLocalized,
        optionsLocalized,
    });

    const normalized: NormalizedQuestionPayload = {
        class_level: String(payload.class_level || payload.class || '').trim(),
        department: String(payload.department || '').trim(),
        subject: String(payload.subject || '').trim(),
        chapter: String(payload.chapter || '').trim(),
        topic: String(payload.topic || '').trim(),
        question: questionText,
        question_text: questionText,
        questionText: questionTextLocalized,
        question_html: sanitizedHtml,
        question_type: questionType,
        questionType: normalizeLegacyType(questionType),
        options,
        optionsLocalized,
        correct_answer: correctAnswers,
        correctAnswer: (correctAnswers[0] as 'A' | 'B' | 'C' | 'D') || undefined,
        explanation,
        explanation_text: explanation,
        explanationText: explanationTextLocalized,
        languageMode,
        difficulty: normalizeDifficulty(payload),
        tags,
        estimated_time: Number.isFinite(estimated) && estimated > 0 ? Math.round(estimated) : 60,
        skill_tags: skillTags,
        has_explanation: Boolean(explanationTextLocalized.en || explanationTextLocalized.bn),
        optionA: options.find((opt) => opt.key === 'A')?.text || '',
        optionB: options.find((opt) => opt.key === 'B')?.text || '',
        optionC: options.find((opt) => opt.key === 'C')?.text || '',
        optionD: options.find((opt) => opt.key === 'D')?.text || '',
        marks: Number.isFinite(marks) && marks > 0 ? marks : 1,
        negative_marks: Number.isFinite(negative) && negative >= 0 ? negative : 0,
        negativeMarks: Number.isFinite(negative) && negative >= 0 ? negative : 0,
        image_media_id:
            payload.image_media_id && mongoose.Types.ObjectId.isValid(String(payload.image_media_id))
                ? new mongoose.Types.ObjectId(String(payload.image_media_id))
                : null,
        media_alt_text_bn: String(payload.media_alt_text_bn || payload.alt_text || '').trim(),
        media_status: String(payload.media_status || '').trim().toLowerCase() === 'pending' ? 'pending' : 'approved',
        status,
        manual_flags: toStringArray(payload.manual_flags),
        questionImage: String(payload.questionImage || '').trim() || undefined,
    };

    const errors: string[] = [];
    if (!normalized.question) {
        errors.push('প্রশ্ন লিখতে হবে');
    }

    if (normalized.question_type !== 'WRITTEN') {
        if (normalized.options.length < 2) {
            errors.push('অপশনগুলি পূরণ করুন');
        }
        if (normalized.correct_answer.length < 1) {
            errors.push('সঠিক উত্তর নির্বাচন করুন');
        } else {
            const optionKeys = new Set(normalized.options.map((opt) => opt.key));
            const invalidCorrect = normalized.correct_answer.some((answer) => !optionKeys.has(answer) && answer !== 'TRUE' && answer !== 'FALSE');
            if (invalidCorrect) {
                errors.push('সঠিক উত্তর নির্বাচন করুন');
            }
        }
    }

    if (normalized.question_type !== 'WRITTEN' && normalized.options.some((opt) => !opt.text)) {
        errors.push('অপশনগুলি পূরণ করুন');
    }

    if ((normalized.image_media_id || normalized.questionImage) && !normalized.media_alt_text_bn) {
        errors.push('ইমেজ ব্যবহার করলে alt text (বাংলা) দিতে হবে');
    }

    return { normalized, errors };
}

export function computeQualityScore(data: NormalizedQuestionPayload & {
    usage_count?: number;
    avg_correct_pct?: number | null;
    flagged_duplicate?: boolean;
}): QualityResult {
    let score = 0;
    const flags: string[] = [];

    const questionLength = data.question.length;
    if (questionLength >= 20) score += 20;
    else if (questionLength >= 8) score += 12;
    else flags.push('short_question');

    if (data.question_type === 'WRITTEN') {
        score += 15;
    } else {
        if (data.options.length >= 4) score += 20;
        else if (data.options.length >= 2) score += 14;
        else flags.push('missing_options');

        if (data.correct_answer.length >= 1) score += 12;
        else flags.push('missing_correct_answer');
    }

    if (data.subject) score += 6;
    else flags.push('missing_subject');
    if (data.chapter) score += 6;
    else flags.push('missing_chapter');
    if (data.class_level) score += 4;
    if (data.topic) score += 3;

    if (data.tags.length >= 3) score += 8;
    else if (data.tags.length > 0) score += 4;
    else flags.push('missing_tags');

    if (data.has_explanation || data.explanation.length > 10) score += 8;
    else flags.push('missing_explanation');

    if (data.estimated_time > 0 && data.estimated_time <= 600) score += 5;
    if ((data.image_media_id || data.questionImage) && data.media_alt_text_bn) score += 4;

    const usageCount = Number(data.usage_count || 0);
    if (usageCount > 0) score += 5;
    if (usageCount >= 20) score += 4;

    const avgCorrect = Number(data.avg_correct_pct ?? 0);
    if (Number.isFinite(avgCorrect) && avgCorrect > 0) {
        const balance = 1 - Math.abs(avgCorrect - 55) / 55;
        score += clamp(balance, 0, 1) * 8;
    }

    if (data.flagged_duplicate) {
        score -= 25;
        flags.push('duplicate_risk');
    }

    if (data.media_status === 'pending') flags.push('media_pending');

    return {
        score: Number(clamp(Math.round(score * 100) / 100, 0, 100)),
        flags,
    };
}

function optionSimilarity(aOptions: NormalizedQuestionOption[], bOptions: NormalizedQuestionOption[]): number {
    if (aOptions.length === 0 || bOptions.length === 0) return 0;
    const aText = aOptions.map((entry) => normalizeForSimilarity(entry.text)).filter(Boolean);
    const bText = bOptions.map((entry) => normalizeForSimilarity(entry.text)).filter(Boolean);
    if (aText.length === 0 || bText.length === 0) return 0;

    let total = 0;
    let matched = 0;
    for (const left of aText) {
        let best = 0;
        for (const right of bText) {
            const ratio = levenshteinRatio(left, right);
            if (ratio > best) best = ratio;
        }
        total += best;
        matched += 1;
    }
    return matched === 0 ? 0 : total / matched;
}

export function detectSimilarQuestions(
    incoming: { question: string; options: NormalizedQuestionOption[] },
    existingRows: Array<{ _id: unknown; question?: string; question_text?: string; options?: NormalizedQuestionOption[]; optionA?: string; optionB?: string; optionC?: string; optionD?: string }>,
    threshold = 0.82,
): SimilarityMatch[] {
    const matches: SimilarityMatch[] = [];
    const incomingQuestion = incoming.question || '';

    for (const row of existingRows) {
        const existingQuestion = String(row.question_text || row.question || '').trim();
        if (!existingQuestion) continue;

        const existingOptions = Array.isArray(row.options) && row.options.length > 0
            ? row.options
            : [
                { key: 'A', text: String(row.optionA || '') },
                { key: 'B', text: String(row.optionB || '') },
                { key: 'C', text: String(row.optionC || '') },
                { key: 'D', text: String(row.optionD || '') },
            ].filter((entry) => entry.text);

        const overlap = tokenOverlap(incomingQuestion, existingQuestion);
        const lev = levenshteinRatio(incomingQuestion, existingQuestion);
        const optSimilarity = optionSimilarity(incoming.options, existingOptions);
        const score = overlap * 0.45 + lev * 0.35 + optSimilarity * 0.2;

        if (score >= threshold) {
            matches.push({
                questionId: String(row._id),
                questionText: existingQuestion,
                score: Number(score.toFixed(4)),
                tokenOverlap: Number(overlap.toFixed(4)),
                levenshteinRatio: Number(lev.toFixed(4)),
                optionSimilarity: Number(optSimilarity.toFixed(4)),
            });
        }
    }

    return matches.sort((a, b) => b.score - a.score);
}

export async function validateImageUrl(
    rawUrl: string,
    maxBytes = 5 * 1024 * 1024,
): Promise<{ ok: boolean; reason?: string; mimeType?: string; sizeBytes?: number }> {
    const url = String(rawUrl || '').trim();
    if (!url) return { ok: true };
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const headResponse = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
        clearTimeout(timeout);

        if (!headResponse.ok) {
            return { ok: false, reason: `HTTP ${headResponse.status}` };
        }

        const mimeType = String(headResponse.headers.get('content-type') || '').toLowerCase();
        const sizeHeader = Number(headResponse.headers.get('content-length') || 0);
        const sizeBytes = Number.isFinite(sizeHeader) ? sizeHeader : 0;

        if (mimeType && !mimeType.startsWith('image/')) {
            return { ok: false, reason: 'content_type_not_image', mimeType };
        }
        if (sizeBytes > 0 && sizeBytes > maxBytes) {
            return { ok: false, reason: 'image_too_large', sizeBytes, mimeType };
        }

        return { ok: true, mimeType, sizeBytes };
    } catch {
        return { ok: false, reason: 'image_url_unreachable' };
    }
}


export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export function validateQuestionPayload(payload: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // 1. Question text validation
    const enLen = (payload.question_en as string || '').trim().length;
    const bnLen = (payload.question_bn as string || '').trim().length;
    if (enLen < 1 && bnLen < 1) {
        errors.push('At least one of question_en or question_bn must be provided');
    }

    // 2. Options validation
    const options = payload.options as IBankQuestionOption[] | undefined;
    const questionType = String(payload.question_type || payload.questionType || 'mcq');
    
    if (questionType !== 'written_cq' && questionType !== 'fill_blank') {
        if (!options || options.length < 2) {
            errors.push('At least 2 options are required for MCQ types');
        } else {
            // Check each option has non-empty text
            options.forEach((opt, i) => {
                if (!(opt.text_en?.trim()) && !(opt.text_bn?.trim()) && !(opt.imageUrl?.trim())) {
                    errors.push(`Option ${i + 1}: text_en, text_bn, or imageUrl is required`);
                }
            });

            // 3. correctKey validation
            const optionKeys = options.map(o => o.key);
            if (payload.correctKey) {
                if (!optionKeys.includes(payload.correctKey as typeof optionKeys[number])) {
                    errors.push('correctKey must match one of the option keys');
                }
            } else {
                // If correctKey is missing, check if any option is marked correct
                if (!options.some((o: any) => o.isCorrect === true)) {
                    errors.push('At least one option must be marked as correct');
                }
            }
        }
    }

    // 4. difficulty validation
    if (payload.difficulty && !['easy', 'medium', 'hard', 'expert'].includes(payload.difficulty as string)) {
        errors.push('difficulty must be easy, medium, hard, or expert');
    }

    return { valid: errors.length === 0, errors };
}
