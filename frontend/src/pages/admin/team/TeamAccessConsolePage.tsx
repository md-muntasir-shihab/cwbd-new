import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import { useAuth } from '../../../hooks/useAuth';
import { useModuleAccess } from '../../../hooks/useModuleAccess';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import {
  teamApi,
  type ModulePermissionMap,
  type TeamAction,
  type TeamApprovalRuleItem,
  type TeamAuditItem,
  type TeamInviteItem,
  type TeamMemberItem,
  type TeamRoleItem,
  type TeamSecurityOverview,
} from '../../../services/teamAccessApi';
import {
  Search, Plus, Shield, Users, Lock, Activity, Mail, MoreVertical, Copy,
  Trash2, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Fingerprint, KeyRound, UserCheck, UserX, Send,
} from 'lucide-react';
import { showConfirmDialog } from '../../../lib/appDialog';

type TeamView = 'members' | 'roles' | 'permissions' | 'approval-rules' | 'activity' | 'security' | 'invites';

const ACTIONS: TeamAction[] = [
  'view',
  'create',
  'edit',
  'delete',
  'archive',
  'publish',
  'approve',
  'reject',
  'verify',
  'export',
  'import',
  'manage_settings',
  'manage_permissions',
  'manage_security',
  'manage_finance',
  'manage_users',
  'bulk_actions',
];

function getViewFromPath(pathname: string): TeamView {
  if (pathname.includes('/team/roles')) return 'roles';
  if (pathname.includes('/team/permissions')) return 'permissions';
  if (pathname.includes('/team/approval-rules')) return 'approval-rules';
  if (pathname.includes('/team/activity')) return 'activity';
  if (pathname.includes('/team/security')) return 'security';
  if (pathname.includes('/team/invites')) return 'invites';
  return 'members';
}

function getRoleName(member: TeamMemberItem): string {
  if (member.teamRoleId && typeof member.teamRoleId === 'object' && 'name' in member.teamRoleId) return member.teamRoleId.name || 'Unassigned';
  return 'Unassigned';
}

function emptyPermissions(modules: string[]): ModulePermissionMap {
  const map: ModulePermissionMap = {};
  modules.forEach((moduleName) => {
    map[moduleName] = {};
    ACTIONS.forEach((action) => {
      map[moduleName][action] = false;
    });
  });
  return map;
}

const ROLE_COLORS: Record<string, string> = {
  'Super Admin': 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
  Admin: 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/20',
  Moderator: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20',
  Editor: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  'University Manager': 'border-l-purple-500 bg-purple-50 dark:bg-purple-950/20',
  'Exam Manager': 'border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/20',
  'Student Manager': 'border-l-teal-500 bg-teal-50 dark:bg-teal-950/20',
  'Finance Manager': 'border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/20',
  'Support Manager': 'border-l-cyan-500 bg-cyan-50 dark:bg-cyan-950/20',
  'Campaign Manager': 'border-l-pink-500 bg-pink-50 dark:bg-pink-950/20',
  'Content Reviewer': 'border-l-violet-500 bg-violet-50 dark:bg-violet-950/20',
  'Data Entry Operator': 'border-l-lime-500 bg-lime-50 dark:bg-lime-950/20',
  'Viewer/Read Only': 'border-l-slate-400 bg-slate-50 dark:bg-slate-950/20',
};

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatActivityDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function humanizeActivityValue(value: string): string {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function resolveActivityActor(item: TeamAuditItem): string {
  return item.actorName || item.actorId?.full_name || item.actorId?.username || 'System';
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    revoked: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    invited: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    accepted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    terminated: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    blocked: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
      {status}
    </span>
  );
}

