import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, BookOpen, Shield, CreditCard, BarChart3, MessageSquare,
  AlertTriangle, Headphones, Settings, Heart, FileText, DollarSign,
  ChevronLeft, GraduationCap,
  CheckCircle, XCircle, Clock, Lock, Unlock, Send, RefreshCcw,
  Edit, Save, X, Plus, Trash2, Eye,
} from 'lucide-react';
import {
  getStudentUnified, updateStudent, suspendStudent, activateStudent,
  assignSubscription, extendSubscription,
  expireSubscriptionNow, toggleAutoRenew,
  addTimelineEntry, deleteTimelineEntry,
  createFinanceAdjustment, getStudentPayments, getStudentFinanceStatement,
  getStudentExtendedProfile,
} from '../../../api/adminStudentApi';
import {
  adminSetPassword, resendAccountInfo, toggleForceReset, revokeStudentSessions,
} from '../../../api/adminStudentSecurityApi';
import { adminGetSubscriptionPlans, type AdminSubscriptionPlan } from '../../../services/api';

type Tab = 'overview' | 'profile' | 'guardian' | 'subscription' | 'payments' |
  'finance' | 'exams' | 'results' | 'weak-topics' | 'communication' |
  'crm-timeline' | 'security' | 'support' | 'extended-profile';

const TABS: { key: Tab; label: string; icon: typeof User }[] = [
  { key: 'overview', label: 'Overview', icon: Eye },
  { key: 'profile', label: 'Profile', icon: User },
  { key: 'guardian', label: 'Guardian', icon: Heart },
  { key: 'subscription', label: 'Subscription', icon: CreditCard },
  { key: 'payments', label: 'Payments', icon: DollarSign },
  { key: 'finance', label: 'Finance', icon: BarChart3 },
  { key: 'exams', label: 'Exams', icon: BookOpen },
  { key: 'results', label: 'Results', icon: FileText },
  { key: 'weak-topics', label: 'Weak Topics', icon: AlertTriangle },
  { key: 'extended-profile', label: 'Extended Data', icon: GraduationCap },
  { key: 'communication', label: 'Communication', icon: MessageSquare },
  { key: 'crm-timeline', label: 'CRM', icon: Clock },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'support', label: 'Support', icon: Headphones },
];


const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  blocked: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  none: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

