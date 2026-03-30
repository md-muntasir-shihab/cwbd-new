import {
  ApiListResponse,
  BackupRow,
  CurrentUserPayload,
  DueRow,
  ExpenseRow,
  FinanceSummary,
  NewsAppearanceConfig,
  NewsItem,
  NoticeRow,
  PaymentRow,
  PlanRow,
  RuntimeSettingsPayload,
  StaffPayoutRow,
  StudentDashboardProfile,
  StudentRow,
  TicketRow,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:5003';
const ADMIN_PATH = process.env.NEXT_PUBLIC_ADMIN_PATH || 'campusway-secure-admin';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH';

async function request<T>(url: string, token?: string, method: HttpMethod = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export async function getAdminStudents(token: string): Promise<ApiListResponse<StudentRow>> {
  return request<ApiListResponse<StudentRow>>(`/api/${ADMIN_PATH}/students?limit=20`, token);
}

export async function createAdminStudent(
  token: string,
  payload: {
    fullName: string;
    username: string;
    email: string;
    password?: string;
    phoneNumber?: string;
    status?: 'active' | 'suspended' | 'blocked' | 'pending';
    planCode?: string;
  },
): Promise<{ message?: string; student?: StudentRow; inviteSent?: boolean }> {
  return request<{ message?: string; student?: StudentRow; inviteSent?: boolean }>(
    `/api/${ADMIN_PATH}/students`,
    token,
    'POST',
    payload,
  );
}

export async function assignStudentPlan(
  token: string,
  studentId: string,
  payload: {
    planCode: string;
    isActive?: boolean;
    startDate?: string;
    expiryDate?: string;
    durationDays?: number;
  },
): Promise<{ message?: string }> {
  return request<{ message?: string }>(
    `/api/${ADMIN_PATH}/students/${studentId}/subscription`,
    token,
    'PUT',
    payload,
  );
}

export async function getCurrentUser(token: string): Promise<CurrentUserPayload> {
  return request<CurrentUserPayload>(`/api/auth/me`, token);
}

export async function getAdminPlans(token: string): Promise<ApiListResponse<PlanRow>> {
  return request<ApiListResponse<PlanRow>>(`/api/${ADMIN_PATH}/subscription-plans`, token);
}

export async function getFinanceSummary(token: string): Promise<FinanceSummary> {
  return request<FinanceSummary>(`/api/${ADMIN_PATH}/finance/summary`, token);
}

export async function getPayments(token: string): Promise<ApiListResponse<PaymentRow>> {
  return request<ApiListResponse<PaymentRow>>(`/api/${ADMIN_PATH}/payments?limit=20`, token);
}

export async function getExpenses(token: string): Promise<ApiListResponse<ExpenseRow>> {
  return request<ApiListResponse<ExpenseRow>>(`/api/${ADMIN_PATH}/expenses?limit=20`, token);
}

export async function getStaffPayouts(token: string): Promise<ApiListResponse<StaffPayoutRow>> {
  return request<ApiListResponse<StaffPayoutRow>>(`/api/${ADMIN_PATH}/staff-payouts?limit=20`, token);
}

export async function getDues(token: string): Promise<ApiListResponse<DueRow>> {
  return request<ApiListResponse<DueRow>>(`/api/${ADMIN_PATH}/dues?status=due&limit=20`, token);
}

export async function updateDue(
  token: string,
  studentId: string,
  payload: { computedDue: number; manualAdjustment?: number; waiverAmount?: number; note?: string },
): Promise<{ message?: string }> {
  return request<{ message?: string }>(
    `/api/${ADMIN_PATH}/dues/${studentId}`,
    token,
    'PATCH',
    payload,
  );
}

export async function sendDueReminder(token: string, studentId: string): Promise<{ message?: string }> {
  return request<{ message?: string }>(`/api/${ADMIN_PATH}/dues/${studentId}/remind`, token, 'POST', {});
}

export async function getNotices(token: string): Promise<ApiListResponse<NoticeRow>> {
  return request<ApiListResponse<NoticeRow>>(`/api/${ADMIN_PATH}/notices?limit=20`, token);
}

export async function getSupportTickets(token: string): Promise<ApiListResponse<TicketRow>> {
  return request<ApiListResponse<TicketRow>>(`/api/${ADMIN_PATH}/support-tickets?limit=20`, token);
}

export async function updateSupportTicketStatus(
  token: string,
  ticketId: string,
  status: 'open' | 'in_progress' | 'resolved' | 'closed',
): Promise<{ message?: string }> {
  return request<{ message?: string }>(
    `/api/${ADMIN_PATH}/support-tickets/${ticketId}/status`,
    token,
    'PATCH',
    { status },
  );
}

export async function replySupportTicket(
  token: string,
  ticketId: string,
  message: string,
): Promise<{ message?: string }> {
  return request<{ message?: string }>(
    `/api/${ADMIN_PATH}/support-tickets/${ticketId}/reply`,
    token,
    'POST',
    { message },
  );
}

export async function getBackups(token: string): Promise<ApiListResponse<BackupRow>> {
  return request<ApiListResponse<BackupRow>>(`/api/${ADMIN_PATH}/backups?limit=20`, token);
}

export async function runBackup(token: string, type: 'full' | 'incremental' = 'incremental', storage: 'local' | 's3' | 'both' = 'local'): Promise<{ message?: string }> {
  return request<{ message?: string }>(`/api/${ADMIN_PATH}/backups/run`, token, 'POST', { type, storage });
}

export async function restoreBackup(token: string, backupId: string, confirmation: string): Promise<{ message?: string }> {
  return request<{ message?: string }>(
    `/api/${ADMIN_PATH}/backups/${backupId}/restore`,
    token,
    'POST',
    { confirmation },
  );
}

export async function createPayment(
  token: string,
  payload: {
    studentId: string;
    amount: number;
    method: 'bkash' | 'cash' | 'manual' | 'bank';
    entryType?: 'subscription' | 'due_settlement' | 'other_income';
    reference?: string;
    notes?: string;
  },
): Promise<{ message?: string }> {
  return request<{ message?: string }>(`/api/${ADMIN_PATH}/payments`, token, 'POST', payload);
}

export async function createExpense(
  token: string,
  payload: {
    category: 'server' | 'marketing' | 'staff_salary' | 'moderator_salary' | 'tools' | 'misc';
    amount: number;
    vendor?: string;
    notes?: string;
  },
): Promise<{ message?: string }> {
  return request<{ message?: string }>(`/api/${ADMIN_PATH}/expenses`, token, 'POST', payload);
}

export async function getRuntimeSettings(token: string): Promise<RuntimeSettingsPayload> {
  return request<RuntimeSettingsPayload>(`/api/${ADMIN_PATH}/settings/runtime`, token);
}

export async function createSupportTicket(token: string, payload: { subject: string; message: string; priority?: 'low' | 'medium' | 'high' }): Promise<{ message?: string }> {
  return request<{ message?: string }>(`/api/student/support-tickets`, token, 'POST', payload);
}

export async function getStudentProfile(token: string): Promise<StudentDashboardProfile> {
  return request<StudentDashboardProfile>(`/api/student/dashboard-profile`, token);
}

export async function getStudentNotices(token: string): Promise<ApiListResponse<NoticeRow>> {
  return request<ApiListResponse<NoticeRow>>(`/api/student/notices`, token);
}

export async function getStudentSupportTickets(token: string): Promise<ApiListResponse<TicketRow>> {
  return request<ApiListResponse<TicketRow>>(`/api/student/support-tickets`, token);
}

export async function getNewsV2List(params: {
  page?: number;
  limit?: number;
  category?: string;
  search?: string;
} = {}): Promise<{ items: NewsItem[]; total: number; page: number; pages: number }> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.category && params.category !== 'All') query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  const qs = query.toString();
  return request<{ items: NewsItem[]; total: number; page: number; pages: number }>(`/api/news-v2/list${qs ? `?${qs}` : ''}`);
}

export async function getNewsV2BySlug(slug: string): Promise<{ item: NewsItem }> {
  return request<{ item: NewsItem }>(`/api/news-v2/${slug}`);
}

export async function getNewsV2Appearance(): Promise<{ appearance: NewsAppearanceConfig }> {
  return request<{ appearance: NewsAppearanceConfig }>(`/api/news-v2/config/appearance`);
}

export async function getNewsV2Widgets(): Promise<{ trending: NewsItem[]; categories: Array<{ _id: string; count: number }> }> {
  return request<{ trending: NewsItem[]; categories: Array<{ _id: string; count: number }> }>(`/api/news-v2/widgets`);
}
