import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getStudentGroups, createStudentGroup, updateStudentGroup, deleteStudentGroup,
  canDeleteStudentGroup, exportStudentGroups, exportGroupMembers, bulkUpdateStudentGroups, bulkDeleteStudentGroups,
} from '../../../api/adminStudentApi';
import { adminUi, ADMIN_DASHBOARD } from '../../../lib/appRoutes';
import { useModuleAccess } from '../../../hooks/useModuleAccess';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import {
  Plus, Search, Users, X, Palette, Tag,
  Star, MoreVertical, Pencil, Trash2, CheckCircle, XCircle,
  Megaphone, BookOpen, Download, ChevronDown, Info, Settings, Zap,
} from 'lucide-react';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import { downloadFile } from '../../../utils/download';
import ModernToggle from '../../../components/ui/ModernToggle';
import { showConfirmDialog } from '../../../lib/appDialog';
import RuleBuilder, { type DynamicRuleSet } from '../../../components/admin/students/RuleBuilder';

type Toast = { show: boolean; message: string; type: 'success' | 'error' };
type GroupType = 'manual' | 'dynamic';
type CardStyle = 'solid' | 'gradient' | 'outline' | 'minimal';

interface GroupForm {
  name: string; description: string; type: GroupType;
  shortCode: string; color: string; icon: string; cardStyleVariant: CardStyle;
  sortOrder: number; isFeatured: boolean;
  batch: string; department: string; visibilityNote: string;
  defaultExamVisibility: string; defaultCommunicationAudience: string;
}

const EMPTY_FORM: GroupForm = {
  name: '', description: '', type: 'manual',
  shortCode: '', color: '#6366f1', icon: 'Users', cardStyleVariant: 'solid',
  sortOrder: 0, isFeatured: false,
  batch: '', department: '', visibilityNote: '',
  defaultExamVisibility: 'all_students', defaultCommunicationAudience: '',
};

const CARD_STYLES: CardStyle[] = ['solid', 'gradient', 'outline', 'minimal'];
const DEPARTMENTS = ['science', 'arts', 'commerce'];
const EXAM_VIS = ['all_students', 'group_only', 'hidden'];
const GROUP_BULK_FIELDS = [
  { label: 'Department', value: 'department' },
  { label: 'Batch', value: 'batch' },
  { label: 'Exam Visibility', value: 'defaultExamVisibility' },
  { label: 'Featured', value: 'isFeatured' },
  { label: 'Active', value: 'isActive' },
] as const;