export default function TeamAccessConsolePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();
  const { hasAccess } = useModuleAccess();
  const view = useMemo(() => getViewFromPath(location.pathname), [location.pathname]);
  const isSuperAdmin = user?.role === 'superadmin';
  const canManageMemberPasswords = user?.role === 'superadmin' || user?.role === 'admin';
  const canCreateTeam = hasAccess('team_access_control', 'create');
  const canEditTeam = hasAccess('team_access_control', 'edit');
  const canDeleteTeam = hasAccess('team_access_control', 'delete');

  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [roles, setRoles] = useState<TeamRoleItem[]>([]);
  const [rules, setRules] = useState<TeamApprovalRuleItem[]>([]);
  const [activity, setActivity] = useState<TeamAuditItem[]>([]);
  const [security, setSecurity] = useState<TeamSecurityOverview | null>(null);
  const [invites, setInvites] = useState<TeamInviteItem[]>([]);

  const [matrixModules, setMatrixModules] = useState<string[]>([]);
  const [matrixActions, setMatrixActions] = useState<string[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [matrix, setMatrix] = useState<ModulePermissionMap>({});

  const [newMember, setNewMember] = useState({
    fullName: '',
    email: '',
    username: '',
    phone: '',
    roleId: '',
    status: 'active',
    passwordMode: 'manual' as 'manual' | 'invite',
    password: '',
    confirmPassword: '',
    mode: 'invite',
    forcePasswordResetRequired: false,
    notes: '',
  });

  const [newRole, setNewRole] = useState({
    name: '',
    description: '',
    cloneFromRoleId: '',
    basePlatformRole: 'viewer',
    isActive: true,
  });

  const [newRule, setNewRule] = useState({
    module: 'news',
    action: 'publish',
    requiresApproval: true,
    requiredApprovals: 1,
    description: '',
    approverRoleIds: [] as string[],
  });

  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    try {
      const [memberRes, roleRes] = await Promise.all([teamApi.getMembers(), teamApi.getRoles()]);
      setMembers(memberRes.data.items || []);
      setRoles(roleRes.data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadRoles() {
    setLoading(true);
    try {
      const roleRes = await teamApi.getRoles();
      setRoles(roleRes.data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadPermissions() {
    setLoading(true);
    try {
      const res = await teamApi.getPermissions();
      const modules = res.data.modules || [];
      const actions = res.data.actions || [];
      const apiRoles = res.data.roles || [];

      setMatrixModules(modules);
      setMatrixActions(actions);

      const roleOptions = apiRoles.map((role) => ({
        _id: role._id,
        name: role.name,
        slug: role.slug,
      }));
      setRoles(roleOptions as TeamRoleItem[]);

      const currentRole = selectedRoleId || apiRoles[0]?._id || '';
      setSelectedRoleId(currentRole);
      const current = apiRoles.find((r) => r._id === currentRole);
      setMatrix(current?.permissions || emptyPermissions(modules));
    } finally {
      setLoading(false);
    }
  }

  async function loadApprovalRules() {
    setLoading(true);
    try {
      const [ruleRes, roleRes] = await Promise.all([teamApi.getApprovalRules(), teamApi.getRoles()]);
      setRules(ruleRes.data.items || []);
      setRoles(roleRes.data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadActivity() {
    setLoading(true);
    try {
      const res = await teamApi.getActivity();
      setActivity(res.data.items || []);
    } finally {
      setLoading(false);
    }
  }

  async function loadSecurity() {
    setLoading(true);
    try {
      const res = await teamApi.getSecurityOverview();
      setSecurity(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadInvites() {
    setLoading(true);
    try {
      const res = await teamApi.getInvites();
      setInvites(res.data.items || []);
    } finally {
      setLoading(false);
    }
  }

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.toLowerCase();
    return members.filter(m =>
      (m.full_name || m.fullName || '').toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      getRoleName(m).toLowerCase().includes(q)
    );
  }, [members, search]);

  const filteredActivity = useMemo(() => {
    if (!search.trim()) return activity;
    const q = search.toLowerCase();
    return activity.filter(a =>
      resolveActivityActor(a).toLowerCase().includes(q) ||
      String(a.actorRole || '').toLowerCase().includes(q) ||
      String(a.module || '').toLowerCase().includes(q) ||
      String(a.action || '').toLowerCase().includes(q) ||
      String(a.targetType || '').toLowerCase().includes(q) ||
      String(a.targetId || '').toLowerCase().includes(q) ||
      String(a.ip || '').toLowerCase().includes(q) ||
      String(a.device || '').toLowerCase().includes(q) ||
      String(a.browser || '').toLowerCase().includes(q) ||
      String(a.platform || '').toLowerCase().includes(q) ||
      String(a.locationSummary || '').toLowerCase().includes(q)
    );
  }, [activity, search]);

  useEffect(() => {
    setSearch('');
    setShowCreateForm(false);
    setActionMenuId(null);
  }, [view]);

  useEffect(() => {
    if (canManageMemberPasswords) return;
    setNewMember((current) => ({
      ...current,
      passwordMode: 'invite',
      password: '',
      confirmPassword: '',
      forcePasswordResetRequired: true,
    }));
  }, [canManageMemberPasswords]);

  useEffect(() => {
    if (authLoading || !user) {
      return;
    }

    const run = async () => {
      try {
        if (view === 'members') await loadMembers();
        if (view === 'roles') await loadRoles();
        if (view === 'permissions') await loadPermissions();
        if (view === 'approval-rules') await loadApprovalRules();
        if (view === 'activity') await loadActivity();
        if (view === 'security') await loadSecurity();
        if (view === 'invites') await loadInvites();
      } catch (error: any) {
        toast.error(error?.response?.data?.message || 'Failed to load team access data');
      }
    };
    void run();
  }, [authLoading, user, view]);

  async function handleCreateMember() {
    try {
      if (!newMember.fullName.trim() || !newMember.email.trim() || !newMember.roleId) {
        toast.error('Full name, email, and role are required');
        return;
      }
      if (newMember.passwordMode === 'manual') {
        if (!canManageMemberPasswords) {
          toast.error('Only admin or super admin can set passwords directly');
          return;
        }
        if (newMember.password.length < 8) {
          toast.error('Password must be at least 8 characters');
          return;
        }
        if (newMember.password !== newMember.confirmPassword) {
          toast.error('Password confirmation does not match');
          return;
        }
      }

      await teamApi.createMember({
        fullName: newMember.fullName,
        email: newMember.email,
        username: newMember.username,
        phone: newMember.phone,
        roleId: newMember.roleId,
        status: newMember.status,
        passwordMode: newMember.passwordMode,
        password: newMember.passwordMode === 'manual' ? newMember.password : undefined,
        mode: newMember.passwordMode === 'invite' ? (newMember.mode as 'invite' | 'without_send' | 'draft') : 'without_send',
        forcePasswordResetRequired: newMember.forcePasswordResetRequired,
        notes: newMember.notes,
      });
      toast.success('Team member created');
      setNewMember({
        fullName: '',
        email: '',
        username: '',
        phone: '',
        roleId: '',
        status: 'active',
        passwordMode: 'manual',
        password: '',
        confirmPassword: '',
        mode: 'invite',
        forcePasswordResetRequired: false,
        notes: '',
      });
      await loadMembers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to create member');
    }
  }

  async function handleCreateRole() {
    try {
      await teamApi.createRole(newRole);
      toast.success('Role created');
      setNewRole({ ...newRole, name: '', description: '' });
      await loadRoles();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to create role');
    }
  }

  async function handleSaveMatrix() {
    if (!selectedRoleId) {
      toast.error('Select a role first');
      return;
    }
    if (!isSuperAdmin) {
      toast.error('Only super admin can edit the permissions matrix');
      return;
    }
    try {
      await teamApi.updateRolePermissions(selectedRoleId, matrix);
      toast.success('Permissions updated');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to save permissions');
    }
  }

  async function handleCreateRule() {
    try {
      await teamApi.createApprovalRule(newRule);
      toast.success('Approval rule created');
      await loadApprovalRules();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to create approval rule');
    }
  }

  async function handleMemberAction(memberId: string, action: 'suspend' | 'activate' | 'reset' | 'revoke' | 'resend') {
    try {
      if (action === 'suspend') await teamApi.suspendMember(memberId);
      if (action === 'activate') await teamApi.activateMember(memberId);
      if (action === 'reset') await teamApi.resetMemberPassword(memberId, { mode: 'invite', forcePasswordResetRequired: true });
      if (action === 'revoke') await teamApi.revokeMemberSessions(memberId);
      if (action === 'resend') await teamApi.resendMemberInvite(memberId);
      toast.success('Action completed');
      await loadMembers();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Action failed');
    }
  }

  const titleByView: Record<TeamView, string> = {
    members: 'Team Members',
    roles: 'Roles',
    permissions: 'Permissions Matrix',
    'approval-rules': 'Approval Rules',
    activity: 'Activity / Audit Logs',
    security: 'Login & Security',
    invites: 'Invite / Access Requests',
  };

  return (
    <AdminGuardShell
      title={titleByView[view]}
      description="Manage admin/staff roles, permissions, approvals, security controls, and audit visibility from one access-control workspace."
      allowedRoles={['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent']}
      requiredModule="team_access_control"
    >
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        {/* Tab Navigation */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {([
            { key: 'members', label: 'Members', icon: Users, path: ADMIN_PATHS.teamMembers },
            { key: 'roles', label: 'Roles', icon: Shield, path: ADMIN_PATHS.teamRoles },
            { key: 'permissions', label: 'Permissions', icon: Lock, path: ADMIN_PATHS.teamPermissions },
            { key: 'approval-rules', label: 'Approvals', icon: CheckCircle2, path: ADMIN_PATHS.teamApprovalRules },
            { key: 'activity', label: 'Activity', icon: Activity, path: ADMIN_PATHS.teamActivity },
            { key: 'security', label: 'Security', icon: Fingerprint, path: ADMIN_PATHS.teamSecurity },
            { key: 'invites', label: 'Invites', icon: Mail, path: ADMIN_PATHS.teamInvites },
          ] as const).map((tab) => {
            const active = view === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => navigate(tab.path)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-all ${active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  }`}
              >
                <TabIcon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & action bar */}
        {(view === 'members' || view === 'activity' || view === 'invites') && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="admin-input w-full pl-9" placeholder={`Search ${view}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {view === 'members' && canCreateTeam && (
              <button onClick={() => setShowCreateForm((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">
                <Plus className="h-4 w-4" /> Add Member
              </button>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading...
          </div>
        )}

        {/* ═══ MEMBERS ═══ */}
        {view === 'members' && (
          <>
            <AnimatePresence>
              {showCreateForm && canCreateTeam && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-2">
                    <input className="admin-input" placeholder="Full name" value={newMember.fullName} onChange={(e) => setNewMember((v) => ({ ...v, fullName: e.target.value }))} />
                    <input className="admin-input" placeholder="Email" value={newMember.email} onChange={(e) => setNewMember((v) => ({ ...v, email: e.target.value }))} />
                    <input className="admin-input" placeholder="Username" value={newMember.username} onChange={(e) => setNewMember((v) => ({ ...v, username: e.target.value }))} />
                    <input className="admin-input" placeholder="Phone" value={newMember.phone} onChange={(e) => setNewMember((v) => ({ ...v, phone: e.target.value }))} />
                    <select className="admin-input" value={newMember.roleId} onChange={(e) => setNewMember((v) => ({ ...v, roleId: e.target.value }))}>
                      <option value="">Select role</option>
                      {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
                    </select>
                    <select className="admin-input" value={newMember.passwordMode} onChange={(e) => setNewMember((v) => ({
                      ...v,
                      passwordMode: e.target.value as 'manual' | 'invite',
                      forcePasswordResetRequired: e.target.value === 'invite',
                    }))}>
                      {canManageMemberPasswords && <option value="manual">Set Password Manually</option>}
                      <option value="invite">Send Set-Password Invite</option>
                    </select>
                    {newMember.passwordMode === 'manual' ? (
                      <>
                        <input
                          className="admin-input"
                          type="password"
                          placeholder="Password"
                          value={newMember.password}
                          onChange={(e) => setNewMember((v) => ({ ...v, password: e.target.value }))}
                          minLength={8}
                        />
                        <input
                          className="admin-input"
                          type="password"
                          placeholder="Confirm password"
                          value={newMember.confirmPassword}
                          onChange={(e) => setNewMember((v) => ({ ...v, confirmPassword: e.target.value }))}
                          minLength={8}
                        />
                      </>
                    ) : (
                      <select className="admin-input" value={newMember.mode} onChange={(e) => setNewMember((v) => ({ ...v, mode: e.target.value as 'invite' | 'without_send' | 'draft' }))}>
                        <option value="invite">Create &amp; Send Invite</option>
                        <option value="without_send">Create Without Sending</option>
                        <option value="draft">Save Draft Invite</option>
                      </select>
                    )}
                    <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 md:col-span-2">
                      <input
                        type="checkbox"
                        checked={newMember.forcePasswordResetRequired}
                        onChange={(e) => setNewMember((v) => ({ ...v, forcePasswordResetRequired: e.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Force password reset on first login
                    </label>
                    <textarea className="admin-input md:col-span-2" rows={2} placeholder="Notes" value={newMember.notes} onChange={(e) => setNewMember((v) => ({ ...v, notes: e.target.value }))} />
                    <div className="flex gap-2 md:col-span-2">
                      <button onClick={handleCreateMember} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"><Send className="h-4 w-4" /> Create</button>
                      <button onClick={() => setShowCreateForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredMembers.map((member) => {
                const displayName = member.full_name || member.fullName || member.email;
                return (
                  <div key={member._id} className="group relative cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900 focus-within:ring-2 focus-within:ring-indigo-500" role="group" tabIndex={0} onClick={() => navigate(`${ADMIN_PATHS.teamMembers}/${member._id}`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`${ADMIN_PATHS.teamMembers}/${member._id}`); } }}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        {getInitials(displayName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">{displayName}</p>
                        <p className="truncate text-xs text-slate-500">{member.email}</p>
                      </div>
                      {canCreateTeam && (
                        <div className="relative" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <button onClick={() => setActionMenuId(actionMenuId === member._id ? null : member._id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {actionMenuId === member._id && (
                            <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                              <button onClick={() => { handleMemberAction(member._id, 'activate'); setActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"><UserCheck className="h-3.5 w-3.5 text-emerald-600" /> Activate</button>
                              <button onClick={() => { handleMemberAction(member._id, 'suspend'); setActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"><UserX className="h-3.5 w-3.5 text-amber-600" /> Suspend</button>
                              {canManageMemberPasswords && (
                                <button onClick={() => { handleMemberAction(member._id, 'reset'); setActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"><KeyRound className="h-3.5 w-3.5 text-indigo-600" /> Send Reset Link</button>
                              )}
                              <button onClick={() => { handleMemberAction(member._id, 'revoke'); setActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"><Lock className="h-3.5 w-3.5 text-rose-600" /> Revoke Sessions</button>
                              <button onClick={() => { handleMemberAction(member._id, 'resend'); setActionMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"><Mail className="h-3.5 w-3.5 text-cyan-600" /> Resend Invite</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"><Shield className="h-3 w-3" /> {getRoleName(member)}</span>
                      <StatusBadge status={member.status || 'active'} />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">Last login: {member.lastLoginAtUTC ? relativeTime(member.lastLoginAtUTC) : 'Never'}</p>
                  </div>
                );
              })}
              {filteredMembers.length === 0 && !loading && (
                <div className="col-span-full rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  <Users className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  {search ? 'No members match your search' : 'No team members yet'}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ ROLES ═══ */}
        {view === 'roles' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {canCreateTeam && (
                <button onClick={() => setShowCreateForm((v) => !v)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500">
                  <Plus className="h-4 w-4" /> Create Role
                </button>
              )}
            </div>

            <AnimatePresence>
              {showCreateForm && canCreateTeam && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-2">
                    <input className="admin-input" placeholder="Role name" value={newRole.name} onChange={(e) => setNewRole((v) => ({ ...v, name: e.target.value }))} />
                    <input className="admin-input" placeholder="Description" value={newRole.description} onChange={(e) => setNewRole((v) => ({ ...v, description: e.target.value }))} />
                    <select className="admin-input" value={newRole.basePlatformRole} onChange={(e) => setNewRole((v) => ({ ...v, basePlatformRole: e.target.value }))}>
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="moderator">moderator</option>
                      <option value="admin">admin</option>
                      <option value="support_agent">support_agent</option>
                      <option value="finance_agent">finance_agent</option>
                    </select>
                    <select className="admin-input" value={newRole.cloneFromRoleId} onChange={(e) => setNewRole((v) => ({ ...v, cloneFromRoleId: e.target.value }))}>
                      <option value="">Clone from (optional)</option>
                      {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
                    </select>
                    <div className="flex gap-2 md:col-span-2">
                      <button onClick={handleCreateRole} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"><Plus className="h-4 w-4" /> Create</button>
                      <button onClick={() => setShowCreateForm(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roles.map((role) => (
                <div key={role._id} className={`cursor-pointer rounded-2xl border border-slate-200 border-l-4 p-4 transition-shadow hover:shadow-md dark:border-slate-700 focus-within:ring-2 focus-within:ring-indigo-500 ${ROLE_COLORS[role.name] || 'border-l-slate-400 bg-white dark:bg-slate-900'}`} role="group" tabIndex={0} onClick={() => navigate(`${ADMIN_PATHS.teamRoles}/${role._id}`)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`${ADMIN_PATHS.teamRoles}/${role._id}`); } }}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400">{role.name}</h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{role.description || 'No description'}</p>
                    </div>
                    {role.isSystemRole && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">System</span>}
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {role.totalUsers ?? 0} users</span>
                    <span>
                      {Object.values(role.modulePermissions || {}).filter((moduleActions) => Object.values(moduleActions || {}).some(Boolean)).length} modules
                    </span>
                    <span>
                      {Object.values(role.modulePermissions || {}).reduce((total, moduleActions) => (
                        total + Object.values(moduleActions || {}).filter(Boolean).length
                      ), 0)} perms
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
                      onClick={() => navigate(`${ADMIN_PATHS.teamRoles}/${role._id}`)}
                    >
                      View Permissions
                    </button>
                    {canCreateTeam && <button className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800" onClick={async () => { await teamApi.duplicateRole(role._id); toast.success('Role duplicated'); await loadRoles(); }}><Copy className="h-3 w-3" /> Duplicate</button>}
                    {!role.isSystemRole && canDeleteTeam && <button className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/20" onClick={async () => { const userCount = role.totalUsers ?? 0; const confirmed = await showConfirmDialog({ title: `Archive role "${role.name}"?`, message: userCount > 0 ? `This role has ${userCount} assigned member${userCount === 1 ? '' : 's'}. They will become unassigned. This action cannot be undone.` : 'This will archive the role. This action cannot be undone.', confirmLabel: 'Archive', tone: 'danger' }); if (!confirmed) return; await teamApi.deleteRole(role._id); toast.success('Role archived'); await loadRoles(); }}><Trash2 className="h-3 w-3" /> Archive</button>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══ PERMISSIONS MATRIX ═══ */}
        {view === 'permissions' && (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <select className="admin-input max-w-xs" value={selectedRoleId} onChange={async (e) => {
                const nextRoleId = e.target.value;
                setSelectedRoleId(nextRoleId);
                try {
                  const res = await teamApi.getPermissions();
                  const role = (res.data.roles || []).find((item) => item._id === nextRoleId);
                  setMatrix(role?.permissions || emptyPermissions(res.data.modules || []));
                  setMatrixModules(res.data.modules || []);
                  setMatrixActions(res.data.actions || []);
                } catch {
                  toast.error('Failed to load role matrix');
                }
              }}>
                <option value="">Select role</option>
                {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
              </select>
              {isSuperAdmin && (
                <>
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500" onClick={handleSaveMatrix}><CheckCircle2 className="h-4 w-4" /> Save</button>
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => { const full: ModulePermissionMap = {}; matrixModules.forEach(m => { full[m] = {}; matrixActions.forEach(a => { full[m][a] = true; }); }); setMatrix(full); }}>Enable All</button>
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setMatrix(emptyPermissions(matrixModules))}>Disable All</button>
                </>
              )}
              {!isSuperAdmin && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                  Permissions matrix is view-only for non-superadmin accounts.
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-semibold dark:bg-slate-800/60">Module</th>
                    {matrixActions.map((action) => <th key={action} className="px-2 py-2.5 text-center text-[11px] font-medium capitalize">{action.replace(/_/g, ' ')}</th>)}
                    <th className="px-2 py-2.5 text-center text-[11px] font-medium">Row</th>
                  </tr>
                </thead>
                <tbody>
                  {matrixModules.map((moduleName) => (
                    <tr key={moduleName} className="border-t border-slate-100 hover:bg-slate-50/50 dark:border-slate-800 dark:hover:bg-slate-800/30">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-medium capitalize dark:bg-slate-900">{moduleName.replace(/_/g, ' ')}</td>
                      {matrixActions.map((action) => (
                        <td key={`${moduleName}-${action}`} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600"
                            checked={Boolean(matrix[moduleName]?.[action])}
                            disabled={!isSuperAdmin}
                            onChange={(e) => {
                              setMatrix((prev) => ({
                                ...prev,
                                [moduleName]: {
                                  ...(prev[moduleName] || {}),
                                  [action]: e.target.checked,
                                },
                              }));
                            }}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center">
                        {isSuperAdmin ? (
                          <button className="text-[10px] text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => { const newMap = { ...matrix }; const allOn = matrixActions.every(a => matrix[moduleName]?.[a]); newMap[moduleName] = {}; matrixActions.forEach(a => { newMap[moduleName][a] = !allOn; }); setMatrix(newMap); }}>
                            {matrixActions.every(a => matrix[moduleName]?.[a]) ? 'None' : 'All'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {view === 'approval-rules' && (
          <>
            {canCreateTeam && (
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-2">
                <input className="admin-input" placeholder="Module" value={newRule.module} onChange={(e) => setNewRule((v) => ({ ...v, module: e.target.value }))} />
                <input className="admin-input" placeholder="Action" value={newRule.action} onChange={(e) => setNewRule((v) => ({ ...v, action: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={newRule.requiresApproval} onChange={(e) => setNewRule((v) => ({ ...v, requiresApproval: e.target.checked }))} />
                  Requires approval
                </label>
                <input
                  type="number"
                  min={1}
                  className="admin-input"
                  placeholder="Required approvals"
                  value={newRule.requiredApprovals}
                  onChange={(e) => setNewRule((v) => ({ ...v, requiredApprovals: Math.max(1, Number(e.target.value || 1)) }))}
                />
                <input
                  className="admin-input md:col-span-2"
                  placeholder="Description (optional)"
                  value={newRule.description}
                  onChange={(e) => setNewRule((v) => ({ ...v, description: e.target.value }))}
                />
                <select className="admin-input" multiple value={newRule.approverRoleIds} onChange={(e) => {
                  const ids = Array.from(e.target.selectedOptions).map((item) => item.value);
                  setNewRule((v) => ({ ...v, approverRoleIds: ids }));
                }}>
                  {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
                </select>
                <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 md:col-span-2" onClick={handleCreateRule}>Create Rule</button>
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Module</th>
                    <th className="px-3 py-2 text-left">Action</th>
                    <th className="px-3 py-2 text-left">Requires</th>
                    <th className="px-3 py-2 text-left">Count</th>
                    <th className="px-3 py-2 text-left">Approvers</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule._id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">{rule.module}</td>
                      <td className="px-3 py-2">{rule.action}</td>
                      <td className="px-3 py-2">{rule.requiresApproval ? 'Yes' : 'No'}</td>
                      <td className="px-3 py-2">{rule.requiredApprovals || 1}</td>
                      <td className="px-3 py-2">{rule.approverRoleIds.map((r) => typeof r === 'string' ? r : r.name).join(', ') || '-'}</td>
                      <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{rule.description || '-'}</td>
                      <td className="px-3 py-2">
                        {canDeleteTeam ? (
                          <button className="rounded bg-rose-600 px-2 py-1 text-xs text-white" onClick={async () => { await teamApi.deleteApprovalRule(rule._id); toast.success('Rule deleted'); await loadApprovalRules(); }}>Delete</button>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══ ACTIVITY ═══ */}
        {view === 'activity' && (
          <div className="space-y-2">
            {filteredActivity.length === 0 && !loading && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <Activity className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                {search ? 'No activity matches your search' : 'No activity logs yet'}
              </div>
            )}
            {filteredActivity.map((item) => (
              <div key={item._id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-shadow hover:shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <Activity className="h-4 w-4 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900 dark:text-slate-100">
                    <span className="font-semibold">{resolveActivityActor(item)}</span>{' '}
                    <span className="text-slate-500">performed</span>{' '}
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{humanizeActivityValue(item.action)}</span>{' '}
                    <span className="text-slate-500">on</span>{' '}
                    <span className="font-medium">{humanizeActivityValue(item.module)}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    {item.kind && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">{humanizeActivityValue(item.kind)}</span>}
                    {item.actorRole && <span className="text-xs text-slate-400">{humanizeActivityValue(item.actorRole)}</span>}
                    {item.targetType && <span className="text-xs text-slate-400">{humanizeActivityValue(item.targetType)}{item.targetId ? ` / ${item.targetId}` : ''}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {item.ip && <span>IP: {item.ip}</span>}
                    {item.device && <span>{item.device}</span>}
                    {item.browser && <span>{item.browser}</span>}
                    {item.platform && <span>{item.platform}</span>}
                    {item.locationSummary && <span>{item.locationSummary}</span>}
                    {item.durationMinutes != null && <span>Duration: {item.durationMinutes}m</span>}
                    {item.loginAt && <span>Login: {formatActivityDate(item.loginAt)}</span>}
                    {item.lastActivityAt && <span>Last active: {formatActivityDate(item.lastActivityAt)}</span>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{relativeTime(item.createdAt)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ SECURITY ═══ */}
        {view === 'security' && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" /><p className="text-xs text-slate-500">Total Members</p></div>
                <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{security?.summary.total || 0}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><p className="text-xs text-slate-500">Suspended</p></div>
                <p className="mt-1 text-2xl font-bold text-amber-600">{security?.summary.suspended || 0}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-indigo-500" /><p className="text-xs text-slate-500">Password Reset Required</p></div>
                <p className="mt-1 text-2xl font-bold text-indigo-600">{security?.summary.resetRequired || 0}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-emerald-500" /><p className="text-xs text-slate-500">2FA Enabled</p></div>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{security?.summary.twoFactorEnabled || 0}</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">Member</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-3 py-2.5 text-left font-semibold">2FA</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Reset Required</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Failed Logins</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(security?.items || []).map((member) => (
                    <tr key={member._id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {getInitials(member.full_name || member.fullName || member.email)}
                          </div>
                          <span>{member.full_name || member.fullName || member.email}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2"><StatusBadge status={member.status || 'active'} /></td>
                      <td className="px-3 py-2">
                        {member.twoFactorEnabled
                          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Enabled</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-slate-400"><XCircle className="h-3.5 w-3.5" /> Disabled</span>}
                      </td>
                      <td className="px-3 py-2">{member.forcePasswordResetRequired ? <span className="text-xs text-amber-600">Yes</span> : <span className="text-xs text-slate-400">No</span>}</td>
                      <td className="px-3 py-2">{(member as any).loginAttempts ?? '-'}</td>
                      <td className="px-3 py-2">
                        {canDeleteTeam && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await teamApi.toggleMember2FA(member._id, !member.twoFactorEnabled);
                                toast.success(res.data.message || 'Done');
                                await loadSecurity();
                              } catch (err: any) {
                                toast.error(err?.response?.data?.message || 'Failed to toggle 2FA');
                              }
                            }}
                            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-white ${member.twoFactorEnabled ? 'bg-orange-600 hover:bg-orange-500' : 'bg-teal-600 hover:bg-teal-500'
                              }`}
                          >
                            <Fingerprint className="h-3 w-3" /> {member.twoFactorEnabled ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ═══ INVITES ═══ */}
        {view === 'invites' && (
          <div className="space-y-3">
            {invites.length === 0 && !loading && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
                <Send className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                No pending invites
              </div>
            )}
            {invites.map((item) => (
              <div key={item._id} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {getInitials(item.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.fullName}</p>
                  <p className="truncate text-xs text-slate-500">{item.email}</p>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"><Shield className="h-3 w-3" /> {item.roleId?.name || '-'}</span>
                </div>
                <StatusBadge status={item.status} />
                <div className="hidden shrink-0 text-right text-xs text-slate-400 md:block">
                  <p>Expires: {item.expiresAt ? relativeTime(item.expiresAt) : '-'}</p>
                  <p>By: {item.invitedBy?.full_name || item.invitedBy?.username || '-'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </AdminGuardShell>
  );
}
