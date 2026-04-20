import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
    useFcTransactions, useFcCreateTransaction, useFcUpdateTransaction,
    useFcDeleteTransaction, useFcBulkApprove, useFcBulkMarkPaid,
    useFcTransaction,
} from '../../../hooks/useFinanceCenterQueries';
import type { FcTransaction, TransactionStatus, PaymentMethod, SourceType } from '../../../types/finance';
import {
    Plus, Search, Filter, Trash2, Eye, ChevronLeft, ChevronRight,
    Receipt, Clock, AlertCircle, CreditCard, X, Loader2,
} from 'lucide-react';
import { displayName } from '../../../utils/displayName';
import { showConfirmDialog } from '../../../lib/appDialog';

type Params = Record<string, string | number | boolean | undefined>;

function fmt(n: number) { return new Intl.NumberFormat('en-BD').format(n); }

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    refunded: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

const EXPENSE_SOURCES: SourceType[] = ['expense', 'sms_cost', 'email_cost', 'hosting_cost', 'staff_payout', 'other'];
const STATUS_OPTIONS: TransactionStatus[] = ['pending', 'approved', 'paid', 'cancelled'];
const METHOD_OPTIONS: PaymentMethod[] = ['cash', 'bkash', 'nagad', 'bank', 'card', 'manual', 'gateway', 'upay', 'rocket'];

