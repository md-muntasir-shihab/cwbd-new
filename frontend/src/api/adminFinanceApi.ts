/* ─── Finance Center API Layer ──────────────────────────── */
import api, { resolveSensitiveActionHeaders, type SensitiveActionProof } from '../services/api';
import { downloadFile } from '../utils/download';
import type {
    FcTransaction, FcInvoice, FcBudget, FcRecurringRule,
    FcChartOfAccount, FcVendor, FcSettings, FcRefund,
    FcDashboardSummary, FcAuditLog, FcPaginatedResponse,
} from '../types/finance';

const ADMIN_PATH = String(import.meta.env.VITE_ADMIN_PATH || 'campusway-secure-admin').replace(/^\/+|\/+$/g, '');
const FC = `/${ADMIN_PATH}/fc`;

type Params = Record<string, string | number | boolean | undefined>;

function qs(params: Params): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
    if (entries.length === 0) return '';
    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

// ── Dashboard ───────────────────────────────────────────
export const fcApi = {
    getDashboard: (month?: string) =>
        api.get<{ ok: boolean; data: FcDashboardSummary }>(`${FC}/dashboard${qs({ month })}`).then(r => r.data.data),

    // ── Transactions ────────────────────────────────────
    getTransactions: (p: Params = {}) =>
        api.get<FcPaginatedResponse<FcTransaction>>(`${FC}/transactions${qs(p)}`).then(r => r.data),
    getTransaction: (id: string) =>
        api.get<{ data: FcTransaction }>(`${FC}/transactions/${id}`).then(r => r.data),
    createTransaction: (data: Partial<FcTransaction>) =>
        api.post<{ data: FcTransaction }>(`${FC}/transactions`, data).then(r => r.data),
    updateTransaction: (id: string, data: Partial<FcTransaction>) =>
        api.put<{ data: FcTransaction }>(`${FC}/transactions/${id}`, data).then(r => r.data),
    deleteTransaction: (id: string) =>
        api.delete(`${FC}/transactions/${id}`).then(r => r.data),
    restoreTransaction: (id: string) =>
        api.post(`${FC}/transactions/${id}/restore`).then(r => r.data),
    bulkApprove: (ids: string[]) =>
        api.post(`${FC}/transactions/bulk-approve`, { ids }).then(r => r.data),
    bulkMarkPaid: (ids: string[]) =>
        api.post(`${FC}/transactions/bulk-mark-paid`, { ids }).then(r => r.data),

    // ── Invoices ────────────────────────────────────────
    getInvoices: (p: Params = {}) =>
        api.get<FcPaginatedResponse<FcInvoice>>(`${FC}/invoices${qs(p)}`).then(r => r.data),
    getInvoice: (id: string) =>
        api.get<{ data: FcInvoice }>(`${FC}/invoices/${id}`).then(r => r.data),
    createInvoice: (data: Partial<FcInvoice>) =>
        api.post<{ data: FcInvoice }>(`${FC}/invoices`, data).then(r => r.data),
    updateInvoice: (id: string, data: Partial<FcInvoice>) =>
        api.put<{ data: FcInvoice }>(`${FC}/invoices/${id}`, data).then(r => r.data),
    markInvoicePaid: (id: string, paidAmount?: number) =>
        api.post<{ data: FcInvoice }>(`${FC}/invoices/${id}/mark-paid`, { paidAmount }).then(r => r.data),

    // ── Budgets ─────────────────────────────────────────
    getBudgets: (p: Params = {}) =>
        api.get<FcPaginatedResponse<FcBudget>>(`${FC}/budgets${qs(p)}`).then(r => r.data),
    createBudget: (data: Partial<FcBudget>) =>
        api.post<{ data: FcBudget }>(`${FC}/budgets`, data).then(r => r.data),
    updateBudget: (id: string, data: Partial<FcBudget>) =>
        api.put<{ data: FcBudget }>(`${FC}/budgets/${id}`, data).then(r => r.data),
    deleteBudget: (id: string) =>
        api.delete(`${FC}/budgets/${id}`).then(r => r.data),

    // ── Recurring Rules ─────────────────────────────────
    getRecurringRules: (p: Params = {}) =>
        api.get<FcPaginatedResponse<FcRecurringRule>>(`${FC}/recurring-rules${qs(p)}`).then(r => r.data),
    createRecurringRule: (data: Partial<FcRecurringRule>) =>
        api.post<{ data: FcRecurringRule }>(`${FC}/recurring-rules`, data).then(r => r.data),
    updateRecurringRule: (id: string, data: Partial<FcRecurringRule>) =>
        api.put<{ data: FcRecurringRule }>(`${FC}/recurring-rules/${id}`, data).then(r => r.data),
    deleteRecurringRule: (id: string) =>
        api.delete(`${FC}/recurring-rules/${id}`).then(r => r.data),
    runRecurringRuleNow: (id: string) =>
        api.post(`${FC}/recurring-rules/${id}/run-now`).then(r => r.data),

    // ── Chart of Accounts ───────────────────────────────
    getChartOfAccounts: () =>
        api.get<{ data: FcChartOfAccount[] }>(`${FC}/chart-of-accounts`).then(r => r.data),
    createAccount: (data: Partial<FcChartOfAccount>) =>
        api.post<{ data: FcChartOfAccount }>(`${FC}/chart-of-accounts`, data).then(r => r.data),

    // ── Vendors ─────────────────────────────────────────
    getVendors: (p: Params = {}) =>
        api.get<FcPaginatedResponse<FcVendor>>(`${FC}/vendors${qs(p)}`).then(r => r.data),
    createVendor: (data: Partial<FcVendor>) =>
        api.post<{ data: FcVendor }>(`${FC}/vendors`, data).then(r => r.data),

    // ── Settings ────────────────────────────────────────
    getSettings: () =>
        api.get<{ ok: boolean; data: FcSettings }>(`${FC}/settings`).then(r => r.data.data),
    updateSettings: (data: Partial<FcSettings>) =>
        api.put<{ ok: boolean; data: FcSettings }>(`${FC}/settings`, data).then(r => r.data.data),

    // ── Refunds ─────────────────────────────────────────
    getRefunds: (p: Params = {}) =>
        api.get<FcPaginatedResponse<FcRefund>>(`${FC}/refunds${qs(p)}`).then(r => r.data),
    createRefund: (data: { originalPaymentId?: string; financeTxnId?: string; studentId?: string; amountBDT: number; reason: string }) =>
        api.post<{ data: FcRefund }>(`${FC}/refunds`, data).then(r => r.data),
    processRefund: (id: string, action: 'approve' | 'reject', rejectionNote?: string) =>
        api.post<{ data: FcRefund }>(`${FC}/refunds/${id}/process`, { action, rejectionNote }).then(r => r.data),

    // ── Audit Logs ──────────────────────────────────────
    getAuditLogs: (p: Params = {}) =>
        api.get<FcPaginatedResponse<FcAuditLog>>(`${FC}/audit-logs${qs(p)}`).then(r => r.data),
    getAuditLogDetail: (id: string) =>
        api.get<{ data: FcAuditLog }>(`${FC}/audit-logs/${id}`).then(r => r.data),

    // ── Export / Import ─────────────────────────────────
    exportTransactions: async (p: Params = {}, proof?: SensitiveActionProof) =>
        api.get(`${FC}/export${qs({
            ...p,
            dateFrom: p.dateFrom ?? p.from,
            dateTo: p.dateTo ?? p.to,
        })}`, {
            responseType: 'blob',
            headers: await resolveSensitiveActionHeaders({
                actionLabel: 'export finance transactions',
                defaultReason: 'Export finance transaction records',
                requireOtpHint: true,
                proof,
            }),
        }),
    downloadImportTemplate: () =>
        api.get(`${FC}/import-template`, { responseType: 'blob' }),
    importPreview: (file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        return api.post(`${FC}/import-preview`, fd).then(r => r.data);
    },
    importCommit: (payload: { rows: unknown[]; mapping?: Record<string, string> }) =>
        api.post(`${FC}/import-commit`, payload).then(r => r.data),

    // ── P&L Report PDF ──────────────────────────────────
    downloadPLReport: async (month?: string, proof?: SensitiveActionProof) => {
        const url = `${FC}/report.pdf${qs({ month })}`;
        return api.get(url, {
            responseType: 'blob',
            headers: await resolveSensitiveActionHeaders({
                actionLabel: 'download finance profit and loss report',
                defaultReason: 'Download finance profit and loss report',
                requireOtpHint: true,
                proof,
            }),
        }).then(r => {
            downloadFile(r, { filename: `PL-Report-${month || 'current'}.pdf` });
        });
    },
};
