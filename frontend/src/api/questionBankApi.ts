import api from '../services/api';
import type {
    ApiResponse,
    PaginatedResponse,
    CreateQuestionDto,
    UpdateQuestionDto,
    QuestionFilters,
    BulkActionDto,
    BulkResult,
    ReviewActionDto,
    ImportResult,
} from '../types/exam-system';

const BASE = '/v1/questions';

/** GET / — List/search questions with filters and pagination. */
export const listQuestions = (filters: QuestionFilters) =>
    api.get<PaginatedResponse<Record<string, unknown>>>(`${BASE}`, { params: filters }).then((r) => r.data);

/** POST / — Create a new question. */
export const createQuestion = (payload: CreateQuestionDto) =>
    api.post<ApiResponse<Record<string, unknown>>>(`${BASE}`, payload).then((r) => r.data);

/** GET /:id — Get a single question by ID. */
export const getQuestion = (id: string) =>
    api.get<ApiResponse<Record<string, unknown>>>(`${BASE}/${id}`).then((r) => r.data);

/** PUT /:id — Update a question. */
export const updateQuestion = (id: string, payload: UpdateQuestionDto) =>
    api.put<ApiResponse<Record<string, unknown>>>(`${BASE}/${id}`, payload).then((r) => r.data);

/** DELETE /:id — Archive (soft-delete) a question. */
export const archiveQuestion = (id: string) =>
    api.delete<ApiResponse<null>>(`${BASE}/${id}`).then((r) => r.data);

/** POST /bulk-action — Bulk operations on questions. */
export const bulkAction = (payload: BulkActionDto) =>
    api.post<ApiResponse<BulkResult>>(`${BASE}/bulk-action`, payload).then((r) => r.data);

/** POST /:id/review — Approve or reject a question. */
export const reviewQuestion = (id: string, payload: ReviewActionDto) =>
    api.post<ApiResponse<Record<string, unknown>>>(`${BASE}/${id}/review`, payload).then((r) => r.data);

/** POST /import — Import questions from a file (Excel/CSV/JSON). */
export const importQuestions = (file: File, mapping?: Record<string, string>) => {
    const fd = new FormData();
    fd.append('file', file);
    if (mapping && Object.keys(mapping).length > 0) {
        fd.append('mapping', JSON.stringify(mapping));
    }
    return api.post<ApiResponse<ImportResult>>(`${BASE}/import`, fd, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    }).then((r) => r.data);
};

/** GET /export — Export questions to Excel or CSV. */
export const exportQuestions = (filters: QuestionFilters, format: 'xlsx' | 'csv' = 'xlsx') =>
    api.get(`${BASE}/export`, {
        params: { ...filters, format },
        responseType: 'blob',
    }).then((r) => r.data);
