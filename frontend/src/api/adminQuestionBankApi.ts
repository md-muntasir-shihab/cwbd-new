import api, { resolveSensitiveActionHeaders, type SensitiveActionProof } from '../services/api';
import type {
    BankQuestion,
    BankQuestionDetail,
    BankQuestionFacets,
    BankQuestionFilters,
    BankQuestionListResponse,
    ImportPreviewResponse,
    ImportCommitResponse,
    QuestionBankSet,
    QuestionBankSettings,
    AnalyticsSummary,
} from '../types/questionBank';

const BASE = '/admin/question-bank/v2';

/* ── Settings ── */
export const getQBSettings = () =>
    api.get(`${BASE}/settings`).then((r) => r.data as QuestionBankSettings);

export const updateQBSettings = (payload: Partial<QuestionBankSettings>) =>
    api.put(`${BASE}/settings`, payload).then((r) => r.data as QuestionBankSettings);

/* ── CRUD ── */
export const listBankQuestions = (filters: BankQuestionFilters) =>
    api.get(`${BASE}/questions`, { params: filters }).then((r) => r.data as BankQuestionListResponse);

export const getBankQuestion = (id: string) =>
    api.get(`${BASE}/questions/${id}`).then((r) => r.data as BankQuestionDetail);

export const createBankQuestion = (payload: Record<string, unknown>) =>
    api.post(`${BASE}/questions`, payload).then((r) => r.data as BankQuestion);

export const updateBankQuestion = (id: string, payload: Record<string, unknown>) =>
    api.put(`${BASE}/questions/${id}`, payload).then((r) => r.data as { question: BankQuestion; versioned: boolean });

export const deleteBankQuestion = (id: string) =>
    api.delete(`${BASE}/questions/${id}`).then((r) => r.data);

export const archiveBankQuestion = (id: string) =>
    api.post(`${BASE}/questions/${id}/archive`).then((r) => r.data);

export const restoreBankQuestion = (id: string) =>
    api.post(`${BASE}/questions/${id}/restore`).then((r) => r.data);

export const duplicateBankQuestion = (id: string) =>
    api.post(`${BASE}/questions/${id}/duplicate`).then((r) => r.data as BankQuestion);

/* ── Bulk ── */
export const bulkArchive = (ids: string[]) =>
    api.post(`${BASE}/bulk/archive`, { ids }).then((r) => r.data);

export const bulkActivate = (ids: string[], active: boolean) =>
    api.post(`${BASE}/bulk/activate`, { ids, active }).then((r) => r.data);

export const bulkUpdateTags = (ids: string[], tags: string[], mode: 'add' | 'set') =>
    api.post(`${BASE}/bulk/tags`, { ids, tags, mode }).then((r) => r.data);

export const bulkDelete = (ids: string[]) =>
    api.post(`${BASE}/bulk/delete`, { ids }).then((r) => r.data);

export const bulkCopy = (ids: string[]) =>
    api.post(`${BASE}/bulk/copy`, { ids }).then((r) => r.data as { copied: number; newQuestions: BankQuestion[] });

/* ── Import / Export ── */
export const getImportTemplateUrl = () => `${api.defaults.baseURL}${BASE}/import/template`;

export const downloadImportTemplate = () =>
    api.get(`${BASE}/import/template`, { responseType: 'blob' }).then((r) => r.data);

export const importPreview = (file: File, mapping?: Record<string, string>) => {
    const fd = new FormData();
    fd.append('file', file);
    if (mapping && Object.keys(mapping).length > 0) fd.append('mapping', JSON.stringify(mapping));
    return api.post(`${BASE}/import/preview`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data as ImportPreviewResponse);
};

export const importCommit = (file: File, mapping: Record<string, string>, mode: 'create' | 'upsert') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mapping', JSON.stringify(mapping));
    fd.append('mode', mode);
    return api.post(`${BASE}/import/commit`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data as ImportCommitResponse);
};

export const exportQuestions = async (
    filters: BankQuestionFilters,
    format: 'csv' | 'xlsx' = 'xlsx',
    proof?: SensitiveActionProof,
) =>
    api.get(`${BASE}/export`, {
        params: { ...filters, format },
        responseType: 'blob',
        headers: await resolveSensitiveActionHeaders({
            actionLabel: 'export question bank',
            defaultReason: 'Export question bank records',
            proof,
        }),
    }).then((r) => r.data);

export const exportPdf = (filters: BankQuestionFilters) =>
    api.get(`${BASE}/export/pdf`, {
        params: filters,
        responseType: 'blob',
    }).then((r) => r.data);

/* ── Sets ── */
export const listSets = () =>
    api.get(`${BASE}/sets`).then((r) => r.data as QuestionBankSet[]);

export const getSet = (id: string) =>
    api.get(`${BASE}/sets/${id}`).then((r) => r.data as QuestionBankSet);

export const createSet = (payload: Record<string, unknown>) =>
    api.post(`${BASE}/sets`, payload).then((r) => r.data as QuestionBankSet);

export const updateSet = (id: string, payload: Record<string, unknown>) =>
    api.put(`${BASE}/sets/${id}`, payload).then((r) => r.data as QuestionBankSet);

export const deleteSet = (id: string) =>
    api.delete(`${BASE}/sets/${id}`).then((r) => r.data);

export const resolveSetQuestions = (id: string) =>
    api.get(`${BASE}/sets/${id}/resolve`).then((r) => r.data as BankQuestion[]);

/* ── Exam Integration ── */
export const searchBankForExam = (examId: string, filters: BankQuestionFilters) =>
    api.get(`${BASE}/exam/${examId}/search`, { params: filters }).then((r) => r.data as BankQuestionListResponse);

export const attachBankToExam = (examId: string, bankQuestionIds: string[]) =>
    api.post(`${BASE}/exam/${examId}/attach`, { bankQuestionIds }).then((r) => r.data);

export const removeBankFromExam = (examId: string, questionId: string) =>
    api.delete(`${BASE}/exam/${examId}/questions/${questionId}`).then((r) => r.data);

export const reorderExamQuestions = (examId: string, orderMap: { id: string; orderIndex: number }[]) =>
    api.put(`${BASE}/exam/${examId}/reorder`, { orderMap }).then((r) => r.data);

export const finalizeExamSnapshot = (examId: string) =>
    api.post(`${BASE}/exam/${examId}/finalize`).then((r) => r.data);

/* ── Analytics ── */
export const getFacets = () =>
    api.get(`${BASE}/facets`).then((r) => r.data as BankQuestionFacets);

export const getAnalytics = (params?: Record<string, string>) =>
    api.get(`${BASE}/analytics`, { params }).then((r) => r.data as AnalyticsSummary);

export const refreshQuestionAnalytics = (id: string) =>
    api.post(`${BASE}/analytics/${id}/refresh`).then((r) => r.data);

export const refreshAllAnalytics = () =>
    api.post(`${BASE}/analytics/refresh-all`).then((r) => r.data);
