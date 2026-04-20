import { useState, useCallback, useRef, useEffect } from 'react';
import {
    useFcTransactions, useFcCreateTransaction, useFcUpdateTransaction,
    useFcDeleteTransaction, useFcRestoreTransaction, useFcBulkApprove, useFcBulkMarkPaid,
    useFcTransaction,
} from '../../../hooks/useFinanceCenterQueries';
import type { FcTransaction, TransactionDirection, TransactionStatus, PaymentMethod, SourceType } from '../../../types/finance';
import { Plus, Trash2, Pencil, RotateCcw, Search, Filter, ChevronLeft, ChevronRight, Eye, X, Link2, Loader2 } from 'lucide-react';
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

const SOURCE_BADGE_COLORS: Record<string, string> = {
    subscription_payment: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    exam_payment: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
    service_sale: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    manual_income: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    expense: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    refund: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    sms_cost: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    email_cost: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    hosting_cost: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    staff_payout: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    other: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

const DIRECTION_OPTIONS: TransactionDirection[] = ['income', 'expense'];
const STATUS_OPTIONS: TransactionStatus[] = ['pending', 'approved', 'paid', 'cancelled', 'refunded'];
const METHOD_OPTIONS: PaymentMethod[] = ['cash', 'bkash', 'nagad', 'bank', 'card', 'manual', 'gateway', 'upay', 'rocket'];
const SOURCE_OPTIONS: SourceType[] = ['subscription_payment', 'exam_payment', 'service_sale', 'manual_income', 'expense', 'refund', 'sms_cost', 'email_cost', 'hosting_cost', 'staff_payout', 'other'];

export default function FinanceTransactionsPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<Params>({});
    const [showFilter, setShowFilter] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [editTxn, setEditTxn] = useState<FcTransaction | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [showDeleted, setShowDeleted] = useState(false);

    const params: Params = { page, limit: 20, search: search || undefined, showDeleted: showDeleted || undefined, ...filters };
    const { data, isLoading } = useFcTransactions(params);
    const createMut = useFcCreateTransaction();
    const updateMut = useFcUpdateTransaction();
    const deleteMut = useFcDeleteTransaction();
    const restoreMut = useFcRestoreTransaction();
    const bulkApprove = useFcBulkApprove();
    const bulkMarkPaid = useFcBulkMarkPaid();

    const txns = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / 20);

    const toggleSelect = useCallback((id: string) => {
        setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    }, []);
    const toggleAll = () => {
        if (selected.size === txns.length) setSelected(new Set());
        else setSelected(new Set(txns.map(t => t._id)));
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Transactions</h2>
                <div className="flex gap-2">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                            <Plus size={14} /> New
                        </button>
                    </div>
                </div>
            </div>

            {/* Search + filter bar */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search txnCode, description..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowFilter(!showFilter)} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600 dark:text-white">
                        <Filter size={14} /> Filters
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                        <input type="checkbox" checked={showDeleted} onChange={e => { setShowDeleted(e.target.checked); setPage(1); }} />
                        Show deleted
                    </label>
                </div>
            </div>

            {/* Filter panel */}
            {showFilter && (
                <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <FilterSelect label="Direction" value={filters.direction as string} options={DIRECTION_OPTIONS} onChange={v => { setFilters(p => ({ ...p, direction: v || undefined })); setPage(1); }} />
                    <FilterSelect label="Status" value={filters.status as string} options={STATUS_OPTIONS} onChange={v => { setFilters(p => ({ ...p, status: v || undefined })); setPage(1); }} />
                    <FilterSelect label="Method" value={filters.method as string} options={METHOD_OPTIONS} onChange={v => { setFilters(p => ({ ...p, method: v || undefined })); setPage(1); }} />
                    <FilterSelect label="Source" value={filters.sourceType as string} options={SOURCE_OPTIONS} onChange={v => { setFilters(p => ({ ...p, sourceType: v || undefined })); setPage(1); }} />
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
                    <div className="self-end flex items-center gap-2">
                        <button onClick={() => { setFilters({}); setPage(1); }} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Clear</button>
                    </div>
                </div>
            )}

            {/* Bulk actions */}
            {selected.size > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 dark:bg-indigo-900/20">
                    <span className="text-xs text-indigo-700 dark:text-indigo-300">{selected.size} selected</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => bulkApprove.mutate([...selected], { onSuccess: () => setSelected(new Set()) })} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">
                            Approve
                        </button>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => bulkMarkPaid.mutate([...selected], { onSuccess: () => setSelected(new Set()) })} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">
                            Mark Paid
                        </button>
                    </div>
                </div>
            )}

            {/* Table (desktop) + Cards (mobile) */}
            {isLoading ? (
                <div className="py-12 text-center text-sm text-slate-500 animate-pulse">Loading...</div>
            ) : txns.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">No transactions found.</div>
            ) : (
                <>
                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 sm:block dark:border-slate-700">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800">
                                <tr>
                                    <th className="px-3 py-2 text-left"><input type="checkbox" checked={selected.size === txns.length && txns.length > 0} onChange={toggleAll} /></th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Code</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Direction</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Amount</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Category</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Source</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Status</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Method</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Date</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {txns.map(t => (
                                    <tr key={t._id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${t.isDeleted ? 'opacity-50' : ''}`}>
                                        <td className="px-3 py-2"><input type="checkbox" checked={selected.has(t._id)} onChange={() => toggleSelect(t._id)} /></td>
                                        <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{t.txnCode}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${t.direction === 'income' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}>
                                                {t.direction}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium text-slate-800 dark:text-white">৳{fmt(t.amount)}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{t.categoryLabel}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE_COLORS[t.sourceType] ?? SOURCE_BADGE_COLORS.other}`}>
                                                {t.sourceId && <Link2 size={9} />}
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
                                                {!t.isDeleted && (
                                                    <>
                                                        <button onClick={() => setEditTxn(t)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit">
                                                            <Pencil size={13} className="text-blue-600" />
                                                        </button>
                                                        <button onClick={async () => {
                                                            const confirmed = await showConfirmDialog({
                                                                title: 'Delete transaction',
                                                                message: 'Delete this transaction?',
                                                                confirmLabel: 'Delete',
                                                                tone: 'danger',
                                                            });
                                                            if (confirmed) deleteMut.mutate(t._id);
                                                        }} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="Delete">
                                                            <Trash2 size={13} className="text-red-500" />
                                                        </button>
                                                    </>
                                                )}
                                                {t.isDeleted && (
                                                    <button onClick={() => restoreMut.mutate(t._id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="Restore">
                                                        <RotateCcw size={13} className="text-green-600" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="space-y-2 sm:hidden">
                        {txns.map(t => (
                            <div key={t._id} className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 ${t.isDeleted ? 'opacity-50' : ''}`}>
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" checked={selected.has(t._id)} onChange={() => toggleSelect(t._id)} />
                                        <div>
                                            <p className="text-sm font-medium text-slate-800 dark:text-white">{t.categoryLabel}</p>
                                            <p className="text-[10px] text-slate-500">{t.txnCode}</p>
                                        </div>
                                    </div>
                                    <p className={`text-sm font-bold ${t.direction === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                        {t.direction === 'income' ? '+' : '-'}৳{fmt(t.amount)}
                                    </p>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${t.direction === 'income' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'}`}>
                                        {t.direction}
                                    </span>
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] ?? ''}`}>{t.status}</span>
                                    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE_COLORS[t.sourceType] ?? SOURCE_BADGE_COLORS.other}`}>
                                        {t.sourceId && <Link2 size={8} />}
                                        {t.sourceType.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-[10px] text-slate-500">{t.method} &middot; {new Date(t.dateUTC).toLocaleDateString()}</span>
                                </div>
                                <div className="mt-2 flex justify-end gap-1">
                                    <button onClick={() => setDetailId(t._id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="View details"><Eye size={13} className="text-slate-500" /></button>
                                    {!t.isDeleted && (
                                        <>
                                            <button onClick={() => setEditTxn(t)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil size={13} className="text-blue-600" /></button>
                                            <button onClick={async () => {
                                                const confirmed = await showConfirmDialog({
                                                    title: 'Delete transaction',
                                                    message: 'Delete this transaction?',
                                                    confirmLabel: 'Delete',
                                                    tone: 'danger',
                                                });
                                                if (confirmed) deleteMut.mutate(t._id);
                                            }} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><Trash2 size={13} className="text-red-500" /></button>
                                        </>
                                    )}
                                    {t.isDeleted && (
                                        <button onClick={() => restoreMut.mutate(t._id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><RotateCcw size={13} className="text-green-600" /></button>
                                    )}
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
                        <div className="flex items-center gap-1">
                            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-600 dark:text-white"><ChevronLeft size={14} /></button>
                        </div>
                        <div className="flex items-center gap-1">
                            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-600 dark:text-white"><ChevronRight size={14} /></button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail drawer */}
            {detailId && <TransactionDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}

            {/* Create / Edit modal */}
            {(showCreate || editTxn) && (
                <TransactionModal
                    txn={editTxn}
                    onClose={() => { setShowCreate(false); setEditTxn(null); }}
                    onSave={(raw) => {
                        const payload: Partial<FcTransaction> = { ...raw };
                        // Convert YYYY-MM-DD to ISO datetime for Zod
                        if (payload.dateUTC && !payload.dateUTC.includes('T')) {
                            payload.dateUTC = new Date(payload.dateUTC).toISOString();
                        }
                        // Strip empty optional strings
                        if (!payload.note) delete (payload as Record<string, unknown>).note;
                        if (editTxn) updateMut.mutate({ id: editTxn._id, data: payload }, { onSuccess: () => setEditTxn(null) });
                        else createMut.mutate(payload, { onSuccess: () => setShowCreate(false) });
                    }}
                    saving={createMut.isPending || updateMut.isPending}
                />
            )}
        </div>
    );
}

/* ── Helpers ─────────────────────────────────────────────── */

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

/* ── Transaction Detail Drawer ───────────────────────────── */
function TransactionDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
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
                aria-label="Transaction Details"
                className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl dark:bg-slate-900 sm:max-w-md"
                onClick={e => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-white">Transaction Details</h3>
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

/* ── Transaction Modal ───────────────────────────────────── */

function TransactionModal({ txn, onClose, onSave, saving }: { txn: FcTransaction | null; onClose: () => void; onSave: (data: Partial<FcTransaction>) => void; saving: boolean }) {
    const [form, setForm] = useState<Partial<FcTransaction>>({
        direction: txn?.direction ?? 'income',
        amount: txn?.amount ?? 0,
        accountCode: txn?.accountCode ?? '',
        categoryLabel: txn?.categoryLabel ?? '',
        description: txn?.description ?? '',
        status: txn?.status ?? 'pending',
        method: txn?.method ?? 'cash',
        sourceType: txn?.sourceType ?? 'manual_income',
        dateUTC: txn?.dateUTC ? txn.dateUTC.slice(0, 10) : new Date().toISOString().slice(0, 10),
        note: txn?.note ?? '',
        tags: txn?.tags ?? [],
    });

    const set = (key: string, val: unknown) => setForm(p => ({ ...p, [key]: val }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
                <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-white">{txn ? 'Edit Transaction' : 'New Transaction'}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField label="Direction" value={form.direction!} options={DIRECTION_OPTIONS} onChange={v => set('direction', v)} />
                    <InputField label="Amount" type="number" value={form.amount} onChange={v => set('amount', Number(v))} />
                    <InputField label="Account Code" value={form.accountCode} onChange={v => set('accountCode', v)} />
                    <InputField label="Category" value={form.categoryLabel} onChange={v => set('categoryLabel', v)} />
                    <SelectField label="Status" value={form.status!} options={STATUS_OPTIONS} onChange={v => set('status', v)} />
                    <SelectField label="Method" value={form.method!} options={METHOD_OPTIONS} onChange={v => set('method', v)} />
                    <SelectField label="Source" value={form.sourceType!} options={SOURCE_OPTIONS} onChange={v => set('sourceType', v)} />
                    <InputField label="Date" type="date" value={form.dateUTC?.slice(0, 10)} onChange={v => set('dateUTC', v)} />
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
                    <button onClick={() => onSave(form)} disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
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
