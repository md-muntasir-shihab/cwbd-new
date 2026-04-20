import api, {
  buildSensitiveActionHeaders,
  resolveSensitiveActionHeaders,
  type SensitiveActionProof,
} from '../services/api';
import type { AdminStudentUnifiedPayload } from '../types/studentManagement';

// ─── Unified Student Detail (Student Management OS) ──────────────────────
export const getStudentUnified = (id: string): Promise<AdminStudentUnifiedPayload> =>
  api.get(`/admin/students-v2/${id}/unified`).then(r => r.data);

// ─── Extended Profile (exam history, analytics, device/IP info) ──────────
export const getStudentExtendedProfile = (id: string) =>
  api.get(`/admin/students/${id}/extended-profile`).then(r => r.data);

// ─── Metrics ──────────────────────────────────────────────────────────────
export const getStudentMetrics = () =>
  api.get('/admin/students-v2/metrics').then(r => r.data);

// Students
export const getStudentsList = (filters: {
  q?: string; status?: string; group?: string; page?: number; limit?: number;
  profileScoreMin?: number; subscriptionStatus?: string; expiringDays?: number;
  department?: string; sscBatch?: string; hscBatch?: string;
  guardianStatus?: string; hasPaymentDue?: boolean;
  sortBy?: string; sortOrder?: string;
}) => api.get('/admin/students-v2', { params: filters }).then(r => r.data);

export const getStudentById = (id: string) =>
  api.get(`/admin/students-v2/${id}`).then(r => r.data);

export const createStudent = (data: {
  full_name: string; email: string; password: string;
  phone_number?: string; department?: string; ssc_batch?: string; hsc_batch?: string;
  college_name?: string; guardian_name?: string; guardian_phone?: string; guardian_email?: string;
  gender?: string; dob?: string; district?: string; present_address?: string;
  planId?: string; sendCredentials?: boolean;
  groupIds?: string[];
  paymentAmount?: number; paymentMethod?: string; recordPayment?: boolean;
}) => api.post('/admin/students-v2/create', data).then(r => r.data);

export const updateStudent = (id: string, data: Record<string, unknown>) =>
  api.put(`/admin/students-v2/${id}`, data).then(r => r.data);

export const suspendStudent = (id: string) =>
  api.post(`/admin/students-v2/${id}/suspend`).then(r => r.data);

export const activateStudent = (id: string) =>
  api.post(`/admin/students-v2/${id}/activate`).then(r => r.data);

export const resetStudentPassword = (id: string, data: { newPassword: string }) =>
  api.post(`/admin/students-v2/${id}/reset-password`, data).then(r => r.data);

export const bulkDeleteStudents = (ids: string[]) =>
  api.post('/admin/students-v2/bulk-delete', { ids }).then(r => r.data);

export const bulkUpdateStudents = (ids: string[], update: Record<string, unknown>) =>
  api.post('/admin/students-v2/bulk-update', { ids, update }).then(r => r.data);

export const exportStudents = async (filters: Record<string, unknown>, format: 'csv' | 'xlsx') => {
  const headers = await resolveSensitiveActionHeaders({
    actionLabel: 'export student records',
    defaultReason: 'Student records export',
    requireOtpHint: true,
  });

  return api.get('/admin/students-v2/export', {
    params: { ...filters, format },
    responseType: 'blob',
    headers,
  }).then(r => r.data as Blob);
};