function badge(status: string) {
  return STATUS_BADGE[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
}

const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

function Card({ title, icon: Icon, children, action }: { title: string; icon?: typeof User; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className="text-slate-400" />}
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800 dark:text-white">{value ?? '—'}</span>
    </div>
  );
}

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function StudentManagementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Modals
  const [editProfile, setEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<Record<string, string>>({});
  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ planId: '', startDate: '', notes: '' });
  const [extendModal, setExtendModal] = useState(false);
  const [extendDays, setExtendDays] = useState('30');
  const [setPassModal, setSetPassModal] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [addNoteModal, setAddNoteModal] = useState(false);
  const [noteForm, setNoteForm] = useState({ type: 'note', content: '' });
  const [adjModal, setAdjModal] = useState(false);
  const [adjForm, setAdjForm] = useState({ direction: 'income', amount: '', description: '', method: 'manual' });

  const { data: student, isLoading } = useQuery({
    queryKey: ['student-unified', id],
    queryFn: () => getStudentUnified(id!),
    enabled: !!id,
  });
  const { data: availablePlans } = useQuery({
    queryKey: ['admin-subscription-plans-lite'],
    queryFn: async () => (await adminGetSubscriptionPlans()).data.items ?? [],
  });

  const flash = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };
  const refetch = () => qc.invalidateQueries({ queryKey: ['student-unified', id] });

  // Mutations
  const updateMut = useMutation({ mutationFn: (d: Record<string, unknown>) => updateStudent(id!, d), onSuccess: () => { refetch(); flash('Profile updated'); setEditProfile(false); } });
  const suspendMut = useMutation({ mutationFn: () => suspendStudent(id!), onSuccess: () => { refetch(); flash('Student suspended'); } });
  const activateMut = useMutation({ mutationFn: () => activateStudent(id!), onSuccess: () => { refetch(); flash('Student activated'); } });
  const resetPassMut = useMutation({
    mutationFn: async () => {
      await toggleForceReset(id!, { enabled: true });
      return resendAccountInfo(id!, { channels: ['email'] });
    },
    onSuccess: () => { refetch(); flash('Password reset request sent'); },
    onError: () => flash('Failed to send reset request', false),
  });
  const assignSubMut = useMutation({ mutationFn: () => assignSubscription(id!, assignForm), onSuccess: () => { refetch(); flash('Subscription assigned'); setAssignModal(false); } });
  const extendSubMut = useMutation({ mutationFn: () => extendSubscription(id!, parseInt(extendDays)), onSuccess: () => { refetch(); flash('Subscription extended'); setExtendModal(false); } });
  const expireSubMut = useMutation({ mutationFn: () => expireSubscriptionNow(id!), onSuccess: () => { refetch(); flash('Subscription expired'); } });
  const toggleAutoMut = useMutation({ mutationFn: () => toggleAutoRenew(id!), onSuccess: () => { refetch(); flash('Auto-renew toggled'); } });
  const setPassMut = useMutation({
    mutationFn: () => adminSetPassword(id!, { newPassword: newPass }),
    onSuccess: () => { flash('Password updated'); setSetPassModal(false); setNewPass(''); },
    onError: (err: any) => flash(String(err?.response?.data?.message || 'Failed to set password'), false),
  });
  const resendMut = useMutation({ mutationFn: () => resendAccountInfo(id!, { channels: ['email'] }), onSuccess: () => flash('Password setup link sent') });
  const forceResetMut = useMutation({ mutationFn: () => toggleForceReset(id!, { enabled: !student?.security?.forcePasswordResetRequired }), onSuccess: () => { refetch(); flash('Force reset toggled'); } });
  const revokeMut = useMutation({ mutationFn: () => revokeStudentSessions(id!), onSuccess: () => flash('Sessions revoked') });
  const addNoteMut = useMutation({ mutationFn: () => addTimelineEntry(id!, noteForm), onSuccess: () => { refetch(); flash('Note added'); setAddNoteModal(false); setNoteForm({ type: 'note', content: '' }); } });
  const deleteNoteMut = useMutation({ mutationFn: (eid: string) => deleteTimelineEntry(id!, eid), onSuccess: () => { refetch(); flash('Entry deleted'); } });
  const adjMut = useMutation({ mutationFn: () => createFinanceAdjustment(id!, { direction: adjForm.direction as 'income' | 'expense', amount: parseFloat(adjForm.amount), description: adjForm.description, method: adjForm.method }), onSuccess: () => { refetch(); flash('Adjustment recorded'); setAdjModal(false); setAdjForm({ direction: 'income', amount: '', description: '', method: 'manual' }); } });

  if (isLoading) return <div className="py-20 text-center text-slate-400">Loading student details...</div>;
  if (!student) return <div className="py-20 text-center text-slate-400">Student not found</div>;

  const s = student;
  const p = s.profile;
  const g = s.guardian;

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-bold text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
            {s.full_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">{s.full_name}</h1>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{s.email}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge(s.status)}`}>{s.status}</span>
              {s.subscription?.state && s.subscription.state !== 'none' && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge(s.subscription.state)}`}>
                  Sub: {s.subscription.state}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {s.status === 'active' ? (
            <div className="flex items-center gap-1">
              <button onClick={() => suspendMut.mutate()} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">
                Suspend
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => activateMut.mutate()} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-600 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20">
                Activate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/50">
        {TABS.map(t => (
          <div key={t.key} className="flex items-center gap-1">
            <button onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === t.key
                ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}>
              <t.icon size={13} />
              {t.label}
            </button>
          </div>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {tab === 'overview' && <OverviewTab s={s} setTab={setTab} />}
        {tab === 'profile' && <ProfileTab s={s} p={p} editProfile={editProfile} setEditProfile={setEditProfile} profileForm={profileForm} setProfileForm={setProfileForm} updateMut={updateMut} />}
        {tab === 'guardian' && <GuardianTab g={g} />}
        {tab === 'subscription' && <SubscriptionTab s={s} setAssignModal={setAssignModal} setExtendModal={setExtendModal} expireSubMut={expireSubMut} toggleAutoMut={toggleAutoMut} />}
        {tab === 'payments' && <PaymentsTab id={id!} s={s} />}
        {tab === 'finance' && <FinanceTab id={id!} s={s} setAdjModal={setAdjModal} />}
        {tab === 'exams' && <ExamsTab s={s} />}
        {tab === 'results' && <ResultsTab s={s} />}
        {tab === 'weak-topics' && <WeakTopicsTab s={s} />}
        {tab === 'communication' && <CommunicationTab s={s} />}
        {tab === 'crm-timeline' && <CrmTimelineTab s={s} setAddNoteModal={setAddNoteModal} deleteNoteMut={deleteNoteMut} />}
        {tab === 'security' && <SecurityTab s={s} setSetPassModal={setSetPassModal} resetPassMut={resetPassMut} resendMut={resendMut} forceResetMut={forceResetMut} revokeMut={revokeMut} />}
        {tab === 'extended-profile' && <ExtendedProfileTab studentId={id!} />}
        {tab === 'support' && <SupportTab s={s} />}
      </div>

      {/* Modals */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Assign Subscription">
        <div className="space-y-3">
          <select className={inputCls} value={assignForm.planId} onChange={e => setAssignForm(p => ({ ...p, planId: e.target.value }))}>
            <option value="">Select a plan</option>
            {(availablePlans ?? []).map((plan: AdminSubscriptionPlan) => (
              <option key={plan._id} value={plan._id}>
                {plan.name || 'Unnamed plan'} {plan.code ? `(${plan.code})` : ''}
              </option>
            ))}
          </select>
          <input className={inputCls} type="date" value={assignForm.startDate} onChange={e => setAssignForm(p => ({ ...p, startDate: e.target.value }))} />
          <textarea className={inputCls} rows={2} placeholder="Notes" value={assignForm.notes} onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))} />
          <button onClick={() => assignSubMut.mutate()} disabled={!assignForm.planId || assignSubMut.isPending} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {assignSubMut.isPending ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </Modal>

      <Modal open={extendModal} onClose={() => setExtendModal(false)} title="Extend Subscription">
        <div className="space-y-3">
          <input className={inputCls} type="number" min="1" value={extendDays} onChange={e => setExtendDays(e.target.value)} />
          <button onClick={() => extendSubMut.mutate()} disabled={extendSubMut.isPending} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {extendSubMut.isPending ? 'Extending...' : `Extend by ${extendDays} days`}
          </button>
        </div>
      </Modal>

      <Modal open={setPassModal} onClose={() => setSetPassModal(false)} title="Set Password">
        <div className="space-y-3">
          <input className={inputCls} type="password" placeholder="New password" minLength={6} value={newPass} onChange={e => setNewPass(e.target.value)} />
          <button onClick={() => setPassMut.mutate()} disabled={!newPass || setPassMut.isPending} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {setPassMut.isPending ? 'Setting...' : 'Set Password'}
          </button>
        </div>
      </Modal>

      <Modal open={addNoteModal} onClose={() => setAddNoteModal(false)} title="Add CRM Entry">
        <div className="space-y-3">
          <select className={inputCls} value={noteForm.type} onChange={e => setNoteForm(p => ({ ...p, type: e.target.value }))}>
            {['note', 'call', 'message', 'email', 'sms', 'meeting', 'follow_up', 'support_ticket'].map(t => (
              <option key={t} value={t}>{t.replace('_', ' ')}</option>
            ))}
          </select>
          <textarea className={inputCls} rows={3} placeholder="Content..." value={noteForm.content} onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))} />
          <button onClick={() => addNoteMut.mutate()} disabled={!noteForm.content || addNoteMut.isPending} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {addNoteMut.isPending ? 'Adding...' : 'Add Entry'}
          </button>
        </div>
      </Modal>

      <Modal open={adjModal} onClose={() => setAdjModal(false)} title="Finance Adjustment">
        <div className="space-y-3">
          <select className={inputCls} value={adjForm.direction} onChange={e => setAdjForm(p => ({ ...p, direction: e.target.value }))}>
            <option value="income">Income (Payment / Credit)</option>
            <option value="expense">Expense (Refund / Waiver)</option>
          </select>
          <input className={inputCls} type="number" min="0" placeholder="Amount (BDT)" value={adjForm.amount} onChange={e => setAdjForm(p => ({ ...p, amount: e.target.value }))} />
          <input className={inputCls} placeholder="Description" value={adjForm.description} onChange={e => setAdjForm(p => ({ ...p, description: e.target.value }))} />
          <select className={inputCls} value={adjForm.method} onChange={e => setAdjForm(p => ({ ...p, method: e.target.value }))}>
            {['manual', 'cash', 'bkash', 'nagad', 'bank', 'card'].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button onClick={() => adjMut.mutate()} disabled={!adjForm.amount || !adjForm.description || adjMut.isPending} className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {adjMut.isPending ? 'Recording...' : 'Record Adjustment'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════ Tab Components ═══════════════════ */

type S = any;

function OverviewTab({ s, setTab }: { s: S; setTab: (t: Tab) => void }) {
  const cards = [
    { label: 'Profile Score', value: `${s.profile?.profile_completion_percentage ?? 0}%`, color: 'indigo', tab: 'profile' as Tab },
    { label: 'Subscription', value: s.subscription?.state ?? 'none', color: 'green', tab: 'subscription' as Tab },
    { label: 'Total Paid', value: `৳${s.payments?.totalPaid?.toLocaleString() ?? 0}`, color: 'emerald', tab: 'payments' as Tab },
    { label: 'Net Due', value: `৳${s.finance?.netDue?.toLocaleString() ?? 0}`, color: s.finance?.netDue > 0 ? 'red' : 'green', tab: 'finance' as Tab },
    { label: 'Exams Taken', value: s.exams?.totalAttempted ?? 0, color: 'blue', tab: 'exams' as Tab },
    { label: 'Weak Topics', value: s.weakTopics?.count ?? 0, color: (s.weakTopics?.count ?? 0) > 0 ? 'red' : 'green', tab: 'weak-topics' as Tab },
    { label: 'CRM Entries', value: s.crmTimeline?.totalEntries ?? 0, color: 'amber', tab: 'crm-timeline' as Tab },
    { label: 'Open Tickets', value: s.support?.openTickets ?? 0, color: (s.support?.openTickets ?? 0) > 0 ? 'orange' : 'slate', tab: 'support' as Tab },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <button key={c.label} onClick={() => setTab(c.tab)} className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{c.value}</p>
          </button>
        ))}
      </div>

      {/* Quick Info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Identity" icon={User}>
          <InfoRow label="Email" value={s.email} />
          <InfoRow label="Phone" value={s.phone_number} />
          <InfoRow label="Department" value={s.profile?.department} />
          <InfoRow label="HSC Batch" value={s.profile?.hsc_batch} />
          <InfoRow label="Last Login" value={s.lastLoginAtUTC ? new Date(s.lastLoginAtUTC).toLocaleString() : undefined} />
          <InfoRow label="Joined" value={new Date(s.createdAt).toLocaleDateString()} />
        </Card>
        <Card title="Groups" icon={Settings}>
          {s.groups?.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {s.groups.map((g: { _id: string; name: string; color?: string }) => (
                <span
                  key={g._id}
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${g.color || '#6366f1'}20`, color: g.color || '#6366f1' }}
                >
                  {g.name}
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No groups</p>}
        </Card>
      </div>
    </div>
  );
}

