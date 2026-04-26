import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getStudentGroupDetail, getStudentGroupMetrics, getStudentGroupMembers,
  updateStudentGroup, addGroupMembers, removeGroupMembers, exportGroupMembers,
  moveGroupMembers, getStudentGroups, validateGroupMemberIds,
  downloadMemberImportTemplate, importGroupMembersPreview, importGroupMembersCommit,
} from '../../../api/adminStudentApi';
import { listAdminExams } from '../../../api/adminExamApi';
import { listCampaigns, exportDataHub } from '../../../api/adminNotificationCampaignApi';
import { adminUi } from '../../../lib/appRoutes';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import { downloadFile } from '../../../utils/download';
import { useModuleAccess } from '../../../hooks/useModuleAccess';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import {
  ArrowLeft, Users, Search, Plus, Download, X, Pencil, Star,
  CheckCircle, XCircle, UserMinus, BookOpen, Megaphone, FileSpreadsheet,
  ExternalLink, Phone, Mail, UserCheck, Upload, FileDown, AlertCircle, Loader2,
  ArrowUpDown, ChevronUp, ChevronDown, ArrowRightLeft,
} from 'lucide-react';
import ModernToggle from '../../../components/ui/ModernToggle';

type Tab = 'overview' | 'members' | 'exams' | 'campaigns' | 'exports' | 'settings';
type Toast = { show: boolean; message: string; type: 'success' | 'error' };
type SortKey = 'name' | 'joinDate' | 'membershipStatus';
type SortDir = 'asc' | 'desc';

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';
const labelCls = 'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1';