const COLOR_SWATCHES = ['#6366f1', '#ef4444', '#22c55e', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6'];

const generateSlug = (name: string) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';
const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';

function CollapsibleSection({ title, icon, children, defaultOpen = true }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-1 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
      >
        <span className="flex items-center gap-1.5">{icon} {title}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEscapeKey(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function GroupCard({ g, selected, onToggleSelect, onEdit, onDelete, onOpen, onExport, onNavigate, canDelete, canExport }: {
  g: Record<string, unknown>;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void; onDelete: () => void; onOpen: () => void; onExport: () => void;
  onNavigate: (path: string) => void;
  canDelete: boolean;
  canExport: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const color = (g.color as string) || '#6366f1';
  const style = (g.cardStyleVariant as CardStyle) || 'solid';
  const memberCount = (g.memberCountCached as number) ?? (g.memberCount as number) ?? (g.studentCount as number) ?? 0;

  const cardBg = style === 'gradient'
    ? { background: `linear-gradient(135deg, ${color}15, ${color}05)` }
    : style === 'solid'
      ? { borderLeftColor: color, borderLeftWidth: '4px' }
      : {};

  return (
    <div
      className={`relative rounded-xl border bg-white p-5 transition hover:shadow-md dark:bg-slate-900 cursor-pointer ${style === 'outline' ? 'border-2' : 'border-slate-200 dark:border-slate-700'
        }`}
      style={style === 'outline' ? { borderColor: `${color}60` } : cardBg}
      onClick={onOpen}
    >
      {/* Header row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 rounded border-slate-300"
          />
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}20` }}>
            <Users size={18} style={{ color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{String(g.name ?? '')}</h3>
              {!!g.isFeatured && <Star size={12} className="text-amber-500 fill-amber-500" />}
            </div>
            {!!g.shortCode && (
              <span className="text-[10px] font-mono text-slate-400">{String(g.shortCode)}</span>
            )}
          </div>
        </div>

        {/* Actions menu */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowMenu(!showMenu)} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <button onClick={() => { setShowMenu(false); onEdit(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                <Pencil size={12} /> Edit
              </button>
              <button onClick={() => { setShowMenu(false); onNavigate(`${ADMIN_PATHS.campaignsNew}?audienceType=group&audienceGroupId=${g._id}&audienceGroupName=${encodeURIComponent(g.name as string || '')}`); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                <Megaphone size={12} /> Send Campaign
              </button>
              <button onClick={() => { setShowMenu(false); onNavigate(ADMIN_PATHS.exams); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                <BookOpen size={12} /> Create Exam
              </button>
              {canExport && (
                <button onClick={() => { setShowMenu(false); onExport(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700">
                  <Download size={12} /> Export
                </button>
              )}
              {canDelete && (
                <button onClick={() => { setShowMenu(false); onDelete(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {!!g.description && (
        <p className="mt-2 text-xs text-slate-500 line-clamp-2">{String(g.description)}</p>
      )}

      {/* Metrics row */}
      <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <Users size={12} />
          <span className="font-medium text-slate-700 dark:text-slate-300">{memberCount}</span>
          <span>members</span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize"
          style={{ backgroundColor: `${color}15`, color }}>
          {String(g.type)}
        </span>
        {!!g.department && (
          <span className="capitalize text-slate-400">{String(g.department)}</span>
        )}
        {!!g.batch && <span className="text-slate-400">Batch {String(g.batch)}</span>}
        {g.defaultExamVisibility === 'group_only' && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">Exam: Group Only</span>
        )}
      </div>
    </div>
  );
}

export default function StudentGroupsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasAccess } = useModuleAccess();
  const canView = hasAccess('students_groups', 'view');
  const canCreate = hasAccess('students_groups', 'create');
  const canDelete = hasAccess('students_groups', 'delete');
  const canExport = hasAccess('students_groups', 'export');
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [bulkField, setBulkField] = useState<(typeof GROUP_BULK_FIELDS)[number]['value']>('department');
  const [bulkValue, setBulkValue] = useState('');
  const [groupModal, setGroupModal] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [form, setForm] = useState<GroupForm>(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; name: string; safe?: boolean; blockers?: { activeMemberCount?: number; linkedExams?: { _id: string; title: string }[]; linkedCampaigns?: { _id: string; campaignName: string }[] } }>({ open: false, id: '', name: '' });
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [dynamicRules, setDynamicRules] = useState<DynamicRuleSet>({});

  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, show: false })), 3000);
  };

  // Redirect to dashboard if admin lacks view permission
  useEffect(() => {
    if (!canView) {
      showToast('Insufficient permissions to view student groups', 'error');
      navigate(ADMIN_DASHBOARD, { replace: true });
    }
  }, [canView, navigate]);

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['admin-student-groups'],
    queryFn: () => getStudentGroups(),
  });

  const rawGroups: Record<string, unknown>[] =
    (groupsData as { groups?: Record<string, unknown>[]; items?: Record<string, unknown>[]; data?: Record<string, unknown>[] })?.groups ??
    (groupsData as { data?: Record<string, unknown>[] })?.data ??
    (groupsData as { items?: Record<string, unknown>[] })?.items ??
    (Array.isArray(groupsData) ? groupsData as Record<string, unknown>[] : []);

  const filteredGroups = useMemo(() => (
    search
      ? rawGroups.filter(g => `${String(g.name || '')} ${String(g.slug || '')} ${String(g.batch || '')}`.toLowerCase().includes(search.toLowerCase()))
      : rawGroups
  ), [rawGroups, search]);
  const allVisibleSelected = filteredGroups.length > 0 && filteredGroups.every((g) => selectedIds.includes(String(g._id)));

  const openCreate = () => { setForm(EMPTY_FORM); setNameError(false); setDynamicRules({}); setGroupModal({ open: true }); };
  const openEdit = (g: Record<string, unknown>) => {
    setForm({
      name: (g.name as string) ?? '',
      description: (g.description as string) ?? '',
      type: (g.type as GroupType) ?? 'manual',
      shortCode: (g.shortCode as string) ?? '',
      color: (g.color as string) ?? '#6366f1',
      icon: (g.icon as string) ?? 'Users',
      cardStyleVariant: (g.cardStyleVariant as CardStyle) ?? 'solid',
      sortOrder: (g.sortOrder as number) ?? 0,
      isFeatured: (g.isFeatured as boolean) ?? false,
      batch: (g.batch as string) ?? '',
      department: (g.department as string) ?? '',
      visibilityNote: (g.visibilityNote as string) ?? '',
      defaultExamVisibility: (g.defaultExamVisibility as string) ?? 'all_students',
      defaultCommunicationAudience: (g.defaultCommunicationAudience as string) ?? '',
    });
    setGroupModal({ open: true, editId: g._id as string });
    setDynamicRules((g.rules as DynamicRuleSet) ?? {});
    setNameError(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (form.type === 'dynamic') {
        payload.rules = dynamicRules;
      }
      if (groupModal.editId) {
        await updateStudentGroup(groupModal.editId, payload);
        showToast('Group updated');
      } else {
        await createStudentGroup(payload);
        showToast('Group created');
      }
      qc.invalidateQueries({ queryKey: ['admin-student-groups'] });
      setGroupModal({ open: false });
    } catch { showToast('Failed to save group', 'error'); }
  };

  const confirmDelete = async (id: string, name: string) => {
    try {
      const res = await canDeleteStudentGroup(id);
      setDeleteConfirm({ open: true, id, name, safe: res.canDelete ?? res.safe ?? true, blockers: res.blockers });
    } catch {
      setDeleteConfirm({ open: true, id, name, safe: true });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteStudentGroup(deleteConfirm.id);
      qc.invalidateQueries({ queryKey: ['admin-student-groups'] });
      setDeleteConfirm({ open: false, id: '', name: '' });
      showToast('Group deleted');
    } catch { showToast('Failed to delete', 'error'); }
  };

  const set = (field: keyof GroupForm, value: string | number | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const toggleGroupSelection = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredGroups.map((group) => String(group._id));
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleExport = async () => {
    try {
      const blob = await exportStudentGroups({ q: search || undefined, format: exportFormat });
      downloadFile(blob, { filename: `student-groups.${exportFormat}` });
      showToast('Groups exported');
    } catch {
      showToast('Failed to export groups', 'error');
    }
  };

  const handleExportMembers = async (groupId: string, groupName: string) => {
    try {
      const blob = await exportGroupMembers(groupId, 'csv');
      const safeName = groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || groupId;
      downloadFile(blob, { filename: `${safeName}_members.csv` });
      showToast('Group members exported');
    } catch {
      showToast('Failed to export group members', 'error');
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedIds.length === 0) return;
    const normalizedValue = bulkValue.trim();
    let update: Record<string, unknown> = {};

    if (bulkField === 'department' || bulkField === 'batch' || bulkField === 'defaultExamVisibility') {
      if (!normalizedValue) {
        showToast('Choose a bulk value', 'error');
        return;
      }
      update = { [bulkField]: normalizedValue };
    } else if (bulkField === 'isFeatured' || bulkField === 'isActive') {
      update = { [bulkField]: normalizedValue === 'true' };
    }

    try {
      await bulkUpdateStudentGroups(selectedIds, update);
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['admin-student-groups'] });
      showToast('Bulk update applied');
    } catch {
      showToast('Bulk update failed', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = await showConfirmDialog({
      title: 'Delete groups',
      message: `Delete ${selectedIds.length} selected groups? Unsafe groups will be skipped.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const result = await bulkDeleteStudentGroups(selectedIds) as { skipped?: Array<{ blockers?: string[] }> };
      setSelectedIds([]);
      qc.invalidateQueries({ queryKey: ['admin-student-groups'] });
      if (Array.isArray(result?.skipped) && result.skipped.length > 0) {
        showToast(`Deleted with ${result.skipped.length} blocked group(s) skipped`, 'error');
      } else {
        showToast('Selected groups deleted');
      }
    } catch {
      showToast('Bulk delete failed', 'error');
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 overflow-x-hidden">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
            <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Student Groups</h2>
            <p className="text-xs text-slate-500">{rawGroups.length} group{rawGroups.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Desktop header actions (visible ≥768px) */}
        <div className="hidden md:flex items-center gap-2">
          {canExport && (
            <>
              <select aria-label="Export format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as 'csv' | 'xlsx')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                <option value="xlsx">XLSX</option>
                <option value="csv">CSV</option>
              </select>
              <button onClick={() => void handleExport()} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                <Download size={14} /> Export
              </button>
            </>
          )}
          {canCreate && (
            <button onClick={openCreate} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus size={14} /> New Group
            </button>
          )}
        </div>

        {/* Mobile overflow menu (visible <768px) */}
        <div className="relative md:hidden">
          <button
            onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="More actions"
          >
            <MoreVertical size={20} />
          </button>
          {headerMenuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              {canExport && (
                <button
                  onClick={() => { setHeaderMenuOpen(false); void handleExport(); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Download size={14} /> Export ({exportFormat.toUpperCase()})
                </button>
              )}
              {canCreate && (
                <button
                  onClick={() => { setHeaderMenuOpen(false); openCreate(); }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <Plus size={14} /> New Group
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input aria-label="Search groups" className={`${inputCls} pl-8`} placeholder="Search groups..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filteredGroups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} className="rounded border-slate-300" />
              Select visible
            </label>
            {selectedIds.length > 0 && (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:w-auto">
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">{selectedIds.length} selected</span>
                <select aria-label="Bulk edit field" value={bulkField} onChange={(e) => {
                  const nextField = e.target.value as (typeof GROUP_BULK_FIELDS)[number]['value'];
                  setBulkField(nextField);
                  setBulkValue(nextField === 'isFeatured' || nextField === 'isActive' ? 'true' : '');
                }} className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                  {GROUP_BULK_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
                </select>
                {bulkField === 'department' && (
                  <select aria-label="Department value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                    <option value="">Choose department</option>
                    {DEPARTMENTS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                )}
                {bulkField === 'defaultExamVisibility' && (
                  <select aria-label="Visibility value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                    <option value="">Choose visibility</option>
                    {EXAM_VIS.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
                  </select>
                )}
                {bulkField === 'isFeatured' || bulkField === 'isActive' ? (
                  <select aria-label="Boolean value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} className="w-full sm:w-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : null}
                {bulkField === 'batch' && (
                  <input aria-label="Batch value" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="Batch value" className={`${inputCls} w-full sm:w-auto`} />
                )}
                <button onClick={() => void handleBulkUpdate()} className="w-full sm:w-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Bulk Edit</button>
                <button onClick={() => void handleBulkDelete()} className="w-full sm:w-auto rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Bulk Delete</button>
                <button onClick={() => setSelectedIds([])} className="w-full sm:w-auto sm:ml-auto text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">Clear</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Users size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-500">{search ? 'No groups match your search' : 'No groups yet. Create one to get started.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredGroups.map(g => (
            <GroupCard
              key={g._id as string}
              g={g}
              selected={selectedIds.includes(String(g._id))}
              onToggleSelect={() => toggleGroupSelection(String(g._id))}
              onOpen={() => navigate(adminUi(`student-management/groups/${g._id}`))}
              onExport={() => void handleExportMembers(String(g._id), String(g.name || 'group'))}
              onEdit={() => openEdit(g)}
              onDelete={() => confirmDelete(g._id as string, g.name as string)}
              onNavigate={(path) => navigate(path)}
              canDelete={canDelete}
              canExport={canExport}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={groupModal.open} onClose={() => setGroupModal({ open: false })} title={groupModal.editId ? 'Edit Group' : 'Create Group'}>
        <div className="space-y-3">
          {/* Basic Info Section */}
          <CollapsibleSection title="Basic Info" icon={<Info size={12} />} defaultOpen={true}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>Group Name *</label>
                <input
                  className={`${inputCls} ${nameError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  value={form.name}
                  onChange={e => { set('name', e.target.value); if (e.target.value.trim()) setNameError(false); }}
                  placeholder="e.g. HSC 2025 Science"
                />
                {nameError && (
                  <p className="mt-1 text-xs text-red-500">Group name is required</p>
                )}
                {form.name.trim() && (
                  <p className="mt-1 text-xs text-slate-400">slug: {generateSlug(form.name)}</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Short Code</label>
                <input className={inputCls} value={form.shortCode} onChange={e => set('shortCode', e.target.value)} placeholder="e.g. H25S" maxLength={10} />
              </div>
              <div>
                <label className={labelCls}>Type</label>
                <select className={inputCls} value={form.type} onChange={e => set('type', e.target.value)}>
                  <option value="manual">Manual</option>
                  <option value="dynamic">Dynamic</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Description</label>
                <textarea className={`${inputCls} resize-none`} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional description" />
              </div>
            </div>
          </CollapsibleSection>

          {/* Appearance Section */}
          <CollapsibleSection title="Appearance" icon={<Palette size={12} />} defaultOpen={false}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <label className={labelCls}>Color</label>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {COLOR_SWATCHES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('color', c)}
                      className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Select color ${c}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.color} onChange={e => set('color', e.target.value)} className="h-8 w-8 cursor-pointer rounded border-0" />
                  <input className={inputCls} value={form.color} onChange={e => set('color', e.target.value)} placeholder="#hex" maxLength={7} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Card Style</label>
                <select className={inputCls} value={form.cardStyleVariant} onChange={e => set('cardStyleVariant', e.target.value)}>
                  {CARD_STYLES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Sort Order</label>
                <input className={inputCls} type="number" min={0} value={form.sortOrder} onChange={e => set('sortOrder', parseInt(e.target.value) || 0)} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Organization Section */}
          <CollapsibleSection title="Organization" icon={<Tag size={12} />} defaultOpen={false}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Department</label>
                <select className={inputCls} value={form.department} onChange={e => set('department', e.target.value)}>
                  <option value="">None</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Batch</label>
                <input className={inputCls} value={form.batch} onChange={e => set('batch', e.target.value)} placeholder="e.g. 2025" />
              </div>
              <div>
                <label className={labelCls}>Exam Visibility</label>
                <select className={inputCls} value={form.defaultExamVisibility} onChange={e => set('defaultExamVisibility', e.target.value)}>
                  {EXAM_VIS.map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
          </CollapsibleSection>

          {/* Policy Defaults Section */}
          <CollapsibleSection title="Policy Defaults" icon={<Settings size={12} />} defaultOpen={false}>
            <div className="space-y-4">
              <div className="flex items-center">
                <ModernToggle
                  label={<span className="flex items-center gap-2"><Star size={14} className="text-amber-500" /> Featured Group</span>}
                  checked={form.isFeatured}
                  onChange={v => set('isFeatured', v)}
                  size="sm"
                />
              </div>
              <div>
                <label className={labelCls}>Communication Audience</label>
                <input className={inputCls} value={form.defaultCommunicationAudience} onChange={e => set('defaultCommunicationAudience', e.target.value)} placeholder="e.g. all_members" />
              </div>
            </div>
          </CollapsibleSection>

          {/* Dynamic Rules Section - only when type is dynamic */}
          {form.type === 'dynamic' && (
            <CollapsibleSection title="Dynamic Rules" icon={<Zap size={12} />} defaultOpen={true}>
              <RuleBuilder
                rules={dynamicRules}
                onChange={setDynamicRules}
                groupId={groupModal.editId}
              />
            </CollapsibleSection>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button onClick={() => setGroupModal({ open: false })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button onClick={handleSave} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {groupModal.editId ? 'Update Group' : 'Create Group'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={deleteConfirm.open} onClose={() => setDeleteConfirm({ open: false, id: '', name: '' })} title="Delete Group">
        <div className="space-y-4">
          {deleteConfirm.safe === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400 space-y-1">
              <p className="font-medium">This group has active dependencies:</p>
              <ul className="list-disc pl-4 text-xs space-y-0.5">
                {(deleteConfirm.blockers?.activeMemberCount ?? 0) > 0 && (
                  <li>{deleteConfirm.blockers!.activeMemberCount} active member(s)</li>
                )}
                {(deleteConfirm.blockers?.linkedExams?.length ?? 0) > 0 && (
                  <li>{deleteConfirm.blockers!.linkedExams!.length} linked exam(s): {deleteConfirm.blockers!.linkedExams!.map(e => e.title).join(', ')}</li>
                )}
                {(deleteConfirm.blockers?.linkedCampaigns?.length ?? 0) > 0 && (
                  <li>{deleteConfirm.blockers!.linkedCampaigns!.length} linked campaign(s): {deleteConfirm.blockers!.linkedCampaigns!.map(c => c.campaignName).join(', ')}</li>
                )}
              </ul>
              <p className="text-xs mt-1">Deleting will archive memberships, not remove student data.</p>
            </div>
          )}
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to delete <strong className="text-slate-900 dark:text-white">{deleteConfirm.name}</strong>?
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setDeleteConfirm({ open: false, id: '', name: '' })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
              Cancel
            </button>
            <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
