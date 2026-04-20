import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Users, UserCheck, UserX, CreditCard,
  ChevronLeft, ChevronRight,
  RefreshCcw, AlertTriangle,
  Eye, X, Mail, Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getStudentsList, getStudentMetrics, getStudentGroups, suspendStudent, activateStudent, getStudentUnified } from '../../../api/adminStudentApi';
import { adminBulkStudentAction } from '../../../services/api';
import { adminUi } from '../../../lib/appRoutes';
import type { AdminStudentUnifiedPayload } from '../../../types/studentManagement';

type Student = {
  _id: string; full_name: string; email: string; phone_number?: string;
  status: string; role: string; createdAt: string; lastLogin?: string;
  avatarUrl?: string;
  subscription?: { status?: string; planId?: { name?: string }; expiresAtUTC?: string };
  profile_completion_percentage?: number;
  profile?: { profile_completion_percentage?: number; phone_number?: string; profile_photo_url?: string };
  groups?: { _id: string; name: string; color?: string }[];
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  blocked: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function StudentManagementListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [subFilter, setSubFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [expiringDays, setExpiringDays] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 25;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: metrics } = useQuery({
    queryKey: ['student-metrics'],
    queryFn: getStudentMetrics,
    staleTime: 30_000,
  });

  const { data: groupsData } = useQuery({
    queryKey: ['student-groups-filter'],
    queryFn: () => getStudentGroups(),
    staleTime: 60_000,
  });
  const allGroups: { _id: string; name: string }[] = groupsData?.data ?? groupsData ?? [];

  const { data: listData, isLoading, refetch } = useQuery({
    queryKey: ['students-list', page, debouncedSearch, statusFilter, subFilter, departmentFilter, groupFilter, sortBy, sortOrder, expiringDays],
    queryFn: () => getStudentsList({
      page, limit, q: debouncedSearch || undefined,
      status: statusFilter || undefined,
      subscriptionStatus: subFilter || undefined,
      expiringDays: expiringDays ? Number(expiringDays) : undefined,
      department: departmentFilter || undefined,
      group: groupFilter || undefined,
      sortBy, sortOrder: sortOrder as 'asc' | 'desc',
    }),
  });

  const students: Student[] = listData?.data ?? listData?.students ?? [];
  const total = listData?.total ?? 0;
  const totalPages = listData?.pages ?? (Math.ceil(total / limit) || 1);

  const suspendMut = useMutation({ mutationFn: suspendStudent, onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['student-metrics'] }); } });
  const activateMut = useMutation({ mutationFn: activateStudent, onSuccess: () => { refetch(); qc.invalidateQueries({ queryKey: ['student-metrics'] }); } });

  const toggleSelect = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(prev => prev.length === students.length ? [] : students.map(s => s._id));
  const applyQuickFilter = (mode: 'all' | 'suspended' | 'expired' | 'expiring' | 'needs_review') => {
    setPage(1);
    if (mode === 'all') {
      setStatusFilter('');
      setSubFilter('');
      setExpiringDays('');
      return;
    }
    if (mode === 'suspended') {
      setStatusFilter('suspended');
      setSubFilter('');
      setExpiringDays('');
      return;
    }
    if (mode === 'expired') {
      setStatusFilter('');
      setSubFilter('expired');
      setExpiringDays('');
      return;
    }
    if (mode === 'expiring') {
      setStatusFilter('');
      setSubFilter('active');
      setExpiringDays('7');
      return;
    }
    setStatusFilter('blocked');
    setSubFilter('');
    setExpiringDays('');
  };

  const inputCls = 'rounded-xl border border-slate-200/60 bg-white px-3 py-2 text-sm dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all';
  const m = metrics;

  // Quick-view drawer state
  const [quickView, setQuickView] = useState<Student | null>(null);

  // Bulk action mutation
  const bulkMut = useMutation({
    mutationFn: (payload: { studentIds: string[]; action: string; groupId?: string }) => adminBulkStudentAction(payload),
    onSuccess: () => { toast.success('Bulk action completed'); refetch(); qc.invalidateQueries({ queryKey: ['student-metrics'] }); setSelected([]); },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Bulk action failed'),
  });

  const handleBulkAction = useCallback((action: string) => {
    if (!selected.length) return;
    bulkMut.mutate({ studentIds: selected, action });
  }, [selected, bulkMut]);

  return (
    <div className="space-y-5">
      {/* Metrics Cards */}
      {m && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={Users} label="Total Students" value={m.totalStudents} />
          <MetricCard icon={UserCheck} label="Active" value={m.activeStudents} accent="green" />
          <MetricCard icon={CreditCard} label="Active Subs" value={m.activeSubs} accent="indigo" />
          <MetricCard icon={AlertTriangle} label="Expiring Soon" value={m.expiringSoon} accent="orange" />
        </div>
      )}

      {/* Search & Filters */}
      <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80">
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'All Students' },
            { key: 'suspended', label: 'Suspended' },
            { key: 'expired', label: 'Expired Subs' },
            { key: 'expiring', label: 'Expiring 7d' },
            { key: 'needs_review', label: 'Needs Review' },
          ].map((item) => {
            const active =
              (item.key === 'all' && !statusFilter && !subFilter && !expiringDays) ||
              (item.key === 'suspended' && statusFilter === 'suspended') ||
              (item.key === 'expired' && subFilter === 'expired') ||
              (item.key === 'expiring' && subFilter === 'active' && expiringDays === '7') ||
              (item.key === 'needs_review' && statusFilter === 'blocked');
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => applyQuickFilter(item.key as 'all' | 'suspended' | 'expired' | 'expiring' | 'needs_review')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input aria-label="Search students" title="Search students" className={`${inputCls} w-full pl-8`} placeholder="Search by name, email, phone..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <select aria-label="Filter by status" title="Filter by status" className={inputCls} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="blocked">Blocked</option>
            <option value="pending">Pending</option>
          </select>
          <select aria-label="Filter by subscription" title="Filter by subscription" className={inputCls} value={subFilter} onChange={e => { setSubFilter(e.target.value); setPage(1); }}>
            <option value="">All Subs</option>
            <option value="active">Active Sub</option>
            <option value="expired">Expired Sub</option>
            <option value="none">No Sub</option>
          </select>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${showFilters ? 'border-indigo-300 bg-indigo-50 text-indigo-600 dark:border-indigo-700 dark:bg-indigo-900/20' : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400'}`} title={showFilters ? 'Hide more filters' : 'Show more filters'}>
            <Filter size={14} /> More
          </button>
          <button onClick={() => refetch()} className="rounded-lg border border-slate-300 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800" title="Refresh list">
            <RefreshCcw size={14} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <select aria-label="Filter by department" title="Filter by department" className={inputCls} value={departmentFilter} onChange={e => { setDepartmentFilter(e.target.value); setPage(1); }}>
              <option value="">All Departments</option>
              {['science', 'arts', 'commerce'].map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
            </select>
            <select aria-label="Filter by group" title="Filter by group" className={inputCls} value={groupFilter} onChange={e => { setGroupFilter(e.target.value); setPage(1); }}>
              <option value="">All Groups</option>
              {allGroups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
            </select>
            <select aria-label="Filter by expiring timeline" title="Filter by expiring timeline" className={inputCls} value={expiringDays} onChange={e => { setExpiringDays(e.target.value); setPage(1); }}>
              <option value="">Any expiry</option>
              <option value="7">Expiring in 7 days</option>
              <option value="30">Expiring in 30 days</option>
            </select>
            <select aria-label="Sort by" title="Sort by" className={inputCls} value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="createdAt">Sort: Join Date</option>
              <option value="name">Sort: Name</option>
              <option value="lastLogin">Sort: Last Login</option>
              <option value="status">Sort: Status</option>
            </select>
            <select aria-label="Sort order" title="Sort order" className={inputCls} value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selected.length > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto max-w-3xl">
          <div className="flex items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/95 px-5 py-3 shadow-elevated backdrop-blur-md">
            <span className="text-sm font-semibold text-white">{selected.length} selected</span>
            <div className="h-4 w-px bg-white/20" />
            <button onClick={() => handleBulkAction('suspend')} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/25 transition" disabled={bulkMut.isPending}>
              <UserX size={13} /> Suspend
            </button>
            <button onClick={() => handleBulkAction('activate')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition" disabled={bulkMut.isPending}>
              <UserCheck size={13} /> Activate
            </button>
            <button onClick={() => handleBulkAction('send_notification')} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/25 transition" disabled={bulkMut.isPending}>
              <Mail size={13} /> Notify
            </button>
            <button onClick={() => handleBulkAction('export')} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/20 transition" disabled={bulkMut.isPending}>
              <Download size={13} /> Export
            </button>
            <button onClick={() => setSelected([])} className="ml-auto rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition" aria-label="Clear selection">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Quick-View Drawer */}
      {quickView && (
        <StudentQuickViewDrawer student={quickView} onClose={() => setQuickView(null)} onNavigate={(id) => { setQuickView(null); navigate(adminUi(`student-management/students/${id}`)); }} onSuspend={(id) => { suspendMut.mutate(id); setQuickView(null); }} onActivate={(id) => { activateMut.mutate(id); setQuickView(null); }} />
      )}

      {/* List */}
      <div className="rounded-2xl border border-slate-200/60 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80 overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="inline-flex items-center gap-2"><RefreshCcw size={16} className="animate-spin" /> Loading students...</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/60 bg-slate-50/50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/30 dark:text-slate-400">
                    <th className="px-4 py-3 w-8">
                      <input aria-label="Select all students" title="Select all students" type="checkbox" checked={selected.length === students.length && students.length > 0} onChange={toggleAll} className="rounded border-slate-300" />
                    </th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Groups</th>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3">Profile</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {students.map(s => (
                    <tr key={s._id} className="text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50 cursor-pointer"
                      onClick={() => navigate(adminUi(`student-management/students/${s._id}`))}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input aria-label="Select student" title="Select student" type="checkbox" checked={selected.includes(s._id)} onChange={() => toggleSelect(s._id)} className="rounded border-slate-300" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {(s.avatarUrl || s.profile?.profile_photo_url) ? (
                            <img
                              src={s.avatarUrl || s.profile?.profile_photo_url}
                              alt={s.full_name}
                              className="h-8 w-8 rounded-full object-cover ring-2 ring-indigo-200 dark:ring-indigo-800"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                            />
                          ) : null}
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 ${(s.avatarUrl || s.profile?.profile_photo_url) ? 'hidden' : ''}`}>
                            {s.full_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800 dark:text-white">{s.full_name}</p>
                            <p className="text-xs text-slate-400">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] || ''}`}>{s.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {s.groups?.slice(0, 2).map(g => (
                            <span key={g._id} className="rounded-full px-2 py-0.5 text-[10px] font-medium" ref={(el) => { if (el) { el.style.backgroundColor = `${g.color || '#6366f1'}20`; el.style.color = g.color || '#6366f1'; } }}>{g.name}</span>
                          ))}
                          {(s.groups?.length ?? 0) > 2 && <span className="text-[10px] text-slate-400">+{(s.groups?.length ?? 0) - 2}</span>}
                          {!s.groups?.length && <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {s.subscription?.status === 'active' ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            {s.subscription.planId?.name || 'Active'}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">No active sub</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const pct = s.profile?.profile_completion_percentage ?? s.profile_completion_percentage ?? 0; return (
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-slate-200 dark:bg-slate-700">
                                <div className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  ref={(el) => { if (el) el.style.width = `${Math.min(pct, 100)}%`; }} />
                              </div>
                              <span className="text-xs text-slate-400">{pct}%</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setQuickView(s)}
                            title="Quick view"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300"
                          >
                            <Eye size={13} />
                            View
                          </button>
                          {s.status === 'active' ? (
                            <button
                              onClick={() => suspendMut.mutate(s._id)}
                              title="Suspend"
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10"
                            >
                              <UserX size={13} />
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={() => activateMut.mutate(s._id)}
                              title="Activate"
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                            >
                              <UserCheck size={13} />
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-400">No students found</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="text-xs text-slate-500">
                Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" title="Previous page">
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 text-xs text-slate-600 dark:text-slate-400">{page} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" title="Next page">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, accent = 'slate' }: { icon: typeof Users; label: string; value: number; accent?: string }) {
  const colorMap: Record<string, { text: string; bg: string; icon: string; border: string }> = {
    green: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', icon: 'text-emerald-500', border: 'border-emerald-200/60 dark:border-emerald-500/20' },
    indigo: { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10', icon: 'text-indigo-500', border: 'border-indigo-200/60 dark:border-indigo-500/20' },
    orange: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', icon: 'text-amber-500', border: 'border-amber-200/60 dark:border-amber-500/20' },
    red: { text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-500/10', icon: 'text-rose-500', border: 'border-rose-200/60 dark:border-rose-500/20' },
    slate: { text: 'text-slate-900 dark:text-white', bg: 'bg-slate-50 dark:bg-slate-800/50', icon: 'text-slate-500', border: 'border-slate-200/60 dark:border-slate-700/60' },
  };
  const c = colorMap[accent] || colorMap.slate;
  return (
    <div className={`rounded-2xl border ${c.border} bg-white p-4 dark:bg-slate-900/80 transition-shadow hover:shadow-card`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
          <p className={`mt-1.5 text-3xl font-bold tabular-nums ${c.text}`}>{value?.toLocaleString() ?? 0}</p>
        </div>
        <div className={`rounded-xl ${c.bg} p-2.5`}>
          <Icon size={20} className={c.icon} />
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="text-sm text-slate-800 dark:text-slate-200">{value}</div>
    </div>
  );
}

function StudentQuickViewDrawer({ student, onClose, onNavigate, onSuspend, onActivate }: {
  student: Student;
  onClose: () => void;
  onNavigate: (id: string) => void;
  onSuspend: (id: string) => void;
  onActivate: (id: string) => void;
}) {
  const { data: unified, isLoading } = useQuery<AdminStudentUnifiedPayload>({
    queryKey: ['student-unified', student._id],
    queryFn: () => getStudentUnified(student._id),
    staleTime: 30_000,
  });

  const s = unified;
  const pct = s?.profile?.profile_completion_percentage ?? student.profile_completion_percentage ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white shadow-2xl dark:bg-slate-900 overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/60 bg-white/90 px-5 py-4 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Student Details</h3>
          <button onClick={onClose} className="rounded-lg border border-slate-200/60 p-1.5 text-slate-400 hover:text-slate-600 dark:border-slate-700/60" aria-label="Close"><X size={16} /></button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20"><RefreshCcw size={20} className="animate-spin text-slate-400" /></div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Profile Header */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 ring-2 ring-indigo-200 dark:ring-indigo-800 overflow-hidden">
                {(s?.profile_photo || student.avatarUrl || student.profile?.profile_photo_url) ? (
                  <img src={s?.profile_photo || student.avatarUrl || student.profile?.profile_photo_url} alt="" className="h-14 w-14 object-cover" />
                ) : (student.full_name?.charAt(0).toUpperCase() || '?')}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{s?.full_name || student.full_name}</p>
                <p className="text-sm text-slate-500 truncate">{s?.email || student.email}</p>
                {(s?.phone_number || student.phone_number) && <p className="text-xs text-slate-400">{s?.phone_number || student.phone_number}</p>}
                {s?.username && <p className="text-[11px] text-slate-400">@{s.username}</p>}
              </div>
            </div>

            {/* Status Row */}
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="Status" value={<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s?.status || student.status] || ''}`}>{s?.status || student.status}</span>} />
              <DetailField label="Role" value={s?.role || student.role} />
              <DetailField label="Joined" value={new Date(s?.createdAt || student.createdAt).toLocaleDateString()} />
              <DetailField label="Last Login" value={s?.lastLoginAtUTC ? new Date(s.lastLoginAtUTC).toLocaleDateString() : student.lastLogin ? new Date(student.lastLogin).toLocaleDateString() : 'Never'} />
            </div>

            {/* Profile Info */}
            {s?.profile && (
              <DrawerSection title="Profile">
                <div className="grid grid-cols-2 gap-2">
                  {s.profile.user_unique_id && <DetailField label="Student ID" value={s.profile.user_unique_id} />}
                  {s.profile.department && <DetailField label="Department" value={s.profile.department} />}
                  {s.profile.gender && <DetailField label="Gender" value={s.profile.gender} />}
                  {s.profile.dob && <DetailField label="Date of Birth" value={new Date(s.profile.dob).toLocaleDateString()} />}
                  {s.profile.ssc_batch && <DetailField label="SSC Batch" value={s.profile.ssc_batch} />}
                  {s.profile.hsc_batch && <DetailField label="HSC Batch" value={s.profile.hsc_batch} />}
                  {s.profile.college_name && <DetailField label="College" value={s.profile.college_name} />}
                  {s.profile.district && <DetailField label="District" value={s.profile.district} />}
                  {s.profile.institution_name && <DetailField label="Institution" value={s.profile.institution_name} />}
                  {s.profile.roll_number && <DetailField label="Roll" value={s.profile.roll_number} />}
                  {s.profile.points != null && <DetailField label="Points" value={String(s.profile.points)} />}
                  {s.profile.rank != null && <DetailField label="Rank" value={`#${s.profile.rank}`} />}
                </div>
                {/* Profile Completion */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Completion</span>
                    <span className={`text-xs font-bold ${pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              </DrawerSection>
            )}

            {/* Guardian */}
            {s?.guardian && (s.guardian.guardian_name || s.guardian.guardian_phone) && (
              <DrawerSection title="Guardian">
                <div className="grid grid-cols-2 gap-2">
                  {s.guardian.guardian_name && <DetailField label="Name" value={s.guardian.guardian_name} />}
                  {s.guardian.guardian_phone && <DetailField label="Phone" value={s.guardian.guardian_phone} />}
                  {s.guardian.guardian_email && <DetailField label="Email" value={s.guardian.guardian_email} />}
                  <DetailField label="Verified" value={<span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${s.guardian.verificationStatus === 'verified' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{s.guardian.verificationStatus}</span>} />
                </div>
              </DrawerSection>
            )}

            {/* Subscription */}
            <DrawerSection title="Subscription">
              {s?.subscription?.state === 'active' ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{s.subscription.planName || 'Active'}</p>
                  {s.subscription.daysRemaining != null && <p className="text-xs text-slate-400">{s.subscription.daysRemaining} days remaining</p>}
                  {s.subscription.expiryDate && <p className="text-xs text-slate-400">Expires: {new Date(s.subscription.expiryDate).toLocaleDateString()}</p>}
                  <p className="text-xs text-slate-400">Auto-renew: {s.subscription.autoRenew ? 'Yes' : 'No'}</p>
                </div>
              ) : (
                <p className="text-sm text-slate-400">No active subscription</p>
              )}
            </DrawerSection>

            {/* Groups */}
            {(s?.groups?.length || student.groups?.length) ? (
              <DrawerSection title="Groups">
                <div className="flex flex-wrap gap-1.5">
                  {(s?.groups || student.groups || []).map((g: any) => (
                    <span key={g._id} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">{g.name}</span>
                  ))}
                </div>
              </DrawerSection>
            ) : null}

            {/* Exams */}
            {s?.exams && (
              <DrawerSection title="Exams">
                <div className="grid grid-cols-2 gap-2">
                  <DetailField label="Attempted" value={String(s.exams.totalAttempted)} />
                  <DetailField label="Upcoming" value={String(s.exams.upcomingCount)} />
                </div>
                {s.exams.recentResults?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent Results</p>
                    {s.exams.recentResults.slice(0, 3).map(r => (
                      <div key={r._id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50">
                        <span className="truncate text-slate-700 dark:text-slate-300">{r.examTitle || 'Exam'}</span>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">{r.percentage}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </DrawerSection>
            )}

            {/* Payments */}
            {s?.payments && (
              <DrawerSection title="Payments">
                <div className="grid grid-cols-2 gap-2">
                  <DetailField label="Total Paid" value={`৳${s.payments.totalPaid.toLocaleString()}`} />
                  <DetailField label="Pending" value={String(s.payments.pendingCount)} />
                </div>
              </DrawerSection>
            )}

            {/* Weak Topics */}
            {s?.weakTopics?.items?.length ? (
              <DrawerSection title={`Weak Topics (${s.weakTopics.count})`}>
                <div className="space-y-1">
                  {s.weakTopics.items.slice(0, 5).map(t => (
                    <div key={t.topic} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/50">
                      <span className="text-slate-700 dark:text-slate-300">{t.topic}</span>
                      <span className={`font-medium ${t.severity === 'critical' ? 'text-rose-600' : t.severity === 'high' ? 'text-amber-600' : 'text-slate-500'}`}>{t.accuracy}%</span>
                    </div>
                  ))}
                </div>
              </DrawerSection>
            ) : null}

            {/* Security */}
            {s?.security && (
              <DrawerSection title="Security">
                <div className="grid grid-cols-2 gap-2">
                  <DetailField label="2FA" value={s.security.twoFactorEnabled ? 'Enabled' : 'Disabled'} />
                  <DetailField label="Must Change Password" value={s.security.mustChangePassword ? 'Yes' : 'No'} />
                  {s.security.ip_address && <DetailField label="Last IP" value={s.security.ip_address} />}
                  {s.security.device_info && <DetailField label="Device" value={s.security.device_info} />}
                </div>
              </DrawerSection>
            )}

            {/* Support */}
            {s?.support && s.support.totalTickets > 0 && (
              <DrawerSection title="Support">
                <div className="grid grid-cols-2 gap-2">
                  <DetailField label="Open Tickets" value={String(s.support.openTickets)} />
                  <DetailField label="Total Tickets" value={String(s.support.totalTickets)} />
                </div>
              </DrawerSection>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
              <button onClick={() => onNavigate(student._id)} className="btn-primary flex-1 text-sm">Full Profile</button>
              {(s?.status || student.status) === 'active' ? (
                <button onClick={() => onSuspend(student._id)} className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-300">Suspend</button>
              ) : (
                <button onClick={() => onActivate(student._id)} className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 dark:border-emerald-500/20 dark:text-emerald-300">Activate</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200/60 p-3 dark:border-slate-700/60 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>
      {children}
    </div>
  );
}