export default function FinanceExpensesPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [showFilter, setShowFilter] = useState(false);
    const [filters, setFilters] = useState<Params>({});
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showCreate, setShowCreate] = useState(false);
    const [editTxn, setEditTxn] = useState<FcTransaction | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);

    const params: Params = {
        page, limit: 20, direction: 'expense',
        search: search || undefined, ...filters,
    };
    const { data, isLoading } = useFcTransactions(params);
    const createMut = useFcCreateTransaction();
    const updateMut = useFcUpdateTransaction();
    const deleteMut = useFcDeleteTransaction();
    const bulkApprove = useFcBulkApprove();
    const bulkMarkPaid = useFcBulkMarkPaid();

    const expenses = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / 20);

    /* ── Mini KPIs ── */
    const kpis = useMemo(() => {
        const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
        const unpaid = expenses.filter(t => t.status === 'approved').reduce((s, t) => s + t.amount, 0);
        const pendingCount = expenses.filter(t => t.status === 'pending').length;
        return { totalExpense, unpaid, pendingCount };
    }, [expenses]);

    const toggleSelect = useCallback((id: string) => {
        setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    }, []);
    const toggleAll = () => {
        if (selected.size === expenses.length) setSelected(new Set());
        else setSelected(new Set(expenses.map(t => t._id)));
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Expenses</h2>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                    <Plus size={14} /> New Expense
                </button>
            </div>

            {/* KPI mini row */}
            <div className="grid grid-cols-3 gap-3">
                <MiniKpi icon={<CreditCard size={15} className="text-red-500" />} label="Total Expense" value={`৳${fmt(kpis.totalExpense)}`} />
                <MiniKpi icon={<Clock size={15} className="text-amber-500" />} label="Unpaid" value={`৳${fmt(kpis.unpaid)}`} />
                <MiniKpi icon={<AlertCircle size={15} className="text-orange-500" />} label="Pending Approval" value={String(kpis.pendingCount)} />
            </div>

            {/* Search + filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search expense description, category..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                </div>
                <button onClick={() => setShowFilter(!showFilter)} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600 dark:text-white">
                    <Filter size={14} /> Filters
                </button>
            </div>

            {/* Filter panel */}
            {showFilter && (
                <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <FilterSelect label="Status" value={filters.status as string} options={STATUS_OPTIONS} onChange={v => { setFilters(p => ({ ...p, status: v || undefined })); setPage(1); }} />
                    <FilterSelect label="Source" value={filters.sourceType as string} options={EXPENSE_SOURCES} onChange={v => { setFilters(p => ({ ...p, sourceType: v || undefined })); setPage(1); }} />
                    <FilterSelect label="Method" value={filters.method as string} options={METHOD_OPTIONS} onChange={v => { setFilters(p => ({ ...p, method: v || undefined })); setPage(1); }} />
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium text-slate-500">From</label>
                        <input type="date" value={(filters.dateFrom as string) ?? ''} onChange={e => { setFilters(p => ({ ...p, dateFrom: e.target.value || undefined })); setPage(1); }}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium text-slate-500">To</label>
                        <input type="date" value={(filters.dateTo as string) ?? ''} onChange={e => { setFilters(p => ({ ...p, dateTo: e.target.value || undefined })); setPage(1); }}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    </div>
                    <button onClick={() => { setFilters({}); setPage(1); }} className="self-end rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Clear</button>
                </div>
            )}

            {/* Bulk actions */}
            {selected.size > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 dark:bg-indigo-900/20">
                    <span className="text-xs text-indigo-700 dark:text-indigo-300">{selected.size} selected</span>
                    <button onClick={() => bulkApprove.mutate([...selected], { onSuccess: () => setSelected(new Set()) })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">
                        Approve
                    </button>
                    <button onClick={() => bulkMarkPaid.mutate([...selected], { onSuccess: () => setSelected(new Set()) })} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">
                        Mark Paid
                    </button>
                </div>
            )}

            {/* Table (desktop) + Card list (mobile) */}
            {isLoading ? (
                <div className="py-12 text-center text-sm text-slate-500 animate-pulse">Loading...</div>
            ) : expenses.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">No expenses found.</div>
            ) : (
                <>
                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 sm:block dark:border-slate-700">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800">
                                <tr>
                                    <th className="px-3 py-2 text-left"><input type="checkbox" checked={selected.size === expenses.length && expenses.length > 0} onChange={toggleAll} /></th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Code</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Category</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Amount</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Source</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Status</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Method</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Date</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {expenses.map(t => (
                                    <tr key={t._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-3 py-2"><input type="checkbox" checked={selected.has(t._id)} onChange={() => toggleSelect(t._id)} /></td>
                                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{t.txnCode}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{t.categoryLabel}</td>
                                        <td className="px-3 py-2 text-right font-medium text-red-600 dark:text-red-400">৳{fmt(t.amount)}</td>
                                        <td className="px-3 py-2">
                                            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                {t.sourceType.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] ?? ''}`}>{t.status}</span></td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{t.method}</td>
                                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{new Date(t.dateUTC).toLocaleDateString()}</td>
                                        <td className="px-3 py-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => setDetailId(t._id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="View" aria-label="View details">
                                                    <Eye size={13} className="text-slate-500" />
                                                </button>
                                                <button onClick={() => setEditTxn(t)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit">
                                                    <Receipt size={13} className="text-blue-600" />
                                                </button>
                                                <button onClick={async () => {
                                                    const confirmed = await showConfirmDialog({
                                                        title: 'Delete expense',
                                                        message: 'Delete this expense?',
                                                        confirmLabel: 'Delete',
                                                        tone: 'danger',
                                                    });
                                                    if (confirmed) deleteMut.mutate(t._id);
                                                }} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="Delete">
                                                    <Trash2 size={13} className="text-red-500" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="space-y-2 sm:hidden">
                        {expenses.map(t => (
                            <div key={t._id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" checked={selected.has(t._id)} onChange={() => toggleSelect(t._id)} />
                                        <div>
                                            <p className="text-sm font-medium text-slate-800 dark:text-white">{t.categoryLabel}</p>
                                            <p className="text-[10px] text-slate-500">{t.txnCode} &middot; {t.sourceType.replace(/_/g, ' ')}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-bold text-red-600 dark:text-red-400">৳{fmt(t.amount)}</p>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] ?? ''}`}>{t.status}</span>
                                        <span className="text-[10px] text-slate-500">{t.method} &middot; {new Date(t.dateUTC).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => setDetailId(t._id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="View details"><Eye size={13} className="text-slate-500" /></button>
                                        <button onClick={() => setEditTxn(t)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><Receipt size={13} className="text-blue-600" /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Page {page} of {totalPages} ({total} total)</span>
                    <div className="flex gap-1">
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-600 dark:text-white"><ChevronLeft size={14} /></button>
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-600 dark:text-white"><ChevronRight size={14} /></button>
                    </div>
                </div>
            )}

            {/* Detail drawer */}
            {detailId && <ExpenseDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}

            {/* Create / Edit modal */}
            {(showCreate || editTxn) && (
                <ExpenseModal
                    txn={editTxn}
                    onClose={() => { setShowCreate(false); setEditTxn(null); }}
                    onSave={(data) => {
                        if (editTxn) updateMut.mutate({ id: editTxn._id, data }, { onSuccess: () => setEditTxn(null) });
                        else createMut.mutate(data as Partial<FcTransaction>, { onSuccess: () => setShowCreate(false) });
                    }}
                    saving={createMut.isPending || updateMut.isPending}
                />
            )}
        </div>
    );
}

/* ── Mini KPI card ──────────────────────────────────────── */
function MiniKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
            {icon}
            <div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{value}</p>
            </div>
        </div>
    );
}

/* ── Filter select ──────────────────────────────────────── */
function FilterSelect({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500">{label}</label>
            <select value={value ?? ''} onChange={e => onChange(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                <option value="">All</option>
                {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
        </div>
    );
}

/* ── Detail Drawer ──────────────────────────────────────── */
function ExpenseDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
    const { data, isLoading, isError, error } = useFcTransaction(id);
    const closeRef = useRef<HTMLButtonElement>(null);

    // Focus close button on mount
    useEffect(() => {
        closeRef.current?.focus();
    }, []);

    // Escape key handler
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const txn = (data as { data?: FcTransaction })?.data ?? data as FcTransaction | undefined;
    const is404 = isError && (error as { response?: { status?: number } })?.response?.status === 404;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Expense Details"
                className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl dark:bg-slate-900 sm:max-w-md"
                onClick={e => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-white">Expense Details</h3>
                    <button ref={closeRef} onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
                </div>

                {isLoading && (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 size={24} className="animate-spin text-indigo-500" />
                        <span className="ml-2 text-sm text-slate-500">Loading...</span>
                    </div>
                )}

                {isError && (
                    <div className="py-12 text-center text-sm text-slate-500">
                        {is404 ? 'Record not found.' : 'Failed to load details. Please try again.'}
                    </div>
                )}

                {txn && (
                    <dl className="space-y-3 text-sm">
                        <DetailRow label="Transaction Code" value={txn.txnCode} />
                        <DetailRow label="Direction" value={txn.direction} />
                        <DetailRow label="Amount" value={`${txn.currency ?? '৳'}${fmt(txn.amount)}`} />
                        <DetailRow label="Status" value={txn.status} />
                        <DetailRow label="Method" value={txn.method} />
                        <DetailRow label="Account Code" value={txn.accountCode} />
                        <DetailRow label="Category" value={txn.categoryLabel} />
                        <DetailRow label="Source Type" value={txn.sourceType?.replace(/_/g, ' ') ?? '—'} />
                        {txn.sourceId && <DetailRow label="Source ID" value={txn.sourceId} />}
                        <DetailRow label="Date" value={new Date(txn.dateUTC).toLocaleDateString()} />
                        {txn.description && <DetailRow label="Description" value={txn.description} />}
                        {txn.note && <DetailRow label="Note" value={txn.note} />}
                        <DetailRow label="Student" value={displayName(txn.studentId)} />
                        <DetailRow label="Vendor" value={displayName(txn.vendorId)} />
                        <DetailRow label="Created By" value={displayName(txn.createdByAdminId)} />
                        <DetailRow label="Approved By" value={displayName(txn.approvedByAdminId)} />
                        {txn.approvedAtUTC && <DetailRow label="Approved At" value={new Date(txn.approvedAtUTC).toLocaleDateString()} />}
                        {txn.paidAtUTC && <DetailRow label="Paid At" value={new Date(txn.paidAtUTC).toLocaleDateString()} />}
                        {txn.tags && txn.tags.length > 0 && <DetailRow label="Tags" value={txn.tags.join(', ')} />}
                        {txn.invoiceNo && <DetailRow label="Invoice No" value={txn.invoiceNo} />}
                        <DetailRow label="Deleted" value={txn.isDeleted ? 'Yes' : 'No'} />
                        <DetailRow label="Created" value={new Date(txn.createdAt).toLocaleDateString()} />
                        <DetailRow label="Updated" value={new Date(txn.updatedAt).toLocaleDateString()} />
                    </dl>
                )}
            </div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-slate-800 dark:text-white">{value}</dd>
        </div>
    );
}

/* ── Expense Modal ──────────────────────────────────────── */
function ExpenseModal({ txn, onClose, onSave, saving }: { txn: FcTransaction | null; onClose: () => void; onSave: (data: Partial<FcTransaction>) => void; saving: boolean }) {
    const [form, setForm] = useState<Partial<FcTransaction>>({
        direction: 'expense',
        amount: txn?.amount ?? 0,
        accountCode: txn?.accountCode ?? '',
        categoryLabel: txn?.categoryLabel ?? '',
        description: txn?.description ?? '',
        status: txn?.status ?? 'pending',
        method: txn?.method ?? 'cash',
        sourceType: txn?.sourceType ?? 'expense',
        dateUTC: txn?.dateUTC ? txn.dateUTC.slice(0, 10) : new Date().toISOString().slice(0, 10),
        note: txn?.note ?? '',
        tags: txn?.tags ?? [],
        vendorId: txn?.vendorId ?? '',
    });

    const set = (key: string, val: unknown) => setForm(p => ({ ...p, [key]: val }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
                <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-white">{txn ? 'Edit Expense' : 'New Expense'}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                    <InputField label="Amount (৳)" type="number" value={form.amount} onChange={v => set('amount', Number(v))} />
                    <InputField label="Account Code" value={form.accountCode} onChange={v => set('accountCode', v)} />
                    <InputField label="Category" value={form.categoryLabel} onChange={v => set('categoryLabel', v)} />
                    <SelectField label="Status" value={form.status!} options={STATUS_OPTIONS} onChange={v => set('status', v)} />
                    <SelectField label="Method" value={form.method!} options={METHOD_OPTIONS} onChange={v => set('method', v)} />
                    <SelectField label="Source" value={form.sourceType!} options={EXPENSE_SOURCES} onChange={v => set('sourceType', v)} />
                    <InputField label="Date" type="date" value={form.dateUTC?.slice(0, 10)} onChange={v => set('dateUTC', v)} />
                    <InputField label="Vendor ID" value={form.vendorId} onChange={v => set('vendorId', v)} />
                    <div className="sm:col-span-2">
                        <InputField label="Description" value={form.description} onChange={v => set('description', v)} />
                    </div>
                    <div className="sm:col-span-2">
                        <InputField label="Note" value={form.note} onChange={v => set('note', v)} />
                    </div>
                    <div className="sm:col-span-2">
                        <InputField label="Tags (comma separated)" value={(form.tags ?? []).join(', ')} onChange={v => set('tags', v.split(',').map(s => s.trim()).filter(Boolean))} />
                    </div>
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-1.5 text-xs dark:border-slate-600 dark:text-white">Cancel</button>
                    <button onClick={() => onSave({ ...form, direction: 'expense' })} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function InputField({ label, value, onChange, type = 'text' }: { label: string; value?: string | number; onChange: (v: string) => void; type?: string }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</label>
            <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
        </div>
    );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</label>
            <select value={value} onChange={e => onChange(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                {options.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
        </div>
    );
}
