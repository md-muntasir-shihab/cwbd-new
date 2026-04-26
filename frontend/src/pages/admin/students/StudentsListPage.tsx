import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import {
  getStudentsList, suspendStudent, activateStudent, resetStudentPassword,
  exportStudents, importStudentsPreview, importStudentsCommit, bulkDeleteStudents, bulkUpdateStudents,
} from '../../../api/adminStudentApi';
import { showConfirmDialog } from '../../../lib/appDialog';
import { downloadFile } from '../../../utils/download';
import { useEscapeKey } from '../../../hooks/useEscapeKey';

type Toast = { show: boolean; message: string; type: 'success' | 'error' };

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Expiring \u22647d', value: 'expiring' },
  { label: 'Expired', value: 'expired' },
  { label: 'Score<70', value: 'score_low' },
];

const SCORE_CLS = (s: number) => s >= 70 ? 'bg-green-500' : s >= 40 ? 'bg-yellow-500' : 'bg-red-500';

const SUB_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  expiring: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  none: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const SYSTEM_FIELDS = ['fullName', 'phone', 'email', 'department', 'sscBatch', 'hscBatch', 'gender', 'dob', 'district'];
const BULK_FIELDS = [
  { label: 'Status', value: 'status' },
  { label: 'Department', value: 'department' },
  { label: 'SSC Batch', value: 'ssc_batch' },
  { label: 'HSC Batch', value: 'hsc_batch' },
] as const;

