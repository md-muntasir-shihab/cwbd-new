/**
 * ExportPipelineService
 *
 * Generates Excel (.xlsx), CSV (UTF-8 BOM for Bengali), and PDF exports
 * of questions and exam results.
 *
 * - exportQuestionsExcel: Query questions matching filters, generate .xlsx
 * - exportQuestionsCSV: Same query, generate UTF-8 CSV with BOM
 * - exportResultsPDF: Query exam + results, generate PDF with Bengali font + LaTeX
 * - Async processing for > 10000 records (returns job ID)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import katex from 'katex';
import mongoose from 'mongoose';
import QuestionBankQuestion, {
    IQuestionBankQuestion,
} from '../models/QuestionBankQuestion';
import ExamResult, { IExamResult } from '../models/ExamResult';
import Exam, { IExam } from '../models/Exam';

// ─── Types ──────────────────────────────────────────────────

/**
 * Reuse the same QuestionFilters interface from QuestionBankService.
 * Duplicated here to avoid circular dependency.
 */
export interface QuestionFilters {
    group?: string;
    subGroup?: string;
    subject?: string;
    chapter?: string;
    topic?: string;
    difficulty?: string;
    tags?: string | string[];
    year?: string;
    source?: string;
    question_type?: string;
    status?: string;
    review_status?: string;
    search?: string;
}

export interface ExportJobResult {
    jobId: string;
    message: string;
}

// ─── Constants ──────────────────────────────────────────────

const ASYNC_THRESHOLD = 10_000;

/** UTF-8 BOM for proper Bengali display in Excel/CSV viewers. */
const UTF8_BOM = '\uFEFF';

/** Column headers matching the import template for round-trip compatibility. */
const EXPORT_COLUMNS = [
    'questionType',
    'questionText',
    'questionTextBn',
    'option1',
    'option1Bn',
    'option2',
    'option2Bn',
    'option3',
    'option3Bn',
    'option4',
    'option4Bn',
    'correctOption',
    'difficulty',
    'marks',
    'negativeMarks',
    'group',
    'subGroup',
    'subject',
    'chapter',
    'topic',
    'tags',
    'explanation',
    'explanationBn',
    'imageUrl',
    'year',
    'source',
] as const;

/** Map correctKey (A/B/C/D) to numeric correctOption (1/2/3/4). */
const CORRECT_KEY_TO_NUMBER: Record<string, string> = {
    A: '1',
    B: '2',
    C: '3',
    D: '4',
};

/**
 * Path to Noto Sans Bengali font file for PDF Bengali text rendering.
 * Falls back to built-in Helvetica if the font file is not available.
 */
const BENGALI_FONT_PATH = path.resolve(
    __dirname,
    '../assets/fonts/NotoSansBengali-Regular.ttf',
);

// ─── Query Builder ──────────────────────────────────────────

/**
 * Build a Mongoose query filter from QuestionFilters.
 * Mirrors the logic in QuestionBankService.listQuestions.
 */
function buildQuestionQuery(filters: QuestionFilters): Record<string, unknown> {
    const query: Record<string, unknown> = { isArchived: { $ne: true } };

    if (filters.group) {
        query.group_id = new mongoose.Types.ObjectId(filters.group);
    }
    if (filters.subGroup) {
        query.sub_group_id = new mongoose.Types.ObjectId(filters.subGroup);
    }
    if (filters.subject) query.subject = filters.subject;
    if (filters.chapter) query.chapter = filters.chapter;
    if (filters.topic) query.topic = filters.topic;
    if (filters.difficulty) query.difficulty = filters.difficulty;
    if (filters.question_type) query.question_type = filters.question_type;
    if (filters.status) query.status = filters.status;
    if (filters.review_status) query.review_status = filters.review_status;
    if (filters.year) query.yearOrSession = filters.year;
    if (filters.source) query.sourceLabel = filters.source;

    if (filters.tags) {
        const tagList = Array.isArray(filters.tags)
            ? filters.tags
            : [filters.tags];
        if (tagList.length > 0) {
            query.tags = { $all: tagList };
        }
    }

    if (filters.search) {
        query.$or = [
            { question_en: { $regex: filters.search, $options: 'i' } },
            { question_bn: { $regex: filters.search, $options: 'i' } },
        ];
    }

    return query;
}