function ProfileTab({ s, p, editProfile, setEditProfile, profileForm, setProfileForm, updateMut }: {
  s: S; p: S; editProfile: boolean;
  setEditProfile: (b: boolean) => void;
  profileForm: Record<string, string>;
  setProfileForm: (v: Record<string, string>) => void;
  updateMut: { mutate: (d: Record<string, unknown>) => void; isPending: boolean };
}) {
  const startEdit = () => {
    setProfileForm({
      full_name: s.full_name || '', email: s.email || '', phone_number: s.phone_number || '',
      department: p?.department || '', gender: p?.gender || '',
      dob: p?.dob?.substring(0, 10) || '', ssc_batch: p?.ssc_batch || '', hsc_batch: p?.hsc_batch || '',
      college_name: p?.college_name || '', district: p?.district || '', present_address: p?.present_address || '',
      roll_number: p?.roll_number || '', registration_id: p?.registration_id || '',
    });
    setEditProfile(true);
  };

  if (editProfile) {
    const set = (k: string, v: string) => setProfileForm({ ...profileForm, [k]: v });
    return (
      <Card title="Edit Profile" icon={Edit} action={
        <button onClick={() => setEditProfile(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      }>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(profileForm).map(([k, v]) => (
            <div key={k}>
              <label className="mb-1 block text-xs text-slate-500 capitalize">{k.replace(/_/g, ' ')}</label>
              <input className={inputCls} value={v} onChange={e => set(k, e.target.value)} />
            </div>
          ))}
        </div>
        <button onClick={() => updateMut.mutate(profileForm)} disabled={updateMut.isPending}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
          <Save size={14} /> {updateMut.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card title="Personal Info" icon={User} action={
        <button onClick={startEdit} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"><Edit size={12} /> Edit</button>
      }>
        <InfoRow label="Full Name" value={s.full_name} />
        <InfoRow label="Email" value={s.email} />
        <InfoRow label="Phone" value={s.phone_number} />
        <InfoRow label="Gender" value={p?.gender} />
        <InfoRow label="Date of Birth" value={p?.dob ? new Date(p.dob).toLocaleDateString() : undefined} />
        <InfoRow label="District" value={p?.district} />
        <InfoRow label="Address" value={p?.present_address} />
      </Card>
      <Card title="Academic" icon={GraduationCap}>
        <InfoRow label="Department" value={p?.department} />
        <InfoRow label="SSC Batch" value={p?.ssc_batch} />
        <InfoRow label="HSC Batch" value={p?.hsc_batch} />
        <InfoRow label="College" value={p?.college_name} />
        <InfoRow label="Roll Number" value={p?.roll_number} />
        <InfoRow label="Registration ID" value={p?.registration_id} />
        <InfoRow label="Profile Score" value={`${p?.profile_completion_percentage ?? 0}%`} />
        <InfoRow label="Points" value={p?.points} />
        <InfoRow label="Rank" value={p?.rank} />
      </Card>
    </div>
  );
}

function GuardianTab({ g }: { g: S }) {
  return (
    <Card title="Guardian Information" icon={Heart}>
      {g ? (
        <div className="space-y-0">
          <InfoRow label="Guardian Name" value={g.guardian_name} />
          <InfoRow label="Phone" value={g.guardian_phone} />
          <InfoRow label="Email" value={g.guardian_email} />
          <InfoRow label="Verification" value={g.verificationStatus} />
          <InfoRow label="Verified At" value={g.verifiedAt ? new Date(g.verifiedAt).toLocaleString() : undefined} />
        </div>
      ) : (
        <p className="text-sm text-slate-400">No guardian information on file</p>
      )}
    </Card>
  );
}

function SubscriptionTab({ s, setAssignModal, setExtendModal, expireSubMut, toggleAutoMut }: {
  s: S; setAssignModal: (b: boolean) => void; setExtendModal: (b: boolean) => void;
  expireSubMut: { mutate: () => void; isPending: boolean };
  toggleAutoMut: { mutate: () => void; isPending: boolean };
}) {
  const sub = s.subscription;
  const currentTimeline = (() => {
    if (!sub?.startDate || !sub?.expiryDate) return null;
    const start = new Date(sub.startDate).getTime();
    const end = new Date(sub.expiryDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
    const now = Date.now();
    const progress = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    const remainingDays = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return {
      progress,
      label: remainingDays >= 0 ? `${remainingDays} day${remainingDays === 1 ? '' : 's'} left` : 'Expired',
    };
  })();
  return (
    <div className="space-y-4">
      <Card title="Current Subscription" icon={CreditCard} action={
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAssignModal(true)} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700">Assign Plan</button>
          {sub?.state === 'active' && (
            <>
              <button onClick={() => setExtendModal(true)} className="rounded-lg border border-indigo-200 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800">Extend</button>
              <button onClick={() => expireSubMut.mutate()} className="rounded-lg border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800">Expire Now</button>
            </>
          )}
        </div>
      }>
        {currentTimeline ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscription Window</p>
              <span className="text-xs font-medium text-slate-500">{currentTimeline.label}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-full rounded-full ${sub?.state === 'expired' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                style={{ width: `${currentTimeline.progress}%` }}
              />
            </div>
          </div>
        ) : null}
        <InfoRow label="Status" value={sub?.state} />
        <InfoRow label="Plan" value={sub?.planName ? `${sub.planName} (${sub.planCode})` : undefined} />
        <InfoRow label="Start Date" value={sub?.startDate ? new Date(sub.startDate).toLocaleDateString() : undefined} />
        <InfoRow label="Expiry Date" value={sub?.expiryDate ? new Date(sub.expiryDate).toLocaleDateString() : undefined} />
        <InfoRow label="Days Remaining" value={sub?.daysRemaining} />
        <div className="flex items-center justify-between border-b border-slate-100 py-2 dark:border-slate-800">
          <span className="text-xs text-slate-500">Auto Renew</span>
          <button onClick={() => toggleAutoMut.mutate()} className={`rounded-full px-3 py-0.5 text-xs font-medium ${sub?.autoRenew ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {sub?.autoRenew ? 'ON' : 'OFF'}
          </button>
        </div>
      </Card>

      {sub?.history?.length > 0 && (
        <Card title="Subscription History" icon={Clock}>
          <div className="space-y-2">
            {sub.history.map((h: { _id: string; planName?: string; status: string; startAtUTC: string; expiresAtUTC: string }) => (
              <div key={h._id} className="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{h.planName || 'Plan'}</p>
                  <p className="text-xs text-slate-400">{new Date(h.startAtUTC).toLocaleDateString()} → {new Date(h.expiresAtUTC).toLocaleDateString()}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(h.status)}`}>{h.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function PaymentsTab({ id, s }: { id: string; s: S }) {
  const { data } = useQuery({
    queryKey: ['student-payments', id],
    queryFn: () => getStudentPayments(id),
  });

  const payments = data?.payments ?? s.payments?.recentPayments ?? [];
  const due = data?.dueLedger ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Total Paid</p>
          <p className="mt-1 text-xl font-bold text-green-600">৳{s.payments?.totalPaid?.toLocaleString() ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Pending Payments</p>
          <p className="mt-1 text-xl font-bold text-yellow-600">{s.payments?.pendingCount ?? 0}</p>
        </div>
        {due && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs text-slate-500">Net Due</p>
            <p className={`mt-1 text-xl font-bold ${due.netDue > 0 ? 'text-red-600' : 'text-green-600'}`}>৳{due.netDue?.toLocaleString()}</p>
          </div>
        )}
      </div>

      <Card title="Payment Records" icon={DollarSign}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                <th className="pb-2 pr-3">Amount</th>
                <th className="pb-2 pr-3">Method</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {payments.map((pay: { _id: string; amountBDT: number; method: string; status: string; createdAt: string }) => (
                <tr key={pay._id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2 pr-3 font-medium">৳{pay.amountBDT?.toLocaleString()}</td>
                  <td className="py-2 pr-3 capitalize">{pay.method}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(pay.status)}`}>{pay.status}</span></td>
                  <td className="py-2 text-xs text-slate-400">{new Date(pay.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-slate-400">No payments</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function FinanceTab({ id, s, setAdjModal }: { id: string; s: S; setAdjModal: (b: boolean) => void }) {
  const { data } = useQuery({
    queryKey: ['student-finance-statement', id],
    queryFn: () => getStudentFinanceStatement(id),
  });

  const txns = data?.transactions ?? s.finance?.recentTransactions ?? [];
  const totals = data?.totals ?? { income: s.finance?.totalIncome ?? 0, expense: s.finance?.totalRefunds ?? 0 };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Total Income</p>
          <p className="mt-1 text-xl font-bold text-green-600">৳{totals.income?.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Total Expense</p>
          <p className="mt-1 text-xl font-bold text-red-600">৳{totals.expense?.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Net Due</p>
          <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">৳{s.finance?.netDue?.toLocaleString() ?? 0}</p>
        </div>
      </div>

      <Card title="Transactions" icon={BarChart3} action={
        <button onClick={() => setAdjModal(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700">
          <Plus size={12} /> Adjustment
        </button>
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                <th className="pb-2 pr-3">Code</th>
                <th className="pb-2 pr-3">Direction</th>
                <th className="pb-2 pr-3">Amount</th>
                <th className="pb-2 pr-3">Description</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {txns.map((t: { _id: string; txnCode: string; direction: string; amount: number; description: string; status: string; dateUTC: string; createdAt?: string }) => (
                <tr key={t._id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2 pr-3 text-xs font-mono">{t.txnCode}</td>
                  <td className="py-2 pr-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${t.direction === 'income' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {t.direction}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-medium">৳{t.amount?.toLocaleString()}</td>
                  <td className="py-2 pr-3 max-w-[200px] truncate">{t.description}</td>
                  <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(t.status)}`}>{t.status}</span></td>
                  <td className="py-2 text-xs text-slate-400">{new Date(t.dateUTC || t.createdAt || '').toLocaleDateString()}</td>
                </tr>
              ))}
              {txns.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No transactions</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ExamsTab({ s }: { s: S }) {
  const identity = s.exams?.identity;
  const syncHistory = s.exams?.syncHistory ?? [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Total Attempted</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">{s.exams?.totalAttempted ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Upcoming Exams</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">{s.exams?.upcomingCount ?? 0}</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <Card title="Exam Identity" icon={BookOpen}>
          <InfoRow label="Serial ID" value={identity?.serialId} />
          <InfoRow label="Roll Number" value={identity?.rollNumber} />
          <InfoRow label="Registration Number" value={identity?.registrationNumber} />
          <InfoRow label="Admit Card" value={identity?.admitCardNumber} />
          <InfoRow label="Exam Center" value={identity?.examCenter} />
          <InfoRow label="Last Sync" value={identity?.lastSyncAt ? new Date(identity.lastSyncAt).toLocaleString() : undefined} />
          <InfoRow label="Latest Summary" value={identity?.latestResultSummary} />
        </Card>
        <Card title="Recent Sync History" icon={RefreshCcw}>
          <div className="space-y-2">
            {syncHistory.map((item: { _id: string; examTitle?: string; source: string; status: string; syncMode: string; changedFields: string[]; createdAt: string }) => (
              <div key={item._id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.examTitle || 'Exam Sync'}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge(item.status)}`}>{item.status}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{item.source} · {item.syncMode}</p>
                <p className="mt-1 text-xs text-slate-500">{item.changedFields?.join(', ') || 'No field changes listed'}</p>
              </div>
            ))}
            {syncHistory.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">No sync history yet</p>
            )}
          </div>
        </Card>
      </div>
      <Card title="Recent Results" icon={BookOpen}>
        <div className="space-y-2">
          {(s.exams?.recentResults ?? []).map((r: { _id: string; examTitle?: string; percentage: number; obtainedMarks: number; totalMarks: number; submittedAt: string; status: string; source?: string; examCenter?: string; syncStatus?: string }) => (
            <div key={r._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{r.examTitle || 'Exam'}</p>
                <p className="text-xs text-slate-400">{new Date(r.submittedAt).toLocaleDateString()} · {r.source || 'internal'}{r.examCenter ? ` · ${r.examCenter}` : ''}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-800 dark:text-white">{r.obtainedMarks}/{r.totalMarks}</p>
                <p className={`text-xs font-medium ${r.percentage >= 60 ? 'text-green-600' : r.percentage >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{r.percentage.toFixed(1)}%</p>
                {r.syncStatus ? <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{r.syncStatus}</p> : null}
              </div>
            </div>
          ))}
          {(!s.exams?.recentResults || s.exams.recentResults.length === 0) && (
            <p className="py-6 text-center text-sm text-slate-400">No exam results yet</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function ResultsTab({ s }: { s: S }) {
  const results = s.exams?.recentResults ?? [];
  return (
    <Card title="All Results" icon={FileText}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
              <th className="pb-2 pr-3">Exam</th>
              <th className="pb-2 pr-3">Marks</th>
              <th className="pb-2 pr-3">Percentage</th>
              <th className="pb-2 pr-3">Source</th>
              <th className="pb-2 pr-3">Center</th>
              <th className="pb-2 pr-3">Status</th>
              <th className="pb-2 pr-3">Sync</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {results.map((r: { _id: string; examTitle?: string; obtainedMarks: number; totalMarks: number; percentage: number; status: string; submittedAt: string; source?: string; examCenter?: string; syncStatus?: string }) => (
              <tr key={r._id} className="text-slate-700 dark:text-slate-300">
                <td className="py-2 pr-3 font-medium">{r.examTitle || '—'}</td>
                <td className="py-2 pr-3">{r.obtainedMarks}/{r.totalMarks}</td>
                <td className="py-2 pr-3">
                  <span className={`font-medium ${r.percentage >= 60 ? 'text-green-600' : r.percentage >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {r.percentage.toFixed(1)}%
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs uppercase tracking-wide text-slate-500">{r.source || 'internal'}</td>
                <td className="py-2 pr-3">{r.examCenter || 'â€”'}</td>
                <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(r.status)}`}>{r.status}</span></td>
                <td className="py-2 pr-3 text-xs text-slate-500">{r.syncStatus || 'â€”'}</td>
                <td className="py-2 text-xs text-slate-400">{new Date(r.submittedAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {results.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-400">No results</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function WeakTopicsTab({ s }: { s: S }) {
  const items = s.weakTopics?.items ?? [];
  const severityColor: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  return (
    <Card title={`Weak Topics (${items.length})`} icon={AlertTriangle}>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((t: { topic: string; accuracy: number; totalAttempts: number; severity: string }, i: number) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.topic}</p>
                <p className="text-xs text-slate-400">{t.totalAttempts} attempts</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityColor[t.severity] || severityColor.low}`}>{t.severity}</span>
                <span className="text-sm font-bold text-red-600">{t.accuracy.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-slate-400">No weak topics — great performance!</p>
      )}
    </Card>
  );
}

function CommunicationTab({ s }: { s: S }) {
  const comm = s.communication;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Eligibility</p>
          <p className="mt-1 text-sm font-bold capitalize text-slate-900 dark:text-white">{comm?.eligibility ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Total Sent</p>
          <p className="mt-1 text-xl font-bold text-indigo-600">{comm?.totalSent ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Last Sent</p>
          <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">{comm?.lastSentAt ? new Date(comm.lastSentAt).toLocaleString() : '—'}</p>
        </div>
      </div>

      <Card title="Recent Notifications" icon={Send}>
        <div className="space-y-2">
          {(comm?.recentLogs ?? []).map((l: { _id: string; channel: string; status: string; to: string; sentAtUTC?: string; providerUsed: string }) => (
            <div key={l._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div className="flex items-center gap-2">
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{l.channel}</span>
                <span className="text-sm text-slate-700 dark:text-slate-300">{l.to}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{l.providerUsed}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.status === 'delivered' ? 'bg-green-100 text-green-700' : badge(l.status)}`}>{l.status}</span>
              </div>
            </div>
          ))}
          {(!comm?.recentLogs || comm.recentLogs.length === 0) && (
            <p className="py-6 text-center text-sm text-slate-400">No notifications sent</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function CrmTimelineTab({ s, setAddNoteModal, deleteNoteMut }: {
  s: S; setAddNoteModal: (b: boolean) => void;
  deleteNoteMut: { mutate: (id: string) => void; isPending: boolean };
}) {
  const entries = s.crmTimeline?.recentEntries ?? [];
  return (
    <Card title={`CRM Timeline (${s.crmTimeline?.totalEntries ?? 0})`} icon={Clock} action={
      <button onClick={() => setAddNoteModal(true)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700">
        <Plus size={12} /> Add Entry
      </button>
    }>
      <div className="space-y-2">
        {entries.map((e: { _id: string; type: string; content: string; createdAt: string; createdByAdmin?: string }) => (
          <div key={e._id} className="group flex items-start gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">{e.type}</span>
                <span className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
                {e.createdByAdmin && <span className="text-xs text-slate-400">by {e.createdByAdmin}</span>}
              </div>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{e.content}</p>
            </div>
            <button onClick={() => deleteNoteMut.mutate(e._id)} className="hidden text-slate-400 hover:text-red-500 group-hover:block">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">No CRM entries yet</p>
        )}
      </div>
    </Card>
  );
}

function SecurityTab({ s, setSetPassModal, resetPassMut, resendMut, forceResetMut, revokeMut }: {
  s: S; setSetPassModal: (b: boolean) => void;
  resetPassMut: { mutate: () => void; isPending: boolean };
  resendMut: { mutate: () => void; isPending: boolean };
  forceResetMut: { mutate: () => void; isPending: boolean };
  revokeMut: { mutate: () => void; isPending: boolean };
}) {
  const sec = s.security;
  return (
    <div className="space-y-4">
      <Card title="Security Status" icon={Shield}>
        <InfoRow label="2FA Enabled" value={sec?.twoFactorEnabled ? 'Yes' : 'No'} />
        <InfoRow label="Must Change Password" value={sec?.mustChangePassword ? 'Yes' : 'No'} />
        <InfoRow label="Force Reset Required" value={sec?.forcePasswordResetRequired ? 'Yes' : 'No'} />
        <InfoRow label="Login Attempts" value={sec?.loginAttempts} />
        <InfoRow label="Locked Until" value={sec?.lockUntil ? new Date(sec.lockUntil).toLocaleString() : undefined} />
        <InfoRow label="Last Login" value={sec?.lastLoginAt ? new Date(sec.lastLoginAt).toLocaleString() : undefined} />
        <InfoRow label="IP Address" value={sec?.ip_address} />
        <InfoRow label="Device" value={sec?.device_info} />
        <InfoRow label="Password Last Changed" value={sec?.passwordLastChangedAt ? new Date(sec.passwordLastChangedAt).toLocaleString() : undefined} />
        <InfoRow label="Credentials Resent" value={sec?.credentialsLastResentAt ? new Date(sec.credentialsLastResentAt).toLocaleString() : undefined} />
      </Card>

      <Card title="Security Actions" icon={Lock}>
        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={() => setSetPassModal(true)} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <Lock size={14} /> Set Password
          </button>
          <button onClick={() => resetPassMut.mutate()} disabled={resetPassMut.isPending} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <RefreshCcw size={14} /> Send Reset Link
          </button>
          <button onClick={() => resendMut.mutate()} disabled={resendMut.isPending} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <Send size={14} /> Resend Credentials
          </button>
          <button onClick={() => forceResetMut.mutate()} disabled={forceResetMut.isPending} className="flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            <Unlock size={14} /> Toggle Force Reset
          </button>
          <button onClick={() => revokeMut.mutate()} disabled={revokeMut.isPending} className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 sm:col-span-2">
            <Shield size={14} /> Revoke All Sessions
          </button>
        </div>
      </Card>
    </div>
  );
}

function ExtendedProfileTab({ studentId }: { studentId: string }) {
  const extQuery = useQuery({
    queryKey: ['student-extended-profile', studentId],
    queryFn: () => getStudentExtendedProfile(studentId),
    enabled: Boolean(studentId),
  });

  if (extQuery.isLoading) return <div className="p-4 text-sm text-slate-500">Loading extended profile...</div>;
  if (extQuery.isError) return <div className="p-4 text-sm text-red-500">Failed to load extended profile.</div>;

  const data = extQuery.data;
  if (!data) return <div className="p-4 text-sm text-slate-500">No data available.</div>;

  return (
    <div className="space-y-4">
      {/* Performance Analytics */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Performance Analytics</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <div><p className="text-xs text-slate-500">Total Exams</p><p className="text-lg font-bold">{data.performanceAnalytics?.totalExams ?? 0}</p></div>
          <div><p className="text-xs text-slate-500">Average Score</p><p className="text-lg font-bold">{data.performanceAnalytics?.averageScore ?? 0}%</p></div>
          <div><p className="text-xs text-slate-500">Trend</p><p className={`text-lg font-bold ${(data.performanceAnalytics?.trend ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{(data.performanceAnalytics?.trend ?? 0) >= 0 ? '+' : ''}{data.performanceAnalytics?.trend ?? 0}%</p></div>
          <div><p className="text-xs text-slate-500">Weak Topics</p><p className="text-lg font-bold text-orange-600">{data.performanceAnalytics?.weakTopics?.length ?? 0}</p></div>
        </div>
      </div>

      {/* Exam History */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Exam History</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 border-b"><th className="text-left p-2">Exam</th><th className="text-left p-2">Subject</th><th className="text-right p-2">Score</th><th className="text-right p-2">%</th><th className="text-right p-2">Date</th></tr></thead>
            <tbody>
              {(data.examHistory || []).slice(0, 20).map((e: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2">{e.examTitle}</td>
                  <td className="p-2">{e.subject}</td>
                  <td className="p-2 text-right">{e.obtainedMarks}/{e.totalMarks}</td>
                  <td className="p-2 text-right">{e.percentage}%</td>
                  <td className="p-2 text-right text-xs text-slate-400">{e.submittedAt ? new Date(e.submittedAt).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Device & IP Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Device & IP History</h3>
        <div className="space-y-2">
          {(data.ipHistory || []).map((ip: string, i: number) => (
            <span key={i} className="inline-block mr-2 mb-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-mono dark:bg-slate-800">{ip}</span>
          ))}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500 border-b"><th className="text-left p-2">IP</th><th className="text-left p-2">User Agent</th><th className="text-right p-2">Time</th></tr></thead>
            <tbody>
              {(data.deviceInfo || []).slice(0, 10).map((d: any, i: number) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-mono text-xs">{d.ip}</td>
                  <td className="p-2 text-xs truncate max-w-[200px]">{d.userAgent}</td>
                  <td className="p-2 text-right text-xs text-slate-400">{d.timestamp ? new Date(d.timestamp).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SupportTab({ s }: { s: S }) {
  const sup = s.support;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Open Tickets</p>
          <p className={`mt-1 text-2xl font-bold ${(sup?.openTickets ?? 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>{sup?.openTickets ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Total Tickets</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{sup?.totalTickets ?? 0}</p>
        </div>
      </div>

      <Card title="Recent Tickets" icon={Headphones}>
        <div className="space-y-2">
          {(sup?.recentTickets ?? []).map((t: { _id: string; ticketNo: string; subject: string; status: string; priority: string; createdAt: string }) => (
            <div key={t._id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t.subject}</p>
                <p className="text-xs text-slate-400">#{t.ticketNo} • {new Date(t.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.priority === 'high' || t.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                  }`}>{t.priority}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(t.status)}`}>{t.status}</span>
              </div>
            </div>
          ))}
          {(!sup?.recentTickets || sup.recentTickets.length === 0) && (
            <p className="py-6 text-center text-sm text-slate-400">No support tickets</p>
          )}
        </div>
      </Card>
    </div>
  );
}