export const importStudentsPreview = (formData: FormData) =>
  api.post('/admin/students-v2/import/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);

export const importStudentsCommit = (data: {
  mode: string; dedupeField: string; mapping: Record<string, string>; rows: Record<string, string>[];
}) => api.post('/admin/students-v2/import/commit', data).then(r => r.data);

// Groups
export const getStudentGroups = (q?: string) =>
  api.get('/admin/student-groups', { params: { q } }).then(r => r.data);

export const getStudentGroupDetail = (id: string) =>
  api.get(`/admin/student-groups/${id}`).then(r => r.data);

export const getStudentGroupMetrics = (id: string) =>
  api.get(`/admin/student-groups/${id}/metrics`).then(r => r.data);

export const getStudentGroupMembers = (id: string, params?: { page?: number; limit?: number; q?: string }) =>
  api.get(`/admin/student-groups/${id}/members`, { params }).then(r => r.data);

export const createStudentGroup = (data: Record<string, unknown>) =>
  api.post('/admin/student-groups', data).then(r => r.data);

export const updateStudentGroup = (id: string, data: Record<string, unknown>) =>
  api.put(`/admin/student-groups/${id}`, data).then(r => r.data);

export const deleteStudentGroup = (id: string) =>
  api.delete(`/admin/student-groups/${id}`).then(r => r.data);

export const canDeleteStudentGroup = (id: string) =>
  api.get(`/admin/student-groups/${id}/can-delete`).then(r => r.data);

export const exportStudentGroups = (params: { q?: string; format?: 'csv' | 'xlsx' } = {}) =>
  api.get('/admin/student-groups/export', {
    params: { ...params, format: params.format || 'xlsx' },
    responseType: 'blob',
  }).then(r => r.data as Blob);

export const bulkUpdateStudentGroups = (ids: string[], update: Record<string, unknown>) =>
  api.post('/admin/student-groups/bulk-update', { ids, update }).then(r => r.data);

export const bulkDeleteStudentGroups = (ids: string[]) =>
  api.post('/admin/student-groups/bulk-delete', { ids }).then(r => r.data);

export const addGroupMembers = (groupId: string, studentIds: string[]) =>
  api.post(`/admin/student-groups/${groupId}/members/add`, { studentIds }).then(r => r.data);

export const removeGroupMembers = (groupId: string, studentIds: string[]) =>
  api.post(`/admin/student-groups/${groupId}/members/remove`, { studentIds }).then(r => r.data);

export const moveGroupMembers = (groupId: string, studentIds: string[], targetGroupId: string) =>
  api.post(`/admin/student-groups/${groupId}/members/move`, { studentIds, targetGroupId }).then(r => r.data);

export const exportGroupMembers = (groupId: string, format: 'csv' | 'xlsx' = 'csv') =>
  api.get(`/admin/student-groups/${groupId}/members/export`, { params: { format }, responseType: 'blob' }).then(r => r.data as Blob);

export const downloadMemberImportTemplate = () =>
  api.get('/admin/student-groups/members/template', { responseType: 'blob' }).then(r => r.data as Blob);

export const importGroupMembersPreview = (groupId: string, formData: FormData) =>
  api.post(`/admin/student-groups/${groupId}/members/import/preview`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);

export const importGroupMembersCommit = (groupId: string, studentIds: string[]) =>
  api.post(`/admin/student-groups/${groupId}/members/import/commit`, { studentIds }).then(r => r.data);

// Subscriptions
export const getSubscriptions = (filters: { status?: string; q?: string; page?: number; limit?: number }) =>
  api.get('/admin/subscriptions-v2', { params: filters }).then(r => r.data);

export const assignSubscription = (studentId: string, data: { planId: string; startDate?: string; notes?: string }) =>
  api.post(`/admin/subscriptions-v2/users/${studentId}/assign`, data).then(r => r.data);

export const extendSubscription = (studentId: string, days: number, notes?: string) =>
  api.post(`/admin/subscriptions-v2/users/${studentId}/extend`, { days, notes }).then(r => r.data);

export const expireSubscriptionNow = (studentId: string) =>
  api.post(`/admin/subscriptions-v2/users/${studentId}/expire-now`).then(r => r.data);

export const toggleAutoRenew = (studentId: string) =>
  api.post(`/admin/subscriptions-v2/users/${studentId}/toggle-auto-renew`).then(r => r.data);

// Notification Providers
export const getProviders = () =>
  api.get('/admin/notification-providers').then(r => r.data);

export const createProvider = (data: Record<string, unknown>, proof?: SensitiveActionProof) =>
  api.post('/admin/notification-providers', data, { headers: buildSensitiveActionHeaders(proof) }).then(r => r.data);

export const updateProvider = (id: string, data: Record<string, unknown>, proof?: SensitiveActionProof) =>
  api.put(`/admin/notification-providers/${id}`, data, { headers: buildSensitiveActionHeaders(proof) }).then(r => r.data);

export const deleteProvider = (id: string, proof?: SensitiveActionProof) =>
  api.delete(`/admin/notification-providers/${id}`, { headers: buildSensitiveActionHeaders(proof) }).then(r => r.data);

export const testProvider = (id: string, studentId: string) =>
  api.post(`/admin/notification-providers/${id}/test-send`, { studentId }).then(r => r.data);

// Notification Templates
export const getTemplates = () =>
  api.get('/admin/notification-templates').then(r => r.data);

export const createTemplate = (data: Record<string, unknown>) =>
  api.post('/admin/notification-templates', data).then(r => r.data);

export const updateTemplate = (id: string, data: Record<string, unknown>) =>
  api.put(`/admin/notification-templates/${id}`, data).then(r => r.data);

export const deleteTemplate = (id: string) =>
  api.delete(`/admin/notification-templates/${id}`).then(r => r.data);

// Send Notification
export const sendNotification = (data: Record<string, unknown>) =>
  api.post('/admin/notifications-v2/send', data).then(r => r.data);

export const getNotificationJobs = (page?: number) =>
  api.get('/admin/notifications-v2/jobs', { params: { page } }).then(r => r.data);

export const getNotificationLogs = (filters: Record<string, unknown>) =>
  api.get('/admin/notifications-v2/logs', { params: filters }).then(r => r.data);

export const retryFailedJob = (jobId: string) =>
  api.post(`/admin/notifications-v2/jobs/${jobId}/retry-failed`).then(r => r.data);

// Contact Timeline
export const getContactTimeline = (studentId: string) =>
  api.get(`/admin/student-contact-timeline/${studentId}`).then(r => r.data);

export const addTimelineEntry = (studentId: string, data: { type: string; content: string; linkedId?: string }) =>
  api.post(`/admin/student-contact-timeline/${studentId}`, data).then(r => r.data);

export const deleteTimelineEntry = (studentId: string, entryId: string) =>
  api.delete(`/admin/student-contact-timeline/${studentId}/${entryId}`).then(r => r.data);

// Student Settings
export const getStudentSettings = () =>
  api.get('/admin/student-settings').then(r => r.data);

export const updateStudentSettings = (data: Record<string, unknown>) =>
  api.put('/admin/student-settings', data).then(r => r.data);

// ─── Audience Segments ────────────────────────────────────────────────────
export const getAudienceSegments = (q?: string) =>
  api.get('/admin/audience-segments', { params: { q } }).then(r => r.data);

export const createAudienceSegment = (data: { name: string; description?: string; rules: Record<string, unknown> }) =>
  api.post('/admin/audience-segments', data).then(r => r.data);

export const previewAudienceSegment = (rules: Record<string, unknown>) =>
  api.post('/admin/audience-segments/preview', { rules }).then(r => r.data);

export const deleteAudienceSegment = (id: string) =>
  api.delete(`/admin/audience-segments/${id}`).then(r => r.data);

// ─── Finance Adjustment ──────────────────────────────────────────────────
export const createFinanceAdjustment = (studentId: string, data: {
  amount: number; direction: 'income' | 'expense'; description: string;
  method?: string; categoryLabel?: string;
}) => api.post(`/admin/students-v2/${studentId}/finance-adjustment`, data).then(r => r.data);

// ─── Student Payment History ─────────────────────────────────────────────
export const getStudentPayments = (studentId: string) =>
  api.get(`/admin/students-v2/${studentId}/payments`).then(r => r.data);

// ─── Student Finance Statement ───────────────────────────────────────────
export const getStudentFinanceStatement = (studentId: string) =>
  api.get(`/admin/students-v2/${studentId}/finance-statement`).then(r => r.data);

// ─── Weak Topics Report ─────────────────────────────────────────────────
export const getWeakTopicsReport = () =>
  api.get('/admin/students-v2/weak-topics-report').then(r => r.data);

// ─── Import/Export Logs ──────────────────────────────────────────────────
export const getImportExportLogs = (filters?: { direction?: string; category?: string; page?: number }) =>
  api.get('/admin/import-export-logs', { params: filters }).then(r => r.data);
