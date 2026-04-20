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
    api.get<{ data: QuestionBankSettings }>(`${BASE}/settings`).then((r) => r.data.data);

export const updateQBSettings = (payload: Partial<QuestionBankSettings>) =>
    api.put<{ data: QuestionBankSettings }>(`${BASE}/settings`, payload).then((r) => r.data.data);

/* ── CRUD ── */
export const listBankQuestions = (filters: BankQuestionFilters) =>
    api.get<{ data: BankQuestionListResponse }>(`${BASE}/questions`, { params: filters }).then((r) => r.data.data);

export const getBankQuestion = (id: string) =>
    api.get<{ data: BankQuestionDetail }>(`${BASE}/questions/${id}`).then((r) => r.data.data);

export const createBankQuestion = (payload: Record<string, unknown>) =>
    api.post<{ data: BankQuestion }>(`${BASE}/questions`, payload).then((r) => r.data.data);

export const updateBankQuestion = (id: string, payload: Record<string, unknown>) =>
    api.put<{ data: { question: BankQuestion; versioned: boolean } }>(`${BASE}/questions/${id}`, payload).then((r) => r.data.data);

export const deleteBankQuestion = (id: string) =>
    api.delete(`${BASE}/questions/${id}`).then((r) => r.data);

export const archiveBankQuestion = (id: string) =>
    api.post(`${BASE}/questions/${id}/archive`).then((r) => r.data.data);

export const restoreBankQuestion = (id: string) =>
    api.post(`${BASE}/questions/${id}/restore`).then((r) => r.data.data);

export const duplicateBankQuestion = (id: string) =>
    api.post<{ data: BankQuestion }>(`${BASE}/questions/${id}/duplicate`).then((r) => r.data.data);

/* ── Bulk ── */
export const bulkArchive = (ids: string[]) =>
    api.post(`${BASE}/bulk/archive`, { ids }).then((r) => r.data.data);

export const bulkActivate = (ids: string[], active: boolean) =>
    api.post(`${BASE}/bulk/activate`, { ids, active }).then((r) => r.data.data);

export const bulkUpdateTags = (ids: string[], tags: string[], mode: 'add' | 'set') =>
    api.post(`${BASE}/bulk/tags`, { ids, tags, mode }).then((r) => r.data.data);

export const bulkDelete = (ids: string[]) =>
    api.post(`${BASE}/bulk/delete`, { ids }).then((r) => r.data.data);

export const bulkCopy = (ids: string[]) =>
    api.post<{ data: { copied: number; newQuestions: BankQuestion[] } }>(`${BASE}/bulk/copy`, { ids }).then((r) => r.data.data);

/* ── Import / Export ── */
export const getImportTemplateUrl = () => `${api.defaults.baseURL}${BASE}/import/template`;

export const downloadImportTemplate = () =>
    api.get(`${BASE}/import/template`, { responseType: 'blob' }).then((r) => r.data);

export const importPreview = (file: File, mapping?: Record<string, string>) => {
    const fd = new FormData();
    fd.append('file', file);
    if (mapping) fd.append('mapping', JSON.stringify(mapping));
    return api.post<{ data: ImportPreviewResponse }>(`${BASE}/import/preview`, fd).then((r) => r.data.data);
};

export const importCommit = (file: File, mapping: Record<string, string>, mode: 'create' | 'upsert') => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mapping', JSON.stringify(mapping));
    fd.append('mode', mode);
    return api.post<{ data: ImportCommitResponse }>(`${BASE}/import/commit`, fd).then((r) => r.data.data);
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
    api.get<{ data: QuestionBankSet[] }>(`${BASE}/sets`).then((r) => r.data.data);

export const getSet = (id: string) =>
    api.get<{ data: QuestionBankSet }>(`${BASE}/sets/${id}`).then((r) => r.data.data);

export const createSet = (payload: Record<string, unknown>) =>
    api.post<{ data: QuestionBankSet }>(`${BASE}/sets`, payload).then((r) => r.data.data);

export const updateSet = (id: string, payload: Record<string, unknown>) =>
    api.put<{ data: QuestionBankSet }>(`${BASE}/sets/${id}`, payload).then((r) => r.data.data);

export const deleteSet = (id: string) =>
    api.delete(`${BASE}/sets/${id}`).then((r) => r.data);

export const resolveSetQuestions = (id: string) =>
    api.get<{ data: BankQuestion[] }>(`${BASE}/sets/${id}/resolve`).then((r) => r.data.data);

/* ── Exam Integration ── */
export const searchBankForExam = (examId: string, filters: BankQuestionFilters) =>
    api.get<{ data: BankQuestionListResponse }>(`${BASE}/exam/${examId}/search`, { params: filters }).then((r) => r.data.data);

export const attachBankToExam = (examId: string, bankQuestionIds: string[]) =>
    api.post(`${BASE}/exam/${examId}/attach`, { bankQuestionIds }).then((r) => r.data.data);

export const removeBankFromExam = (examId: string, questionId: string) =>
    api.delete(`${BASE}/exam/${examId}/questions/${questionId}`).then((r) => r.data);

export const reorderExamQuestions = (examId: string, orderMap: { id: string; orderIndex: number }[]) =>
    api.put(`${BASE}/exam/${examId}/reorder`, { orderMap }).then((r) => r.data.data);

export const finalizeExamSnapshot = (examId: string) =>
    api.post(`${BASE}/exam/${examId}/finalize`).then((r) => r.data.data);

/* ── Analytics ── */
export const getFacets = () =>
    api.get<{ data: BankQuestionFacets }>(`${BASE}/facets`).then((r) => r.data.data);

export const getAnalytics = (params?: Record<string, string>) =>
    api.get<{ data: AnalyticsSummary }>(`${BASE}/analytics`, { params }).then((r) => r.data.data);

export const refreshQuestionAnalytics = (id: string) =>
    api.post(`${BASE}/analytics/${id}/refresh`).then((r) => r.data.data);

export const refreshAllAnalytics = () =>
    api.post(`${BASE}/analytics/refresh-all`).then((r) => r.data.data);
