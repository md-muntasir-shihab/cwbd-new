import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Copy, Download, ExternalLink, Eye, History, Mail, MessageSquare, MoreHorizontal, Phone, Save, Settings2, Users } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import { useAuth } from '../../../hooks/useAuth';
import {
  createSubscriptionContactCenterPreset,
  deleteSubscriptionContactCenterPreset,
  exportSubscriptionContactCenter,
  getSubscriptionContactCenterLogs,
  getSubscriptionContactCenterMembers,
  getSubscriptionContactCenterOverview,
  getSubscriptionContactCenterPresets,
  previewSubscriptionContactCopy,
  updateSubscriptionContactCenterPreset,
  type SubscriptionContactCenterFilters,
  type SubscriptionContactCenterMember,
  type SubscriptionContactCenterPreset,
} from '../../../api/adminNotificationCampaignApi';
import { assignSubscription, createAudienceSegment, expireSubscriptionNow, extendSubscription, toggleAutoRenew } from '../../../api/adminStudentApi';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import { downloadFile } from '../../../utils/download';

type CenterTab = 'overview' | 'members' | 'outreach' | 'export' | 'presets' | 'logs';
type ContactScope = 'phones' | 'emails' | 'combined' | 'guardian' | 'student_guardian' | 'raw';
type ExportFormat = 'clipboard' | 'xlsx' | 'csv' | 'txt' | 'json';
type SubscriptionActionMode = 'assign' | 'extend' | 'expire' | 'autoRenew';
type ContactCenterPlanOption = { id: string; name: string; code?: string };

const CENTER_TABS: Array<{ key: CenterTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'members', label: 'Members' },
  { key: 'outreach', label: 'Personal Outreach' },
  { key: 'export', label: 'Export / Copy' },
  { key: 'presets', label: 'Format Presets' },
  { key: 'logs', label: 'Logs / History' },
];

const EMPTY_FILTERS: SubscriptionContactCenterFilters = {
  bucket: 'all',
  search: '',
  planIds: [],
  groupIds: [],
  departments: [],
  institutionNames: [],
  selectedUserIds: [],
};