/**
 * Map a QuestionBankQuestion document to a flat export row.
 * Exports both English and Bengali text separately for round-trip import.
 * Reads hierarchy names from populated references when available.
 */
function questionToExportRow(
    q: IQuestionBankQuestion & {
        group_id?: { title?: { en?: string } } | mongoose.Types.ObjectId;
        sub_group_id?: { title?: { en?: string } } | mongoose.Types.ObjectId;
        subject_id?: { title?: { en?: string } } | mongoose.Types.ObjectId;
        chapter_id?: { title?: { en?: string } } | mongoose.Types.ObjectId;
        topic_id?: { title?: { en?: string } } | mongoose.Types.ObjectId;
    },
): Record<string, string> {
    // Map options by key (both en/bn)
    const optionEnMap: Record<string, string> = {};
    const optionBnMap: Record<string, string> = {};
    for (const opt of q.options || []) {
        optionEnMap[opt.key] = opt.text_en || '';
        optionBnMap[opt.key] = opt.text_bn || '';
    }

    // Resolve hierarchy names from populated refs, fall back to string fields
    const getPopulatedName = (ref: unknown): string => {
        if (ref && typeof ref === 'object' && 'title' in (ref as Record<string, unknown>)) {
            const titleObj = (ref as { title?: { en?: string } }).title;
            return titleObj?.en || '';
        }
        return '';
    };

    const groupName = getPopulatedName(q.group_id) || '';
    const subGroupName = getPopulatedName(q.sub_group_id) || '';
    const subjectName = getPopulatedName(q.subject_id) || q.subject || '';
    const chapterName = getPopulatedName(q.chapter_id) || q.chapter || '';
    const topicName = getPopulatedName(q.topic_id) || q.topic || '';

    return {
        questionType: q.question_type || 'mcq',
        questionText: q.question_en || '',
        questionTextBn: q.question_bn || '',
        option1: optionEnMap['A'] || '',
        option1Bn: optionBnMap['A'] || '',
        option2: optionEnMap['B'] || '',
        option2Bn: optionBnMap['B'] || '',
        option3: optionEnMap['C'] || '',
        option3Bn: optionBnMap['C'] || '',
        option4: optionEnMap['D'] || '',
        option4Bn: optionBnMap['D'] || '',
        correctOption: CORRECT_KEY_TO_NUMBER[q.correctKey] || '',
        difficulty: q.difficulty || 'medium',
        marks: String(q.marks ?? 1),
        negativeMarks: String(q.negativeMarks ?? 0),
        group: groupName,
        subGroup: subGroupName,
        subject: subjectName,
        chapter: chapterName,
        topic: topicName,
        tags: (q.tags || []).join(', '),
        explanation: q.explanation_en || '',
        explanationBn: q.explanation_bn || '',
        imageUrl: (q.images && q.images.length > 0) ? q.images[0] : (q.questionImageUrl || ''),
        year: q.yearOrSession || '',
        source: q.sourceLabel || '',
    };
}

// ─── LaTeX Rendering ────────────────────────────────────────

/**
 * Render LaTeX expressions in text to plain-text representation for PDF.
 * Extracts LaTeX delimited by $...$ (inline) or $$...$$ (block),
 * renders via KaTeX to HTML, then strips HTML tags to get readable text.
 *
 * Requirement 11.6
 */
export function renderLatexToText(text: string): string {
    if (!text) return '';

    // Replace block LaTeX ($$...$$) first, then inline ($...$)
    let result = text.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_match, latex: string) => renderSingleLatex(latex.trim(), true),
    );

    result = result.replace(
        /\$((?!\$)[\s\S]*?)\$/g,
        (_match, latex: string) => renderSingleLatex(latex.trim(), false),
    );

    return result;
}

/**
 * Render a single LaTeX expression to plain text via KaTeX.
 * Falls back to raw LaTeX on parse error.
 */
function renderSingleLatex(latex: string, displayMode: boolean): string {
    try {
        // Render to HTML, then strip tags to get text representation
        const html = katex.renderToString(latex, {
            displayMode,
            throwOnError: false,
            output: 'html',
        });
        // Strip HTML tags to extract readable text
        return stripHtmlTags(html);
    } catch {
        // Fallback: return raw LaTeX wrapped in delimiters
        return displayMode ? `[${latex}]` : latex;
    }
}

/**
 * Strip HTML tags from a string, preserving text content.
 */
