import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import {
  getStudentById, updateStudent, suspendStudent, activateStudent, resetStudentPassword,
  assignSubscription, extendSubscription, expireSubscriptionNow, toggleAutoRenew,
  getNotificationLogs, sendNotification, getTemplates,
  getContactTimeline, addTimelineEntry, deleteTimelineEntry,
} from '../../../api/adminStudentApi';
import { useEscapeKey } from '../../../hooks/useEscapeKey';
import {
  getStudentSecurity, adminSetPassword, resendAccountInfo,
  toggleForceReset, revokeStudentSessions,
  type StudentSecurityMeta,
} from '../../../api/adminStudentSecurityApi';
import ModernToggle from '../../../components/ui/ModernToggle';
import { showConfirmDialog } from '../../../lib/appDialog';

type Toast = { show: boolean; message: string; type: 'success' | 'error' };
type Tab = 'profile' | 'subscription' | 'notifications' | 'timeline' | 'security';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile', label: 'Profile' },
  { key: 'subscription', label: 'Subscription' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'timeline', label: 'Contact Timeline' },
  { key: 'security', label: 'Security' },
];


const DEPARTMENTS = ['Science', 'Commerce', 'Arts', 'Engineering', 'Medical', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];

const SUB_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  expiring: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  none: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const SCORE_CLS = (s: number) => s >= 70 ? 'bg-green-500' : s >= 40 ? 'bg-yellow-500' : 'bg-red-500';

const TIMELINE_ICONS: Record<string, string> = { note: '\uD83D\uDCDD', call: '\uD83D\uDCDE', message: '\uD83D\uDCAC' };