const BUCKET_OPTIONS = [
  { value: 'all', label: 'All buckets' },
  { value: 'active', label: 'Active' },
  { value: 'renewal_due', label: 'Renewal Due' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled_paused', label: 'Cancelled / Paused' },
  { value: 'pending', label: 'Pending' },
];

const SCOPE_OPTIONS: Array<{ value: ContactScope; label: string }> = [
  { value: 'phones', label: 'Phones only' },
  { value: 'emails', label: 'Emails only' },
  { value: 'combined', label: 'Phone + Email bundle' },
  { value: 'guardian', label: 'Guardian contacts only' },
  { value: 'student_guardian', label: 'Student + Guardian bundle' },
  { value: 'raw', label: 'Raw labeled rows' },
];

const FORMAT_OPTIONS: Array<{ value: ExportFormat; label: string }> = [
  { value: 'clipboard', label: 'Copy to clipboard' },
  { value: 'xlsx', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV (.csv)' },
  { value: 'txt', label: 'Plain text (.txt)' },
  { value: 'json', label: 'JSON (.json)' },
];

function bucketLabel(bucket: string) {
  return BUCKET_OPTIONS.find((option) => option.value === bucket)?.label || bucket.replace(/_/g, ' ');
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function compactSeparator(separator: string) {
  if (separator === '\n') return '\\n';
  if (separator === '\t') return '\\t';
  return separator || '(none)';
}

function normalizeTab(value: string | null): CenterTab {
  return CENTER_TABS.some((item) => item.key === value) ? (value as CenterTab) : 'overview';
}

function presetDraftFromPreset(preset?: Partial<SubscriptionContactCenterPreset> | null) {
  return {
    name: preset?.name || '',
    prefix: preset?.prefix || '',
    suffix: preset?.suffix || '',
    separator: preset?.separator || '\n',
    includeName: preset?.includeName ?? false,
    includeEmail: preset?.includeEmail ?? false,
    includeGuardian: preset?.includeGuardian ?? false,
    includePlan: preset?.includePlan ?? false,
    includeStatus: preset?.includeStatus ?? false,
    isDefault: preset?.isDefault ?? false,
  };
}

function trimFilterPayload(filters: SubscriptionContactCenterFilters): SubscriptionContactCenterFilters {
  return {
    ...filters,
    search: String(filters.search || '').trim(),
    planIds: (filters.planIds || []).filter(Boolean),
    groupIds: (filters.groupIds || []).filter(Boolean),
    departments: (filters.departments || []).filter(Boolean),
    institutionNames: (filters.institutionNames || []).filter(Boolean),
    selectedUserIds: (filters.selectedUserIds || []).filter(Boolean),
  };
}

function ManageSubscriptionModal(props: {
  open: boolean;
  members: SubscriptionContactCenterMember[];
  plans: ContactCenterPlanOption[];
  submitting: boolean;
  mode: SubscriptionActionMode;
  setMode: (mode: SubscriptionActionMode) => void;
  assignDraft: { planId: string; notes: string };
  setAssignDraft: Dispatch<SetStateAction<{ planId: string; notes: string }>>;
  extendDraft: { days: string; notes: string };
  setExtendDraft: Dispatch<SetStateAction<{ days: string; notes: string }>>;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { open, members, plans, submitting, mode, setMode, assignDraft, setAssignDraft, extendDraft, setExtendDraft, onClose, onSubmit } = props;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Subscription actions</div>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Manage subscription</h3>
            <p className="mt-2 text-sm text-slate-500">Applying to {members.length} member{members.length === 1 ? '' : 's'} using the existing subscription admin APIs.</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700">Close</button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ['assign', 'Assign / Change plan'],
            ['extend', 'Extend expiry'],
            ['expire', 'Expire now'],
            ['autoRenew', 'Toggle auto-renew'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMode(key as SubscriptionActionMode)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${mode === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-2 rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          {members.slice(0, 5).map((member) => (
            <div key={member.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-sm dark:bg-slate-950">
              <span>{member.fullName}</span>
              <span className="text-xs text-slate-500">{member.planName} | {bucketLabel(member.bucket)}</span>
            </div>
          ))}
          {members.length > 5 && <div className="text-xs text-slate-500">+{members.length - 5} more members</div>}
        </div>

        {mode === 'assign' && (
          <div className="mt-5 space-y-4">
            <select
              value={assignDraft.planId}
              onChange={(event) => setAssignDraft((current) => ({ ...current, planId: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">Select a plan</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>{plan.name}</option>
              ))}
            </select>
            <textarea
              value={assignDraft.notes}
              onChange={(event) => setAssignDraft((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Optional note"
            />
          </div>
        )}

        {mode === 'extend' && (
          <div className="mt-5 space-y-4">
            <input
              value={extendDraft.days}
              onChange={(event) => setExtendDraft((current) => ({ ...current, days: event.target.value }))}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              inputMode="numeric"
              placeholder="30"
            />
            <textarea
              value={extendDraft.notes}
              onChange={(event) => setExtendDraft((current) => ({ ...current, notes: event.target.value }))}
              rows={3}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
              placeholder="Optional note"
            />
          </div>
        )}

        {mode === 'expire' && (
          <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
            This expires the selected subscriptions immediately and should move them into the expired bucket on refresh.
          </div>
        )}

        {mode === 'autoRenew' && (
          <div className="mt-5 rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
            This toggles auto-renew using the current subscription endpoint. Use it for quick renewal-state changes without leaving the Contact Center.
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-700">Cancel</button>
          <button onClick={onSubmit} disabled={submitting} className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {submitting ? 'Running...' : 'Apply action'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

  const activeFilters = useMemo(
    () => trimFilterPayload({ ...filters, selectedUserIds: selectedIds }),
    [filters, selectedIds],
  );
  const authReady = Boolean(user) && !authLoading;

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

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    setSelectedIds([]);
  }, [page, filters]);

  const canViewGuardian = Boolean(membersQuery.data?.permissions.canViewGuardian);
  const canExport = Boolean(membersQuery.data?.permissions.canExport);
  const canPersonalOutreach = Boolean(membersQuery.data?.permissions.canPersonalOutreach);
  const visibleMembers = membersQuery.data?.items ?? [];
  const selectedMembers = visibleMembers.filter((member) => selectedIds.includes(member.userId));
  const outreachMembers = selectedMembers.length > 0 ? selectedMembers : visibleMembers.slice(0, 12);
  const filterOptions = membersQuery.data?.filterOptions || overviewQuery.data?.filterOptions;
  const thresholdOptions = membersQuery.data?.thresholdOptions || overviewQuery.data?.thresholdOptions || [3, 7, 15, 30];
  const totalMemberCount = membersQuery.data?.summary.totalMembers || 0;
  const totalSelectedOrVisible = selectedIds.length || totalMemberCount;
  const planOptions = useMemo(() => (filterOptions?.plans || []).filter((plan) => plan.id), [filterOptions?.plans]);
  const availablePlans = useMemo<ContactCenterPlanOption[]>(
    () => planOptions.map((plan) => ({
      id: plan.id,
      name: plan.name,
      code: plan.code,
    })),
    [planOptions],
  );

  useEffect(() => {
    if (!canViewGuardian && (scope === 'guardian' || scope === 'student_guardian')) {
      setScope('phones');
    }
    if (!canViewGuardian) {
      setShowGuardianColumns(false);
      setFilters((current) => ({
        ...current,
        hasGuardian: undefined,
      }));
    }
  }, [canViewGuardian, scope]);

  useEffect(() => {
    if (!selectedPresetId && presetsQuery.data?.length) {
      const defaultPreset = presetsQuery.data.find((preset) => preset.isDefault);
      if (defaultPreset?._id) {
        setSelectedPresetId(defaultPreset._id);
      }
    }
  }, [presetsQuery.data, selectedPresetId]);

  const previewMutation = useMutation({
    mutationFn: (mode: 'copy_preview' | 'personal_outreach') => previewSubscriptionContactCopy({
      filters: activeFilters,
      scope,
      presetId: selectedPresetId || undefined,
      mode,
    }),
    onSuccess: (result) => {
      setPreviewText(result.previewText || result.text || '');
      setPreviewCount(result.rowCount || 0);
    },
    onError: () => showToast('Preview failed', 'error'),
  });

  const exportMutation = useMutation({
    mutationFn: async () => exportSubscriptionContactCenter({
      filters: activeFilters,
      scope,
      format,
      presetId: selectedPresetId || undefined,
    }),
    onSuccess: async (result) => {
      const structuredResult = result as {
        text?: string;
        previewText?: string;
        rowCount?: number;
        fileName?: string;
        data?: Record<string, unknown>[];
        count?: number;
      };
      const blobResult = result as { data: Blob; headers?: Record<string, unknown> };

      if (format === 'clipboard' && structuredResult.text) {
        await navigator.clipboard.writeText(structuredResult.text);
        setPreviewText(structuredResult.previewText || structuredResult.text);
        setPreviewCount(structuredResult.rowCount || structuredResult.count || 0);
        showToast(`Copied ${structuredResult.rowCount || structuredResult.count || 0} contacts`);
        return;
      }
      if (format === 'txt' && structuredResult.text) {
        const blob = new Blob([structuredResult.text], { type: 'text/plain' });
        downloadFile(blob, { filename: structuredResult.fileName || 'subscription-contact-center.txt', contentType: 'text/plain' });
        showToast('TXT export downloaded');
        return;
      }
      if (format === 'json' && structuredResult.data) {
        const blob = new Blob([JSON.stringify(structuredResult.data, null, 2)], { type: 'application/json' });
        downloadFile(blob, { filename: structuredResult.fileName || 'subscription-contact-center.json', contentType: 'application/json' });
        showToast('JSON export downloaded');
        return;
      }
      downloadFile(blobResult);
      showToast('Download started');
    },
    onError: () => showToast('Export failed', 'error'),
  });

  const saveAudienceMutation = useMutation({
    mutationFn: () => createAudienceSegment({
      name: saveAudienceName,
      rules: {
        planIds: filters.planIds,
        planCodes: filters.planCodes,
        groupIds: filters.groupIds,
        departments: filters.departments,
        institutionNames: filters.institutionNames,
        bucket: filters.bucket,
        hasPhone: filters.hasPhone,
        hasEmail: filters.hasEmail,
        hasGuardian: filters.hasGuardian,
        paymentDue: filters.paymentDue,
        renewalThresholdDays: filters.renewalThresholdDays,
        profileScoreRange: filters.profileScoreRange,
      },
    }),
    onSuccess: () => {
      setSaveAudienceName('');
      invalidateCenter();
      showToast('Saved as custom audience');
    },
    onError: () => showToast('Could not save custom audience', 'error'),
  });

  const savePresetMutation = useMutation({
    mutationFn: () => editingPresetId
      ? updateSubscriptionContactCenterPreset(editingPresetId, presetDraft)
      : createSubscriptionContactCenterPreset(presetDraft),
    onSuccess: () => {
      setPresetDraft(presetDraftFromPreset());
      setEditingPresetId(null);
      queryClient.invalidateQueries({ queryKey: ['subscription-contact-center-presets'] });
      showToast('Preset saved');
    },
    onError: () => showToast('Preset save failed', 'error'),
  });

  const deletePresetMutation = useMutation({
    mutationFn: (presetId: string) => deleteSubscriptionContactCenterPreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-contact-center-presets'] });
      showToast('Preset removed');
    },
    onError: () => showToast('Preset delete failed', 'error'),
  });

  const subscriptionMutation = useMutation({
    mutationFn: async () => {
      const targets = manageMembers;
      if (!targets.length) return { successCount: 0, failureCount: 0 };
      let results: PromiseSettledResult<unknown>[] = [];

      if (manageMode === 'assign') {
        if (!assignDraft.planId) throw new Error('Plan required');
        results = await Promise.allSettled(
          targets.map((member) => assignSubscription(member.userId, { planId: assignDraft.planId, notes: assignDraft.notes || undefined })),
        );
      } else if (manageMode === 'extend') {
        const days = Number(extendDraft.days);
        if (!Number.isFinite(days) || days <= 0) throw new Error('Valid days required');
        results = await Promise.allSettled(
          targets.map((member) => extendSubscription(member.userId, days, extendDraft.notes || undefined)),
        );
      } else if (manageMode === 'expire') {
        results = await Promise.allSettled(targets.map((member) => expireSubscriptionNow(member.userId)));
      } else {
        results = await Promise.allSettled(targets.map((member) => toggleAutoRenew(member.userId)));
      }

      const successCount = results.filter((item) => item.status === 'fulfilled').length;
      return { successCount, failureCount: results.length - successCount };
    },
    onSuccess: ({ successCount, failureCount }) => {
      invalidateCenter();
      setManageOpen(false);
      setManageMembers([]);
      showToast(
        failureCount > 0
          ? `Completed with ${successCount} success and ${failureCount} failure`
          : `Updated ${successCount} subscription${successCount === 1 ? '' : 's'}`,
        failureCount > 0 ? 'error' : 'success',
      );
    },
    onError: (error) => showToast(error instanceof Error ? error.message : 'Subscription action failed', 'error'),
  });

  const setTab = (nextTab: CenterTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next);
  };

  const applyOverviewPlan = (planId: string, nextTab: CenterTab, nextScope?: ContactScope) => {
    setSelectedIds([]);
    setFilters(() => ({
      ...EMPTY_FILTERS,
      savedAudienceId: '',
      planIds: planId ? [planId] : [],
      selectedUserIds: [],
    }));
    if (nextScope) setScope(nextScope);
    setTab(nextTab);
  };

  const togglePlanFilter = (planId: string) => {
    setFilters((current) => ({
      ...current,
      savedAudienceId: '',
      planIds: current.planIds?.includes(planId)
        ? current.planIds.filter((item) => item !== planId)
        : [...(current.planIds || []), planId],
    }));
  };

  const toggleSelected = (userId: string) => {
    setSelectedIds((current) => current.includes(userId)
      ? current.filter((item) => item !== userId)
      : [...current, userId]);
  };

  const toggleAllVisible = () => {
    const ids = visibleMembers.map((member) => member.userId);
    const allSelected = ids.length > 0 && ids.every((userId) => selectedIds.includes(userId));
    setSelectedIds(allSelected ? [] : ids);
  };

  const copySingleValue = async (value: string, successMessage: string) => {
    if (!value) {
      showToast('No value available', 'error');
      return;
    }
    await navigator.clipboard.writeText(value);
    showToast(successMessage);
  };

  const startPresetEdit = (preset: SubscriptionContactCenterPreset) => {
    setEditingPresetId(preset._id);
    setPresetDraft(presetDraftFromPreset(preset));
    setTab('presets');
  };

  const openManage = (members: SubscriptionContactCenterMember[], mode: SubscriptionActionMode = 'assign') => {
    setManageMembers(members);
    setManageMode(mode);
    setManageOpen(true);
  };

  const renderMembersTable = () => (
    <div className="space-y-4">
      <div className="sticky top-4 z-10 rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={filters.search || ''}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            placeholder="Search by name, email, phone, guardian, or plan"
            className="min-w-[240px] flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <div className="relative">
            <button onClick={() => setPlanPickerOpen((current) => !current)} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
              Plans {filters.planIds?.length ? `(${filters.planIds.length})` : '(All)'}
              <ChevronDown className="h-4 w-4" />
            </button>
            {planPickerOpen && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-80 rounded-3xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-950">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Multi-plan filter</div>
                  <button onClick={() => setFilters((current) => ({ ...current, planIds: [], savedAudienceId: '' }))} className="text-xs font-medium text-indigo-600">Clear</button>
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {planOptions.map((plan) => {
                    const checked = Boolean(filters.planIds?.includes(plan.id));
                    return (
                      <button key={plan.id} onClick={() => togglePlanFilter(plan.id)} className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900 dark:text-white">{plan.name}</div>
                          <div className="truncate text-xs text-slate-500">{plan.code || plan.id}</div>
                        </div>
                        <span className={`ml-3 inline-flex h-5 w-5 items-center justify-center rounded-full border ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-transparent dark:border-slate-700'}`}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <select
            value={filters.groupIds?.[0] || ''}
            onChange={(event) => setFilters((current) => ({ ...current, groupIds: event.target.value ? [event.target.value] : [], savedAudienceId: '' }))}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All groups</option>
            {(filterOptions?.groups || []).map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          <select
            value={filters.departments?.[0] || ''}
            onChange={(event) => setFilters((current) => ({ ...current, departments: event.target.value ? [event.target.value] : [], savedAudienceId: '' }))}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All departments</option>
            {(filterOptions?.departments || []).map((department) => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
          <select
            value={filters.institutionNames?.[0] || ''}
            onChange={(event) => setFilters((current) => ({ ...current, institutionNames: event.target.value ? [event.target.value] : [], savedAudienceId: '' }))}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">All institutions</option>
            {(filterOptions?.institutionNames || []).map((institutionName) => (
              <option key={institutionName} value={institutionName}>{institutionName}</option>
            ))}
          </select>
          <select
            value={String(filters.renewalThresholdDays || overviewQuery.data?.renewalThresholdDays || thresholdOptions[1] || 7)}
            onChange={(event) => setFilters((current) => ({ ...current, renewalThresholdDays: Number(event.target.value) || undefined, savedAudienceId: '' }))}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {thresholdOptions.map((option) => (
              <option key={option} value={option}>Renewal in {option} days</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <input type="checkbox" checked={Boolean(filters.hasPhone)} onChange={(event) => setFilters((current) => ({ ...current, hasPhone: event.target.checked || undefined, savedAudienceId: '' }))} />
            Has phone
          </label>
          <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <input type="checkbox" checked={Boolean(filters.hasEmail)} onChange={(event) => setFilters((current) => ({ ...current, hasEmail: event.target.checked || undefined, savedAudienceId: '' }))} />
            Has email
          </label>
          <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <input type="checkbox" checked={Boolean(filters.paymentDue)} onChange={(event) => setFilters((current) => ({ ...current, paymentDue: event.target.checked || undefined, savedAudienceId: '' }))} />
            Payment due
          </label>
          {canViewGuardian && (
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
              <input type="checkbox" checked={Boolean(filters.hasGuardian)} onChange={(event) => setFilters((current) => ({ ...current, hasGuardian: event.target.checked || undefined, savedAudienceId: '' }))} />
              Has guardian
            </label>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {BUCKET_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilters((current) => ({ ...current, bucket: option.value, savedAudienceId: '' }))}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${filters.bucket === option.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sticky top-36 z-10 rounded-3xl border border-slate-200/80 bg-slate-50/95 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-indigo-600 px-3 py-1 text-white">{selectedIds.length} selected</span>
          {selectedIds.length > 0 && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
              Campaign handoff stays locked to the selected rows
            </span>
          )}
          <button onClick={() => { setScope('phones'); setTab('export'); }} className="rounded-2xl border border-slate-200 px-3 py-2 font-medium dark:border-slate-700">Copy phones</button>
          <button onClick={() => { setScope('emails'); setTab('export'); }} className="rounded-2xl border border-slate-200 px-3 py-2 font-medium dark:border-slate-700">Copy emails</button>
          <button onClick={() => { setScope('raw'); setTab('export'); }} className="rounded-2xl border border-slate-200 px-3 py-2 font-medium dark:border-slate-700">Export</button>
          <button
            onClick={() => navigate(ADMIN_PATHS.campaignsNew, {
              state: {
                prefillAudienceFilters: selectedIds.length > 0 ? activeFilters : trimFilterPayload(filters),
                prefillSelectedUserIds: selectedIds,
                prefillCampaignName: selectedIds.length > 0 ? `Selected audience (${selectedIds.length})` : `${bucketLabel(String(filters.bucket || 'all'))} audience`,
              },
            })}
            className="rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200"
          >
            Create campaign
          </button>
          {canPersonalOutreach && (
            <button onClick={() => setTab('outreach')} className="rounded-2xl bg-indigo-600 px-3 py-2 font-medium text-white">Personal Outreach</button>
          )}
          <button onClick={() => openManage(selectedMembers)} disabled={selectedMembers.length === 0} className="rounded-2xl border border-slate-200 px-3 py-2 font-medium disabled:opacity-50 dark:border-slate-700">Manage subscriptions</button>
          {canViewGuardian && (
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showGuardianColumns} onChange={(event) => setShowGuardianColumns(event.target.checked)} />
              Show guardian columns
            </label>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Plan Members</h3>
            <p className="text-sm text-slate-500">One table, one filter bar, one bulk action bar. Copy, export, and outreach all run on the same audience.</p>
          </div>
          <div className="flex items-center gap-2">
            <input value={saveAudienceName} onChange={(event) => setSaveAudienceName(event.target.value)} placeholder="Save current filters as custom audience" className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900" />
            <button onClick={() => saveAudienceMutation.mutate()} disabled={!saveAudienceName || saveAudienceMutation.isPending} className="rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
              <Save className="mr-2 inline h-4 w-4" />Save Audience
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {(filterOptions?.savedAudiences || []).map((audience) => (
            <button
              key={audience.id}
              onClick={() => setFilters((current) => ({ ...current, savedAudienceId: audience.id }))}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${filters.savedAudienceId === audience.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300'}`}
            >
              {audience.name} ({audience.memberCountCached})
            </button>
          ))}
          {filters.savedAudienceId && (
            <button onClick={() => setFilters((current) => ({ ...current, savedAudienceId: '' }))} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700">
              Clear saved audience
            </button>
          )}
        </div>
        <div className="space-y-3 px-4 pb-4">
          {visibleMembers.map((member) => (
            <div key={member.userId} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selectedIds.includes(member.userId)} onChange={() => toggleSelected(member.userId)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{member.fullName}</h4>
                      <p className="text-xs text-slate-500">{member.planName}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{bucketLabel(member.bucket)}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <div>{member.phone || 'No phone'}</div>
                    <div>{member.email || 'No email'}</div>
                    <div>Expires: {formatDate(member.expiresAtUTC)}</div>
                    {canViewGuardian && showGuardianColumns && <div>{member.guardianPhone || member.guardianEmail || 'No guardian contact'}</div>}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button onClick={() => copySingleValue(member.phone, 'Phone copied')} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">Copy phone</button>
                    <button onClick={() => openManage([member])} className="rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white">Manage</button>
                    <button onClick={() => copySingleValue(member.email, 'Email copied')} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">Copy email</button>
                    <button onClick={() => navigate(member.openProfileRoute)} className="rounded-2xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">Open profile</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {visibleMembers.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400 dark:border-slate-800">No members found for the current filters.</div>
          )}
        </div>
        <div className="hidden overflow-x-auto">
          <table className="min-w-full table-fixed text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <th className="px-4 py-3"><input type="checkbox" checked={visibleMembers.length > 0 && visibleMembers.every((member) => selectedIds.includes(member.userId))} onChange={toggleAllVisible} /></th>
                <th className="w-[19%] px-4 py-3">Student</th>
                <th className="w-[13%] px-4 py-3">Phone</th>
                <th className="w-[18%] px-4 py-3">Email</th>
                {canViewGuardian && showGuardianColumns && <th className="w-[14%] px-4 py-3">Guardian</th>}
                <th className="w-[12%] px-4 py-3">Plan</th>
                <th className="w-[10%] px-4 py-3">Bucket</th>
                <th className="w-[9%] px-4 py-3">Expiry</th>
                <th className="w-[12rem] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr key={member.userId} className="border-b border-slate-100 last:border-b-0 dark:border-slate-900">
                  <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(member.userId)} onChange={() => toggleSelected(member.userId)} /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{member.fullName}</div>
                    <div className="text-xs text-slate-500">{member.department || 'No department'} · {member.groupNames.join(', ') || 'No group'}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{member.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{member.email || '—'}</td>
                  {canViewGuardian && showGuardianColumns && <td className="px-4 py-3 text-xs text-slate-500">{member.guardianPhone || member.guardianEmail || '—'}</td>}
                  <td className="px-4 py-3">{member.planName}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">{member.bucket.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{member.expiresAtUTC ? new Date(member.expiresAtUTC).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => copySingleValue(member.phone, 'Phone copied')} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">Copy phone</button>
                      <button onClick={() => copySingleValue(member.email, 'Email copied')} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">Copy email</button>
                      <button onClick={() => copySingleValue([member.fullName, member.phone, member.email].filter(Boolean).join(' | '), 'Contact bundle copied')} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">Copy all</button>
                      <a href={member.phone ? `tel:${member.phone}` : undefined} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">Call</a>
                      <a href={member.phone ? `sms:${member.phone}` : undefined} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">SMS</a>
                      <a href={member.email ? `mailto:${member.email}` : undefined} className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs dark:border-slate-700">Email</a>
                      <button onClick={() => navigate(member.openProfileRoute)} className="rounded-xl bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white">Open profile</button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleMembers.length === 0 && (
                <tr><td colSpan={showGuardianColumns ? 9 : 8} className="px-4 py-10 text-center text-slate-400">No members found for the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {(membersQuery.data?.totalPages || 1) > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm dark:border-slate-800">
            <span className="text-slate-500">
              Page {membersQuery.data?.page || 1} of {membersQuery.data?.totalPages || 1}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={(membersQuery.data?.page || 1) <= 1}
                className="rounded-2xl border border-slate-200 px-4 py-2 font-medium disabled:opacity-50 dark:border-slate-700"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((current) => Math.min(membersQuery.data?.totalPages || 1, current + 1))}
                disabled={(membersQuery.data?.page || 1) >= (membersQuery.data?.totalPages || 1)}
                className="rounded-2xl border border-slate-200 px-4 py-2 font-medium disabled:opacity-50 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <AdminGuardShell
      title="Subscription Contact Center"
      description="One canonical subscription-wise audience workspace for copy, export, custom saved audiences, and personal outreach."
      requiredModule="notifications"
      allowedRoles={['superadmin', 'admin', 'moderator', 'support_agent']}
    >
      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
          {toast.message}
        </div>
      )}
        <ManageSubscriptionModal
          open={manageOpen}
          members={manageMembers}
          plans={availablePlans}
          submitting={subscriptionMutation.isPending}
        mode={manageMode}
        setMode={setManageMode}
        assignDraft={assignDraft}
        setAssignDraft={setAssignDraft}
        extendDraft={extendDraft}
        setExtendDraft={setExtendDraft}
        onClose={() => setManageOpen(false)}
        onSubmit={() => subscriptionMutation.mutate()}
      />
      <div className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                <Users className="h-4 w-4" /> Communication Hub
              </div>
              <h2 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">Subscription Contact Center</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">Use real subscription status as the single audience source for copy, export, guardian-aware handoff, saved audiences, campaign outreach, and direct subscription operations.</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            {CENTER_TABS.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${tab === item.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[
                { label: 'Total members', value: overviewQuery.data?.summary.totalMembers || 0 },
                { label: 'Active', value: overviewQuery.data?.summary.activeCount || 0 },
                { label: 'Renewal due', value: overviewQuery.data?.summary.renewalDueCount || 0 },
                { label: 'Expired members', value: overviewQuery.data?.summary.expiredCount || 0 },
                { label: 'Cancelled / Paused', value: overviewQuery.data?.summary.cancelledCount || 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Audience Overview</h3>
                  <p className="text-sm text-slate-500">Quick actions always jump to the same canonical filters. No duplicate contact pages, no manual bucket maintenance.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Active</th>
                      <th className="px-4 py-3">Renewal Due</th>
                      <th className="px-4 py-3">Expired</th>
                      <th className="px-4 py-3">Cancelled / Paused</th>
                      <th className="px-4 py-3">Phone Ready</th>
                      <th className="px-4 py-3">Email Ready</th>
                      <th className="px-4 py-3">Quick actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overviewQuery.data?.plans || []).map((plan, index) => (
                      <tr key={`${plan.planId || plan.planCode || plan.planName}-${index}`} className="border-b border-slate-100 last:border-b-0 dark:border-slate-900">
                        <td className="px-4 py-3 font-medium text-slate-950 dark:text-white">{plan.planName}</td>
                        <td className="px-4 py-3">{plan.totalMembers}</td>
                        <td className="px-4 py-3">{plan.activeCount}</td>
                        <td className="px-4 py-3">{plan.renewalDueCount}</td>
                        <td className="px-4 py-3">{plan.expiredCount}</td>
                        <td className="px-4 py-3">{plan.cancelledCount}</td>
                        <td className="px-4 py-3">{plan.phoneReadyCount}</td>
                        <td className="px-4 py-3">{plan.emailReadyCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => applyOverviewPlan(plan.planId, 'members')} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">View Members</button>
                            <button onClick={() => applyOverviewPlan(plan.planId, 'export', 'phones')} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">Copy Phones</button>
                            <button onClick={() => applyOverviewPlan(plan.planId, 'export', 'emails')} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">Copy Emails</button>
                            <button onClick={() => applyOverviewPlan(plan.planId, 'export', 'raw')} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-700">Export</button>
                            {canPersonalOutreach && <button onClick={() => applyOverviewPlan(plan.planId, 'outreach')} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-slate-900">Personal Outreach</button>}
                            <button onClick={() => navigate(ADMIN_PATHS.campaignsNew, { state: { prefillAudienceFilters: { planIds: [plan.planId] }, prefillCampaignName: `${plan.planName} audience` } })} className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white">Send Campaign</button>
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

        {tab === 'members' && renderMembersTable()}

        {tab === 'outreach' && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Personal Outreach Mode</h3>
                  <p className="text-sm text-slate-500">Use the currently selected audience or the first visible members from the filtered table. Guardian access stays role-protected.</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => { setScope('phones'); previewMutation.mutate('personal_outreach'); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Preview phones</button>
                <button onClick={() => { setScope('emails'); previewMutation.mutate('personal_outreach'); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Preview emails</button>
                <button onClick={() => { setScope('combined'); previewMutation.mutate('personal_outreach'); }} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-700">Preview bundle</button>
                <button onClick={() => setTab('export')} className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Open Export / Copy</button>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {outreachMembers.map((member) => (
                <div key={member.userId} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-950 dark:text-white">{member.fullName}</h4>
                      <p className="text-sm text-slate-500">{member.planName} · {member.bucket.replace('_', ' ')}</p>
                    </div>
                    <button onClick={() => navigate(member.openProfileRoute)} className="rounded-full border border-slate-200 p-2 dark:border-slate-700"><ExternalLink className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <div>{member.phone || 'No phone'}</div>
                    <div>{member.email || 'No email'}</div>
                    {canViewGuardian && (member.guardianPhone || member.guardianEmail) && (
                      <div className="rounded-2xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900">
                        Guardian: {member.guardianPhone || member.guardianEmail}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => copySingleValue(member.phone, 'Phone copied')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"><Phone className="mr-1 inline h-3.5 w-3.5" />Copy</button>
                    <a href={member.phone ? `tel:${member.phone}` : undefined} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"><Phone className="mr-1 inline h-3.5 w-3.5" />Call</a>
                    <a href={member.phone ? `sms:${member.phone}` : undefined} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"><MessageSquare className="mr-1 inline h-3.5 w-3.5" />SMS</a>
                    <a href={member.email ? `mailto:${member.email}` : undefined} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"><Mail className="mr-1 inline h-3.5 w-3.5" />Email</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'export' && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Export / Copy Center</h3>
                  <p className="text-sm text-slate-500">The same filtered audience powers clipboard copy, plain-text handoff, CSV/XLSX export, and guardian-inclusive output.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Scope</label>
                  <select value={scope} onChange={(event) => setScope(event.target.value as ContactScope)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    {SCOPE_OPTIONS.filter((option) => canViewGuardian || !['guardian', 'student_guardian'].includes(option.value)).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Format</label>
                  <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    {FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Preset</label>
                  <select value={selectedPresetId} onChange={(event) => setSelectedPresetId(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <option value="">Default preset</option>
                    {(presetsQuery.data || []).map((preset) => <option key={preset._id} value={preset._id}>{preset.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => previewMutation.mutate('copy_preview')} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-700"><Eye className="mr-2 inline h-4 w-4" />Preview output</button>
                <button onClick={() => exportMutation.mutate()} disabled={!canExport || exportMutation.isPending} className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"><Download className="mr-2 inline h-4 w-4" />Run export / copy</button>
                <button onClick={() => setTab('presets')} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-700"><Settings2 className="mr-2 inline h-4 w-4" />Manage presets</button>
              </div>
              <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {selectedIds.length > 0
                    ? <>Using <strong>{selectedIds.length}</strong> selected members for this action.</>
                    : <>Using all <strong>{totalMemberCount}</strong> members from the current filtered audience because nothing is selected.</>}
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-300">Current action scope: <strong>{SCOPE_OPTIONS.find((option) => option.value === scope)?.label || scope}</strong></p>
                <p className="text-sm text-slate-600 dark:text-slate-300">Last preview row count: <strong>{previewCount}</strong></p>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Preview</h4>
                {previewText && <button onClick={() => navigator.clipboard.writeText(previewText).then(() => showToast('Preview copied'))} className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700"><Copy className="mr-1 inline h-3.5 w-3.5" />Copy preview</button>}
              </div>
              <textarea readOnly value={previewText} rows={14} className="w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200" />
            </div>
          </div>
        )}

        {tab === 'presets' && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Saved Format Presets</h3>
                  <p className="text-sm text-slate-500">One preset can drive clipboard output, TXT, CSV, XLSX, and JSON export labels.</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-900">
                {(presetsQuery.data || []).map((preset) => (
                  <div key={preset._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-slate-900 dark:text-white">{preset.name}</h4>
                        {preset.isDefault && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Default</span>}
                      </div>
                      <p className="text-xs text-slate-500">
                        Prefix: <code>{preset.prefix || '(none)'}</code> | Suffix: <code>{preset.suffix || '(none)'}</code> | Separator: <code>{preset.separator === '\n' ? '\\n' : preset.separator}</code>
                      </p>
                      <p className="text-xs text-slate-500">
                        Include name: {preset.includeName ? 'Yes' : 'No'} | Include email: {preset.includeEmail ? 'Yes' : 'No'} | Include guardian: {preset.includeGuardian ? 'Yes' : 'No'} | Include plan: {preset.includePlan ? 'Yes' : 'No'} | Include status: {preset.includeStatus ? 'Yes' : 'No'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => { setSelectedPresetId(preset._id); setTab('export'); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700">Use in export</button>
                      <button onClick={() => startPresetEdit(preset)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700">Edit</button>
                      {!preset.isDefault && (
                        <button onClick={() => deletePresetMutation.mutate(preset._id)} disabled={deletePresetMutation.isPending} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 disabled:opacity-50 dark:border-rose-900/50">
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {(presetsQuery.data || []).length === 0 && (
                  <div className="px-5 py-10 text-center text-sm text-slate-400">No presets found yet.</div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{editingPresetId ? 'Edit Preset' : 'Create Preset'}</h3>
                  <p className="text-sm text-slate-500">Keep formatting reusable and consistent across manual copy, outreach, and export.</p>
                </div>
                {editingPresetId && (
                  <button onClick={() => { setEditingPresetId(null); setPresetDraft(presetDraftFromPreset()); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700">
                    Reset
                  </button>
                )}
              </div>
              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Preset name</label>
                  <input value={presetDraft.name} onChange={(event) => setPresetDraft((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="e.g. WhatsApp phones" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Prefix</label>
                    <input value={presetDraft.prefix} onChange={(event) => setPresetDraft((current) => ({ ...current, prefix: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder="WA:" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Suffix</label>
                    <input value={presetDraft.suffix} onChange={(event) => setPresetDraft((current) => ({ ...current, suffix: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900" placeholder=";" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Separator</label>
                    <select value={presetDraft.separator} onChange={(event) => setPresetDraft((current) => ({ ...current, separator: event.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                      <option value="\n">New line</option>
                      <option value=", ">Comma</option>
                      <option value="; ">Semicolon</option>
                      <option value=" | ">Pipe</option>
                      <option value="\t">Tab</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['includeName', 'Include student name'],
                    ['includeEmail', 'Include student email'],
                    ['includeGuardian', 'Include guardian contact'],
                    ['includePlan', 'Include plan name'],
                    ['includeStatus', 'Include status bucket'],
                    ['isDefault', 'Set as default preset'],
                  ].map(([field, label]) => (
                    <label key={field} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(presetDraft[field as keyof typeof presetDraft])}
                        onChange={(event) => setPresetDraft((current) => ({ ...current, [field]: event.target.checked }))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sample output</p>
                  <p className="mt-2 font-mono text-xs text-slate-600 dark:text-slate-300">
                    {`${presetDraft.includePlan ? '[Premium] ' : ''}${presetDraft.includeStatus ? 'Active | ' : ''}${presetDraft.includeName ? 'Student Name | ' : ''}${presetDraft.prefix || ''}+8801XXXXXXXXX${presetDraft.suffix || ''}${presetDraft.includeEmail ? ' | student@email.com' : ''}${presetDraft.includeGuardian ? ' | Guardian: +8801YYYYYYYYY' : ''}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => savePresetMutation.mutate()} disabled={!presetDraft.name.trim() || savePresetMutation.isPending} className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                    <Save className="mr-2 inline h-4 w-4" />{editingPresetId ? 'Update preset' : 'Save preset'}
                  </button>
                  <button onClick={() => { setSelectedPresetId(''); setPresetDraft(presetDraftFromPreset()); setEditingPresetId(null); }} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-700">
                    Clear form
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-white">Logs / History</h3>
                  <p className="text-sm text-slate-500">Copy preview, export, outreach, and preset changes are all logged from the canonical module.</p>
                </div>
                <button onClick={() => logsQuery.refetch()} className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium dark:border-slate-700">
                  <History className="mr-2 inline h-4 w-4" />Refresh logs
                </button>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Rows</th>
                      <th className="px-4 py-3">Performed by</th>
                      <th className="px-4 py-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(logsQuery.data?.items || []).map((item) => (
                      <tr key={item._id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-900">
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${item.kind === 'export' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200'}`}>
                            {item.kind}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.title}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.category || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.format || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.rowCount || 0}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{item.performedByName || 'System'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                    {(logsQuery.data?.items || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-slate-400">No logs yet for this module.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuardShell>
  );
}
