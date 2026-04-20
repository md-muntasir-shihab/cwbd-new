import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import * as svc from '../services/questionBankAdvancedService';

/* ─── Helper ──────────────────────────────────────────── */
function adminId(req: AuthRequest): string {
    return String((req as any).user?._id || '');
}

function ok(res: Response, data: unknown) {
    return res.status(200).json({ success: true, data });
}
function created(res: Response, data: unknown) {
    return res.status(201).json({ success: true, data });
}
function notFound(res: Response, msg = 'Not found') {
    return res.status(404).json({ success: false, error: msg });
}
function bad(res: Response, msg: string) {
    return res.status(400).json({ success: false, error: msg });
}

function param(req: AuthRequest, key: string): string {
    const value = (req.params as Record<string, string | string[] | undefined>)[key];
    return Array.isArray(value) ? (value[0] || '') : (value || '');
}

/* ─── Settings ────────────────────────────────────────── */
export async function getSettings(req: AuthRequest, res: Response) {
    const data = await svc.getSettings();
    return ok(res, data);
}

export async function updateSettings(req: AuthRequest, res: Response) {
    const data = await svc.updateSettings(req.body, adminId(req));
    return ok(res, data);
}

/* ─── CRUD ────────────────────────────────────────────── */
export async function listBankQuestions(req: AuthRequest, res: Response) {
    const params: svc.ListBankQuestionsParams = {
        q: req.query.q as string,
        subject: req.query.subject as string,
        moduleCategory: req.query.moduleCategory as string,
        topic: req.query.topic as string,
        difficulty: req.query.difficulty as string,
        tag: req.query.tag as string,
        status: req.query.status as string,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25,
        sort: req.query.sort as string,
    };
    const data = await svc.listBankQuestions(params);
    return ok(res, data);
}

export async function getBankQuestion(req: AuthRequest, res: Response) {
    const data = await svc.getBankQuestion(param(req, 'id'));
    if (!data) return notFound(res, 'Question not found');
    return ok(res, data);
}

export async function createBankQuestion(req: AuthRequest, res: Response) {
    const data = await svc.createBankQuestion(req.body, adminId(req));
    return created(res, data);
}

export async function updateBankQuestion(req: AuthRequest, res: Response) {
    const data = await svc.updateBankQuestion(param(req, 'id'), req.body, adminId(req));
    if (!data) return notFound(res, 'Question not found');
    return ok(res, data);
}

export async function deleteBankQuestion(req: AuthRequest, res: Response) {
    const data = await svc.deleteBankQuestion(param(req, 'id'), adminId(req));
    if (!data) return notFound(res, 'Question not found');
    return ok(res, data);
}

export async function archiveBankQuestion(req: AuthRequest, res: Response) {
    const data = await svc.archiveBankQuestion(param(req, 'id'), adminId(req));
    if (!data) return notFound(res, 'Question not found');
    return ok(res, data);
}

export async function restoreBankQuestion(req: AuthRequest, res: Response) {
    const data = await svc.restoreBankQuestion(param(req, 'id'), adminId(req));
    if (!data) return notFound(res, 'Question not found');
    return ok(res, data);
}

export async function duplicateBankQuestion(req: AuthRequest, res: Response) {
    const data = await svc.duplicateBankQuestion(param(req, 'id'), adminId(req));
    if (!data) return notFound(res, 'Question not found');
    return created(res, data);
}

/* ─── Bulk ────────────────────────────────────────────── */
export async function bulkArchive(req: AuthRequest, res: Response) {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return bad(res, 'ids array required');
    const data = await svc.bulkArchive(ids, adminId(req));
    return ok(res, data);
}

export async function bulkActivate(req: AuthRequest, res: Response) {
    const { ids, active } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return bad(res, 'ids array required');
    const data = await svc.bulkActivate(ids, active !== false, adminId(req));
    return ok(res, data);
}

export async function bulkUpdateTags(req: AuthRequest, res: Response) {
    const { ids, tags, mode } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return bad(res, 'ids array required');
    if (!Array.isArray(tags)) return bad(res, 'tags array required');
    const data = await svc.bulkUpdateTags(ids, tags, mode || 'add', adminId(req));
    return ok(res, data);
}

export async function bulkDelete(req: AuthRequest, res: Response) {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return bad(res, 'ids array required');
    const data = await svc.bulkDelete(ids, adminId(req));
    return ok(res, data);
}

export async function bulkCopy(req: AuthRequest, res: Response) {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return bad(res, 'ids array required');
    try {
        const data = await svc.bulkCopy(ids, adminId(req));
        return ok(res, data);
    } catch (err: any) {
        return bad(res, err.message || 'Bulk copy failed');
    }
}

/* ─── Import / Export ─────────────────────────────────── */
export async function importPreview(req: AuthRequest, res: Response) {
    if (!req.file) return bad(res, 'File required');
    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : undefined;
    const data = await svc.importPreview(req.file.buffer, req.file.originalname, mapping);
    return ok(res, data);
}