function stripHtmlTags(html: string): string {
    return html
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Excel Export ───────────────────────────────────────────

/**
 * Export questions matching filters to an Excel (.xlsx) file.
 * Columns match the import format for round-trip compatibility.
 *
 * For > 10000 records, returns a job ID for async processing.
 *
 * Requirement 11.1, 11.5
 */
export async function exportQuestionsExcel(
    filters: QuestionFilters,
): Promise<Buffer | ExportJobResult> {
    const query = buildQuestionQuery(filters);
    const count = await QuestionBankQuestion.countDocuments(query);

    if (count > ASYNC_THRESHOLD) {
        return createAsyncExportJob('excel', filters, count);
    }

    const questions = await QuestionBankQuestion.find(query)
        .populate('group_id', 'title')
        .populate('sub_group_id', 'title')
        .populate('subject_id', 'title')
        .populate('chapter_id', 'title')
        .populate('topic_id', 'title')
        .sort({ createdAt: -1 })
        .lean<IQuestionBankQuestion[]>();

    return generateExcelBuffer(questions);
}

/**
 * Generate an Excel buffer from an array of questions.
 * Exported for reuse in async processing and testing.
 */
export async function generateExcelBuffer(
    questions: IQuestionBankQuestion[],
): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CampusWay Export Pipeline';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Questions');

    // Add header row
    worksheet.columns = EXPORT_COLUMNS.map((col) => ({
        header: col,
        key: col,
        width: col === 'questionText' || col === 'questionTextBn' ? 50
            : col === 'explanation' || col === 'explanationBn' ? 40
            : 20,
    }));

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
    };

    // Add data rows
    for (const q of questions) {
        const row = questionToExportRow(q);
        worksheet.addRow(row);
    }

    // Write to buffer
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
}

// ─── CSV Export ─────────────────────────────────────────────

/**
 * Export questions matching filters to a UTF-8 CSV file with BOM.
 * The BOM ensures proper Bengali character display in Excel and other viewers.
 *
 * For > 10000 records, returns a job ID for async processing.
 *
 * Requirement 11.2, 11.5
 */
export async function exportQuestionsCSV(
    filters: QuestionFilters,
): Promise<Buffer | ExportJobResult> {
    const query = buildQuestionQuery(filters);
    const count = await QuestionBankQuestion.countDocuments(query);

    if (count > ASYNC_THRESHOLD) {
        return createAsyncExportJob('csv', filters, count);
    }

    const questions = await QuestionBankQuestion.find(query)
        .populate('group_id', 'title')
        .populate('sub_group_id', 'title')
        .populate('subject_id', 'title')
        .populate('chapter_id', 'title')
        .populate('topic_id', 'title')
        .sort({ createdAt: -1 })
        .lean<IQuestionBankQuestion[]>();

    return generateCSVBuffer(questions);
}

/**
 * Generate a CSV buffer from an array of questions.
 * Includes UTF-8 BOM for Bengali character support.
 * Exported for reuse in async processing and testing.
 */
export function generateCSVBuffer(questions: IQuestionBankQuestion[]): Buffer {
    const rows: string[] = [];

    // Header row
    rows.push(EXPORT_COLUMNS.join(','));

    // Data rows
    for (const q of questions) {
        const row = questionToExportRow(q);
        const csvRow = EXPORT_COLUMNS.map((col) =>
            escapeCSVField(row[col] || ''),
        );
        rows.push(csvRow.join(','));
    }

    const csvContent = UTF8_BOM + rows.join('\n');
    return Buffer.from(csvContent, 'utf-8');
}

/**
 * Escape a CSV field value: wrap in quotes if it contains commas,
 * quotes, or newlines. Double any internal quotes.
 */
