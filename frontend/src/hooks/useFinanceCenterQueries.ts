import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fcApi } from '../api/adminFinanceApi';

type Params = Record<string, string | number | boolean | undefined>;

const K = {
    dashboard: (m?: string) => ['fc', 'dashboard', m] as const,
    transactions: (p: Params) => ['fc', 'transactions', p] as const,
    transaction: (id: string) => ['fc', 'transaction', id] as const,
    invoices: (p: Params) => ['fc', 'invoices', p] as const,
    budgets: (p: Params) => ['fc', 'budgets', p] as const,
    recurring: (p: Params) => ['fc', 'recurring', p] as const,
    coa: () => ['fc', 'coa'] as const,
    vendors: (p: Params) => ['fc', 'vendors', p] as const,
    settings: () => ['fc', 'settings'] as const,
    refunds: (p: Params) => ['fc', 'refunds', p] as const,
    auditLogs: (p: Params) => ['fc', 'audit-logs', p] as const,
    auditLog: (id: string) => ['fc', 'audit-log', id] as const,
    invoice: (id: string) => ['fc', 'invoice', id] as const,
};

// ── Dashboard ───────────────────────────────────────────
export function useFcDashboard(month?: string) {
    return useQuery({
        queryKey: K.dashboard(month),
        queryFn: () => fcApi.getDashboard(month),
        staleTime: 60_000,
    });
}

// ── Transactions ────────────────────────────────────────
export function useFcTransactions(params: Params = {}) {
    return useQuery({
        queryKey: K.transactions(params),
        queryFn: () => fcApi.getTransactions(params),
    });
}

export function useFcTransaction(id: string) {
    return useQuery({
        queryKey: K.transaction(id),
        queryFn: () => fcApi.getTransaction(id),
        enabled: !!id,
    });
}

export function useFcCreateTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.createTransaction,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcUpdateTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof fcApi.updateTransaction>[1] }) =>
            fcApi.updateTransaction(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcDeleteTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.deleteTransaction,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcRestoreTransaction() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.restoreTransaction,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcBulkApprove() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.bulkApprove,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcBulkMarkPaid() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.bulkMarkPaid,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

// ── Invoices ────────────────────────────────────────────
export function useFcInvoices(params: Params = {}) {
    return useQuery({
        queryKey: K.invoices(params),
        queryFn: () => fcApi.getInvoices(params),
    });
}

export function useFcCreateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.createInvoice,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcUpdateInvoice() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof fcApi.updateInvoice>[1] }) =>
            fcApi.updateInvoice(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcMarkInvoicePaid() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, paidAmount }: { id: string; paidAmount?: number }) =>
            fcApi.markInvoicePaid(id, paidAmount),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcInvoiceDetail(id: string) {
    return useQuery({
        queryKey: K.invoice(id),
        queryFn: () => fcApi.getInvoice(id),
        enabled: !!id,
    });
}

// ── Budgets ─────────────────────────────────────────────
export function useFcBudgets(params: Params = {}) {
    return useQuery({
        queryKey: K.budgets(params),
        queryFn: () => fcApi.getBudgets(params),
    });
}

export function useFcCreateBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.createBudget,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcUpdateBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof fcApi.updateBudget>[1] }) =>
            fcApi.updateBudget(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcDeleteBudget() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.deleteBudget,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

// ── Recurring Rules ─────────────────────────────────────
export function useFcRecurringRules(params: Params = {}) {
    return useQuery({
        queryKey: K.recurring(params),
        queryFn: () => fcApi.getRecurringRules(params),
    });
}

export function useFcCreateRecurringRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.createRecurringRule,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcUpdateRecurringRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof fcApi.updateRecurringRule>[1] }) =>
            fcApi.updateRecurringRule(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcDeleteRecurringRule() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.deleteRecurringRule,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcRunRecurringRuleNow() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.runRecurringRuleNow,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

// ── Chart of Accounts ───────────────────────────────────
export function useFcChartOfAccounts() {
    return useQuery({
        queryKey: K.coa(),
        queryFn: fcApi.getChartOfAccounts,
        staleTime: 5 * 60_000,
    });
}

export function useFcCreateAccount() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.createAccount,
        onSuccess: () => { qc.invalidateQueries({ queryKey: K.coa() }); },
    });
}

// ── Vendors ─────────────────────────────────────────────
export function useFcVendors(params: Params = {}) {
    return useQuery({
        queryKey: K.vendors(params),
        queryFn: () => fcApi.getVendors(params),
    });
}

export function useFcCreateVendor() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.createVendor,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

// ── Settings ────────────────────────────────────────────
export function useFcSettings() {
    return useQuery({
        queryKey: K.settings(),
        queryFn: fcApi.getSettings,
        staleTime: 5 * 60_000,
    });
}

export function useFcUpdateSettings() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.updateSettings,
        onSuccess: () => { qc.invalidateQueries({ queryKey: K.settings() }); },
    });
}

// ── Refunds ─────────────────────────────────────────────
export function useFcRefunds(params: Params = {}) {
    return useQuery({
        queryKey: K.refunds(params),
        queryFn: () => fcApi.getRefunds(params),
    });
}

export function useFcCreateRefund() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fcApi.createRefund,
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

export function useFcProcessRefund() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, action, rejectionNote }: { id: string; action: 'approve' | 'reject'; rejectionNote?: string }) =>
            fcApi.processRefund(id, action, rejectionNote),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}

// ── Audit Logs ──────────────────────────────────────────
export function useFcAuditLogs(params: Params = {}) {
    return useQuery({
        queryKey: K.auditLogs(params),
        queryFn: () => fcApi.getAuditLogs(params),
    });
}

export function useFcAuditLogDetail(id: string) {
    return useQuery({
        queryKey: K.auditLog(id),
        queryFn: () => fcApi.getAuditLogDetail(id),
        enabled: !!id,
    });
}

// ── Import ──────────────────────────────────────────────
export function useFcImportPreview() {
    return useMutation({ mutationFn: (file: File) => fcApi.importPreview(file) });
}

export function useFcImportCommit() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { rows: unknown[]; mapping?: Record<string, string> }) => fcApi.importCommit(payload),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['fc'] }); },
    });
}
