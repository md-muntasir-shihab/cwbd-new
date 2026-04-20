/* ═══════════════════════════════════════════════════════════════════════════
   Subscription Contact Center Page — Comprehensive UI/UX Overhaul
   All original functionality preserved. Visual improvements across all tabs.
   ═══════════════════════════════════════════════════════════════════════════ */
import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardCopy, Clock, Copy, CreditCard, Download, ExternalLink, Eye,
  FileJson, FileSpreadsheet, FileText, Filter, Hash, History, Layers,
  LayoutGrid, Mail, MessageSquare, MoreHorizontal, Phone, RefreshCw, Save,
  Search, Settings2, Sparkles, Table2, Trash2, User, Users, XCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import AdminTabNav from '../../../components/admin/AdminTabNav';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import { useAuth } from '../../../hooks/useAuth';
import {
  createSubscriptionContactCenterPreset, deleteSubscriptionContactCenterPreset,
  exportSubscriptionContactCenter, getSubscriptionContactCenterLogs,
  getSubscriptionContactCenterMembers, getSubscriptionContactCenterOverview,
  getSubscriptionContactCenterPresets, previewSubscriptionContactCopy,
  updateSubscriptionContactCenterPreset,
  type SubscriptionContactCenterFilters, type SubscriptionContactCenterMember,
  type SubscriptionContactCenterPreset,
} from '../../../api/adminNotificationCampaignApi';
import { assignSubscription, createAudienceSegment, expireSubscriptionNow, extendSubscription, toggleAutoRenew } from '../../../api/adminStudentApi';
import { downloadFile } from '../../../utils/download';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type CenterTab = 'overview' | 'members' | 'outreach' | 'export' | 'presets' | 'logs';
type ContactScope = 'phones' | 'emails' | 'combined' | 'guardian' | 'student_guardian' | 'raw';
type ExportFormat = 'clipboard' | 'xlsx' | 'csv' | 'txt' | 'json';
type SubscriptionActionMode = 'assign' | 'extend' | 'expire' | 'autoRenew';
type ContactCenterPlanOption = { id: string; name: string; code?: string };

/* ─── Constants ─────────────────────────────────────────────────────────── */
const CENTER_TABS: Array<{ key: CenterTab; label: string; icon: typeof Users }> = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'outreach', label: 'Personal Outreach', icon: Phone },
  { key: 'export', label: 'Export / Copy', icon: Download },
  { key: 'presets', label: 'Format Presets', icon: Settings2 },
  { key: 'logs', label: 'Logs / History', icon: History },
];
const EMPTY_FILTERS: SubscriptionContactCenterFilters = { bucket: 'all', search: '', planIds: [], groupIds: [], departments: [], institutionNames: [], selectedUserIds: [] };
const BUCKET_OPTIONS = [
  { value: 'all', label: 'All buckets' }, { value: 'active', label: 'Active' },
  { value: 'renewal_due', label: 'Renewal Due' }, { value: 'expired', label: 'Expired' },
  { value: 'cancelled_paused', label: 'Cancelled / Paused' }, { value: 'pending', label: 'Pending' },
];
const SCOPE_OPTIONS: Array<{ value: ContactScope; label: string; icon: typeof Phone }> = [
  { value: 'phones', label: 'Phones only', icon: Phone }, { value: 'emails', label: 'Emails only', icon: Mail },
  { value: 'combined', label: 'Phone + Email bundle', icon: Layers }, { value: 'guardian', label: 'Guardian contacts only', icon: Users },
  { value: 'student_guardian', label: 'Student + Guardian bundle', icon: Users }, { value: 'raw', label: 'Raw labeled rows', icon: Table2 },
];
const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string; icon: typeof Copy }> = [
  { value: 'clipboard', label: 'Copy to clipboard', icon: ClipboardCopy }, { value: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { value: 'csv', label: 'CSV (.csv)', icon: FileText }, { value: 'txt', label: 'Plain text (.txt)', icon: FileText },
  { value: 'json', label: 'JSON (.json)', icon: FileJson },
];
const BUCKET_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  expired: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  renewal_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  cancelled_paused: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};
const BUCKET_DOT: Record<string, string> = {
  active: 'bg-emerald-500', expired: 'bg-rose-500', renewal_due: 'bg-amber-500',
  cancelled_paused: 'bg-slate-400', pending: 'bg-yellow-500',
};