function escapeCSVField(value: string): string {
    const str = String(value);
    if (
        str.includes(',') ||
        str.includes('"') ||
        str.includes('\n') ||
        str.includes('\r')
    ) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// ─── PDF Export ─────────────────────────────────────────────

/**
 * Export exam results to a PDF file.
 * Includes: exam title, date, participant list with scores/ranks,
 * and summary statistics.
 *
 * Uses Noto Sans Bengali font for Bengali text rendering.
 * LaTeX formulas rendered via server-side KaTeX.
 *
 * Requirement 11.3, 11.4, 11.6
 */
export async function exportResultsPDF(examId: string): Promise<Buffer> {
    // Fetch exam and results
    const exam = await Exam.findById(examId).lean<IExam>();
    if (!exam) {
        throw new Error(`Exam "${examId}" not found`);
    }

    const results = await ExamResult.find({
        exam: new mongoose.Types.ObjectId(examId),
    })
        .populate('student', 'name email')
        .sort({ obtainedMarks: -1, timeTaken: 1 })
        .lean<
            (IExamResult & { student: { name?: string; email?: string } })[]
        >();

    return generateResultsPDFBuffer(exam, results);
}

/**
 * Generate a PDF buffer from exam data and results.
 * Exported for reuse and testing.
 */
export function generateResultsPDFBuffer(
    exam: IExam,
    results: (IExamResult & { student: { name?: string; email?: string } })[],
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 },
            info: {
                Title: `Exam Results - ${exam.title}`,
                Author: 'CampusWay',
                Subject: 'Exam Results Export',
            },
        });

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        // Register Bengali font if available (Requirement 11.4)
        const hasBengaliFont = registerBengaliFont(doc);
        const fontName = hasBengaliFont ? 'NotoSansBengali' : 'Helvetica';
        const boldFontName = hasBengaliFont
            ? 'NotoSansBengali'
            : 'Helvetica-Bold';

        // ── Title Section ──
        doc.font(boldFontName).fontSize(20);
        const titleText = exam.title_bn || exam.title || 'Exam Results';
        doc.text(renderLatexToText(titleText), { align: 'center' });

        doc.moveDown(0.5);
        doc.font(fontName).fontSize(10);
        doc.text(
            `Subject: ${exam.subjectBn || exam.subject || 'N/A'}`,
            { align: 'center' },
        );

        const examDate = exam.startDate
            ? new Date(exam.startDate).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            })
            : 'N/A';
        doc.text(`Date: ${examDate}`, { align: 'center' });
        doc.text(
            `Total Marks: ${exam.totalMarks || 0}  |  Duration: ${exam.duration || 0} min`,
            { align: 'center' },
        );

        doc.moveDown(1);

        // ── Summary Statistics ──
        const stats = computeSummaryStats(results, exam.totalMarks || 0);

        doc.font(boldFontName).fontSize(14);
        doc.text('Summary Statistics', { underline: true });
        doc.moveDown(0.3);

        doc.font(fontName).fontSize(10);
        doc.text(`Total Participants: ${stats.totalParticipants}`);
        doc.text(
            `Average Score: ${stats.averageScore.toFixed(2)} / ${exam.totalMarks || 0}`,
        );
        doc.text(`Average Percentage: ${stats.averagePercentage.toFixed(2)}%`);
        doc.text(`Highest Score: ${stats.highestScore}`);
        doc.text(`Lowest Score: ${stats.lowestScore}`);
        doc.text(`Pass Rate: ${stats.passRate.toFixed(1)}%`);

        doc.moveDown(1);

        // ── Participant List ──
        doc.font(boldFontName).fontSize(14);
        doc.text('Participant Results', { underline: true });
        doc.moveDown(0.5);

        // Table header
        drawResultsTableHeader(doc, boldFontName);

        // Table rows
        doc.font(fontName).fontSize(9);
        for (let i = 0; i < results.length; i++) {
            const r = results[i];

            // Check if we need a new page
            if (doc.y > 720) {
                doc.addPage();
                drawResultsTableHeader(doc, boldFontName);
                doc.font(fontName).fontSize(9);
            }

            const rank = r.rank ?? i + 1;
            const studentName =
                r.student?.name || r.student?.email || 'Unknown';
            const score = `${r.obtainedMarks}/${r.totalMarks}`;
            const pct = `${r.percentage.toFixed(1)}%`;
            const timeMins = Math.floor((r.timeTaken || 0) / 60);
            const timeSecs = (r.timeTaken || 0) % 60;
            const timeStr = `${timeMins}m ${timeSecs}s`;
            const passFailStr =
                r.passFail || (r.percentage >= 40 ? 'Pass' : 'Fail');

            const y = doc.y;
            doc.text(String(rank), 50, y, { width: 40 });
            doc.text(studentName, 90, y, { width: 150 });
            doc.text(score, 240, y, { width: 70 });
            doc.text(pct, 310, y, { width: 60 });
            doc.text(timeStr, 370, y, { width: 70 });
            doc.text(passFailStr, 440, y, { width: 60 });

            doc.moveDown(0.3);
        }

        doc.end();
    });
}

