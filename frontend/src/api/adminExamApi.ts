import api from "../services/api";

/* ─── Exams ─── */
export const listAdminExams = () => api.get("/admin/exams").then((r) => r.data.exams ?? r.data);
export const getAdminExam = (id: string) => api.get(`/admin/exams/${id}`).then((r) => r.data.exam ?? r.data);
export const createAdminExam = (payload: Record<string, unknown>) => api.post("/admin/exams", payload).then((r) => r.data);
export const updateAdminExam = (id: string, payload: Record<string, unknown>) => api.put(`/admin/exams/${id}`, payload).then((r) => r.data);
export const deleteAdminExam = (id: string) => api.delete(`/admin/exams/${id}`);

/* ─── Auto-Generate ─── */
export const autoGenerate = (params: Record<string, unknown>) =>
    api.post("/admin/exams/auto-generate", params).then((r) => r.data);

/* ─── Clone ─── */
export const cloneExam = (examId: string) =>
    api.post(`/admin/exams/${examId}/clone`).then((r) => r.data);

/* ─── Preview ─── */
export const getPreview = (examId: string) =>
    api.get(`/admin/exams/${examId}/preview`).then((r) => r.data);

/* ─── Questions ─── */
export const listAdminExamQuestions = (examId: string) => api.get(`/admin/exams/${examId}/questions`).then((r) => r.data.questions ?? r.data);
export const createAdminQuestion = (examId: string, payload: Record<string, unknown>) => api.post(`/admin/exams/${examId}/questions`, payload).then((r) => r.data);
export const updateAdminQuestion = (examId: string, questionId: string, payload: Record<string, unknown>) => api.put(`/admin/exams/${examId}/questions/${questionId}`, payload).then((r) => r.data);
export const deleteAdminQuestion = (examId: string, questionId: string) => api.delete(`/admin/exams/${examId}/questions/${questionId}`);
export const bulkAttachQuestions = (examId: string, questions: Array<{ bankQuestionId: string; marks: number; orderIndex: number }>) =>
    api.post(`/admin/exams/${examId}/questions/bulk-attach`, { questions }).then((r) => r.data);
export const reorderQuestions = (examId: string, order: Array<{ questionId: string; orderIndex: number }>) =>
    api.put(`/admin/exams/${examId}/questions/reorder`, { questions: order }).then((r) => r.data);
export const previewQuestionImport = (examId: string, rows: unknown[]) => api.post(`/admin/exams/${examId}/questions/import/preview`, { rows }).then((r) => r.data);
export const commitQuestionImport = (examId: string, rows: unknown[]) => api.post(`/admin/exams/${examId}/questions/import/commit`, { rows }).then((r) => r.data);

/* ─── Results ─── */
export const getAdminExamResults = (examId: string) => api.get(`/admin/exams/${examId}/results`).then((r) => r.data.results ?? r.data);
export const getAdminExamExports = (examId: string) => api.get(`/admin/exams/${examId}/exports`).then((r) => r.data);
export const publishExamResults = (examId: string) => api.patch(`/admin/exams/${examId}/publish-result`).then((r) => r.data);
export const resetStudentAttempt = (examId: string, userId: string) => api.post(`/admin/exams/${examId}/reset-attempt`, { userId }).then((r) => r.data);

/* ─── Payments ─── */
export const listAdminPayments = () => api.get("/admin/payments").then((r) => r.data);
export const verifyPayment = (paymentId: string, notes?: string) => api.put(`/admin/payments/${paymentId}/verify`, { notes }).then((r) => r.data);

/* ─── Students ─── */
export const listAdminStudents = () => api.get("/admin/students").then((r) => r.data);
export const importStudents = (rows: unknown[]) => api.post("/admin/students/import", { rows }).then((r) => r.data);

/* ─── Student Groups ─── */
export const listStudentGroups = () => api.get("/admin/student-groups").then((r) => r.data);
export const importStudentGroups = (rows: unknown[]) => api.post("/admin/student-groups/import", { rows }).then((r) => r.data);

/* ─── Question Bank ─── */
export const getQuestionBank = () => api.get("/admin/question-bank").then((r) => r.data);

/* ─── Template downloads ─── */
export const downloadQuestionTemplate = (examId: string) =>
    api.get(`/admin/exams/${examId}/questions/template.xlsx`, { responseType: 'blob' });

export const templateUrls = {
    questions: (examId: string) => `/api/admin/exams/${examId}/questions/template.xlsx`,
    students: () => "/api/admin/students/template.xlsx",
    studentGroups: () => "/api/admin/student-groups/template.xlsx",
};