function inp(extra = '') {
  return `w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${extra}`;
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });

  // Profile form
  const [profileForm, setProfileForm] = useState<Record<string, string>>({});
  const [profileDirty, setProfileDirty] = useState(false);

  // Subscription modals
  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ planId: '', startDate: '', notes: '' });
  const [extendModal, setExtendModal] = useState(false);
  const [extendForm, setExtendForm] = useState({ days: '30', notes: '' });

  // Timeline modal
  const [addNoteModal, setAddNoteModal] = useState(false);
  const [noteForm, setNoteForm] = useState({ type: 'note', content: '' });

  // Notification modal
  const [sendNotiModal, setSendNotiModal] = useState(false);
  const [notiForm, setNotiForm] = useState({ templateId: '', channel: 'sms' });

  // Security modal
  const [resetPwModal, setResetPwModal] = useState(false);
  const [newPw, setNewPw] = useState('');

  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, show: false })), 3000);
  };

  const { data: student, isLoading, isError } = useQuery({
    queryKey: ['admin-student', id],
    queryFn: () => getStudentById(id!),
    enabled: !!id,
    onSuccess: (d: Record<string, unknown>) => {
      setProfileForm({
        fullName: (d.fullName as string) ?? '',
        email: (d.email as string) ?? '',
        phone: (d.phone as string) ?? '',
        guardianPhone: (d.guardianPhone as string) ?? '',
        department: (d.department as string) ?? '',
        sscBatch: (d.sscBatch as string) ?? '',
        hscBatch: (d.hscBatch as string) ?? '',
        collegeName: (d.collegeName as string) ?? '',
        collegeAddress: (d.collegeAddress as string) ?? '',
        presentAddress: (d.presentAddress as string) ?? '',
        district: (d.district as string) ?? '',
        gender: (d.gender as string) ?? '',
        dob: (d.dob as string) ?? '',
      });
      setProfileDirty(false);
    },
  } as Parameters<typeof useQuery>[0]);

  const { data: timeline } = useQuery({
    queryKey: ['admin-timeline', id],
    queryFn: () => getContactTimeline(id!),
    enabled: !!id && activeTab === 'timeline',
  });

  const { data: notiLogs } = useQuery({
    queryKey: ['admin-noti-logs', id],
    queryFn: () => getNotificationLogs({ studentId: id }),
    enabled: !!id && activeTab === 'notifications',
  });

  const { data: templates } = useQuery({
    queryKey: ['admin-templates'],
    queryFn: getTemplates,
    enabled: sendNotiModal,
  });

  const handleProfileSave = async () => {
    try {
      await updateStudent(id!, profileForm as Record<string, unknown>);
      qc.invalidateQueries({ queryKey: ['admin-student', id] });
      showToast('Profile saved');
      setProfileDirty(false);
    } catch { showToast('Save failed', 'error'); }
  };

  const handleAssign = async () => {
    try {
      await assignSubscription(id!, assignForm);
      qc.invalidateQueries({ queryKey: ['admin-student', id] });
      setAssignModal(false); showToast('Subscription assigned');
    } catch { showToast('Failed', 'error'); }
  };

  const handleExtend = async () => {
    try {
      await extendSubscription(id!, parseInt(extendForm.days), extendForm.notes);
      qc.invalidateQueries({ queryKey: ['admin-student', id] });
      setExtendModal(false); showToast('Subscription extended');
    } catch { showToast('Failed', 'error'); }
  };

  const handleExpireNow = async () => {
    const confirmed = await showConfirmDialog({
      title: 'Expire subscription',
      message: 'Expire subscription now?',
      confirmLabel: 'Expire now',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await expireSubscriptionNow(id!);
      qc.invalidateQueries({ queryKey: ['admin-student', id] });
      showToast('Subscription expired');
    } catch { showToast('Failed', 'error'); }
  };

  const handleToggleAutoRenew = async () => {
    try {
      await toggleAutoRenew(id!);
      qc.invalidateQueries({ queryKey: ['admin-student', id] });
      showToast('Auto-renew toggled');
    } catch { showToast('Failed', 'error'); }
  };

  const handleAddNote = async () => {
    if (!noteForm.content.trim()) return;
    try {
      await addTimelineEntry(id!, noteForm);
      qc.invalidateQueries({ queryKey: ['admin-timeline', id] });
      setAddNoteModal(false); setNoteForm({ type: 'note', content: '' });
      showToast('Entry added');
    } catch { showToast('Failed', 'error'); }
  };

  const handleDeleteEntry = async (entryId: string) => {
    const confirmed = await showConfirmDialog({
      title: 'Delete timeline entry',
      message: 'Delete this entry?',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteTimelineEntry(id!, entryId);
      qc.invalidateQueries({ queryKey: ['admin-timeline', id] });
      showToast('Entry deleted');
    } catch { showToast('Failed', 'error'); }
  };

  const handleSendNoti = async () => {
    try {
      await sendNotification({ studentIds: [id], ...notiForm });
      setSendNotiModal(false); showToast('Notification sent');
    } catch { showToast('Failed', 'error'); }
  };

  const handleResetPw = async () => {
    if (!newPw.trim()) return;
    try {
      await resetStudentPassword(id!, { newPassword: newPw });
      setResetPwModal(false); setNewPw('');
      showToast('Password reset');
    } catch { showToast('Failed', 'error'); }
  };

  const handleSuspendToggle = async () => {
    const isSusp = (student as Record<string, unknown>)?.status === 'suspended';
    try {
      await (isSusp ? activateStudent(id!) : suspendStudent(id!));
      qc.invalidateQueries({ queryKey: ['admin-student', id] });
      showToast(isSusp ? 'Student activated' : 'Student suspended');
    } catch { showToast('Failed', 'error'); }
  };

  const setField = (k: string, v: string) => { setProfileForm(f => ({ ...f, [k]: v })); setProfileDirty(true); };

  if (isLoading) return (
    <AdminGuardShell title="Student Detail">
      <div className="p-6 space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />)}</div>
    </AdminGuardShell>
  );

  if (isError || !student) return (
    <AdminGuardShell title="Student Detail">
      <div className="m-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">Student not found.</div>
    </AdminGuardShell>
  );

  const s = student as Record<string, unknown>;
  const sub = s.subscription as Record<string, unknown> | undefined;
  const subStatus = (sub?.status as string) || 'none';
  const score = (s.profileScore as number) ?? 0;
  const isSusp = s.status === 'suspended';
  const missingFields = ['phone', 'email', 'department', 'sscBatch', 'hscBatch', 'gender', 'dob'].filter(f => !s[f]);

  const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';
  const fieldRow = (label: string, key: string, type = 'text') => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <input aria-label={label} title={label} type={type} value={profileForm[key] ?? ''} onChange={e => setField(key, e.target.value)} className={inp()} />
    </div>
  );
  const selectRow = (label: string, key: string, opts: string[]) => (
    <div key={key}>
      <label className={labelCls}>{label}</label>
      <select aria-label={label} title={label} value={profileForm[key] ?? ''} onChange={e => setField(key, e.target.value)} className={inp()}>
        <option value="">Select...</option>
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <AdminGuardShell title="Student Detail">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white shadow-lg text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>{toast.message}</div>
      )}

      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-gray-200 dark:border-gray-700">
        <button onClick={() => navigate('/__cw_admin__/students-v2')} className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 mb-3">
          <span>&larr;</span> Back to Students
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{(s.fullName || s.name) as string}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <code className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded">{s.userId as string}</code>
              <span className={`px-2 py-0.5 text-xs rounded-full ${isSusp ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>{s.status as string}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">Score: <strong className={score >= 70 ? 'text-green-600' : score >= 40 ? 'text-yellow-600' : 'text-red-600'}>{score}</strong></span>
            </div>
          </div>
          <div className="sm:ml-auto flex items-center gap-2">
            <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${SCORE_CLS(score)}`} ref={(el) => { if (el) el.style.width = `${Math.min(score, 100)}%`; }} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-px">
          {TABS.map(t => (
            <div key={t.key} className="flex items-center gap-1">
              <button onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {t.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">

        {/* PROFILE TAB */}
        {activeTab === 'profile' && (
          <div className="space-y-6 max-w-3xl">
            {missingFields.length > 0 && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                Missing fields: {missingFields.join(', ')}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {fieldRow('Full Name', 'fullName')}
              {fieldRow('Email', 'email', 'email')}
              {fieldRow('Phone', 'phone', 'tel')}
              {fieldRow('Guardian Phone', 'guardianPhone', 'tel')}
              {selectRow('Department', 'department', DEPARTMENTS)}
              {fieldRow('SSC Batch', 'sscBatch')}
              {fieldRow('HSC Batch', 'hscBatch')}
              {fieldRow('College Name', 'collegeName')}
              {fieldRow('College Address', 'collegeAddress')}
              {fieldRow('Present Address', 'presentAddress')}
              {fieldRow('District', 'district')}
              {selectRow('Gender', 'gender', GENDERS)}
              {fieldRow('Date of Birth', 'dob', 'date')}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${SCORE_CLS(score)}`} ref={(el) => { if (el) el.style.width = `${Math.min(score, 100)}%`; }} />
              </div>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{score}% complete</span>
              <button onClick={handleProfileSave} disabled={!profileDirty} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">Save Profile</button>
            </div>
          </div>
        )}

        {/* SUBSCRIPTION TAB */}
        {activeTab === 'subscription' && (
          <div className="space-y-6 max-w-2xl">
            <div className="p-5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{(sub?.planName as string) || 'No Plan'}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Expires: {sub?.expiresAt ? new Date(sub.expiresAt as string).toLocaleDateString() : 'N/A'}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${SUB_BADGE[subStatus] ?? SUB_BADGE.none}`}>{subStatus}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Auto-renew: {sub?.autoRenew ? 'Enabled' : 'Disabled'}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setAssignModal(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Assign Plan</button>
              <button onClick={() => setExtendModal(true)} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Extend</button>
              <button onClick={handleExpireNow} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Expire Now</button>
              <button onClick={handleToggleAutoRenew} className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Toggle Auto-Renew</button>
            </div>
            {sub && Array.isArray(sub.history) && (sub.history as unknown[]).length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">History</h4>
                <div className="space-y-2">
                  {(sub.history as Record<string, unknown>[]).map((h, i) => (
                    <div key={i} className="text-xs flex gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <span className="text-gray-400">{h.date ? new Date(h.date as string).toLocaleDateString() : ''}</span>
                      <span className="text-gray-700 dark:text-gray-300">{h.action as string}</span>
                      {(h.note as string | undefined) && <span className="text-gray-500 italic">{h.note as string}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="space-y-4 max-w-3xl">
            <div className="flex justify-end">
              <button onClick={() => setSendNotiModal(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Send Notification</button>
            </div>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    {['Date', 'Channel', 'Template', 'Status', 'Message ID'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {((notiLogs as { logs?: Record<string, unknown>[] })?.logs || []).map((log: Record<string, unknown>, i: number) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-xs text-gray-500">{log.createdAt ? new Date(log.createdAt as string).toLocaleString() : ''}</td>
                      <td className="px-4 py-3 text-xs">{log.channel as string}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{log.templateKey as string}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${log.status === 'sent' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{log.status as string}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-400">{log.messageId as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!(notiLogs as { logs?: unknown[] })?.logs?.length) && <div className="p-8 text-center text-sm text-gray-400">No notification logs.</div>}
            </div>
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex justify-end">
              <button onClick={() => setAddNoteModal(true)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add Note</button>
            </div>
            <div className="space-y-3">
              {((timeline as { entries?: Record<string, unknown>[] })?.entries || []).map((entry: Record<string, unknown>) => (
                <div key={entry._id as string} className="flex gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <span className="text-xl mt-0.5">{TIMELINE_ICONS[entry.type as string] ?? '\uD83D\uDCDD'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs text-gray-400 dark:text-gray-500">{entry.createdAt ? new Date(entry.createdAt as string).toLocaleString() : ''} &middot; {entry.type as string}</span>
                      <button onClick={() => handleDeleteEntry(entry._id as string)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{entry.content as string}</p>
                  </div>
                </div>
              ))}
              {(!(timeline as { entries?: unknown[] })?.entries?.length) && <div className="p-8 text-center text-sm text-gray-400">No contact history.</div>}
            </div>
          </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === 'security' && <SecurityTabContent studentId={id!} student={s} isSusp={isSusp} showToast={showToast} onResetPw={() => { setResetPwModal(true); setNewPw(''); }} onSuspendToggle={handleSuspendToggle} qc={qc} />}
      </div>

      {/* Assign Plan Modal */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Assign Subscription">
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">Plan ID</label><input aria-label="Plan ID" title="Plan ID" value={assignForm.planId} onChange={e => setAssignForm(f => ({ ...f, planId: e.target.value }))} className={inp()} placeholder="plan_id" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Start Date</label><input aria-label="Start Date" title="Start Date" type="date" value={assignForm.startDate} onChange={e => setAssignForm(f => ({ ...f, startDate: e.target.value }))} className={inp()} /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Notes</label><input aria-label="Notes" title="Notes" value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} className={inp()} placeholder="Optional notes" /></div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setAssignModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
            <button onClick={handleAssign} disabled={!assignForm.planId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40">Assign</button>
          </div>
        </div>
      </Modal>

      {/* Extend Modal */}
      <Modal open={extendModal} onClose={() => setExtendModal(false)} title="Extend Subscription">
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">Days to extend</label><input aria-label="Days to extend" title="Days to extend" type="number" value={extendForm.days} onChange={e => setExtendForm(f => ({ ...f, days: e.target.value }))} className={inp()} min="1" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Notes</label><input aria-label="Notes" title="Notes" value={extendForm.notes} onChange={e => setExtendForm(f => ({ ...f, notes: e.target.value }))} className={inp()} placeholder="Optional notes" /></div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setExtendModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
            <button onClick={handleExtend} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg">Extend {extendForm.days}d</button>
          </div>
        </div>
      </Modal>

      {/* Add Note Modal */}
      <Modal open={addNoteModal} onClose={() => setAddNoteModal(false)} title="Add Timeline Entry">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select aria-label="Entry type" title="Entry type" value={noteForm.type} onChange={e => setNoteForm(f => ({ ...f, type: e.target.value }))} className={inp()}>
              <option value="note">Note</option>
              <option value="call">Call</option>
              <option value="message">Message</option>
            </select>
          </div>
          <div><label className="block text-xs text-gray-500 mb-1">Content</label><textarea aria-label="Entry content" title="Entry content" value={noteForm.content} onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))} className={inp() + ' h-24 resize-none'} placeholder="Write here..." /></div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setAddNoteModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
            <button onClick={handleAddNote} disabled={!noteForm.content.trim()} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40">Add</button>
          </div>
        </div>
      </Modal>

      {/* Send Notification Modal */}
      <Modal open={sendNotiModal} onClose={() => setSendNotiModal(false)} title="Send Notification">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Channel</label>
            <select aria-label="Notification channel" title="Notification channel" value={notiForm.channel} onChange={e => setNotiForm(f => ({ ...f, channel: e.target.value }))} className={inp()}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="both">Both</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Template</label>
            <select aria-label="Notification template" title="Notification template" value={notiForm.templateId} onChange={e => setNotiForm(f => ({ ...f, templateId: e.target.value }))} className={inp()}>
              <option value="">Select template...</option>
              {((templates as { templates?: Record<string, unknown>[] })?.templates || []).map((t: Record<string, unknown>) => (
                <option key={t._id as string} value={t._id as string}>{t.key as string} — {t.channel as string}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setSendNotiModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
            <button onClick={handleSendNoti} disabled={!notiForm.templateId} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40">Send</button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={resetPwModal} onClose={() => setResetPwModal(false)} title="Force Reset Password">
        <div className="space-y-3">
          <div><label className="block text-xs text-gray-500 mb-1">New Password</label><input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inp()} placeholder="Enter new password" /></div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setResetPwModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
            <button onClick={handleResetPw} disabled={!newPw.trim()} className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg disabled:opacity-40">Reset</button>
          </div>
        </div>
      </Modal>
    </AdminGuardShell>
  );
}

/* ─── Enhanced Security Tab ───────────────────────── */
function SecurityTabContent({
  studentId, student, isSusp, showToast, onResetPw, onSuspendToggle, qc,
}: {
  studentId: string;
  student: Record<string, unknown>;
  isSusp: boolean;
  showToast: (m: string, t?: 'success' | 'error') => void;
  onResetPw: () => void;
  onSuspendToggle: () => void;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [setPasswordForm, setSetPasswordForm] = useState({ password: '', sendSms: true, sendEmail: false });
  const [showSetPwModal, setShowSetPwModal] = useState(false);

  // Close modal on Escape key
  const closeSetPwModal = useCallback(() => setShowSetPwModal(false), []);
  useEscapeKey(closeSetPwModal, showSetPwModal);

  const { data: securityData } = useQuery({
    queryKey: ['student-security', studentId],
    queryFn: () => getStudentSecurity(studentId),
    enabled: !!studentId,
  });
  const sec = (securityData?.data ?? securityData ?? {}) as Partial<StudentSecurityMeta>;

  const handleAdminSetPassword = async () => {
    try {
      await adminSetPassword(studentId, { newPassword: setPasswordForm.password, sendVia: [setPasswordForm.sendSms && 'sms', setPasswordForm.sendEmail && 'email'].filter(Boolean) as string[] });
      showToast('Password reset link sent');
      setShowSetPwModal(false);
      setSetPasswordForm({ password: '', sendSms: true, sendEmail: false });
      qc.invalidateQueries({ queryKey: ['student-security', studentId] });
    } catch {
      showToast('Failed to issue reset link', 'error');
    }
  };

  const handleResendInfo = async () => {
    try {
      await resendAccountInfo(studentId, { channels: ['email'] });
      showToast('Password setup link sent');
      qc.invalidateQueries({ queryKey: ['student-security', studentId] });
    } catch {
      showToast('Failed to resend', 'error');
    }
  };

  const handleToggleForceReset = async () => {
    try {
      await toggleForceReset(studentId, { enabled: !sec.forcePasswordResetRequired });
      showToast(sec.forcePasswordResetRequired ? 'Force reset disabled' : 'Force reset enabled');
      qc.invalidateQueries({ queryKey: ['student-security', studentId] });
      qc.invalidateQueries({ queryKey: ['admin-student', studentId] });
    } catch {
      showToast('Failed to toggle', 'error');
    }
  };

  const handleRevokeSessions = async () => {
    try {
      await revokeStudentSessions(studentId);
      showToast('All sessions revoked');
      qc.invalidateQueries({ queryKey: ['student-security', studentId] });
    } catch {
      showToast('Failed to revoke sessions', 'error');
    }
  };

  const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleString() : 'Never';

  return (
    <div className="space-y-6 max-w-xl">
      {/* Account Status & Flags */}
      <div className="p-5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Account Status</h3>
        {([
          ['Status', String(student.status ?? '')],
          ['Password Reset Required', sec.forcePasswordResetRequired ? 'Yes' : 'No'],
          ['Password Last Changed', fmtDate(sec.passwordLastChangedAtUTC as string | undefined)],
          ['Changed By', sec.passwordChangedByType ?? 'N/A'],
          ['Password Set By Admin', sec.passwordSetByAdmin ? 'Yes' : 'No'],
        ] as [string, string][]).map(([label, val]) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{val}</span>
          </div>
        ))}
      </div>

      {/* Credential Delivery Info */}
      <div className="p-5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Credential Delivery</h3>
        {([
          ['Account Info Last Sent', fmtDate(sec.accountInfoLastSentAtUTC as string | undefined)],
          ['Channels Used', sec.accountInfoLastSentChannels?.join(', ') || 'None'],
          ['Credentials Last Resent', fmtDate(sec.credentialsLastResentAtUTC as string | undefined)],
        ] as [string, string][]).map(([label, val]) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-gray-600 dark:text-gray-400">{label}</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">{val}</span>
          </div>
        ))}
      </div>

      {/* Security Actions */}
      <div className="p-5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Actions</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={() => setShowSetPwModal(true)} className="px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
            Set Password
          </button>
          <button onClick={onResetPw} className="px-4 py-2.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium">
            Force Reset Password
          </button>
          <button onClick={handleResendInfo} className="px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            Resend Credentials
          </button>
          <button onClick={handleToggleForceReset} className={`px-4 py-2.5 text-sm rounded-lg font-medium text-white ${sec.forcePasswordResetRequired ? 'bg-gray-600 hover:bg-gray-700' : 'bg-amber-600 hover:bg-amber-700'}`}>
            {sec.forcePasswordResetRequired ? 'Disable Force Reset' : 'Enable Force Reset'}
          </button>
          <button onClick={handleRevokeSessions} className="px-4 py-2.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
            Revoke All Sessions
          </button>
          <button onClick={onSuspendToggle} className={`px-4 py-2.5 text-sm rounded-lg font-medium text-white ${isSusp ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {isSusp ? 'Activate Account' : 'Suspend Account'}
          </button>
        </div>
      </div>

      {/* Set Password Modal */}
      {showSetPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Admin Set Password</h3>
              <button onClick={() => setShowSetPwModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">New Password</label>
                <input type="password" value={setPasswordForm.password} onChange={e => setSetPasswordForm(p => ({ ...p, password: e.target.value }))} className={inp()} placeholder="Enter password" />
              </div>
              <div className="flex flex-col gap-3">
                <ModernToggle
                  label="Send password via SMS"
                  checked={setPasswordForm.sendSms}
                  onChange={v => setSetPasswordForm(p => ({ ...p, sendSms: v }))}
                  size="sm"
                />
                <ModernToggle
                  label="Send password via Email"
                  checked={setPasswordForm.sendEmail}
                  onChange={v => setSetPasswordForm(p => ({ ...p, sendEmail: v }))}
                  size="sm"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowSetPwModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
                <button onClick={handleAdminSetPassword} disabled={!setPasswordForm.password.trim()} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg disabled:opacity-40">Set Password</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