export default function StudentGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasAccess } = useModuleAccess();
  const canExport = hasAccess('students_groups', 'export');
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPage, setMemberPage] = useState(1);
  const [addIds, setAddIds] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});

  // Multi-select state
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Debounced search state
  const [memberSearchInput, setMemberSearchInput] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Move to Group modal state
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveGroupSearch, setMoveGroupSearch] = useState('');
  const [moveTargetGroupId, setMoveTargetGroupId] = useState<string | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);

  // Add members confirmation modal state
  const [addMembersPreview, setAddMembersPreview] = useState<{
    requested: number; resolved: number; unresolved: number;
    alreadyMembers: number; newMembers: number;
  } | null>(null);
  const [addMembersLoading, setAddMembersLoading] = useState(false);
  const [pendingAddIds, setPendingAddIds] = useState<string[]>([]);

  // Debounced search effect
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setMemberSearch(memberSearchInput);
      setMemberPage(1);
    }, 300);
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [memberSearchInput]);

  // Clear selection when page/search changes
  useEffect(() => {
    setSelectedMemberIds(new Set());
  }, [memberPage, memberSearch]);

  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, show: false })), 3000);
  };

  const { data: group, isLoading } = useQuery({
    queryKey: ['admin-student-group-detail', id],
    queryFn: () => getStudentGroupDetail(id!),
    enabled: !!id,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['admin-student-group-metrics', id],
    queryFn: () => getStudentGroupMetrics(id!),
    enabled: !!id,
  });

  const { data: membersData } = useQuery({
    queryKey: ['admin-student-group-members', id, memberPage, memberSearch],
    queryFn: () => getStudentGroupMembers(id!, { page: memberPage, limit: 20, q: memberSearch }),
    enabled: !!id && tab === 'members',
  });

  const { data: allExams } = useQuery({
    queryKey: ['admin-exams-all'],
    queryFn: () => listAdminExams(),
    enabled: !!id && tab === 'exams',
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['admin-campaigns-group', id],
    queryFn: () => listCampaigns({ audienceGroupId: id }),
    enabled: !!id && tab === 'campaigns',
  });

  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [exportError, setExportError] = useState<{ message: string; retryFn: () => void } | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<Record<string, unknown> | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close modals on Escape key
  const closeAddMembersModal = useCallback(() => { setAddMembersPreview(null); setPendingAddIds([]); }, []);
  const closeImportModal = useCallback(() => { setImportModalOpen(false); setImportPreview(null); }, []);
  const closeMoveModal = useCallback(() => { setMoveModalOpen(false); setMoveTargetGroupId(null); setMoveGroupSearch(''); }, []);
  useEscapeKey(closeAddMembersModal, !!addMembersPreview);
  useEscapeKey(closeImportModal, importModalOpen && !addMembersPreview);
  useEscapeKey(closeMoveModal, moveModalOpen && !importModalOpen && !addMembersPreview);

  // Fetch all groups for Move to Group modal
  const { data: allGroups } = useQuery({
    queryKey: ['admin-student-groups-all'],
    queryFn: () => getStudentGroups(),
    enabled: moveModalOpen,
  });

  const g = (group as Record<string, unknown>) ?? {};
  const color = (g.color as string) || '#6366f1';
  const members = ((membersData as Record<string, unknown>)?.data ??
    (membersData as Record<string, unknown>)?.members ??
    (membersData as Record<string, unknown>)?.items ??
    []) as Record<string, unknown>[];
  const totalMembers = ((membersData as Record<string, unknown>)?.total ?? members.length) as number;
  const totalPages = Math.max(1, Math.ceil(totalMembers / 20));
  const metricsObj = (metrics ?? {}) as Record<string, unknown>;

  // Filter exams targeting this group
  const groupExams = (Array.isArray(allExams) ? allExams : []).filter((e: Record<string, unknown>) => {
    const tgIds = (e.targetGroupIds ?? []) as string[];
    return tgIds.some((gid: string) => String(gid) === id);
  }) as Record<string, unknown>[];

  // Campaigns list
  const campaigns = ((campaignsData as Record<string, unknown>)?.campaigns ??
    (campaignsData as Record<string, unknown>)?.items ??
    (Array.isArray(campaignsData) ? campaignsData : [])) as Record<string, unknown>[];

  // Groups list for Move modal (exclude current group)
  const groupsList = (
    (Array.isArray(allGroups) ? allGroups : ((allGroups as Record<string, unknown>)?.groups ?? [])) as Record<string, unknown>[]
  ).filter(gr => String((gr as Record<string, unknown>)._id) !== id);

  const filteredMoveGroups = moveGroupSearch
    ? groupsList.filter(gr => String((gr as Record<string, unknown>).name ?? '').toLowerCase().includes(moveGroupSearch.toLowerCase()))
    : groupsList;

  // Selection helpers
  const getMemberId = (m: Record<string, unknown>) => String(m.studentId || m._id);

  const toggleMemberSelect = useCallback((memberId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedMemberIds.size === members.length && members.length > 0) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(members.map(getMemberId)));
    }
  }, [members, selectedMemberIds.size]);

  const isAllSelected = members.length > 0 && selectedMemberIds.size === members.length;

  // Sort members client-side
  const sortedMembers = [...members].sort((a, b) => {
    let aVal: string | number = '';
    let bVal: string | number = '';
    if (sortKey === 'name') {
      aVal = String(a.fullName || a.name || a.studentName || '').toLowerCase();
      bVal = String(b.fullName || b.name || b.studentName || '').toLowerCase();
    } else if (sortKey === 'joinDate') {
      aVal = a.joinedAtUTC ? new Date(a.joinedAtUTC as string).getTime() : 0;
      bVal = b.joinedAtUTC ? new Date(b.joinedAtUTC as string).getTime() : 0;
    } else if (sortKey === 'membershipStatus') {
      aVal = String(a.membershipStatus || a.status || '').toLowerCase();
      bVal = String(b.membershipStatus || b.status || '').toLowerCase();
    }
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown size={12} className="ml-1 inline opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="ml-1 inline" />
      : <ChevronDown size={12} className="ml-1 inline" />;
  };

  // Bulk actions
  const handleBulkRemove = async () => {
    if (selectedMemberIds.size === 0) return;
    try {
      await removeGroupMembers(id!, Array.from(selectedMemberIds));
      qc.invalidateQueries({ queryKey: ['admin-student-group-members', id] });
      qc.invalidateQueries({ queryKey: ['admin-student-group-metrics', id] });
      showToast(`${selectedMemberIds.size} member(s) removed`);
      setSelectedMemberIds(new Set());
    } catch { showToast('Failed to remove members', 'error'); }
  };

  const handleBulkExport = async () => {
    setExportError(null);
    try {
      const blob = await exportGroupMembers(id!, 'csv');
      downloadFile(blob as Blob, { filename: `group-${g.shortCode || g.name || id}-selected-members.csv` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (err instanceof Error ? err.message : 'Export failed');
      showToast(msg, 'error');
      setExportError({ message: msg, retryFn: () => handleBulkExport() });
    }
  };

  const handleMoveConfirm = async () => {
    if (!moveTargetGroupId || selectedMemberIds.size === 0) return;
    setMoveLoading(true);
    try {
      await moveGroupMembers(id!, Array.from(selectedMemberIds), moveTargetGroupId);
      qc.invalidateQueries({ queryKey: ['admin-student-group-members', id] });
      qc.invalidateQueries({ queryKey: ['admin-student-group-metrics', id] });
      showToast(`${selectedMemberIds.size} member(s) moved`);
      setSelectedMemberIds(new Set());
      setMoveModalOpen(false);
      setMoveTargetGroupId(null);
      setMoveGroupSearch('');
    } catch { showToast('Failed to move members', 'error'); }
    finally { setMoveLoading(false); }
  };

  const handleDataHubExport = async (category: string, format: string) => {
    setExportLoading(category);
    setExportError(null);
    try {
      const result = await exportDataHub({ category, format, filters: { groupId: id } });
      const axiosLike = result as { data?: unknown; headers?: Record<string, unknown> | { get?: (name: string) => unknown } };
      if (axiosLike?.data instanceof Blob) {
        const filename = `${String(category).replace(/[^a-z0-9_]+/gi, '_').toLowerCase()}.${format === 'csv' ? 'csv' : 'xlsx'}`;
        downloadFile(axiosLike as { data: Blob; headers?: Record<string, unknown> }, { filename });
        showToast(`${category.replace(/_/g, ' ')} exported`);
        return;
      }

      const payload = result as { text?: string; data?: unknown[] };
      if (payload.text) {
        navigator.clipboard.writeText(payload.text);
        showToast(`${category.replace(/_/g, ' ')} copied to clipboard`);
      } else if (payload.data) {
        showToast(`${category.replace(/_/g, ' ')} exported`);
      } else {
        showToast('Export completed');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (err instanceof Error ? err.message : 'Export failed');
      showToast(msg, 'error');
      setExportError({ message: msg, retryFn: () => handleDataHubExport(category, format) });
    } finally {
      setExportLoading(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateStudentGroup(id!, editForm);
      qc.invalidateQueries({ queryKey: ['admin-student-group-detail', id] });
      setEditing(false);
      showToast('Group updated');
    } catch { showToast('Failed to update', 'error'); }
  };

  const handleAddMembers = async () => {
    if (!addIds.trim()) return;
    const ids = addIds.split(/[\s,]+/).filter(Boolean);
    setAddMembersLoading(true);
    try {
      const result = await validateGroupMemberIds(id!, ids) as {
        requested: number; resolved: number; unresolved: number;
        alreadyMembers: number; newMembers: number;
      };
      setPendingAddIds(ids);
      setAddMembersPreview(result);
    } catch {
      showToast('Failed to validate member IDs', 'error');
    } finally {
      setAddMembersLoading(false);
    }
  };

  const handleConfirmAddMembers = async () => {
    if (pendingAddIds.length === 0) return;
    setAddMembersLoading(true);
    try {
      const result = await addGroupMembers(id!, pendingAddIds) as { added?: number; skipped?: number };
      qc.invalidateQueries({ queryKey: ['admin-student-group-members', id] });
      qc.invalidateQueries({ queryKey: ['admin-student-group-metrics', id] });
      setAddIds('');
      setAddMembersPreview(null);
      setPendingAddIds([]);
      const added = Number(result?.added ?? 0);
      const skipped = Number(result?.skipped ?? 0);
      if (added <= 0) {
        showToast('No new members were added', 'error');
        return;
      }
      showToast(skipped > 0 ? `${added} member(s) added, ${skipped} skipped` : `${added} member(s) added`);
    } catch {
      showToast('Failed to add members', 'error');
    } finally {
      setAddMembersLoading(false);
    }
  };

  const handleRemoveMember = async (studentId: string) => {
    try {
      await removeGroupMembers(id!, [studentId]);
      qc.invalidateQueries({ queryKey: ['admin-student-group-members', id] });
      qc.invalidateQueries({ queryKey: ['admin-student-group-metrics', id] });
      showToast('Member removed');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (err instanceof Error ? err.message : 'Failed to remove member');
      showToast(msg, 'error');
    }
  };

  const handleExport = async (format: 'csv' | 'xlsx' = 'csv') => {
    setExportError(null);
    try {
      const blob = await exportGroupMembers(id!, format);
      downloadFile(blob as Blob, { filename: `group-${g.shortCode || g.name || id}-members.${format}` });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (err instanceof Error ? err.message : 'Export failed');
      showToast(msg, 'error');
      setExportError({ message: msg, retryFn: () => handleExport(format) });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadMemberImportTemplate();
      downloadFile(blob, { filename: 'group_members_import_template.xlsx' });
    } catch { showToast('Template download failed', 'error'); }
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const preview = await importGroupMembersPreview(id, fd);
      setImportPreview(preview);
      setImportModalOpen(true);
    } catch { showToast('Failed to parse file', 'error'); }
    finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportCommit = async () => {
    if (!importPreview || !id) return;
    const rows = (importPreview.rows ?? []) as { studentId?: string; status: string }[];
    const newIds = rows.filter(r => r.status === 'new' && r.studentId).map(r => r.studentId!);
    if (newIds.length === 0) { showToast('No new members to import'); return; }
    setImportLoading(true);
    try {
      const result = await importGroupMembersCommit(id, newIds);
      qc.invalidateQueries({ queryKey: ['admin-student-group-members', id] });
      qc.invalidateQueries({ queryKey: ['admin-student-group-metrics', id] });
      showToast(`Imported ${result.added} new member(s)`);
      setImportModalOpen(false);
      setImportPreview(null);
    } catch { showToast('Import failed', 'error'); }
    finally { setImportLoading(false); }
  };

  const startEdit = () => {
    setEditForm({
      name: g.name ?? '',
      description: g.description ?? '',
      shortCode: g.shortCode ?? '',
      color: g.color ?? '#6366f1',
      cardStyleVariant: g.cardStyleVariant ?? 'solid',
      sortOrder: g.sortOrder ?? 0,
      isFeatured: g.isFeatured ?? false,
      batch: g.batch ?? '',
      department: g.department ?? '',
      defaultExamVisibility: g.defaultExamVisibility ?? 'all_students',
    });
    setEditing(true);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'members', label: 'Members' },
    { key: 'exams', label: 'Exams' },
    { key: 'campaigns', label: 'Campaigns' },
    ...(canExport ? [{ key: 'exports' as Tab, label: 'Exports' }] : []),
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6 overflow-x-hidden px-1 sm:px-0">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Export Error Banner with Retry */}
      {exportError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
          <AlertCircle size={16} className="flex-shrink-0 text-red-500" />
          <span className="flex-1 text-sm text-red-700 dark:text-red-400">{exportError.message}</span>
          <button
            onClick={() => { setExportError(null); exportError.retryFn(); }}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Loader2 size={12} className={exportLoading ? 'animate-spin' : 'hidden'} />
            Retry Export
          </button>
          <button onClick={() => setExportError(null)} className="text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4">
        <button onClick={() => navigate(adminUi('student-management/groups'))} className="rounded-lg p-1.5 sm:p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Back to groups">
          <ArrowLeft size={18} />
        </button>
        <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}20` }}>
          <Users size={22} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white truncate">{g.name as string}</h2>
            {g.isFeatured ? <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0" /> : null}
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium capitalize flex-shrink-0" style={{ backgroundColor: `${color}15`, color }}>
              {g.type as string}
            </span>
          </div>
          {g.shortCode ? <span className="text-xs font-mono text-slate-400">{g.shortCode as string}</span> : null}
        </div>
        <button onClick={startEdit} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 flex-shrink-0">
          <Pencil size={14} /> <span className="hidden sm:inline">Edit</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 sm:gap-1 rounded-lg bg-slate-100 p-0.5 sm:p-1 dark:bg-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 min-w-0 rounded-md px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-medium transition whitespace-nowrap ${tab === t.key ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Metrics Cards */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {metricsLoading ? (
              <>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="h-3 w-16 sm:w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="mt-2 h-6 sm:h-7 w-12 sm:w-16 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                ))}
              </>
            ) : (
              [
                { label: 'Total Members', value: metricsObj.totalMembers ?? g.memberCount ?? g.studentCount ?? 0 },
                { label: 'Active Members', value: metricsObj.activeMembers ?? '—' },
                { label: 'Avg. Exam Score', value: metricsObj.avgExamScore != null ? `${metricsObj.avgExamScore}%` : '—' },
                { label: 'Campaign Reach', value: metricsObj.campaignReach ?? '—' },
              ].map(m => (
                <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[10px] sm:text-xs text-slate-500 truncate">{m.label}</p>
                  <p className="mt-1 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">{String(m.value)}</p>
                </div>
              ))
            )}
          </div>

          {/* Group Info */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Group Information</h3>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              {[
                ['Description', g.description || '—'],
                ['Department', g.department || '—'],
                ['Batch', g.batch || '—'],
                ['Exam Visibility', (g.defaultExamVisibility as string)?.replace(/_/g, ' ') || '—'],
                ['Card Style', g.cardStyleVariant || '—'],
                ['Sort Order', g.sortOrder ?? 0],
                ['Created', g.createdAt ? new Date(g.createdAt as string).toLocaleDateString() : '—'],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-slate-500">{label as string}</dt>
                  <dd className="capitalize text-slate-900 dark:text-white">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div className="space-y-4">
          {/* Debounced search + actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3">
            <div className="relative flex-1 min-w-0">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                className={`${inputCls} pl-8`}
                placeholder="Search by name, phone, or email..."
                aria-label="Search members"
                title="Search members"
                value={memberSearchInput}
                onChange={e => setMemberSearchInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFileChange} />
              <button onClick={() => fileInputRef.current?.click()}
                disabled={importLoading}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 dark:border-indigo-600 dark:text-indigo-300 dark:hover:bg-indigo-900/20 disabled:opacity-50"
              >
                {importLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import
              </button>
              {canExport && (
                <>
                  <button onClick={() => handleExport('csv')} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
                    <Download size={14} /> CSV
                  </button>
                  <button onClick={() => handleExport('xlsx')} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
                    <Download size={14} /> XLSX
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectedMemberIds.size > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 sm:px-4 sm:py-2.5 dark:border-indigo-800 dark:bg-indigo-900/20">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                {selectedMemberIds.size} selected
              </span>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-2 sm:ml-auto">
                <button onClick={handleBulkRemove} className="flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-900/20">
                  <UserMinus size={13} /> Remove Selected
                </button>
                <button onClick={() => setMoveModalOpen(true)} className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-400 dark:hover:bg-indigo-900/20">
                  <ArrowRightLeft size={13} /> Move to Group
                </button>
                {canExport && (
                  <button onClick={handleBulkExport} className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <Download size={13} /> Export Selected
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Quick add by IDs */}
          <div className="flex gap-2">
            <input aria-label="Add members by ID" title="Add members by ID" value={addIds} onChange={e => setAddIds(e.target.value)} className={inputCls} placeholder="Add members by ID (comma-separated)" />
            <button onClick={handleAddMembers} disabled={!addIds.trim() || addMembersLoading} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap">
              {addMembersLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
            </button>
          </div>

          {/* Members Table with sortable columns and checkboxes */}
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                      aria-label="Select all members on page"
                      title="Select all members on page"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <button onClick={() => handleSort('name')} className="flex items-center hover:text-slate-700 dark:hover:text-slate-300" type="button">
                      Name <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <button onClick={() => handleSort('membershipStatus')} className="flex items-center hover:text-slate-700 dark:hover:text-slate-300" type="button">
                      Status <SortIcon column="membershipStatus" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <button onClick={() => handleSort('joinDate')} className="flex items-center hover:text-slate-700 dark:hover:text-slate-300" type="button">
                      Joined <SortIcon column="joinDate" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {sortedMembers.map(m => {
                  const mid = getMemberId(m);
                  return (
                    <tr key={mid} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${selectedMemberIds.has(mid) ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.has(mid)}
                          onChange={() => toggleMemberSelect(mid)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                          aria-label={`Select ${(m.fullName || m.name || m.studentName) as string}`}
                          title={`Select ${(m.fullName || m.name || m.studentName) as string}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{(m.fullName || m.name || m.studentName) as string}</td>
                      <td className="px-4 py-3 text-slate-500">{(m.phone || m.studentPhone || '—') as string}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${(m.membershipStatus || m.status) === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                          }`}>
                          {((m.membershipStatus || m.status || 'active') as string)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {m.joinedAtUTC ? new Date(m.joinedAtUTC as string).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleRemoveMember(mid)} className="text-xs text-red-500 hover:text-red-700" title="Remove member">
                          <UserMinus size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {members.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-400">No members in this group.</div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button onClick={() => setMemberPage(p => Math.max(1, p - 1))} disabled={memberPage === 1}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-40 dark:border-slate-600">
                Previous
              </button>
              <span className="text-xs text-slate-500">Page {memberPage} of {totalPages}</span>
              <button onClick={() => setMemberPage(p => Math.min(totalPages, p + 1))} disabled={memberPage === totalPages}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-40 dark:border-slate-600">
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── Exams Tab ─── */}
      {tab === 'exams' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen size={16} /> Exams targeting this group
            </h3>
            <button
              onClick={() => navigate(`${ADMIN_PATHS.examNew}?targetGroupId=${id}&targetGroupName=${encodeURIComponent(g.name as string || '')}`)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 w-full sm:w-auto"
            >
              <Plus size={14} /> Create Exam
            </button>
          </div>

          {groupExams.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <BookOpen size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">No exams targeting this group yet.</p>
              <p className="mt-1 text-xs text-slate-400">Create an exam and set visibility to this group.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    {['Title', 'Visibility', 'Status', 'Start Date', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {groupExams.map(exam => (
                    <tr key={exam._id as string} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{exam.title as string}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {((exam.visibilityMode as string) || 'all_students').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${exam.isPublished || exam.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                          }`}>
                          {exam.isPublished || exam.isActive ? 'Active' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {exam.startDate ? new Date(exam.startDate as string).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => navigate(ADMIN_PATHS.exams)}
                          className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                        >
                          <ExternalLink size={12} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Campaigns Tab ─── */}
      {tab === 'campaigns' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Megaphone size={16} /> Campaigns for this group
            </h3>
            <button
              onClick={() => navigate(`${ADMIN_PATHS.campaignsNew}?audienceType=group&audienceGroupId=${id}&audienceGroupName=${encodeURIComponent(g.name as string || '')}`)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 w-full sm:w-auto"
            >
              <Megaphone size={14} /> Send Campaign
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <Megaphone size={28} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">No campaigns sent to this group yet.</p>
              <p className="mt-1 text-xs text-slate-400">Use "Send Campaign" to reach all members.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    {['Campaign', 'Channel', 'Status', 'Recipients', 'Date'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  {campaigns.map(c => (
                    <tr key={c._id as string} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{c.campaignName as string}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 uppercase">{(c.channelType || c.channels) as string}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : c.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          }`}>
                          {c.status as string}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{(c.recipientCount ?? c.sentCount ?? 0) as number}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {c.createdAt ? new Date(c.createdAt as string).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Exports Tab ─── */}
      {tab === 'exports' && canExport && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet size={16} /> Group Data Exports
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {[
              { key: 'phone_list', label: 'Phone Numbers', icon: Phone, desc: 'Export all member phone numbers' },
              { key: 'email_list', label: 'Email Addresses', icon: Mail, desc: 'Export all member emails' },
              { key: 'guardians', label: 'Guardian Contacts', icon: UserCheck, desc: 'Guardian name, phone & email' },
              { key: 'audience_segment', label: 'Full Member List', icon: Users, desc: 'Name, phone, email, department, batch' },
            ].map(item => (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2 mb-2">
                  <item.icon size={16} className="text-slate-500" />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</span>
                </div>
                <p className="text-xs text-slate-400 mb-3">{item.desc}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDataHubExport(item.key, 'csv')}
                    disabled={exportLoading === item.key}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                  >
                    {exportLoading === item.key ? 'Exporting…' : 'CSV'}
                  </button>
                  <button
                    onClick={() => handleDataHubExport(item.key, 'xlsx')}
                    disabled={exportLoading === item.key}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                  >
                    XLSX
                  </button>
                  <button
                    onClick={() => handleDataHubExport(item.key, 'txt')}
                    disabled={exportLoading === item.key}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                  >
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Quick CSV member export */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Quick Member Export</p>
                <p className="text-xs text-slate-400">Download members as a simple CSV file</p>
              </div>
              <button onClick={() => handleExport('csv')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-700 dark:bg-slate-900">
          {!editing ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Group Settings</h3>
                <button onClick={startEdit} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Edit</button>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                {[
                  ['Name', g.name],
                  ['Short Code', g.shortCode || '—'],
                  ['Color', g.color || '#6366f1'],
                  ['Card Style', g.cardStyleVariant || 'solid'],
                  ['Sort Order', g.sortOrder ?? 0],
                  ['Featured', g.isFeatured ? 'Yes' : 'No'],
                  ['Department', g.department || '—'],
                  ['Batch', g.batch || '—'],
                  ['Exam Visibility', (g.defaultExamVisibility as string)?.replace(/_/g, ' ') || 'all students'],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-slate-500">{label as string}</dt>
                    <dd className="capitalize text-slate-900 dark:text-white flex items-center gap-2">
                      {label === 'Color' && <div className="h-4 w-4 rounded" style={{ backgroundColor: value as string }} />}
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Edit Group Settings</h3>
                <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Name</label>
                  <input aria-label="Group name" title="Group name" className={inputCls} value={(editForm.name ?? '') as string} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Short Code</label>
                  <input aria-label="Short code" title="Short code" className={inputCls} value={(editForm.shortCode ?? '') as string} onChange={e => setEditForm(f => ({ ...f, shortCode: e.target.value }))} maxLength={10} />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <div className="flex items-center gap-2">
                    <input aria-label="Pick color" title="Pick color" type="color" value={(editForm.color ?? '#6366f1') as string} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} className="h-8 w-8 cursor-pointer rounded border-0" />
                    <input aria-label="Color hex" title="Color hex" className={inputCls} value={(editForm.color ?? '') as string} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} maxLength={7} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Card Style</label>
                  <select aria-label="Card style" title="Card style" className={inputCls} value={(editForm.cardStyleVariant ?? 'solid') as string} onChange={e => setEditForm(f => ({ ...f, cardStyleVariant: e.target.value }))}>
                    {['solid', 'gradient', 'outline', 'minimal'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Sort Order</label>
                  <input aria-label="Sort order" title="Sort order" className={inputCls} type="number" min={0} value={(editForm.sortOrder ?? 0) as number} onChange={e => setEditForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className={labelCls}>Department</label>
                  <select aria-label="Department" title="Department" className={inputCls} value={(editForm.department ?? '') as string} onChange={e => setEditForm(f => ({ ...f, department: e.target.value }))}>
                    <option value="">None</option>
                    {['science', 'arts', 'commerce'].map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Batch</label>
                  <input aria-label="Batch" title="Batch" className={inputCls} value={(editForm.batch ?? '') as string} onChange={e => setEditForm(f => ({ ...f, batch: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>Exam Visibility</label>
                  <select aria-label="Exam visibility" title="Exam visibility" className={inputCls} value={(editForm.defaultExamVisibility ?? 'all_students') as string} onChange={e => setEditForm(f => ({ ...f, defaultExamVisibility: e.target.value }))}>
                    {['all_students', 'group_only', 'hidden'].map(v => <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Description</label>
                  <textarea aria-label="Description" title="Description" className={`${inputCls} resize-none`} rows={2} value={(editForm.description ?? '') as string} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="sm:col-span-2">
                  <ModernToggle
                    label={<span className="flex items-center gap-2"><Star size={14} className="text-amber-500" /> Featured group</span>}
                    checked={(editForm.isFeatured ?? false) as boolean}
                    onChange={v => setEditForm(f => ({ ...f, isFeatured: v }))}
                    size="sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">Cancel</button>
                <button onClick={handleSaveSettings} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Members Confirmation Modal */}
      {addMembersPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setAddMembersPreview(null); setPendingAddIds([]); }}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck size={18} /> Add Members Summary
              </h3>
              <button onClick={() => { setAddMembersPreview(null); setPendingAddIds([]); }} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 mb-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
                <p className="text-xs text-slate-500">Matched (new)</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{addMembersPreview.newMembers}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-xs text-slate-500">Already members</p>
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{addMembersPreview.alreadyMembers}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <p className="text-xs text-slate-500">Not found</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{addMembersPreview.unresolved}</p>
              </div>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              {addMembersPreview.newMembers > 0
                ? `${addMembersPreview.newMembers} new member(s) will be added to this group.`
                : 'No new members to add.'}
              {addMembersPreview.alreadyMembers > 0 && ` ${addMembersPreview.alreadyMembers} already in the group will be skipped.`}
              {addMembersPreview.unresolved > 0 && ` ${addMembersPreview.unresolved} ID(s) could not be found.`}
            </p>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button onClick={() => { setAddMembersPreview(null); setPendingAddIds([]); }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button
                onClick={handleConfirmAddMembers}
                disabled={addMembersLoading || addMembersPreview.newMembers === 0}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {addMembersLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Add {addMembersPreview.newMembers} Member(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {importModalOpen && importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setImportModalOpen(false); setImportPreview(null); }}>
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Upload size={18} /> Import Preview
              </h3>
              <button onClick={() => { setImportModalOpen(false); setImportPreview(null); }} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {/* Summary */}
            {(() => {
              const summary = (importPreview.summary ?? {}) as Record<string, number>;
              return (
                <div className="grid gap-3 sm:grid-cols-5 mb-4">
                  {[
                    { label: 'Total Rows', value: summary.total ?? 0, cls: '' },
                    { label: 'New Members', value: summary.newMembers ?? summary.newCount ?? 0, cls: 'text-green-600' },
                    { label: 'Already Members', value: summary.alreadyMembers ?? summary.existingCount ?? 0, cls: 'text-blue-600' },
                    { label: 'Not Found', value: summary.notFound ?? summary.notFoundCount ?? 0, cls: 'text-red-600' },
                    { label: 'Duplicates', value: summary.duplicateCount ?? 0, cls: 'text-amber-600' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                      <p className="text-xs text-slate-500">{s.label}</p>
                      <p className={`text-xl font-bold ${s.cls || 'text-slate-900 dark:text-white'}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Warning banner for not_found rows */}
            {(() => {
              const summary = (importPreview.summary ?? {}) as Record<string, number>;
              const notFoundCount = summary.notFoundCount ?? summary.notFound ?? 0;
              if (notFoundCount === 0) return null;
              return (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                  <AlertCircle size={16} className="flex-shrink-0 text-amber-500" />
                  <span className="text-sm text-amber-700 dark:text-amber-400">
                    {notFoundCount} row(s) could not be matched to any student. Only matched rows will be imported.
                  </span>
                </div>
              );
            })()}

            {/* All rows preview table with color-coded status */}
            {(() => {
              const allRows = (importPreview.rows ?? []) as Record<string, unknown>[];
              if (allRows.length === 0) return null;

              const statusBadge = (status: string) => {
                switch (status) {
                  case 'new':
                    return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">New</span>;
                  case 'existing':
                    return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Already member</span>;
                  case 'not_found':
                    return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Not found</span>;
                  case 'duplicate':
                    return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Duplicate</span>;
                  default:
                    return <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">{status}</span>;
                }
              };

              return (
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-900 dark:text-white mb-2 flex items-center gap-1">
                    <FileSpreadsheet size={14} className="text-slate-500" /> Import Preview ({allRows.length} rows)
                  </h4>
                  <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0">
                        <tr>
                          {['Row', 'Name / Identifier', 'Email / Phone', 'Status'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                        {allRows.slice(0, 50).map((r, i) => (
                          <tr key={i} className={r.status === 'not_found' ? 'bg-red-50/50 dark:bg-red-900/5' : r.status === 'duplicate' ? 'bg-amber-50/50 dark:bg-amber-900/5' : ''}>
                            <td className="px-3 py-1.5 text-slate-400">{r.row as number}</td>
                            <td className="px-3 py-1.5 text-slate-900 dark:text-white">
                              {(r.fullName as string) || (r.email as string) || (r.phone as string) || '—'}
                            </td>
                            <td className="px-3 py-1.5 text-slate-500">
                              {(r.email || r.phone || '—') as string}
                              {r.reason && <span className="ml-1 text-[10px] text-slate-400">({r.reason as string})</span>}
                            </td>
                            <td className="px-3 py-1.5">{statusBadge(r.status as string)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
              <button onClick={handleDownloadTemplate} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700">
                <FileDown size={14} /> Download Template
              </button>
              <div className="flex gap-3">
                <button onClick={() => { setImportModalOpen(false); setImportPreview(null); }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
                  Cancel
                </button>
                <button
                  onClick={handleImportCommit}
                  disabled={importLoading || ((importPreview.summary as Record<string, number>)?.newMembers ?? 0) === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {importLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Import {(importPreview.summary as Record<string, number>)?.newMembers ?? 0} New Member(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Move to Group Modal */}
      {moveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setMoveModalOpen(false); setMoveTargetGroupId(null); setMoveGroupSearch(''); }}>
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowRightLeft size={18} /> Move to Group
              </h3>
              <button onClick={() => { setMoveModalOpen(false); setMoveTargetGroupId(null); setMoveGroupSearch(''); }} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              Move {selectedMemberIds.size} selected member(s) to another group.
            </p>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                className={`${inputCls} pl-8`}
                placeholder="Search groups..."
                aria-label="Search groups"
                title="Search groups"
                value={moveGroupSearch}
                onChange={e => setMoveGroupSearch(e.target.value)}
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {filteredMoveGroups.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">No groups found.</div>
              ) : (
                filteredMoveGroups.map(gr => {
                  const grId = String((gr as Record<string, unknown>)._id);
                  const grName = String((gr as Record<string, unknown>).name ?? '');
                  const grColor = String((gr as Record<string, unknown>).color ?? '#6366f1');
                  return (
                    <button
                      key={grId}
                      type="button"
                      onClick={() => setMoveTargetGroupId(grId)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40 ${moveTargetGroupId === grId ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                        }`}
                    >
                      <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: grColor }} />
                      <span className="text-slate-900 dark:text-white">{grName}</span>
                      {moveTargetGroupId === grId && <CheckCircle size={14} className="ml-auto text-indigo-600" />}
                    </button>
                  );
                })
              )}
            </div>
            <div className="flex justify-end gap-3 mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button onClick={() => { setMoveModalOpen(false); setMoveTargetGroupId(null); setMoveGroupSearch(''); }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
                Cancel
              </button>
              <button
                onClick={handleMoveConfirm}
                disabled={!moveTargetGroupId || moveLoading}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {moveLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />}
                Move Members
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