export async function importCommit(req: AuthRequest, res: Response) {
    if (!req.file) return bad(res, 'File required');
    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};
    const mode = req.body.mode === 'upsert' ? 'upsert' : 'create';
    const data = await svc.importCommit(req.file.buffer, req.file.originalname, mapping, mode, adminId(req));
    return ok(res, data);
}

export async function exportQuestions(req: AuthRequest, res: Response) {
    const format = (req.query.format as string) === 'csv' ? 'csv' : 'xlsx';
    const buf = await svc.exportQuestions(
        {
            subject: req.query.subject as string,
            moduleCategory: req.query.moduleCategory as string,
            topic: req.query.topic as string,
            difficulty: req.query.difficulty as string,
            tag: req.query.tag as string,
            status: req.query.status as string,
        },
        format,
    );
    const mime = format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename=question_bank.${format}`);
    return res.send(buf);
}

export async function downloadImportTemplate(_req: AuthRequest, res: Response) {
    const buf = svc.generateImportTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=question_bank_import_template.xlsx');
    return res.send(buf);
}

/* ─── Sets ────────────────────────────────────────────── */
export async function listSets(req: AuthRequest, res: Response) {
    const data = await svc.listSets();
    return ok(res, data);
}

export async function getSet(req: AuthRequest, res: Response) {
    const data = await svc.getSet(param(req, 'id'));
    if (!data) return notFound(res, 'Set not found');
    return ok(res, data);
}

export async function createSet(req: AuthRequest, res: Response) {
    const data = await svc.createSet(req.body, adminId(req));
    return created(res, data);
}

export async function updateSet(req: AuthRequest, res: Response) {
    const data = await svc.updateSet(param(req, 'id'), req.body, adminId(req));
    if (!data) return notFound(res, 'Set not found');
    return ok(res, data);
}

export async function deleteSet(req: AuthRequest, res: Response) {
    const data = await svc.deleteSet(param(req, 'id'), adminId(req));
    if (!data) return notFound(res, 'Set not found');
    return ok(res, data);
}

export async function resolveSetQuestions(req: AuthRequest, res: Response) {
    const data = await svc.resolveSetQuestions(param(req, 'id'));
    if (!data) return notFound(res, 'Set not found');
    return ok(res, data);
}

/* ─── Exam Integration ────────────────────────────────── */
export async function searchBankQuestionsForExam(req: AuthRequest, res: Response) {
    const data = await svc.searchBankQuestionsForExam(param(req, 'examId'), {
        q: req.query.q as string,
        subject: req.query.subject as string,
        moduleCategory: req.query.moduleCategory as string,
        topic: req.query.topic as string,
        difficulty: req.query.difficulty as string,
        tag: req.query.tag as string,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25,
    });
    return ok(res, data);
}

export async function attachBankQuestionsToExam(req: AuthRequest, res: Response) {
    const { bankQuestionIds } = req.body;
    if (!Array.isArray(bankQuestionIds) || bankQuestionIds.length === 0) {
        return bad(res, 'bankQuestionIds array required');
    }
    const data = await svc.attachBankQuestionsToExam(param(req, 'examId'), bankQuestionIds, adminId(req));
    return created(res, data);
}

export async function removeBankQuestionFromExam(req: AuthRequest, res: Response) {
    const data = await svc.removeBankQuestionFromExam(param(req, 'examId'), param(req, 'questionId'), adminId(req));
    if (!data) return notFound(res, 'Question not found in exam');
    return ok(res, data);
}

export async function reorderExamQuestions(req: AuthRequest, res: Response) {
    const { orderMap } = req.body;
    if (!Array.isArray(orderMap)) return bad(res, 'orderMap array required');
    const data = await svc.reorderExamQuestions(param(req, 'examId'), orderMap, adminId(req));
    return ok(res, data);
}

export async function finalizeExamSnapshot(req: AuthRequest, res: Response) {
    const data = await svc.finalizeExamSnapshot(param(req, 'examId'), adminId(req));
    return ok(res, data);
}

/* ─── Analytics ───────────────────────────────────────── */

export async function exportPdf(req: AuthRequest, res: Response) {
    const doc = await svc.exportQuestionsPdf({
        subject: req.query.subject as string,
        moduleCategory: req.query.moduleCategory as string,
        topic: req.query.topic as string,
        difficulty: req.query.difficulty as string,
        tag: req.query.tag as string,
        status: req.query.status as string,
        q: req.query.search as string || req.query.q as string,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="questions-export.pdf"');
    doc.pipe(res);
    doc.end();
}

export async function getAnalytics(req: AuthRequest, res: Response) {
    const data = await svc.getAnalytics({
        subject: req.query.subject as string,
        moduleCategory: req.query.moduleCategory as string,
        topic: req.query.topic as string,
        examId: req.query.examId as string,
        groupId: req.query.groupId as string,
    });
    return ok(res, data);
}

export async function refreshAnalyticsForQuestion(req: AuthRequest, res: Response) {
    const data = await svc.refreshAnalyticsForQuestion(param(req, 'id'));
    if (!data) return notFound(res, 'No usage data');
    return ok(res, data);
}

export async function refreshAllAnalytics(_req: AuthRequest, res: Response) {
    const data = await svc.refreshAllAnalytics();
    return ok(res, data);
}
