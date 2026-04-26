import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Star, Trash2, Edit3, CheckCircle, XCircle, Award, Search, RefreshCw, Loader2, X } from 'lucide-react';
import {
    adminGetTestimonials, adminCreateTestimonial, adminUpdateTestimonial,
    adminDeleteTestimonial, adminApproveTestimonial, adminRejectTestimonial,
    adminToggleFeatureTestimonial,
} from '../../services/api';

interface Testimonial {
    _id: string; name: string; role: string; university: string; department: string;
    batch: string; location: string; avatarUrl: string; shortQuote: string; fullQuote: string;
    rating: number; category: string; status: string; featured: boolean; displayOrder: number;
    socialProofLabel: string; examReference: string; createdAt: string;
}

const CATEGORIES = ['student', 'parent', 'teacher', 'alumni', 'other'];
const STATUSES = ['draft', 'pending', 'approved', 'rejected', 'archived'];
const STATUS_COLORS: Record<string, string> = {
    approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    draft: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    archived: 'bg-slate-500/15 text-slate-500 border-slate-500/30',
};

const EMPTY_FORM = {
    name: '', role: 'Student', university: '', department: '', batch: '', location: '',
    avatarUrl: '', shortQuote: '', fullQuote: '', rating: 5, category: 'student',
    status: 'approved', featured: false, displayOrder: 0, socialProofLabel: '', examReference: '',
};