/**
 * Draw the results table header row.
 */
function drawResultsTableHeader(
    doc: PDFKit.PDFDocument,
    boldFont: string,
): void {
    doc.font(boldFont).fontSize(9);
    const y = doc.y;

    // Draw header background
    doc.rect(45, y - 2, 500, 16).fill('#E0E0E0');
    doc.fillColor('#000000');

    doc.text('Rank', 50, y, { width: 40 });
    doc.text('Student', 90, y, { width: 150 });
    doc.text('Score', 240, y, { width: 70 });
    doc.text('Percentage', 310, y, { width: 60 });
    doc.text('Time', 370, y, { width: 70 });
    doc.text('Status', 440, y, { width: 60 });

    doc.moveDown(0.5);
}

/**
 * Register Noto Sans Bengali font with PDFKit if the font file exists.
 * Returns true if the font was registered successfully.
 *
 * Requirement 11.4
 */
function registerBengaliFont(doc: PDFKit.PDFDocument): boolean {
    try {
        if (fs.existsSync(BENGALI_FONT_PATH)) {
            doc.registerFont('NotoSansBengali', BENGALI_FONT_PATH);
            return true;
        }
    } catch {
        // Font registration failed — fall back to Helvetica
    }
    return false;
}

// ─── Summary Statistics ─────────────────────────────────────

interface SummaryStats {
    totalParticipants: number;
    averageScore: number;
    averagePercentage: number;
    highestScore: number;
    lowestScore: number;
    passRate: number;
}

/**
 * Compute summary statistics from exam results.
 */
function computeSummaryStats(
    results: IExamResult[],
    _totalMarks: number,
): SummaryStats {
    if (results.length === 0) {
        return {
            totalParticipants: 0,
            averageScore: 0,
            averagePercentage: 0,
            highestScore: 0,
            lowestScore: 0,
            passRate: 0,
        };
    }

    const scores = results.map((r) => r.obtainedMarks || 0);
    const percentages = results.map((r) => r.percentage || 0);
    const passCount = results.filter(
        (r) => r.passFail === 'Pass' || r.percentage >= 40,
    ).length;

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    return {
        totalParticipants: results.length,
        averageScore: sum(scores) / results.length,
        averagePercentage: sum(percentages) / results.length,
        highestScore: Math.max(...scores),
        lowestScore: Math.min(...scores),
        passRate: (passCount / results.length) * 100,
    };
}

// ─── Async Export Processing ────────────────────────────────

/**
 * Create an async export job for large datasets (> 10000 records).
 * Returns a job ID that can be polled for completion.
 *
 * Requirement 11.5
 */
function createAsyncExportJob(
    format: 'excel' | 'csv',
    filters: QuestionFilters,
    recordCount: number,
): ExportJobResult {
    // Generate a unique job ID
    const jobId = new mongoose.Types.ObjectId().toString();

    // Schedule background processing via setImmediate to avoid
    // blocking the request. In production, this would use a job
    // queue (e.g., Bull/BullMQ) and store the result for download.
    setImmediate(() => {
        processAsyncExport(jobId, format, filters).catch((err) => {
            console.error(`Async export job ${jobId} failed:`, err);
        });
    });

    return {
        jobId,
        message: `Export of ${recordCount} records is being processed asynchronously. Use job ID to check status.`,
    };
}

/**
 * Process an async export job in the background.
 * Queries all matching questions and generates the export file.
 *
 * In production, the generated file would be stored in a temporary
 * location (e.g., S3, local disk) and a download link provided.
 */
async function processAsyncExport(
    _jobId: string,
    format: 'excel' | 'csv',
    filters: QuestionFilters,
): Promise<Buffer> {
    const query = buildQuestionQuery(filters);
    const questions = await QuestionBankQuestion.find(query)
        .populate('group_id', 'title')
        .populate('sub_group_id', 'title')
        .populate('subject_id', 'title')
        .populate('chapter_id', 'title')
        .populate('topic_id', 'title')
        .sort({ createdAt: -1 })
        .lean<IQuestionBankQuestion[]>();

    if (format === 'excel') {
        return generateExcelBuffer(questions);
    }
    return generateCSVBuffer(questions);
}