export default function StudentsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dSearch, setDSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
  const [resetModal, setResetModal] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [newPass, setNewPass] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [importBusy, setImportBusy] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [bulkField, setBulkField] = useState<(typeof BULK_FIELDS)[number]['value']>('status');
  const [bulkValue, setBulkValue] = useState('active');

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filterParams =
    filterStatus === 'expiring' ? { expiringDays: 7 } :
      filterStatus === 'score_low' ? { profileScoreMin: 0 } :
        { status: filterStatus || undefined };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-students', dSearch, filterStatus, page],
    queryFn: () => getStudentsList({ q: dSearch || undefined, ...filterParams, page, limit: 20 }),
  });

  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, show: false })), 3000);
  };

  // Close modals on Escape key
  const closeResetModal = useCallback(() => setResetModal({ open: false, id: '' }), []);
  const closeImportModal = useCallback(() => setImportOpen(false), []);
  useEscapeKey(closeResetModal, resetModal.open);
  useEscapeKey(closeImportModal, importOpen && !resetModal.open);

  const handleExport = async () => {
    try {
      const blob = await exportStudents({ q: dSearch, ...filterParams }, exportFormat);
      downloadFile(blob, { filename: `students.${exportFormat}` });
    } catch { showToast('Export failed', 'error'); }
  };

  const handleSuspendToggle = async (id: string, isSuspended: boolean) => {
    try {
      await (isSuspended ? activateStudent(id) : suspendStudent(id));
      qc.invalidateQueries({ queryKey: ['admin-students'] });
      showToast(isSuspended ? 'Student activated' : 'Student suspended');
    } catch { showToast('Action failed', 'error'); }
  };

  const handleResetPw = async () => {
    if (!newPass.trim()) return;
    try {
      await resetStudentPassword(resetModal.id, { newPassword: newPass });
      setResetModal({ open: false, id: '' }); setNewPass('');
      showToast('Password reset successfully');
    } catch { showToast('Reset failed', 'error'); }
  };

  const handleImportPreview = async () => {
    if (!importFile) return;
    setImportBusy(true);
    try {
      const fd = new FormData(); fd.append('file', importFile);
      const res = await importStudentsPreview(fd);
      setImportPreview(res);
      const auto: Record<string, string> = {};
      (res.headers || []).forEach((c: string) => { auto[c] = SYSTEM_FIELDS.includes(c) ? c : ''; });
      setImportMapping(auto);
    } catch { showToast('Preview failed', 'error'); }
    setImportBusy(false);
  };

  const handleImportCommit = async () => {
    if (!importPreview) return;
    setImportBusy(true);
    try {
      await importStudentsCommit({ mode: 'upsert', dedupeField: 'phone', mapping: importMapping, rows: importPreview.rows });
      setImportOpen(false); setImportPreview(null); setImportFile(null);
      qc.invalidateQueries({ queryKey: ['admin-students'] });
      showToast('Import complete');
    } catch { showToast('Import failed', 'error'); }
    setImportBusy(false);
  };

  const toggleSelect = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const students: Record<string, unknown>[] = (data as { students?: Record<string, unknown>[] })?.students ?? [];
  const total: number = (data as { total?: number })?.total ?? 0;
  const totalPages = Math.ceil(total / 20) || 1;
  const allChecked = students.length > 0 && selected.length === students.length;

  const handleBulkUpdate = async (update: Record<string, unknown>, successMessage: string) => {
    try {
      await bulkUpdateStudents(selected, update);
      qc.invalidateQueries({ queryKey: ['admin-students'] }); setSelected([]);
      showToast(successMessage);
    } catch { showToast('Bulk action failed', 'error'); }
  };

  const handleBulkDelete = async () => {
    const confirmed = await showConfirmDialog({
      title: 'Delete students',
      message: `Delete ${selected.length} selected students?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await bulkDeleteStudents(selected);
      qc.invalidateQueries({ queryKey: ['admin-students'] });
      setSelected([]);
      showToast('Selected students deleted');
    } catch { showToast('Bulk delete failed', 'error'); }
  };

  const handleBulkEdit = async () => {
    const nextValue = bulkValue.trim();
    if (!nextValue) {
      showToast('Enter a bulk value', 'error');
      return;
    }
    await handleBulkUpdate({ [bulkField]: nextValue }, 'Bulk update done');
  };

  const inp = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  if (isLoading) return (
    <AdminGuardShell title="Students CRM" description="Manage students, subscriptions, and profile data">
      <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
      ))}</div>
    </AdminGuardShell>
  );

  if (isError) return (
    <AdminGuardShell title="Students CRM" description="Manage students, subscriptions, and profile data">
      <div className="m-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">
        Failed to load students. Please try again.
      </div>
    </AdminGuardShell>
  );

  return (
    <AdminGuardShell title="Students CRM" description="Manage students, subscriptions, and profile data">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white shadow-lg text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Search + actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input className={inp + ' flex-1'} placeholder="Search name, phone, user ID..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="flex gap-2">
            <select value={exportFormat} onChange={e => setExportFormat(e.target.value as 'csv' | 'xlsx')} className={inp}>
              <option value="xlsx">XLSX</option>
              <option value="csv">CSV</option>
            </select>
            <button onClick={handleExport} className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Export {exportFormat.toUpperCase()}</button>
            <button onClick={() => { setImportOpen(true); setImportPreview(null); setImportFile(null); }} className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Import</button>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f.value} onClick={() => { setFilterStatus(f.value); setPage(1); }}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${filterStatus === f.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Bulk action bar */}
        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{selected.length} selected</span>
            <button onClick={() => handleBulkUpdate({ status: 'suspended' }, 'Selected students suspended')} className="px-3 py-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full hover:bg-orange-200">Suspend All</button>
            <button onClick={() => handleBulkUpdate({ status: 'active' }, 'Selected students activated')} className="px-3 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full hover:bg-green-200">Activate All</button>
            <div className="flex flex-wrap items-center gap-2 rounded-full border border-blue-200 bg-white/70 px-2 py-1 dark:border-blue-700 dark:bg-slate-900/50">
              <select value={bulkField} onChange={e => {
                const nextField = e.target.value as (typeof BULK_FIELDS)[number]['value'];
                setBulkField(nextField);
                setBulkValue(nextField === 'status' ? 'active' : '');
              }} className="rounded-full bg-transparent px-2 py-1 text-xs text-blue-700 outline-none dark:text-blue-300">
                {BULK_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
              </select>
              {bulkField === 'status' ? (
                <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="rounded-full bg-transparent px-2 py-1 text-xs text-gray-700 outline-none dark:text-gray-200">
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="blocked">Blocked</option>
                  <option value="pending">Pending</option>
                </select>
              ) : (
                <input value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Value" className="min-w-[110px] rounded-full bg-transparent px-2 py-1 text-xs text-gray-700 outline-none dark:text-gray-200" />
              )}
              <button onClick={() => void handleBulkEdit()} className="rounded-full bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">Bulk Edit</button>
            </div>
            <button onClick={() => void handleBulkDelete()} className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full hover:bg-red-200">Delete All</button>
            <button onClick={() => navigate(ADMIN_PATHS.campaignsNew)} className="px-3 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-full hover:bg-purple-200">New Campaign</button>
            <button onClick={() => setSelected([])} className="ml-auto text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700">Clear</button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 border-t border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/60">
            <tr>
              <th className="px-4 py-3 w-8">
                <input type="checkbox" checked={allChecked} onChange={() => setSelected(allChecked ? [] : students.map((s: Record<string, unknown>) => s._id as string))} className="rounded" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Name / ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden sm:table-cell">Phone</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden md:table-cell">Subscription</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden md:table-cell">Expires</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 hidden lg:table-cell">Score</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {students.map((s: Record<string, unknown>) => {
              const sub = s.subscription as Record<string, unknown> | undefined;
              const subStatus = (sub?.status as string) || 'none';
              const score = (s.profileScore as number) ?? 0;
              const isSusp = s.status === 'suspended';
              return (
                <tr key={s._id as string} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 cursor-pointer" onClick={() => navigate(`/__cw_admin__/students-v2/${s._id}`)}>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.includes(s._id as string)} onChange={() => toggleSelect(s._id as string)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const photoUrl = (s as Record<string, unknown>).avatarUrl as string || (s as Record<string, unknown>).profilePhotoUrl as string || '';
                        if (photoUrl) {
                          return (
                            <img
                              src={photoUrl}
                              alt={(s.fullName || s.name) as string}
                              className="h-8 w-8 rounded-full object-cover ring-2 ring-blue-200 dark:ring-blue-800 shrink-0"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                          );
                        }
                        return (
                          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                            {((s.fullName || s.name) as string)?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        );
                      })()}
                      <div>
                        <div className="font-medium text-gray-900 dark:text-gray-100">{(s.fullName || s.name) as string}</div>
                        <div className="text-xs text-gray-400 font-mono">{(s.userId || (s._id as string)?.slice(-8)) as string}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{s.phone as string}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${SUB_BADGE[subStatus] ?? SUB_BADGE.none}`}>
                      {(sub?.planName as string) || subStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">
                    {sub?.expiresAt ? new Date(sub.expiresAt as string).toLocaleDateString() : '\u2014'}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${SCORE_CLS(score)}`} style={{ width: `${Math.min(score, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-7 text-right">{score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => navigate(`/__cw_admin__/students-v2/${s._id}`)} className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200">View</button>
                      <button onClick={() => handleSuspendToggle(s._id as string, isSusp)} className={`px-2 py-1 text-xs rounded ${isSusp ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200'}`}>
                        {isSusp ? 'Activate' : 'Suspend'}
                      </button>
                      <button onClick={() => { setResetModal({ open: true, id: s._id as string }); setNewPass(''); }} className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200 hidden sm:block">PW</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {students.length === 0 && (
          <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm">No students found.</div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <span className="text-sm text-gray-500 dark:text-gray-400">Page {page} of {totalPages} &middot; {total} total</span>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Prev</button>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300">Next</button>
        </div>
      </div>

      {/* Reset Password Modal */}
      {resetModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Reset Password</h3>
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="New password" className={inp + ' mb-4'} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setResetModal({ open: false, id: '' })} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800">Cancel</button>
              <button onClick={handleResetPw} disabled={!newPass.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Import Students</h3>
              {!importPreview ? (
                <>
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Upload a CSV or XLSX file</p>
                    <input type="file" accept=".csv,.xlsx" onChange={e => setImportFile(e.target.files?.[0] ?? null)} className="text-sm text-gray-600 dark:text-gray-400" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setImportOpen(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
                    <button onClick={handleImportPreview} disabled={!importFile || importBusy} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                      {importBusy ? 'Loading...' : 'Preview'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Map columns &mdash; {importPreview.rows?.length} rows detected</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                    {importPreview.headers.map(col => (
                      <div key={col} className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 truncate w-28 shrink-0">{col}</span>
                        <select value={importMapping[col] ?? ''} onChange={e => setImportMapping(m => ({ ...m, [col]: e.target.value }))}
                          className="flex-1 text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                          <option value="">-- skip --</option>
                          {SYSTEM_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>{importPreview.headers.slice(0, 5).map(h => <th key={h} className="px-2 py-1.5 text-left text-gray-600 dark:text-gray-400 font-medium">{h}</th>)}</tr>
                      </thead>
                      <tbody>{importPreview.rows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                          {importPreview.headers.slice(0, 5).map(h => <td key={h} className="px-2 py-1.5 text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{row[h]}</td>)}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setImportPreview(null); setImportFile(null); }} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Back</button>
                    <button onClick={handleImportCommit} disabled={importBusy} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                      {importBusy ? 'Importing...' : `Import ${importPreview.rows?.length} rows`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminGuardShell>
  );
}