export default function TestimonialsManagementPage() {
    const qc = useQueryClient();
    const [filter, setFilter] = useState({ status: 'all', category: 'all', q: '' });
    const [modal, setModal] = useState<null | 'create' | Testimonial>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['admin-testimonials', filter],
        queryFn: async () => {
            const params: Record<string, string> = {};
            if (filter.status !== 'all') params.status = filter.status;
            if (filter.category !== 'all') params.category = filter.category;
            if (filter.q) params.q = filter.q;
            const res = await adminGetTestimonials(params);
            const p = res.data as any;
            return { items: (p.items || (Array.isArray(p) ? p : [])) as Testimonial[], counts: p.counts || {} };
        },
    });
    const items = data?.items || [];
    const counts = (data?.counts || {}) as Record<string, number>;
    const invalidate = useCallback(() => { qc.invalidateQueries({ queryKey: ['admin-testimonials'] }); qc.invalidateQueries({ queryKey: ['public-testimonials'] }); }, [qc]);

    const openCreate = () => { setForm({ ...EMPTY_FORM }); setModal('create'); };
    const openEdit = (t: Testimonial) => {
        setForm({ name: t.name, role: t.role, university: t.university, department: t.department, batch: t.batch, location: t.location, avatarUrl: t.avatarUrl, shortQuote: t.shortQuote, fullQuote: t.fullQuote, rating: t.rating, category: t.category, status: t.status, featured: t.featured, displayOrder: t.displayOrder, socialProofLabel: t.socialProofLabel, examReference: t.examReference });
        setModal(t);
    };

    const handleSave = async () => {
        if (!form.name.trim() || !form.fullQuote.trim()) { toast.error('Name and quote required'); return; }
        setSaving(true);
        try {
            if (modal === 'create') await adminCreateTestimonial(form);
            else if (modal && typeof modal === 'object') await adminUpdateTestimonial(modal._id, form);
            toast.success(modal === 'create' ? 'Created' : 'Updated');
            setModal(null); invalidate();
        } catch { toast.error('Save failed'); } finally { setSaving(false); }
    };
    const handleDelete = async (id: string) => { if (!confirm('Delete?')) return; try { await adminDeleteTestimonial(id); toast.success('Deleted'); invalidate(); } catch { toast.error('Failed'); } };
    const handleApprove = async (id: string) => { try { await adminApproveTestimonial(id); toast.success('Approved'); invalidate(); } catch { toast.error('Failed'); } };
    const handleReject = async (id: string) => { const r = prompt('Reason:') || ''; try { await adminRejectTestimonial(id, r); toast.success('Rejected'); invalidate(); } catch { toast.error('Failed'); } };
    const handleToggleFeatured = async (id: string) => { try { await adminToggleFeatureTestimonial(id); toast.success('Updated'); invalidate(); } catch { toast.error('Failed'); } };

    const inp = "w-full rounded-xl border border-slate-700/40 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400/60 focus:ring-1 focus:ring-indigo-500/20 transition-all";

    return (
        <div className="space-y-5">
            <header className="rounded-2xl border border-indigo-500/15 bg-gradient-to-r from-slate-950 via-indigo-950/40 to-slate-950 p-5 shadow-xl">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="text-xl font-black text-white">Testimonials Management</h2><p className="text-sm text-slate-400 mt-1">Manage student testimonials</p></div>
                    <div className="flex gap-2">
                        <button onClick={() => void refetch()} className="inline-flex items-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-200"><RefreshCw className="w-4 h-4" />Refresh</button>
                        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-lg"><Plus className="w-4 h-4" />Add</button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                    {([['Total', counts.total], ['Approved', counts.approved], ['Pending', counts.pending], ['Featured', counts.featured]] as [string, number][]).map(([l, v]) => (
                        <div key={l} className="rounded-xl border border-slate-700/30 bg-slate-900/50 px-4 py-2 text-center min-w-[80px]"><p className="text-lg font-black text-white">{v || 0}</p><p className="text-[10px] text-slate-500 uppercase">{l}</p></div>
                    ))}
                </div>
            </header>

            <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 p-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px] relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" /><input value={filter.q} onChange={e => setFilter(p => ({ ...p, q: e.target.value }))} placeholder="Search..." className={`${inp} pl-9`} /></div>
                <select value={filter.status} onChange={e => setFilter(p => ({ ...p, status: e.target.value }))} className={inp + ' w-36'}><option value="all">All Status</option>{STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select>
                <select value={filter.category} onChange={e => setFilter(p => ({ ...p, category: e.target.value }))} className={inp + ' w-36'}><option value="all">All Categories</option>{CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}</select>
            </div>

            <div className="rounded-2xl border border-slate-700/30 bg-slate-900/50 overflow-hidden">
                {isLoading ? <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-500" /></div>
                    : items.length === 0 ? <div className="p-12 text-center text-slate-500">No testimonials found</div>
                        : <div className="divide-y divide-slate-700/20">{items.map(t => (
                            <div key={t._id} className="flex items-start gap-4 p-4 hover:bg-indigo-500/[0.03] transition-colors">
                                <div className="flex-shrink-0">{t.avatarUrl ? <img src={t.avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/10" /> : <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">{t.name.charAt(0)}</div>}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-bold text-white">{t.name}</span>
                                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${STATUS_COLORS[t.status] || STATUS_COLORS.draft}`}>{t.status}</span>
                                        {t.featured && <span className="rounded-md bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 flex items-center gap-1"><Award className="w-3 h-3" />Featured</span>}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">{t.role}{t.university ? ` • ${t.university}` : ''}</p>
                                    <p className="text-xs text-slate-300 mt-1 line-clamp-2">&ldquo;{t.shortQuote || t.fullQuote}&rdquo;</p>
                                    <div className="flex gap-0.5 mt-1">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`w-3 h-3 ${i < t.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-700'}`} />)}</div>
                                </div>
                                <div className="flex flex-col gap-1 flex-shrink-0">
                                    <button onClick={() => openEdit(t)} className="rounded-lg bg-indigo-500/15 px-2 py-1 text-[10px] font-bold text-indigo-300 flex items-center gap-1"><Edit3 className="w-3 h-3" />Edit</button>
                                    {t.status !== 'approved' && <button onClick={() => void handleApprove(t._id)} className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Approve</button>}
                                    {t.status !== 'rejected' && <button onClick={() => void handleReject(t._id)} className="rounded-lg bg-rose-500/15 px-2 py-1 text-[10px] font-bold text-rose-300 flex items-center gap-1"><XCircle className="w-3 h-3" />Reject</button>}
                                    <button onClick={() => void handleToggleFeatured(t._id)} className={`rounded-lg px-2 py-1 text-[10px] font-bold flex items-center gap-1 ${t.featured ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-700/30 text-slate-400'}`}><Award className="w-3 h-3" />{t.featured ? 'Unfeature' : 'Feature'}</button>
                                    <button onClick={() => void handleDelete(t._id)} className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-400 flex items-center gap-1"><Trash2 className="w-3 h-3" />Del</button>
                                </div>
                            </div>
                        ))}</div>}
            </div>

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModal(null)}>
                    <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700/30 bg-slate-900 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-white">{modal === 'create' ? 'Add Testimonial' : 'Edit Testimonial'}</h3>
                            <button onClick={() => setModal(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-800"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Name *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inp} /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Role</label><input value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className={inp} /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">University</label><input value={form.university} onChange={e => setForm(p => ({ ...p, university: e.target.value }))} className={inp} /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Department</label><input value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className={inp} /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Batch</label><input value={form.batch} onChange={e => setForm(p => ({ ...p, batch: e.target.value }))} className={inp} /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Location</label><input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} className={inp} /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Avatar URL</label><input value={form.avatarUrl} onChange={e => setForm(p => ({ ...p, avatarUrl: e.target.value }))} className={inp} placeholder="https://..." /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Rating</label><select value={form.rating} onChange={e => setForm(p => ({ ...p, rating: Number(e.target.value) }))} className={inp}>{[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} Star{r > 1 ? 's' : ''}</option>)}</select></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Category</label><select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={inp}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Status</label><select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className={inp}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Social Proof Label</label><input value={form.socialProofLabel} onChange={e => setForm(p => ({ ...p, socialProofLabel: e.target.value }))} className={inp} placeholder="e.g. Verified Student" /></div>
                            <div><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Order</label><input type="number" value={form.displayOrder} onChange={e => setForm(p => ({ ...p, displayOrder: Number(e.target.value) }))} className={inp} /></div>
                            <div className="sm:col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Short Quote (max 200)</label><input value={form.shortQuote} onChange={e => setForm(p => ({ ...p, shortQuote: e.target.value }))} className={inp} maxLength={200} /></div>
                            <div className="sm:col-span-2"><label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Full Quote *</label><textarea value={form.fullQuote} onChange={e => setForm(p => ({ ...p, fullQuote: e.target.value }))} className={inp + ' min-h-[100px]'} maxLength={2000} /></div>
                            <div className="flex items-center gap-3"><input type="checkbox" checked={form.featured} onChange={e => setForm(p => ({ ...p, featured: e.target.checked }))} className="rounded" /><span className="text-sm text-slate-300">Featured</span></div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setModal(null)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
                            <button onClick={() => void handleSave()} disabled={saving} className="rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : modal === 'create' ? 'Create' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