/* ─── Helpers ───────────────────────────────────────────────────────────── */
function bucketLabel(b: string) { return BUCKET_OPTIONS.find((o) => o.value === b)?.label || b.replace(/_/g, ' '); }
function bucketBadge(b: string) { return BUCKET_COLORS[b] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'; }
function bucketDot(b: string) { return BUCKET_DOT[b] || 'bg-slate-400'; }
function formatDate(v?: string | null) { if (!v) return '-'; return new Date(v).toLocaleDateString(); }
function relativeTime(d: string) {
  const ms = Date.now() - new Date(d).getTime(); if (Number.isNaN(ms)) return d;
  const s = Math.floor(ms / 1000); if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const dy = Math.floor(h / 24); if (dy < 30) return `${dy}d ago`;
  return new Date(d).toLocaleDateString();
}
function compactSeparator(sep: string) { if (sep === '\n') return '\\n'; if (sep === '\t') return '\\t'; return sep || '(none)'; }
function normalizeTab(v: string | null): CenterTab { return CENTER_TABS.some((t) => t.key === v) ? (v as CenterTab) : 'overview'; }
function presetDraftFromPreset(p?: Partial<SubscriptionContactCenterPreset> | null) {
  return {
    name: p?.name || '', prefix: p?.prefix || '', suffix: p?.suffix || '', separator: p?.separator || '\n',
    includeName: p?.includeName ?? false, includeEmail: p?.includeEmail ?? false, includeGuardian: p?.includeGuardian ?? false,
    includePlan: p?.includePlan ?? false, includeStatus: p?.includeStatus ?? false, isDefault: p?.isDefault ?? false
  };
}
function trimFilterPayload(f: SubscriptionContactCenterFilters): SubscriptionContactCenterFilters {
  return {
    ...f, search: String(f.search || '').trim(), planIds: (f.planIds || []).filter(Boolean),
    groupIds: (f.groupIds || []).filter(Boolean), departments: (f.departments || []).filter(Boolean),
    institutionNames: (f.institutionNames || []).filter(Boolean), selectedUserIds: (f.selectedUserIds || []).filter(Boolean)
  };
}
function avatarInitials(name: string) { const p = name.trim().split(/\s+/); return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : (name[0] || '?').toUpperCase(); }
function logKindIcon(k: string) {
  switch (k) {
    case 'export': return <Download className="h-4 w-4" />; case 'copy': return <Copy className="h-4 w-4" />;
    case 'preview': return <Eye className="h-4 w-4" />; case 'preset': return <Settings2 className="h-4 w-4" />;
    case 'outreach': return <Phone className="h-4 w-4" />; default: return <History className="h-4 w-4" />;
  }
}
function logKindColor(k: string) {
  switch (k) {
    case 'export': return 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400';
    case 'copy': return 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400';
    case 'preview': return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
    case 'preset': return 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400';
    case 'outreach': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
    default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
  }
}
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800 ${className}`} />;
}
function pageRange(cur: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const p: (number | '...')[] = [1];
  if (cur > 3) p.push('...');
  for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) p.push(i);
  if (cur < total - 2) p.push('...');
  p.push(total); return p;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ManageSubscriptionModal — Improved visual design
   ═══════════════════════════════════════════════════════════════════════════ */
function ManageSubscriptionModal(props: {
  open: boolean; members: SubscriptionContactCenterMember[]; plans: ContactCenterPlanOption[];
  submitting: boolean; mode: SubscriptionActionMode; setMode: (mode: SubscriptionActionMode) => void;
  assignDraft: { planId: string; notes: string }; setAssignDraft: Dispatch<SetStateAction<{ planId: string; notes: string }>>;
  extendDraft: { days: string; notes: string }; setExtendDraft: Dispatch<SetStateAction<{ days: string; notes: string }>>;
  onClose: () => void; onSubmit: () => void;
}) {
  const { open, members, plans, submitting, mode, setMode, assignDraft, setAssignDraft, extendDraft, setExtendDraft, onClose, onSubmit } = props;
  if (!open) return null;
  const modes: Array<[SubscriptionActionMode, string, typeof CreditCard]> = [
    ['assign', 'Assign / Change plan', CreditCard], ['extend', 'Extend expiry', Clock],
    ['expire', 'Expire now', XCircle], ['autoRenew', 'Toggle auto-renew', RefreshCw],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30"><Settings2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /></div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Subscription actions</p>
            </div>
            <h3 className="mt-3 text-2xl font-bold text-slate-950 dark:text-white">Manage subscription</h3>
            <p className="mt-2 text-sm text-slate-500">Applying to {members.length} member{members.length === 1 ? '' : 's'} using the existing subscription admin APIs.</p>
          </div>
          <button onClick={onClose} className="rounded-2xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900">Close</button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {modes.map(([key, label, Icon]) => (
            <button key={key} onClick={() => setMode(key)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${mode === key ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="mt-5 space-y-2 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          {members.slice(0, 5).map((m) => (
            <div key={m.userId} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 dark:bg-slate-950">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-xs font-bold text-white">{avatarInitials(m.fullName)}</div>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">{m.fullName}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bucketBadge(m.bucket)}`}>{bucketLabel(m.bucket)}</span>
            </div>
          ))}
          {members.length > 5 && <div className="pt-1 text-center text-xs text-slate-500">+{members.length - 5} more members</div>}
        </div>
        {mode === 'assign' && (
          <div className="mt-5 space-y-4">
            <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Select plan</label>
              <select value={assignDraft.planId} onChange={(e) => setAssignDraft((c) => ({ ...c, planId: e.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900/30">
                <option value="">Select a plan</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</label>
              <textarea value={assignDraft.notes} onChange={(e) => setAssignDraft((c) => ({ ...c, notes: e.target.value }))} rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900/30" placeholder="Optional note" /></div>
          </div>
        )}
        {mode === 'extend' && (
          <div className="mt-5 space-y-4">
            <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Days to extend</label>
              <input value={extendDraft.days} onChange={(e) => setExtendDraft((c) => ({ ...c, days: e.target.value }))} inputMode="numeric" placeholder="30"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900/30" /></div>
            <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</label>
              <textarea value={extendDraft.notes} onChange={(e) => setExtendDraft((c) => ({ ...c, notes: e.target.value }))} rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900/30" placeholder="Optional note" /></div>
          </div>
        )}
        {mode === 'expire' && (
          <div className="mt-5 flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/50 dark:bg-rose-950/30">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <p className="text-sm text-rose-700 dark:text-rose-300">This expires the selected subscriptions immediately and should move them into the expired bucket on refresh.</p>
          </div>
        )}
        {mode === 'autoRenew' && (
          <div className="mt-5 flex items-start gap-3 rounded-3xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900/50 dark:bg-sky-950/30">
            <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
            <p className="text-sm text-sky-700 dark:text-sky-300">This toggles auto-renew using the current subscription endpoint. Use it for quick renewal-state changes without leaving the Contact Center.</p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Cancel</button>
          <button onClick={onSubmit} disabled={submitting}
            className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50">
            {submitting ? 'Running...' : 'Apply action'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Page Component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function SubscriptionContactCenterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = normalizeTab(searchParams.get('tab'));
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SubscriptionContactCenterFilters>(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showGuardianColumns, setShowGuardianColumns] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [scope, setScope] = useState<ContactScope>('phones');
  const [format, setFormat] = useState<ExportFormat>('clipboard');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewCount, setPreviewCount] = useState(0);
  const [saveAudienceName, setSaveAudienceName] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetDraft, setPresetDraft] = useState(presetDraftFromPreset());
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageMembers, setManageMembers] = useState<SubscriptionContactCenterMember[]>([]);
  const [manageMode, setManageMode] = useState<SubscriptionActionMode>('assign');
  const [assignDraft, setAssignDraft] = useState({ planId: '', notes: '' });
  const [extendDraft, setExtendDraft] = useState({ days: '30', notes: '' });

  const activeFilters = useMemo(() => trimFilterPayload({ ...filters, selectedUserIds: selectedIds }), [filters, selectedIds]);
  const authReady = Boolean(user) && !authLoading;

  /* ─── Queries ──────────────────────────────────────────────────────── */
  const overviewQuery = useQuery({
    queryKey: ['subscription-contact-center-overview', filters],
    queryFn: () => getSubscriptionContactCenterOverview(trimFilterPayload(filters)),
    enabled: authReady,
  });
  const membersQuery = useQuery({
    queryKey: ['subscription-contact-center-members', filters, page],
    queryFn: () => getSubscriptionContactCenterMembers({ ...trimFilterPayload(filters), page, limit: 25 }),
    enabled: authReady,
  });
  const presetsQuery = useQuery({
    queryKey: ['subscription-contact-center-presets'],
    queryFn: getSubscriptionContactCenterPresets,
    enabled: authReady,
  });
  const logsQuery = useQuery({
    queryKey: ['subscription-contact-center-logs'],
    queryFn: () => getSubscriptionContactCenterLogs({ page: 1, limit: 30 }),
    enabled: authReady && tab === 'logs',
  });

  /* ─── Toast ────────────────────────────────────────────────────────── */
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    window.clearTimeout((showToast as unknown as { timer?: number }).timer);
    (showToast as unknown as { timer?: number }).timer = window.setTimeout(() => setToast(null), 2600);
  };
  const invalidateCenter = () => {
    queryClient.invalidateQueries({ queryKey: ['subscription-contact-center-overview'] });
    queryClient.invalidateQueries({ queryKey: ['subscription-contact-center-members'] });
    queryClient.invalidateQueries({ queryKey: ['subscription-contact-center-logs'] });
    queryClient.invalidateQueries({ queryKey: ['admin-subscriptions-v2'] });
  };

  /* ─── Effects ──────────────────────────────────────────────────────── */
  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { setSelectedIds([]); }, [page, filters]);

  const canViewGuardian = Boolean(membersQuery.data?.permissions.canViewGuardian);
  const canExport = Boolean(membersQuery.data?.permissions.canExport);
  const canPersonalOutreach = Boolean(membersQuery.data?.permissions.canPersonalOutreach);
  const visibleMembers = membersQuery.data?.items ?? [];
  const selectedMembers = visibleMembers.filter((m) => selectedIds.includes(m.userId));
  const outreachMembers = selectedMembers.length > 0 ? selectedMembers : visibleMembers.slice(0, 12);
  const filterOptions = membersQuery.data?.filterOptions || overviewQuery.data?.filterOptions;
  const thresholdOptions = membersQuery.data?.thresholdOptions || overviewQuery.data?.thresholdOptions || [3, 7, 15, 30];
  const totalMemberCount = membersQuery.data?.summary.totalMembers || 0;
  const totalSelectedOrVisible = selectedIds.length || totalMemberCount;
  const planOptions = useMemo(() => (filterOptions?.plans || []).filter((p) => p.id), [filterOptions?.plans]);
  const availablePlans = useMemo<ContactCenterPlanOption[]>(() => planOptions.map((p) => ({ id: p.id, name: p.name, code: p.code })), [planOptions]);

  useEffect(() => {
    if (!canViewGuardian && (scope === 'guardian' || scope === 'student_guardian')) setScope('phones');
    if (!canViewGuardian) { setShowGuardianColumns(false); setFilters((c) => ({ ...c, hasGuardian: undefined })); }
  }, [canViewGuardian, scope]);

  useEffect(() => {
    if (!selectedPresetId && presetsQuery.data?.length) {
      const def = presetsQuery.data.find((p) => p.isDefault);
      if (def?._id) setSelectedPresetId(def._id);
    }
  }, [presetsQuery.data, selectedPresetId]);

  /* ─── Mutations ────────────────────────────────────────────────────── */
  const previewMutation = useMutation({
    mutationFn: (mode: 'copy_preview' | 'personal_outreach') => previewSubscriptionContactCopy({ filters: activeFilters, scope, presetId: selectedPresetId || undefined, mode }),
    onSuccess: (r) => { setPreviewText(r.previewText || r.text || ''); setPreviewCount(r.rowCount || 0); },
    onError: () => showToast('Preview failed', 'error'),
  });
  const exportMutation = useMutation({
    mutationFn: async () => exportSubscriptionContactCenter({ filters: activeFilters, scope, format, presetId: selectedPresetId || undefined }),
    onSuccess: async (result) => {
      const sr = result as { text?: string; previewText?: string; rowCount?: number; fileName?: string; data?: Record<string, unknown>[]; count?: number };
      const br = result as { data: Blob; headers?: Record<string, unknown> };
      if (format === 'clipboard' && sr.text) { await navigator.clipboard.writeText(sr.text); setPreviewText(sr.previewText || sr.text); setPreviewCount(sr.rowCount || sr.count || 0); showToast(`Copied ${sr.rowCount || sr.count || 0} contacts`); return; }
      if (format === 'txt' && sr.text) { const b = new Blob([sr.text], { type: 'text/plain' }); downloadFile(b, { filename: sr.fileName || 'subscription-contact-center.txt', contentType: 'text/plain' }); showToast('TXT export downloaded'); return; }
      if (format === 'json' && sr.data) { const b = new Blob([JSON.stringify(sr.data, null, 2)], { type: 'application/json' }); downloadFile(b, { filename: sr.fileName || 'subscription-contact-center.json', contentType: 'application/json' }); showToast('JSON export downloaded'); return; }
      downloadFile(br); showToast('Download started');
    },
    onError: () => showToast('Export failed', 'error'),
  });
  const saveAudienceMutation = useMutation({
    mutationFn: () => createAudienceSegment({ name: saveAudienceName, rules: { planIds: filters.planIds, planCodes: filters.planCodes, groupIds: filters.groupIds, departments: filters.departments, institutionNames: filters.institutionNames, bucket: filters.bucket, hasPhone: filters.hasPhone, hasEmail: filters.hasEmail, hasGuardian: filters.hasGuardian, paymentDue: filters.paymentDue, renewalThresholdDays: filters.renewalThresholdDays, profileScoreRange: filters.profileScoreRange } }),
    onSuccess: () => { setSaveAudienceName(''); invalidateCenter(); showToast('Saved as custom audience'); },
    onError: () => showToast('Could not save custom audience', 'error'),
  });
  const savePresetMutation = useMutation({
    mutationFn: () => editingPresetId ? updateSubscriptionContactCenterPreset(editingPresetId, presetDraft) : createSubscriptionContactCenterPreset(presetDraft),
    onSuccess: () => { setPresetDraft(presetDraftFromPreset()); setEditingPresetId(null); queryClient.invalidateQueries({ queryKey: ['subscription-contact-center-presets'] }); showToast('Preset saved'); },
    onError: () => showToast('Preset save failed', 'error'),
  });
  const deletePresetMutation = useMutation({
    mutationFn: (id: string) => deleteSubscriptionContactCenterPreset(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['subscription-contact-center-presets'] }); showToast('Preset removed'); },
    onError: () => showToast('Preset delete failed', 'error'),
  });
  const subscriptionMutation = useMutation({
    mutationFn: async () => {
      const targets = manageMembers; if (!targets.length) return { successCount: 0, failureCount: 0 };
      let results: PromiseSettledResult<unknown>[] = [];
      if (manageMode === 'assign') { if (!assignDraft.planId) throw new Error('Plan required'); results = await Promise.allSettled(targets.map((m) => assignSubscription(m.userId, { planId: assignDraft.planId, notes: assignDraft.notes || undefined }))); }
      else if (manageMode === 'extend') { const d = Number(extendDraft.days); if (!Number.isFinite(d) || d <= 0) throw new Error('Valid days required'); results = await Promise.allSettled(targets.map((m) => extendSubscription(m.userId, d, extendDraft.notes || undefined))); }
      else if (manageMode === 'expire') { results = await Promise.allSettled(targets.map((m) => expireSubscriptionNow(m.userId))); }
      else { results = await Promise.allSettled(targets.map((m) => toggleAutoRenew(m.userId))); }
      const sc = results.filter((r) => r.status === 'fulfilled').length; return { successCount: sc, failureCount: results.length - sc };
    },
    onSuccess: ({ successCount, failureCount }) => { invalidateCenter(); setManageOpen(false); setManageMembers([]); showToast(failureCount > 0 ? `Completed with ${successCount} success and ${failureCount} failure` : `Updated ${successCount} subscription${successCount === 1 ? '' : 's'}`, failureCount > 0 ? 'error' : 'success'); },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Subscription action failed', 'error'),
  });

  /* ─── Action helpers ───────────────────────────────────────────────── */
  const setTab = (t: CenterTab) => { const n = new URLSearchParams(searchParams); n.set('tab', t); setSearchParams(n); };
  const applyOverviewPlan = (planId: string, nextTab: CenterTab, nextScope?: ContactScope) => {
    setSelectedIds([]); setFilters(() => ({ ...EMPTY_FILTERS, savedAudienceId: '', planIds: planId ? [planId] : [], selectedUserIds: [] }));
    if (nextScope) setScope(nextScope); setTab(nextTab);
  };
  const togglePlanFilter = (planId: string) => { setFilters((c) => ({ ...c, savedAudienceId: '', planIds: c.planIds?.includes(planId) ? c.planIds.filter((i) => i !== planId) : [...(c.planIds || []), planId] })); };
  const toggleSelected = (userId: string) => { setSelectedIds((c) => c.includes(userId) ? c.filter((i) => i !== userId) : [...c, userId]); };
  const toggleAllVisible = () => { const ids = visibleMembers.map((m) => m.userId); const all = ids.length > 0 && ids.every((id) => selectedIds.includes(id)); setSelectedIds(all ? [] : ids); };
  const copySingleValue = async (value: string, msg: string) => { if (!value) { showToast('No value available', 'error'); return; } await navigator.clipboard.writeText(value); showToast(msg); };
  const startPresetEdit = (p: SubscriptionContactCenterPreset) => { setEditingPresetId(p._id); setPresetDraft(presetDraftFromPreset(p)); setTab('presets'); };
  const openManage = (members: SubscriptionContactCenterMember[], mode: SubscriptionActionMode = 'assign') => { setManageMembers(members); setManageMode(mode); setManageOpen(true); };
  const refreshAll = () => { overviewQuery.refetch(); membersQuery.refetch(); };
  const isRefreshing = overviewQuery.isFetching || membersQuery.isFetching;

  /* ═══════════════════════════════════════════════════════════════════════
     Members Tab — renderMembersTable
     ═══════════════════════════════════════════════════════════════════════ */
  const renderMembersTable = () => (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="sticky top-4 z-10 rounded-[2rem] border border-slate-200/80 bg-white/95 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        {/* Primary filters row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={filters.search || ''} onChange={(e) => setFilters((c) => ({ ...c, search: e.target.value }))}
              placeholder="Search by name, email, phone, guardian, or plan"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-indigo-500" />
          </div>
          <div className="relative">
            <button onClick={() => setPlanPickerOpen((c) => !c)} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
              <CreditCard className="h-4 w-4 text-slate-400" /> Plans {filters.planIds?.length ? `(${filters.planIds.length})` : '(All)'} <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
            {planPickerOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-80 rounded-3xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Multi-plan filter</div>
                  <button onClick={() => setFilters((c) => ({ ...c, planIds: [], savedAudienceId: '' }))} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Clear</button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {planOptions.map((plan) => {
                    const checked = Boolean(filters.planIds?.includes(plan.id));
                    return (
                      <button key={plan.id} onClick={() => togglePlanFilter(plan.id)} className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition hover:bg-slate-50 dark:hover:bg-slate-900">
                        <div className="min-w-0"><div className="truncate font-medium text-slate-900 dark:text-white">{plan.name}</div><div className="truncate text-xs text-slate-500">{plan.code || plan.id}</div></div>
                        <span className={`ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full border transition ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-transparent dark:border-slate-700'}`}><Check className="h-3.5 w-3.5" /></span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <select value={filters.bucket || 'all'} onChange={(e) => setFilters((c) => ({ ...c, bucket: e.target.value, savedAudienceId: '' }))}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600">
            {BUCKET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => setShowAdvancedFilters((c) => !c)}
            className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition ${showAdvancedFilters ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'}`}>
            <Filter className="h-4 w-4" /> Filters <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {/* Advanced filters (collapsible) */}
        {showAdvancedFilters && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:grid-cols-3 lg:grid-cols-4">
            <select value={filters.groupIds?.[0] || ''} onChange={(e) => setFilters((c) => ({ ...c, groupIds: e.target.value ? [e.target.value] : [], savedAudienceId: '' }))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">All groups</option>
              {(filterOptions?.groups || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={filters.departments?.[0] || ''} onChange={(e) => setFilters((c) => ({ ...c, departments: e.target.value ? [e.target.value] : [], savedAudienceId: '' }))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">All departments</option>
              {(filterOptions?.departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filters.institutionNames?.[0] || ''} onChange={(e) => setFilters((c) => ({ ...c, institutionNames: e.target.value ? [e.target.value] : [], savedAudienceId: '' }))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="">All institutions</option>
              {(filterOptions?.institutionNames || []).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select value={String(filters.renewalThresholdDays || overviewQuery.data?.renewalThresholdDays || thresholdOptions[1] || 7)}
              onChange={(e) => setFilters((c) => ({ ...c, renewalThresholdDays: Number(e.target.value) || undefined, savedAudienceId: '' }))}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
              {thresholdOptions.map((o) => <option key={o} value={o}>Renewal in {o} days</option>)}
            </select>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
              <input type="checkbox" checked={Boolean(filters.hasPhone)} onChange={(e) => setFilters((c) => ({ ...c, hasPhone: e.target.checked || undefined, savedAudienceId: '' }))} className="rounded" /> Has phone
            </label>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
              <input type="checkbox" checked={Boolean(filters.hasEmail)} onChange={(e) => setFilters((c) => ({ ...c, hasEmail: e.target.checked || undefined, savedAudienceId: '' }))} className="rounded" /> Has email
            </label>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
              <input type="checkbox" checked={Boolean(filters.paymentDue)} onChange={(e) => setFilters((c) => ({ ...c, paymentDue: e.target.checked || undefined, savedAudienceId: '' }))} className="rounded" /> Payment due
            </label>
            {canViewGuardian && (
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
                <input type="checkbox" checked={Boolean(filters.hasGuardian)} onChange={(e) => setFilters((c) => ({ ...c, hasGuardian: e.target.checked || undefined, savedAudienceId: '' }))} className="rounded" /> Has guardian
              </label>
            )}
          </div>
        )}
      </div>

      {/* ── Bulk action bar ────────────────────────────────────────────── */}
      <div className="sticky top-36 z-10 rounded-[2rem] border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 font-semibold text-white shadow-sm">
            <Users className="h-3.5 w-3.5" /> {selectedIds.length} selected
          </span>
          {selectedIds.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> Locked to selected rows
            </span>
          )}
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <button onClick={() => { setScope('phones'); setTab('export'); }} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2 font-medium transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Phone className="h-3.5 w-3.5 text-slate-400" /> Phones</button>
          <button onClick={() => { setScope('emails'); setTab('export'); }} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2 font-medium transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Mail className="h-3.5 w-3.5 text-slate-400" /> Emails</button>
          <button onClick={() => { setScope('raw'); setTab('export'); }} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2 font-medium transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Download className="h-3.5 w-3.5 text-slate-400" /> Export</button>
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <button onClick={() => navigate(ADMIN_PATHS.campaignsNew, { state: { prefillAudienceFilters: selectedIds.length > 0 ? activeFilters : trimFilterPayload(filters), prefillSelectedUserIds: selectedIds, prefillCampaignName: selectedIds.length > 0 ? `Selected audience (${selectedIds.length})` : `${bucketLabel(String(filters.bucket || 'all'))} audience` } })}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 font-medium text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200 dark:hover:bg-indigo-950/60">
            <Sparkles className="h-3.5 w-3.5" /> Campaign
          </button>
          {canPersonalOutreach && <button onClick={() => setTab('outreach')} className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-3 py-2 font-medium text-white shadow-sm transition hover:bg-indigo-700"><Phone className="h-3.5 w-3.5" /> Outreach</button>}
          <button onClick={() => openManage(selectedMembers)} disabled={selectedMembers.length === 0} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-3 py-2 font-medium transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-900"><Settings2 className="h-3.5 w-3.5 text-slate-400" /> Manage</button>
          {canViewGuardian && (
            <label className="ml-auto inline-flex items-center gap-2 text-xs font-medium text-slate-500">
              <input type="checkbox" checked={showGuardianColumns} onChange={(e) => setShowGuardianColumns(e.target.checked)} className="rounded" /> Guardian cols
            </label>
          )}
        </div>
      </div>

      {/* ── Members container ──────────────────────────────────────────── */}
      <div className="rounded-[2rem] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Plan Members</h3>
            <p className="text-sm text-slate-500">One table, one filter bar, one bulk action bar. Copy, export, and outreach all run on the same audience.</p>
          </div>
          <div className="flex items-center gap-2">
            <input value={saveAudienceName} onChange={(e) => setSaveAudienceName(e.target.value)} placeholder="Save filters as audience"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" />
            <button onClick={() => saveAudienceMutation.mutate()} disabled={!saveAudienceName || saveAudienceMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
        {/* Saved audiences */}
        {((filterOptions?.savedAudiences || []).length > 0 || filters.savedAudienceId) && (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800/50">
            {(filterOptions?.savedAudiences || []).map((a) => (
              <button key={a.id} onClick={() => setFilters((c) => ({ ...c, savedAudienceId: a.id }))}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${filters.savedAudienceId === a.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                {a.name} ({a.memberCountCached})
              </button>
            ))}
            {filters.savedAudienceId && <button onClick={() => setFilters((c) => ({ ...c, savedAudienceId: '' }))} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Clear saved audience</button>}
          </div>
        )}

        {/* ── Mobile card view ─────────────────────────────────────────── */}
        <div className="space-y-3 px-4 pb-4 pt-4 lg:hidden">
          {membersQuery.isLoading ? Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-3xl border border-slate-200 p-4 dark:border-slate-800"><Skeleton className="mb-3 h-5 w-2/3" /><Skeleton className="mb-2 h-4 w-1/2" /><Skeleton className="h-4 w-1/3" /></div>
          )) : visibleMembers.map((m) => (
            <div key={m.userId} className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selectedIds.includes(m.userId)} onChange={() => toggleSelected(m.userId)} className="mt-1.5 rounded" />
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-sm font-bold text-white">{avatarInitials(m.fullName)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div><h4 className="text-sm font-semibold text-slate-900 dark:text-white">{m.fullName}</h4><p className="text-xs text-slate-500">{m.planName}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${bucketBadge(m.bucket)}`}>{bucketLabel(m.bucket)}</span>
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-slate-400" /> {m.phone || 'No phone'}</div>
                    <div className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-slate-400" /> {m.email || 'No email'}</div>
                    <div className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-slate-400" /> Expires: {formatDate(m.expiresAtUTC)}</div>
                    {canViewGuardian && showGuardianColumns && <div className="flex items-center gap-1.5"><Users className="h-3 w-3 text-slate-400" /> {m.guardianPhone || m.guardianEmail || 'No guardian contact'}</div>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => copySingleValue(m.phone, 'Phone copied')} className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Phone className="h-3 w-3" /> Copy</button>
                    <button onClick={() => copySingleValue(m.email, 'Email copied')} className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Mail className="h-3 w-3" /> Copy</button>
                    <button onClick={() => openManage([m])} className="rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-indigo-700">Manage</button>
                    <button onClick={() => navigate(m.openProfileRoute)} className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 px-3 py-2 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><ExternalLink className="h-3 w-3" /> Profile</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!membersQuery.isLoading && visibleMembers.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-10 text-center dark:border-slate-800">
              <Users className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-400">No members found for the current filters.</p>
            </div>
          )}
        </div>

        {/* ── Desktop table view ───────────────────────────────────────── */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full table-fixed text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50/80 text-left dark:border-slate-800 dark:bg-slate-900/50">
                <th className="w-12 px-4 py-3"><input type="checkbox" checked={visibleMembers.length > 0 && visibleMembers.every((m) => selectedIds.includes(m.userId))} onChange={toggleAllVisible} className="rounded" /></th>
                <th className="w-[19%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Student</th>
                <th className="w-[13%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Phone</th>
                <th className="w-[18%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Email</th>
                {canViewGuardian && showGuardianColumns && <th className="w-[14%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Guardian</th>}
                <th className="w-[12%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Plan</th>
                <th className="w-[10%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Bucket</th>
                <th className="w-[9%] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Expiry</th>
                <th className="w-[12rem] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {membersQuery.isLoading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={showGuardianColumns ? 9 : 8} className="px-4 py-4"><Skeleton className="h-5 w-full" /></td></tr>
              )) : visibleMembers.map((m, idx) => (
                <tr key={m.userId} className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/20 ${idx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-900/20' : ''}`}>
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(m.userId)} onChange={() => toggleSelected(m.userId)} className="rounded" /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-xs font-bold text-white">{avatarInitials(m.fullName)}</div>
                      <div className="min-w-0"><div className="truncate font-medium text-slate-900 dark:text-white">{m.fullName}</div><div className="truncate text-xs text-slate-500">{m.department || 'No department'} · {m.groupNames.join(', ') || 'No group'}</div></div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{m.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{m.email || '—'}</td>
                  {canViewGuardian && showGuardianColumns && <td className="px-4 py-3 text-xs text-slate-500">{m.guardianPhone || m.guardianEmail || '—'}</td>}
                  <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-200">{m.planName}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${bucketBadge(m.bucket)}`}><span className={`h-1.5 w-1.5 rounded-full ${bucketDot(m.bucket)}`} />{m.bucket.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{m.expiresAtUTC ? new Date(m.expiresAtUTC).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button onClick={() => copySingleValue(m.phone, 'Phone copied')} title="Copy phone" className="rounded-xl border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-900"><Phone className="h-3.5 w-3.5" /></button>
                      <button onClick={() => copySingleValue(m.email, 'Email copied')} title="Copy email" className="rounded-xl border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-900"><Mail className="h-3.5 w-3.5" /></button>
                      <button onClick={() => copySingleValue([m.fullName, m.phone, m.email].filter(Boolean).join(' | '), 'Contact bundle copied')} title="Copy all" className="rounded-xl border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-900"><Copy className="h-3.5 w-3.5" /></button>
                      {m.phone && <a href={`tel:${m.phone}`} title="Call" className="rounded-xl border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-900"><Phone className="h-3.5 w-3.5" /></a>}
                      {m.phone && <a href={`sms:${m.phone}`} title="SMS" className="rounded-xl border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-900"><MessageSquare className="h-3.5 w-3.5" /></a>}
                      {m.email && <a href={`mailto:${m.email}`} title="Email" className="rounded-xl border border-slate-200 p-1.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-900"><Mail className="h-3.5 w-3.5" /></a>}
                      <button onClick={() => navigate(m.openProfileRoute)} title="Open profile" className="rounded-xl bg-indigo-600 p-1.5 text-white transition hover:bg-indigo-700"><ExternalLink className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!membersQuery.isLoading && visibleMembers.length === 0 && (
                <tr><td colSpan={showGuardianColumns ? 9 : 8} className="px-4 py-10 text-center"><Users className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" /><p className="text-sm text-slate-400">No members found for the current filters.</p></td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ───────────────────────────────────────────────── */}
        {(membersQuery.data?.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 dark:border-slate-800">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Page {membersQuery.data?.page || 1} of {membersQuery.data?.totalPages || 1}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={(membersQuery.data?.page || 1) <= 1}
                className="rounded-xl border border-slate-200 p-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-900" title="Previous">
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pageRange(membersQuery.data?.page || 1, membersQuery.data?.totalPages || 1).map((p, i) =>
                p === '...' ? <span key={`e${i}`} className="px-2 text-sm text-slate-400">…</span> : (
                  <button key={p} onClick={() => setPage(p)} className={`min-w-[2.25rem] rounded-xl px-2 py-2 text-sm font-medium transition ${p === (membersQuery.data?.page || 1) ? 'bg-indigo-600 text-white shadow-sm' : 'border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900'}`}>{p}</button>
                )
              )}
              <button onClick={() => setPage((c) => Math.min(membersQuery.data?.totalPages || 1, c + 1))} disabled={(membersQuery.data?.page || 1) >= (membersQuery.data?.totalPages || 1)}
                className="rounded-xl border border-slate-200 p-2 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-900" title="Next">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════════════════
     Main Return — Shell, Header, Tabs, Tab Content
     ═══════════════════════════════════════════════════════════════════════ */
  return (
    <AdminGuardShell
      title="Subscription Contact Center"
      description="One canonical subscription-wise audience workspace for copy, export, custom saved audiences, and personal outreach."
      requiredModule="notifications"
      allowedRoles={['superadmin', 'admin', 'moderator', 'support_agent']}
    >
      <AdminTabNav tabs={[
        { key: 'plans', label: 'Subscription Plans', path: ADMIN_PATHS.subscriptionPlans, icon: CreditCard },
        { key: 'subs', label: 'Subscriptions', path: ADMIN_PATHS.subscriptionsV2, icon: CreditCard },
        { key: 'contact', label: 'Contact Center', path: ADMIN_PATHS.subscriptionContactCenter, icon: Users },
      ]} />

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2.5 rounded-2xl px-5 py-3.5 text-sm font-medium text-white shadow-lg backdrop-blur transition-all ${toast.type === 'success' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-rose-600 shadow-rose-600/20'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      <ManageSubscriptionModal open={manageOpen} members={manageMembers} plans={availablePlans}
        submitting={subscriptionMutation.isPending} mode={manageMode} setMode={setManageMode}
        assignDraft={assignDraft} setAssignDraft={setAssignDraft} extendDraft={extendDraft} setExtendDraft={setExtendDraft}
        onClose={() => setManageOpen(false)} onSubmit={() => subscriptionMutation.mutate()} />

      <div className="space-y-6">
        {/* ═══════════════════════════════════════════════════════════════
           Hero Header — Dark gradient with cyan accents
           ═══════════════════════════════════════════════════════════════ */}
        <div className="rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-[0_24px_70px_rgba(6,10,24,0.24)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/20 backdrop-blur"><Users className="h-4 w-4 text-cyan-300" /></div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200/85">Communication Hub</p>
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Subscription Contact Center</h2>
              <p className="mt-3 text-sm leading-7 text-slate-300">Use real subscription status as the single audience source for copy, export, guardian-aware handoff, saved audiences, campaign outreach, and direct subscription operations.</p>
            </div>
            <button type="button" onClick={() => refreshAll()} disabled={isRefreshing}
              className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
          {/* ── Pill-style tab navigation ──────────────────────────────── */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {CENTER_TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.key} onClick={() => setTab(item.key)}
                  className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${tab === item.key ? 'bg-white text-slate-900 shadow-md' : 'bg-white/10 text-white/80 hover:bg-white/15 hover:text-white'}`}>
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
           Overview Tab
           ═══════════════════════════════════════════════════════════════ */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Stat cards */}
            {overviewQuery.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {[
                  { label: 'Total members', value: overviewQuery.data?.summary.totalMembers || 0, icon: Users, gradient: 'from-indigo-500/10 to-cyan-500/10 dark:from-indigo-500/5 dark:to-cyan-500/5', iconBg: 'bg-indigo-100 dark:bg-indigo-900/30', iconColor: 'text-indigo-600 dark:text-indigo-400' },
                  { label: 'Active', value: overviewQuery.data?.summary.activeCount || 0, icon: CheckCircle2, gradient: 'from-emerald-500/10 to-emerald-500/5', iconBg: 'bg-emerald-100 dark:bg-emerald-900/30', iconColor: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Renewal due', value: overviewQuery.data?.summary.renewalDueCount || 0, icon: Clock, gradient: 'from-amber-500/10 to-amber-500/5', iconBg: 'bg-amber-100 dark:bg-amber-900/30', iconColor: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Expired', value: overviewQuery.data?.summary.expiredCount || 0, icon: XCircle, gradient: 'from-rose-500/10 to-rose-500/5', iconBg: 'bg-rose-100 dark:bg-rose-900/30', iconColor: 'text-rose-600 dark:text-rose-400' },
                  { label: 'Cancelled / Paused', value: overviewQuery.data?.summary.cancelledCount || 0, icon: AlertCircle, gradient: 'from-slate-500/10 to-slate-500/5', iconBg: 'bg-slate-200 dark:bg-slate-800', iconColor: 'text-slate-500 dark:text-slate-400' },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className={`group rounded-3xl border border-slate-200/80 bg-gradient-to-br ${s.gradient} p-5 shadow-sm transition hover:shadow-md dark:border-slate-800`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{s.label}</p>
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.iconBg} transition group-hover:scale-110`}><Icon className={`h-4 w-4 ${s.iconColor}`} /></div>
                      </div>
                      <p className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{s.value}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Plan overview table */}
            <div className="rounded-[2rem] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-white">Audience Overview</h3>
                  <p className="text-sm text-slate-500">Quick actions always jump to the same canonical filters. No duplicate contact pages, no manual bucket maintenance.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left dark:border-slate-800 dark:bg-slate-900/50">
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Plan</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Total</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Active</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Renewal Due</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Expired</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Cancelled</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Phone</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Email</th>
                      <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {overviewQuery.isLoading ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}><td colSpan={9} className="px-5 py-4"><Skeleton className="h-5 w-full" /></td></tr>
                    )) : (overviewQuery.data?.plans || []).map((plan, idx) => (
                      <tr key={`${plan.planId || plan.planCode || plan.planName}-${idx}`} className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/20 ${idx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-900/20' : ''}`}>
                        <td className="px-5 py-4 font-semibold text-slate-950 dark:text-white">{plan.planName}</td>
                        <td className="px-5 py-4 font-medium">{plan.totalMembers}</td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{plan.activeCount}</span></td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" />{plan.renewalDueCount}</span></td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" />{plan.expiredCount}</span></td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-400" />{plan.cancelledCount}</span></td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400"><Phone className="h-3 w-3" />{plan.phoneReadyCount}</span></td>
                        <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/20 dark:text-sky-400"><Mail className="h-3 w-3" />{plan.emailReadyCount}</span></td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => applyOverviewPlan(plan.planId, 'members')} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Members</button>
                            <button onClick={() => applyOverviewPlan(plan.planId, 'export', 'phones')} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Phones</button>
                            <button onClick={() => applyOverviewPlan(plan.planId, 'export', 'emails')} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Emails</button>
                            <button onClick={() => applyOverviewPlan(plan.planId, 'export', 'raw')} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Export</button>
                            {canPersonalOutreach && <button onClick={() => applyOverviewPlan(plan.planId, 'outreach')} className="rounded-xl bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">Outreach</button>}
                            <button onClick={() => navigate(ADMIN_PATHS.campaignsNew, { state: { prefillAudienceFilters: { planIds: [plan.planId] }, prefillCampaignName: `${plan.planName} audience` } })}
                              className="rounded-xl bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-700">Campaign</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Members Tab */}
        {tab === 'members' && renderMembersTable()}

        {/* ═══════════════════════════════════════════════════════════════
           Personal Outreach Tab
           ═══════════════════════════════════════════════════════════════ */}
        {tab === 'outreach' && (
          <div className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30"><Phone className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Outreach</p></div>
                  <h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">Personal Outreach Mode</h3>
                  <p className="mt-1 text-sm text-slate-500">Use the currently selected audience or the first visible members from the filtered table. Guardian access stays role-protected.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => { setScope('phones'); previewMutation.mutate('personal_outreach'); }} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Phone className="h-4 w-4 text-slate-400" /> Preview phones</button>
                <button onClick={() => { setScope('emails'); previewMutation.mutate('personal_outreach'); }} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Mail className="h-4 w-4 text-slate-400" /> Preview emails</button>
                <button onClick={() => { setScope('combined'); previewMutation.mutate('personal_outreach'); }} className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Layers className="h-4 w-4 text-slate-400" /> Preview bundle</button>
                <button onClick={() => setTab('export')} className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700"><Download className="h-4 w-4" /> Open Export / Copy</button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {outreachMembers.map((m) => (
                <div key={m.userId} className="group rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-sm font-bold text-white shadow-sm">{avatarInitials(m.fullName)}</div>
                      <div><h4 className="text-base font-semibold text-slate-950 dark:text-white">{m.fullName}</h4>
                        <div className="flex items-center gap-2 text-sm text-slate-500"><span>{m.planName}</span><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${bucketBadge(m.bucket)}`}><span className={`h-1.5 w-1.5 rounded-full ${bucketDot(m.bucket)}`} />{m.bucket.replace('_', ' ')}</span></div>
                      </div>
                    </div>
                    <button onClick={() => navigate(m.openProfileRoute)} className="rounded-xl border border-slate-200 p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:hover:bg-slate-900"><ExternalLink className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300"><Phone className="h-3.5 w-3.5 text-slate-400" /> {m.phone || 'No phone'}</div>
                    <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300"><Mail className="h-3.5 w-3.5 text-slate-400" /> {m.email || 'No email'}</div>
                    {canViewGuardian && (m.guardianPhone || m.guardianEmail) && (
                      <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"><Users className="h-3.5 w-3.5" /> Guardian: {m.guardianPhone || m.guardianEmail}</div>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => copySingleValue(m.phone, 'Phone copied')} title="Copy phone" className="flex-1 rounded-2xl border border-slate-200 p-2.5 text-center transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Phone className="mx-auto h-4 w-4 text-slate-500" /></button>
                    {m.phone && <a href={`tel:${m.phone}`} title="Call" className="flex-1 rounded-2xl border border-slate-200 p-2.5 text-center transition hover:bg-emerald-50 dark:border-slate-700 dark:hover:bg-emerald-900/20"><Phone className="mx-auto h-4 w-4 text-emerald-600" /></a>}
                    {m.phone && <a href={`sms:${m.phone}`} title="SMS" className="flex-1 rounded-2xl border border-slate-200 p-2.5 text-center transition hover:bg-sky-50 dark:border-slate-700 dark:hover:bg-sky-900/20"><MessageSquare className="mx-auto h-4 w-4 text-sky-600" /></a>}
                    {m.email && <a href={`mailto:${m.email}`} title="Email" className="flex-1 rounded-2xl border border-slate-200 p-2.5 text-center transition hover:bg-violet-50 dark:border-slate-700 dark:hover:bg-violet-900/20"><Mail className="mx-auto h-4 w-4 text-violet-600" /></a>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           Export / Copy Tab
           ═══════════════════════════════════════════════════════════════ */}
        {tab === 'export' && (
          <div className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30"><Download className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /></div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Export</p></div>
                  <h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">Export / Copy Center</h3>
                  <p className="mt-1 text-sm text-slate-500">The same filtered audience powers clipboard copy, plain-text handoff, CSV/XLSX export, and guardian-inclusive output.</p>
                </div>
              </div>
              {/* Scope selection — card-style radio */}
              <div className="mt-6">
                <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Scope</label>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {SCOPE_OPTIONS.filter((o) => canViewGuardian || !['guardian', 'student_guardian'].includes(o.value)).map((o) => {
                    const Icon = o.icon; const active = scope === o.value;
                    return (
                      <button key={o.value} onClick={() => setScope(o.value)}
                        className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 text-center text-xs font-medium transition ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'}`}>
                        <Icon className="h-5 w-5" />{o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Format selection — card-style radio */}
              <div className="mt-5">
                <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Format</label>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {FORMAT_OPTIONS.map((o) => {
                    const Icon = o.icon; const active = format === o.value;
                    return (
                      <button key={o.value} onClick={() => setFormat(o.value)}
                        className={`flex items-center gap-2.5 rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-400 dark:bg-indigo-950/30 dark:text-indigo-300' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'}`}>
                        <Icon className="h-4 w-4 shrink-0" />{o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Preset selector */}
              <div className="mt-5">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preset</label>
                <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 sm:w-auto sm:min-w-[280px]">
                  <option value="">Default preset</option>
                  {(presetsQuery.data || []).map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              {/* Action buttons */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button onClick={() => previewMutation.mutate('copy_preview')} disabled={previewMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900">
                  <Eye className="h-4 w-4" /> {previewMutation.isPending ? 'Loading...' : 'Preview output'}
                </button>
                <button onClick={() => exportMutation.mutate()} disabled={!canExport || exportMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50">
                  {exportMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {exportMutation.isPending ? 'Exporting...' : 'Run export / copy'}
                </button>
                <button onClick={() => setTab('presets')} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Settings2 className="h-4 w-4" /> Manage presets</button>
              </div>
              {/* Info panel */}
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="grid gap-3 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
                  <div className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" /> {selectedIds.length > 0 ? <><strong>{selectedIds.length}</strong> selected members</> : <>All <strong>{totalMemberCount}</strong> filtered members</>}</div>
                  <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-slate-400" /> Scope: <strong>{SCOPE_OPTIONS.find((o) => o.value === scope)?.label || scope}</strong></div>
                  <div className="flex items-center gap-2"><Hash className="h-4 w-4 text-slate-400" /> Preview rows: <strong>{previewCount}</strong></div>
                </div>
              </div>
            </div>
            {/* Preview panel */}
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</h4>
                {previewText && <button onClick={() => navigator.clipboard.writeText(previewText).then(() => showToast('Preview copied'))} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900"><Copy className="h-3.5 w-3.5" /> Copy preview</button>}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                <textarea readOnly value={previewText} rows={14} className="w-full rounded-2xl border-0 bg-transparent px-4 py-4 font-mono text-xs leading-relaxed text-slate-700 outline-none dark:text-slate-200" />
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           Format Presets Tab
           ═══════════════════════════════════════════════════════════════ */}
        {tab === 'presets' && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            {/* Preset list */}
            <div className="rounded-[2rem] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
                <div><h3 className="text-lg font-bold text-slate-950 dark:text-white">Saved Format Presets</h3>
                  <p className="text-sm text-slate-500">One preset can drive clipboard output, TXT, CSV, XLSX, and JSON export labels.</p></div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {(presetsQuery.data || []).map((preset) => (
                  <div key={preset._id} className="group flex flex-wrap items-center justify-between gap-4 px-6 py-5 transition hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"><Settings2 className="h-4 w-4 text-slate-500" /></div>
                        <h4 className="font-semibold text-slate-900 dark:text-white">{preset.name}</h4>
                        {preset.isDefault && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Default</span>}
                      </div>
                      {/* Visual preview */}
                      <div className="rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                        {preset.includePlan ? '[Plan] ' : ''}{preset.includeStatus ? 'Status | ' : ''}{preset.includeName ? 'Name | ' : ''}{preset.prefix}+880XXXXXXXXX{preset.suffix}{preset.includeEmail ? ' | email' : ''}{preset.includeGuardian ? ' | guardian' : ''}
                      </div>
                      <p className="text-xs text-slate-500">
                        Separator: <code className="rounded bg-slate-100 px-1 py-0.5 dark:bg-slate-800">{compactSeparator(preset.separator)}</code>
                        {' · '}Fields: {[preset.includeName && 'name', preset.includeEmail && 'email', preset.includeGuardian && 'guardian', preset.includePlan && 'plan', preset.includeStatus && 'status'].filter(Boolean).join(', ') || 'phone only'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { setSelectedPresetId(preset._id); setTab('export'); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Use in export</button>
                      <button onClick={() => startPresetEdit(preset)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Edit</button>
                      {!preset.isDefault && (
                        <button onClick={() => deletePresetMutation.mutate(preset._id)} disabled={deletePresetMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:hover:bg-rose-950/20">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {(presetsQuery.data || []).length === 0 && (
                  <div className="px-6 py-10 text-center"><Settings2 className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" /><p className="text-sm text-slate-400">No presets found yet. Create one to get started.</p></div>
                )}
              </div>
            </div>
            {/* Preset editor */}
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30"><Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" /></div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{editingPresetId ? 'Edit' : 'Create'}</p></div>
                  <h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">{editingPresetId ? 'Edit Preset' : 'Create Preset'}</h3>
                  <p className="mt-1 text-sm text-slate-500">Keep formatting reusable and consistent across manual copy, outreach, and export.</p>
                </div>
                {editingPresetId && <button onClick={() => { setEditingPresetId(null); setPresetDraft(presetDraftFromPreset()); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Reset</button>}
              </div>
              <div className="mt-5 space-y-4">
                <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preset name</label>
                  <input value={presetDraft.name} onChange={(e) => setPresetDraft((c) => ({ ...c, name: e.target.value }))} placeholder="e.g. WhatsApp phones"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900/30" /></div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Prefix</label>
                    <input value={presetDraft.prefix} onChange={(e) => setPresetDraft((c) => ({ ...c, prefix: e.target.value }))} placeholder="WA:"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" /></div>
                  <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Suffix</label>
                    <input value={presetDraft.suffix} onChange={(e) => setPresetDraft((c) => ({ ...c, suffix: e.target.value }))} placeholder=";"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900" /></div>
                  <div><label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Separator</label>
                    <select value={presetDraft.separator} onChange={(e) => setPresetDraft((c) => ({ ...c, separator: e.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900">
                      <option value="\n">New line</option><option value=", ">Comma</option><option value="; ">Semicolon</option><option value=" | ">Pipe</option><option value="\t">Tab</option>
                    </select></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([['includeName', 'Include student name'], ['includeEmail', 'Include student email'], ['includeGuardian', 'Include guardian contact'], ['includePlan', 'Include plan name'], ['includeStatus', 'Include status bucket'], ['isDefault', 'Set as default preset']] as const).map(([field, label]) => (
                    <label key={field} className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200 px-4 py-3 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">
                      <input type="checkbox" checked={Boolean(presetDraft[field])} onChange={(e) => setPresetDraft((c) => ({ ...c, [field]: e.target.checked }))} className="rounded" /> {label}
                    </label>
                  ))}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sample output</p>
                  <p className="font-mono text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {`${presetDraft.includePlan ? '[Premium] ' : ''}${presetDraft.includeStatus ? 'Active | ' : ''}${presetDraft.includeName ? 'Student Name | ' : ''}${presetDraft.prefix || ''}+8801XXXXXXXXX${presetDraft.suffix || ''}${presetDraft.includeEmail ? ' | student@email.com' : ''}${presetDraft.includeGuardian ? ' | Guardian: +8801YYYYYYYYY' : ''}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => savePresetMutation.mutate()} disabled={!presetDraft.name.trim() || savePresetMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-50">
                    <Save className="h-4 w-4" /> {editingPresetId ? 'Update preset' : 'Save preset'}
                  </button>
                  <button onClick={() => { setSelectedPresetId(''); setPresetDraft(presetDraftFromPreset()); setEditingPresetId(null); }}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-900">Clear form</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
           Logs / History Tab
           ═══════════════════════════════════════════════════════════════ */}
        {tab === 'logs' && (
          <div className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"><History className="h-4 w-4 text-slate-500 dark:text-slate-400" /></div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Activity</p></div>
                  <h3 className="mt-3 text-lg font-bold text-slate-950 dark:text-white">Logs / History</h3>
                  <p className="mt-1 text-sm text-slate-500">Copy preview, export, outreach, and preset changes are all logged from the canonical module.</p>
                </div>
                <button onClick={() => logsQuery.refetch()} disabled={logsQuery.isFetching}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-900">
                  <RefreshCw className={`h-4 w-4 ${logsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh logs
                </button>
              </div>
            </div>
            {/* Log entries as cards */}
            <div className="space-y-3">
              {logsQuery.isLoading ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-slate-200 p-5 dark:border-slate-800"><Skeleton className="mb-3 h-5 w-1/3" /><Skeleton className="h-4 w-2/3" /></div>
              )) : (logsQuery.data?.items || []).map((item) => (
                <div key={item._id} className="group rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${logKindColor(item.kind)}`}>
                      {logKindIcon(item.kind)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-white">{item.title}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${logKindColor(item.kind)}`}>{item.kind}</span>
                            {item.category && <span>· {item.category}</span>}
                            {item.format && <span>· {item.format}</span>}
                            {item.rowCount > 0 && <span>· {item.rowCount} rows</span>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-medium text-slate-500">{relativeTime(item.createdAt)}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        Performed by: <span className="font-medium text-slate-700 dark:text-slate-300">{item.performedByName || 'System'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {!logsQuery.isLoading && (logsQuery.data?.items || []).length === 0 && (
                <div className="rounded-3xl border border-dashed border-slate-200 px-6 py-10 text-center dark:border-slate-800">
                  <History className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-400">No logs yet for this module.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminGuardShell>
  );
}
