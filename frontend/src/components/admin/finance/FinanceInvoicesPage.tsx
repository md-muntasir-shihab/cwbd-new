import { useState, useMemo, useRef, useEffect } from 'react';
import { useFcInvoices, useFcCreateInvoice, useFcUpdateInvoice, useFcMarkInvoicePaid, useFcInvoiceDetail } from '../../../hooks/useFinanceCenterQueries';
import type { FcInvoice, InvoicePurpose, InvoiceStatus } from '../../../types/finance';
import { Plus, Search, ChevronLeft, ChevronRight, CheckCircle, Pencil, Eye, X, AlertTriangle, FileText, Clock, DollarSign, Loader2 } from 'lucide-react';
import { displayName } from '../../../utils/displayName';

type Params = Record<string, string | number | boolean | undefined>;

function fmt(n: number) { return new Intl.NumberFormat('en-BD').format(n); }

const STATUS_COLORS: Record<string, string> = {
    unpaid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    partial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const PURPOSE_OPTIONS: InvoicePurpose[] = ['subscription', 'exam', 'service', 'custom'];
const STATUS_OPTIONS: InvoiceStatus[] = ['unpaid', 'partial', 'paid', 'cancelled', 'overdue'];

export default function FinanceInvoicesPage() {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [editInv, setEditInv] = useState<FcInvoice | null>(null);
    const [detailId, setDetailId] = useState<string | null>(null);

    const params: Params = { page, limit: 20, search: search || undefined, status: statusFilter || undefined };
    const { data, isLoading } = useFcInvoices(params);
    const createMut = useFcCreateInvoice();
    const updateMut = useFcUpdateInvoice();
    const markPaidMut = useFcMarkInvoicePaid();

    const invoices = data?.items ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / 20);

    const kpi = useMemo(() => {
        const totalReceivable = invoices.reduce((s, i) => s + (i.amountBDT - i.paidAmountBDT), 0);
        const overdueCount = invoices.filter(i => i.status === 'overdue' || (i.dueDateUTC && new Date(i.dueDateUTC) < new Date() && i.status !== 'paid' && i.status !== 'cancelled')).length;
        const paidThisMonth = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.paidAmountBDT, 0);
        return { totalReceivable, overdueCount, paidThisMonth, total };
    }, [invoices, total]);

    const isOverdue = (inv: FcInvoice) =>
        inv.status !== 'paid' && inv.status !== 'cancelled' && inv.dueDateUTC && new Date(inv.dueDateUTC) < new Date();

    const daysPastDue = (inv: FcInvoice) => {
        if (!inv.dueDateUTC) return 0;
        const diff = Date.now() - new Date(inv.dueDateUTC).getTime();
        return Math.max(0, Math.floor(diff / 86400000));
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Invoices</h2>
                <button onClick={() => setShowCreate(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                    <Plus size={14} /> New Invoice
                </button>
            </div>

            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniKpi icon={<FileText size={16} className="text-indigo-500" />} label="Total Invoices" value={String(kpi.total)} />
                <MiniKpi icon={<DollarSign size={16} className="text-amber-500" />} label="Receivable" value={`৳${fmt(kpi.totalReceivable)}`} />
                <MiniKpi icon={<AlertTriangle size={16} className="text-red-500" />} label="Overdue" value={String(kpi.overdueCount)} accent={kpi.overdueCount > 0 ? 'text-red-600' : undefined} />
                <MiniKpi icon={<CheckCircle size={16} className="text-green-500" />} label="Paid (page)" value={`৳${fmt(kpi.paidThisMonth)}`} />
            </div>

            {/* Search + filter */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search invoiceNo..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                        className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                    <option value="">All statuses</option>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>

            {isLoading ? (
                <div className="py-12 text-center text-sm text-slate-500 animate-pulse">Loading...</div>
            ) : invoices.length === 0 ? (
                <div className="py-12 text-center text-sm text-slate-500">No invoices found.</div>
            ) : (
                <>
                    {/* Desktop table */}
                    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 sm:block dark:border-slate-700">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800">
                                <tr>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Invoice #</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Purpose</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Amount</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Paid</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Status</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Due</th>
                                    <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Aging</th>
                                    <th className="px-3 py-2 text-right font-medium text-slate-600 dark:text-slate-400">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {invoices.map(inv => {
                                    const overdue = isOverdue(inv);
                                    const days = daysPastDue(inv);
                                    return (
                                        <tr key={inv._id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${overdue ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                            <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300">{inv.invoiceNo}</td>
                                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 capitalize">{inv.purpose}</td>
                                            <td className="px-3 py-2 text-right font-medium text-slate-800 dark:text-white">৳{fmt(inv.amountBDT)}</td>
                                            <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">৳{fmt(inv.paidAmountBDT)}</td>
                                            <td className="px-3 py-2"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[overdue ? 'overdue' : inv.status] ?? ''}`}>{overdue ? 'overdue' : inv.status}</span></td>
                                            <td className="px-3 py-2 text-slate-500">{inv.dueDateUTC ? new Date(inv.dueDateUTC).toLocaleDateString() : '—'}</td>
                                            <td className="px-3 py-2">
                                                {overdue && days > 0 ? (
                                                    <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${days > 30 ? 'text-red-600' : days > 15 ? 'text-orange-600' : 'text-amber-600'}`}>
                                                        <Clock size={10} /> {days}d
                                                    </span>
                                                ) : <span className="text-[10px] text-slate-400">—</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => setDetailId(inv._id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="View" aria-label="View details">
                                                        <Eye size={13} className="text-slate-500" />
                                                    </button>
                                                    <button onClick={() => setEditInv(inv)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit">
                                                        <Pencil size={13} className="text-blue-600" />
                                                    </button>
                                                    {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                                        <button onClick={() => markPaidMut.mutate({ id: inv._id })} className="rounded p-1 hover:bg-green-50 dark:hover:bg-green-900/20" title="Mark paid">
                                                            <CheckCircle size={13} className="text-green-600" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="space-y-2 sm:hidden">
                        {invoices.map(inv => {
                            const overdue = isOverdue(inv);
                            const days = daysPastDue(inv);
                            return (
                                <div key={inv._id} className={`rounded-xl border p-3 ${overdue ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-slate-800 dark:text-white">{inv.invoiceNo}</p>
                                            <p className="text-[10px] text-slate-500 capitalize">{inv.purpose}</p>
                                        </div>
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">৳{fmt(inv.amountBDT)}</p>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[overdue ? 'overdue' : inv.status] ?? ''}`}>{overdue ? 'overdue' : inv.status}</span>
                                        {overdue && days > 0 && <span className="text-[10px] font-medium text-red-600">{days}d overdue</span>}
                                        <span className="text-[10px] text-slate-500">Paid: ৳{fmt(inv.paidAmountBDT)}</span>
                                    </div>
                                    <div className="mt-2 flex justify-end gap-1">
                                        <button onClick={() => setDetailId(inv._id)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="View details"><Eye size={13} className="text-slate-500" /></button>
                                        <button onClick={() => setEditInv(inv)} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil size={13} className="text-blue-600" /></button>
                                        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                            <button onClick={() => markPaidMut.mutate({ id: inv._id })} className="rounded p-1 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle size={13} className="text-green-600" /></button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                    <div className="flex gap-1">
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-600 dark:text-white"><ChevronLeft size={14} /></button>
                        <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40 dark:border-slate-600 dark:text-white"><ChevronRight size={14} /></button>
                    </div>
                </div>
            )}

            {/* Detail drawer */}
            {detailId && <InvoiceDetailDrawer id={detailId} onClose={() => setDetailId(null)} />}

            {(showCreate || editInv) && (
                <InvoiceModal
                    inv={editInv}
                    onClose={() => { setShowCreate(false); setEditInv(null); }}
                    onSave={(data) => {
                        if (editInv) updateMut.mutate({ id: editInv._id, data }, { onSuccess: () => setEditInv(null) });
                        else createMut.mutate(data as Partial<FcInvoice>, { onSuccess: () => setShowCreate(false) });
                    }}
                    saving={createMut.isPending || updateMut.isPending}
                />
            )}
        </div>
    );
}

function InvoiceModal({ inv, onClose, onSave, saving }: { inv: FcInvoice | null; onClose: () => void; onSave: (d: Partial<FcInvoice>) => void; saving: boolean }) {
    const [form, setForm] = useState<Partial<FcInvoice>>({
        purpose: inv?.purpose ?? 'custom',
        amountBDT: inv?.amountBDT ?? 0,
        notes: inv?.notes ?? '',
        dueDateUTC: inv?.dueDateUTC ? inv.dueDateUTC.slice(0, 10) : '',
        studentId: inv?.studentId ?? '',
    });
    const set = (k: string, v: unknown) => setForm(p => ({ ...p, [k]: v }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
                <h3 className="mb-4 text-base font-semibold text-slate-800 dark:text-white">{inv ? 'Edit Invoice' : 'New Invoice'}</h3>
                <div className="grid gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium text-slate-500">Purpose</label>
                        <select value={form.purpose} onChange={e => set('purpose', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                            {PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium text-slate-500">Amount (BDT)</label>
                        <input type="number" value={form.amountBDT ?? ''} onChange={e => set('amountBDT', Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium text-slate-500">Due Date</label>
                        <input type="date" value={form.dueDateUTC ?? ''} onChange={e => set('dueDateUTC', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium text-slate-500">Student ID (optional)</label>
                        <input type="text" value={form.studentId ?? ''} onChange={e => set('studentId', e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium text-slate-500">Notes</label>
                        <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
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

/* ── Helpers ─────────────────────────────────────────────── */

function MiniKpi({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2">
                {icon}
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{label}</span>
            </div>
            <p className={`mt-1 text-lg font-bold ${accent ?? 'text-slate-800 dark:text-white'}`}>{value}</p>
        </div>
    );
}

function InvoiceDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
    const { data, isLoading, isError, error } = useFcInvoiceDetail(id);
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

    const inv = (data as { data?: FcInvoice })?.data ?? data as FcInvoice | undefined;
    const is404 = isError && (error as { response?: { status?: number } })?.response?.status === 404;

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Invoice Details"
                className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl dark:bg-slate-900 sm:max-w-md"
                onClick={e => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-800 dark:text-white">Invoice Details</h3>
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

                {inv && (
                    <dl className="space-y-3 text-sm">
                        <DRow label="Invoice No" value={inv.invoiceNo} />
                        <DRow label="Purpose" value={inv.purpose} />
                        <DRow label="Amount (BDT)" value={`৳${fmt(inv.amountBDT)}`} />
                        <DRow label="Paid (BDT)" value={`৳${fmt(inv.paidAmountBDT)}`} />
                        <DRow label="Status" value={inv.status} />
                        <DRow label="Due Date" value={inv.dueDateUTC ? new Date(inv.dueDateUTC).toLocaleDateString() : '—'} />
                        <DRow label="Issued At" value={inv.issuedAtUTC ? new Date(inv.issuedAtUTC).toLocaleDateString() : '—'} />
                        {inv.paidAtUTC && <DRow label="Paid At" value={new Date(inv.paidAtUTC).toLocaleDateString()} />}
                        {inv.notes && <DRow label="Notes" value={inv.notes} />}
                        <DRow label="Student" value={displayName(inv.studentId)} />
                        <DRow label="Created By" value={displayName(inv.createdByAdminId)} />
                        <DRow label="Plan" value={displayName(inv.planId)} />
                        <DRow label="Exam" value={displayName(inv.examId)} />
                        {inv.linkedTxnIds && inv.linkedTxnIds.length > 0 && (
                            <DRow label="Linked Transactions" value={inv.linkedTxnIds.join(', ')} />
                        )}
                        <DRow label="Deleted" value={inv.isDeleted ? 'Yes' : 'No'} />
                    </dl>
                )}
            </div>
        </div>
    );
}

function DRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
            <dd className="text-slate-800 dark:text-white">{value}</dd>
        </div>
    );
}
