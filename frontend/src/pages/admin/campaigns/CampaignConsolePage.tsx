import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import ProvidersPanel from './ProvidersPanel';
import NotificationOperationsPanel from './NotificationOperationsPanel';
import SmartTriggersPanel from './SmartTriggersPanel';
import { ADMIN_PATHS } from '../../../routes/adminPaths';
import {
  BarChart3, Send, Sparkles, Plug, Zap, Bell, ClipboardList, Settings,
  Calendar, CheckCircle, AlertTriangle, Users, Mail, MessageSquare, Smartphone,
  Search, RefreshCw, Clock, FileText, Rocket,
  Loader2, Inbox, XCircle,
} from 'lucide-react';
import {
  listCampaigns, getCampaign, previewCampaign, sendCampaign, retryCampaign,
  getDeliveryLogs, listTemplates, createTemplate, updateTemplate,
  getNotificationSettings, updateNotificationSettings, getCampaignDashboardSummary,
  type CampaignListItem, type CampaignDetail, type CampaignPreview,
  type DeliveryLog, type NotificationTemplate, type NotificationSettings, type CampaignDashboardSummary,
} from '../../../api/adminNotificationCampaignApi';
import { getStudentGroups } from '../../../api/adminStudentApi';

type Tab = 'dashboard' | 'campaigns' | 'new' | 'audiences' | 'contact' | 'templates' | 'providers' | 'triggers' | 'notifications' | 'logs' | 'settings';

const CAMPAIGN_TAB_TO_PATH: Record<Tab, string> = {
  dashboard: ADMIN_PATHS.campaignsDashboard,
  campaigns: ADMIN_PATHS.campaignsList,
  new: ADMIN_PATHS.campaignsNew,
  audiences: ADMIN_PATHS.campaignsAudiences,
  contact: ADMIN_PATHS.subscriptionContactCenter,
  templates: ADMIN_PATHS.campaignsTemplates,
  providers: ADMIN_PATHS.campaignsProviders,
  triggers: ADMIN_PATHS.campaignsTriggers,
  notifications: ADMIN_PATHS.campaignsNotifications,
  logs: ADMIN_PATHS.campaignsLogs,
  settings: ADMIN_PATHS.campaignsSettings,
};

const TAB_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: BarChart3, campaigns: Send, new: Sparkles, providers: Plug,
  triggers: Zap, notifications: Bell, logs: ClipboardList, settings: Settings,
};

const CAMPAIGN_VIEW_BUTTONS: Array<{ tab: Tab; label: string }> = [
  { tab: 'dashboard', label: 'Overview' },
  { tab: 'campaigns', label: 'Campaigns' },
  { tab: 'new', label: 'New Campaign' },
  { tab: 'providers', label: 'Providers' },
  { tab: 'triggers', label: 'Smart Triggers' },
  { tab: 'notifications', label: 'Notifications' },
  { tab: 'logs', label: 'Delivery Logs' },
  { tab: 'settings', label: 'Settings' },
];

function getTabFromPath(pathname: string, search?: string, hash?: string): Tab {
  const normalized = String(pathname || '').trim();
  const params = new URLSearchParams(search || '');
  const view = params.get('view');
  if (view && ['dashboard', 'campaigns', 'new', 'audiences', 'contact', 'templates', 'providers', 'triggers', 'notifications', 'logs', 'settings'].includes(view)) return view as Tab;
  const h = String(hash || '').replace('#', '').toLowerCase();
  if (h === 'providers') return 'providers';
  if (h === 'triggers' || h === 'smart_triggers') return 'triggers';
  if (h === 'export' || h === 'export_copy') return 'contact';
  if (normalized === ADMIN_PATHS.campaignsContactCenter || normalized === ADMIN_PATHS.subscriptionContactCenter) return 'contact';
  const match = (Object.entries(CAMPAIGN_TAB_TO_PATH) as Array<[Tab, string]>).find(([, p]) => normalized === p.split('?')[0].split('#')[0] && !p.includes('?') && !p.includes('#'));
  return match?.[0] ?? 'dashboard';
}

export default function CampaignConsolePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = getTabFromPath(location.pathname, location.search, location.hash);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  const qc = useQueryClient();

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, show: false })), 3000);
  };

  const navigateToTab = (nextTab: Tab) => {
    if (nextTab !== 'campaigns') setSelectedCampaignId(null);
    const rawPath = CAMPAIGN_TAB_TO_PATH[nextTab];
    const [pathnameAndQuery, hash] = rawPath.split('#');
    const [pathname, search] = pathnameAndQuery.split('?');
    navigate({ pathname, search: search ? `?${search}` : '', hash: hash ? '#' + hash : '' });
  };

  return (
    <AdminGuardShell title="Communication Hub" description="Unified messaging center — campaigns, smart triggers, providers, audience export, and delivery logs." requiredModule="notifications">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition-all duration-300 ${toast.type === 'success' ? 'bg-emerald-600/95 shadow-emerald-500/20' : 'bg-red-600/95 shadow-red-500/20'}`}>
          <span className="text-base">{toast.type === 'success' ? '✓' : '✕'}</span> {toast.message}
        </div>
      )}
      <CampaignViewNav activeTab={tab} onNavigate={navigateToTab} />
      {tab === 'dashboard' && <DashboardPanel onNavigate={navigateToTab} />}
      {tab === 'campaigns' && <CampaignsListPanel onView={(id: string) => setSelectedCampaignId(id)} onRetry={(id: string) => retryCampaign(id).then(() => { showToast('Retry initiated'); qc.invalidateQueries({ queryKey: ['campaigns'] }); }).catch(() => showToast('Retry failed', 'error'))} />}
      {tab === 'new' && <NewCampaignPanel showToast={showToast} onSent={() => { navigateToTab('campaigns'); qc.invalidateQueries({ queryKey: ['campaigns'] }); }} />}
      {tab === 'audiences' && <Navigate to={`${ADMIN_PATHS.subscriptionContactCenter}?tab=members`} replace />}
      {tab === 'contact' && <Navigate to={`${ADMIN_PATHS.subscriptionContactCenter}?tab=${(location.hash === '#export' || location.hash === '#export_copy') ? 'export' : 'overview'}`} replace />}
      {tab === 'templates' && <TemplatesPanel showToast={showToast} />}
      {tab === 'providers' && <ProvidersPanel showToast={showToast} />}
      {tab === 'triggers' && <SmartTriggersPanel showToast={showToast} />}
      {tab === 'notifications' && <NotificationOperationsPanel onNavigate={navigateToTab} showToast={showToast} />}
      {tab === 'logs' && <LogsPanel />}
      {tab === 'settings' && <SettingsPanel showToast={showToast} />}
      {selectedCampaignId && <CampaignDetailModal id={selectedCampaignId} onClose={() => setSelectedCampaignId(null)} />}
    </AdminGuardShell>
  );
}

/* ─── Enhanced Nav ────────────────────────────────── */
function CampaignViewNav({ activeTab, onNavigate }: { activeTab: Tab; onNavigate: (tab: Tab) => void }) {
  return (
    <div className="mb-6 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/80 p-1.5 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-900/80">
      <div className="flex min-w-max items-center gap-1">
        {CAMPAIGN_VIEW_BUTTONS.map((item) => {
          const isActive = activeTab === item.tab;
          const Icon = TAB_ICON_MAP[item.tab];
          return (
            <button key={item.tab} type="button" onClick={() => onNavigate(item.tab)} aria-pressed={isActive}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${isActive ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/20' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {Icon && <Icon className="h-3.5 w-3.5" />} {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Enhanced Dashboard Panel ────────────────────── */
function DashboardPanel({ onNavigate }: { onNavigate: (t: Tab) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['campaign-dashboard-summary'], queryFn: getCampaignDashboardSummary });
  const summary = data as CampaignDashboardSummary | undefined;
  const campaignsQuery = useQuery({ queryKey: ['campaigns', { page: 1, limit: 5 }], queryFn: () => listCampaigns({ page: 1, limit: 5 }) });
  const campaigns = (campaignsQuery.data?.items ?? []) as CampaignListItem[];

  const totalSent = (summary?.totals.completedCount ?? 0);
  const totalFailed = (summary?.totals.failedCount ?? 0);
  const successRate = totalSent + totalFailed > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 100;

  const statCards: Array<{ label: string; value: number; icon: React.ComponentType<{ className?: string }>; gradient: string; bg: string }> = [
    { label: 'Total Campaigns', value: summary?.totals.totalCampaigns ?? 0, icon: Send, gradient: 'from-indigo-500 to-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
    { label: 'Scheduled Queue', value: summary?.totals.scheduledCount ?? 0, icon: Calendar, gradient: 'from-sky-500 to-cyan-600', bg: 'bg-sky-50 dark:bg-sky-950/30' },
    { label: 'Sent Today', value: summary?.totals.sentToday ?? 0, icon: CheckCircle, gradient: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
    { label: 'Failed Today', value: summary?.totals.failedToday ?? 0, icon: AlertTriangle, gradient: 'from-rose-500 to-red-600', bg: 'bg-rose-50 dark:bg-rose-950/30' },
    { label: 'Active Triggers', value: summary?.totals.activeTriggers ?? 0, icon: Zap, gradient: 'from-amber-500 to-orange-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
    { label: 'Active Subscribers', value: summary?.audience.activeCount ?? 0, icon: Users, gradient: 'from-violet-500 to-purple-600', bg: 'bg-violet-50 dark:bg-violet-950/30' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {statCards.map(s => (
          <div key={s.label} className={`group relative overflow-hidden rounded-2xl ${s.bg} p-5 transition-all hover:shadow-md`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{s.label}</p>
                <p className={`mt-2 text-3xl font-bold bg-gradient-to-r ${s.gradient} bg-clip-text text-transparent`}>{isLoading ? '—' : s.value}</p>
              </div>
              <s.icon className="h-6 w-6 opacity-40 group-hover:scale-110 transition-transform text-slate-500 dark:text-slate-400" />
            </div>
          </div>
        ))}
      </div>

      {/* Success Rate + Health */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Queue & Delivery Health</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Current orchestration state across campaigns, schedules, triggers, and provider delivery.</p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-50 to-emerald-100 px-4 py-2 dark:from-emerald-950/40 dark:to-emerald-900/30">
              <div className="relative h-10 w-10">
                <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-200 dark:text-slate-700" />
                  <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${successRate}, 100`} className="text-emerald-500" strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{successRate}%</span>
              </div>
              <div className="text-xs"><p className="font-semibold text-emerald-700 dark:text-emerald-300">Success</p><p className="text-emerald-600/70 dark:text-emerald-400/70">Rate</p></div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Processing</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary?.totals.processingCount ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Queued: {summary?.totals.queuedCount ?? 0} · Completed: {summary?.totals.completedCount ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Providers</p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{summary?.totals.activeProviders ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">Failed: {summary?.totals.failedProviders ?? 0}</p>
            </div>
          </div>
          {/* Upcoming Jobs */}
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200"><Calendar className="h-4 w-4 inline mr-1" />Upcoming Scheduled Jobs</h4>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(summary?.upcomingJobs ?? []).length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-400">{isLoading ? 'Loading...' : 'No scheduled jobs queued right now.'}</div>
              ) : (summary?.upcomingJobs ?? []).map((job, i) => (
                <div key={`${job._id || i}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">{String(job.campaignName || 'Untitled schedule')}</div>
                    <div className="text-xs text-slate-500">{String(job.channel || 'sms')} · {Number(job.totalTargets || 0)} targets</div>
                  </div>
                  <div className="text-xs text-slate-500">{job.scheduledAtUTC ? new Date(String(job.scheduledAtUTC)).toLocaleString() : '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100"><Plug className="h-4 w-4 inline mr-1" />Provider Health</h3>
            <div className="mt-4 space-y-3">
              {(summary?.providerHealth ?? []).slice(0, 4).map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.type} · {p.provider}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${p.failureRate >= 50 ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300' : p.failureRate >= 20 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>
                      {p.failureRate}% fail
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className={`h-1.5 rounded-full transition-all ${p.failureRate >= 50 ? 'bg-rose-500' : p.failureRate >= 20 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(100 - p.failureRate, 5)}%` }} />
                  </div>
                </div>
              ))}
              {(summary?.providerHealth ?? []).length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No providers configured.</div>}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100"><XCircle className="h-4 w-4 inline mr-1 text-rose-500" />Recent Failures</h3>
            <div className="mt-4 space-y-3">
              {(summary?.recentFailures ?? []).slice(0, 4).map((f, i) => (
                <div key={`${f._id || i}`} className="rounded-2xl border border-rose-100 bg-rose-50/50 p-3 text-xs dark:border-rose-900/30 dark:bg-rose-950/20">
                  <div className="font-semibold text-slate-800 dark:text-slate-100">{String(f.providerUsed || 'Unknown provider')}</div>
                  <div className="mt-1 text-slate-500">{String(f.originModule || 'campaign')} · {f.createdAt ? new Date(String(f.createdAt)).toLocaleString() : '-'}</div>
                </div>
              ))}
              {(summary?.recentFailures ?? []).length === 0 && <div className="text-sm text-slate-400 py-4 text-center">No recent failures.</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'New Campaign', desc: 'Create and send a new campaign', icon: Sparkles, tab: 'new' as Tab, gradient: 'from-indigo-600 to-indigo-500' },
          { label: 'View All', desc: 'Browse all campaign history', icon: Send, tab: 'campaigns' as Tab, gradient: 'from-slate-600 to-slate-500' },
          { label: 'Contact Center', desc: 'Manage subscription audiences', icon: Users, tab: 'contact' as Tab, gradient: 'from-cyan-600 to-cyan-500' },
          { label: 'Manage Triggers', desc: 'Configure auto-triggers', icon: Zap, tab: 'triggers' as Tab, gradient: 'from-amber-600 to-amber-500' },
        ].map(a => (
          <button key={a.label} onClick={() => onNavigate(a.tab)} className={`group rounded-2xl bg-gradient-to-r ${a.gradient} p-5 text-left text-white shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5`}>
            <a.icon className="h-6 w-6" />
            <p className="mt-2 text-sm font-bold">{a.label}</p>
            <p className="mt-0.5 text-xs text-white/70">{a.desc}</p>
          </button>
        ))}
      </div>

      {/* Recent Campaigns */}
      {campaigns.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200"><Send className="h-4 w-4 inline mr-1" />Recent Campaigns</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {campaigns.slice(0, 5).map(c => (
              <div key={c._id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm ${c.channelType === 'email' ? 'bg-blue-100 dark:bg-blue-950/30' : c.channelType === 'both' ? 'bg-purple-100 dark:bg-purple-950/30' : 'bg-green-100 dark:bg-green-950/30'}`}>
                    {c.channelType === 'email' ? <Mail className="h-4 w-4 text-blue-500" /> : c.channelType === 'both' ? <Smartphone className="h-4 w-4 text-purple-500" /> : <MessageSquare className="h-4 w-4 text-green-500" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{c.campaignName || 'Untitled'}</p>
                    <p className="text-xs text-slate-500">{c.channelType} · {new Date(c.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : c.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Enhanced Campaigns List Panel ───────────────── */
function CampaignsListPanel({ onView, onRetry }: { onView: (id: string) => void; onRetry: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['campaigns', { page }], queryFn: () => listCampaigns({ page, limit: 20 }) });
  const campaigns = (data?.items ?? []) as CampaignListItem[];
  const total = data?.total ?? campaigns.length;
  const pages = Math.ceil(total / 20);

  const filtered = useMemo(() => {
    let list = campaigns;
    if (statusFilter) list = list.filter(c => c.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c => (c.campaignName || '').toLowerCase().includes(q) || c.channelType.toLowerCase().includes(q));
    }
    return list;
  }, [campaigns, statusFilter, search]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns..." className="w-full bg-transparent text-sm outline-none text-slate-800 dark:text-slate-200" />
        </div>
        <div className="flex gap-1.5">
          {['', 'completed', 'pending', 'failed'].map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${statusFilter === s ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
              {s ? `${s.charAt(0).toUpperCase() + s.slice(1)}` : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <th className="px-5 py-3.5">Campaign</th><th className="px-5 py-3.5">Channel</th><th className="px-5 py-3.5">Audience</th>
              <th className="px-5 py-3.5">Sent</th><th className="px-5 py-3.5">Failed</th><th className="px-5 py-3.5">Cost</th>
              <th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Date</th><th className="px-5 py-3.5">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                <div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading campaigns...</div>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                <Inbox className="h-8 w-8 mx-auto mb-2 text-slate-300" />No campaigns found
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs ${c.channelType === 'email' ? 'bg-blue-100 dark:bg-blue-950/30' : 'bg-green-100 dark:bg-green-950/30'}`}>
                      {c.channelType === 'email' ? <Mail className="h-4 w-4 text-blue-500" /> : <MessageSquare className="h-4 w-4 text-green-500" />}
                    </div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{c.campaignName || 'Untitled'}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5"><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-slate-800">{c.channelType}</span></td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{c.audienceType}</td>
                <td className="px-5 py-3.5 font-medium text-emerald-600">{c.sentCount ?? 0}</td>
                <td className="px-5 py-3.5 font-medium text-red-600">{c.failedCount ?? 0}</td>
                <td className="px-5 py-3.5 font-medium">৳{(c.actualCost ?? c.estimatedCost ?? 0).toFixed(2)}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : c.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1.5">
                    <button onClick={() => onView(c._id)} className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:hover:bg-indigo-900/40 transition-colors">View</button>
                    {(c.failedCount ?? 0) > 0 && (
                      <button onClick={() => onRetry(c._id)} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40 transition-colors">Retry</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors">← Prev</button>
          <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}

/* ─── Enhanced New Campaign Panel (Wizard) ────────── */
function NewCampaignPanel({ showToast, onSent }: { showToast: (m: string, t?: 'success' | 'error') => void; onSent: () => void }) {
  const location = useLocation();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState({
    campaignName: '', channelType: 'sms' as 'sms' | 'email' | 'both',
    audienceType: 'all' as 'all' | 'group' | 'filter' | 'manual',
    audienceRef: '', guardianTargeted: false,
    templateId: '', customBody: '', subject: '',
    audienceFilters: {} as Record<string, unknown>,
    includeUserIdsText: '', excludeUserIdsText: '',
    scheduleMode: 'now' as 'now' | 'scheduled', scheduledAtUTC: '',
  });
  const [preview, setPreview] = useState<CampaignPreview | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const state = (location.state ?? {}) as { prefillAudienceFilters?: Record<string, unknown>; prefillCampaignName?: string; prefillSelectedUserIds?: string[] };
    if (!state.prefillAudienceFilters && !state.prefillCampaignName && !state.prefillSelectedUserIds?.length) return;
    setForm(cur => ({
      ...cur, campaignName: state.prefillCampaignName || cur.campaignName,
      audienceType: state.prefillAudienceFilters ? 'filter' : cur.audienceType,
      audienceFilters: state.prefillAudienceFilters ? { ...state.prefillAudienceFilters, ...(state.prefillSelectedUserIds?.length ? { selectedUserIds: state.prefillSelectedUserIds } : {}) } : cur.audienceFilters,
      audienceRef: state.prefillAudienceFilters ? '' : cur.audienceRef,
    }));
  }, [location.state]);

  const { data: groupsData } = useQuery({ queryKey: ['student-groups'], queryFn: () => getStudentGroups() });
  const groups = (Array.isArray(groupsData?.data) ? groupsData.data : Array.isArray(groupsData?.groups) ? groupsData.groups : []) as { _id: string; name: string }[];
  const { data: templatesData } = useQuery({ queryKey: ['campaign-templates'], queryFn: () => listTemplates({ limit: 100 }) });
  const templates = (templatesData?.items ?? []) as NotificationTemplate[];
  const filteredTemplates = useMemo(() => templates.filter(t => form.channelType === 'both' || t.channel === form.channelType), [templates, form.channelType]);
  const includeUserIds = useMemo(() => form.includeUserIdsText.split(/[\s,]+/).filter(Boolean), [form.includeUserIdsText]);
  const excludeUserIds = useMemo(() => form.excludeUserIdsText.split(/[\s,]+/).filter(Boolean), [form.excludeUserIdsText]);
  const lockedSelectedUserIds = useMemo(() => { const raw = form.audienceFilters?.selectedUserIds; return Array.isArray(raw) ? raw.map(v => String(v)).filter(Boolean) : []; }, [form.audienceFilters]);

  const handlePreview = async () => {
    try {
      const res = await previewCampaign({ channelType: form.channelType, audienceType: form.audienceType, audienceRef: form.audienceRef || undefined, audienceFilters: form.audienceType === 'filter' ? form.audienceFilters : undefined, includeUserIds, excludeUserIds, guardianTargeted: form.guardianTargeted, templateKey: form.templateId || undefined, customBody: form.customBody || undefined, subject: form.subject || undefined });
      setPreview(res); setStep(4);
    } catch { showToast('Preview failed', 'error'); }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      await sendCampaign({ campaignName: form.campaignName, channelType: form.channelType, audienceType: form.audienceType, audienceRef: form.audienceRef || undefined, audienceFilters: form.audienceType === 'filter' ? form.audienceFilters : undefined, includeUserIds, excludeUserIds, guardianTargeted: form.guardianTargeted, templateKey: form.templateId || undefined, customBody: form.customBody || undefined, subject: form.subject || undefined, scheduledAtUTC: form.scheduleMode === 'scheduled' && form.scheduledAtUTC ? form.scheduledAtUTC : undefined });
      showToast('Campaign sent successfully!'); onSent();
    } catch { showToast('Send failed', 'error'); } finally { setSending(false); }
  };

  const fc = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 transition-all';
  const lc = 'block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5';
  const stepLabels = ['Audience', 'Content', 'Delivery', 'Review & Send'];
  const StepIcons = [Users, FileText, Rocket, CheckCircle];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Enhanced Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3, 4].map(s => (
          <React.Fragment key={s}>
            <button onClick={() => s < step ? setStep(s as 1 | 2 | 3 | 4) : undefined} className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${step >= s ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'} ${s < step ? 'cursor-pointer hover:bg-indigo-700' : ''}`}>
              <span>{React.createElement(StepIcons[s - 1], { className: 'h-4 w-4' })}</span> {stepLabels[s - 1]}
            </button>
            {s < 4 && <div className={`h-0.5 w-6 rounded-full ${step > s ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Audience */}
      {step === 1 && (
        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Select Audience</h3></div>
          <div><label className={lc}>Campaign Name</label><input value={form.campaignName} onChange={e => setForm(p => ({ ...p, campaignName: e.target.value }))} className={fc} placeholder="e.g. Exam Reminder Batch A" /></div>
          <div><label className={lc}>Channel</label>
            <div className="flex gap-2">
              {(['sms', 'email', 'both'] as const).map(ch => (
                <button key={ch} onClick={() => setForm(p => ({ ...p, channelType: ch }))} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${form.channelType === ch ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {ch === 'sms' ? 'SMS' : ch === 'email' ? 'Email' : 'Both'}
                </button>
              ))}
            </div>
          </div>
          <div><label className={lc}>Audience Type</label><select value={form.audienceType} onChange={e => setForm(p => ({ ...p, audienceType: e.target.value as typeof form.audienceType }))} className={fc}><option value="all">All Students</option><option value="group">Student Group</option><option value="filter">Custom Filter</option><option value="manual">Manual List</option></select></div>
          {form.audienceType === 'group' && (<div><label className={lc}>Select Group</label><select value={form.audienceRef} onChange={e => setForm(p => ({ ...p, audienceRef: e.target.value }))} className={fc}><option value="">Choose a group...</option>{groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}</select></div>)}
          {form.audienceType === 'filter' && (<div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/40 dark:text-indigo-200">Prefilled from Subscription Contact Center.{lockedSelectedUserIds.length > 0 ? ` Locked to ${lockedSelectedUserIds.length} member${lockedSelectedUserIds.length === 1 ? '' : 's'}.` : ''}</div>)}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={lc}>Include user IDs</label><textarea value={form.includeUserIdsText} onChange={e => setForm(p => ({ ...p, includeUserIdsText: e.target.value }))} className={fc + ' min-h-[80px]'} placeholder="Comma or newline separated" /></div>
            <div><label className={lc}>Exclude user IDs</label><textarea value={form.excludeUserIdsText} onChange={e => setForm(p => ({ ...p, excludeUserIdsText: e.target.value }))} className={fc + ' min-h-[80px]'} placeholder="Comma or newline separated" /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={form.guardianTargeted} onChange={e => setForm(p => ({ ...p, guardianTargeted: e.target.checked }))} className="rounded border-slate-300" /> Also send to guardians</label>
          <button onClick={() => setStep(2)} disabled={!form.campaignName} className="w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">Next: Content →</button>
        </div>
      )}

      {/* Step 2: Content */}
      {step === 2 && (
        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Message Content</h3></div>
          <div><label className={lc}>Use Template</label><select value={form.templateId} onChange={e => setForm(p => ({ ...p, templateId: e.target.value }))} className={fc}><option value="">Write custom message instead...</option>{filteredTemplates.map(t => <option key={t._id} value={t.templateKey}>{t.name} ({t.channel})</option>)}</select></div>
          {!form.templateId && (<>
            {(form.channelType === 'email' || form.channelType === 'both') && (<div><label className={lc}>Email Subject</label><input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className={fc} placeholder="Subject line..." /></div>)}
            <div>
              <div className="flex items-center justify-between mb-1.5"><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Message Body</label><span className="text-xs text-slate-400">{form.customBody.length} chars</span></div>
              <textarea value={form.customBody} onChange={e => setForm(p => ({ ...p, customBody: e.target.value }))} className={fc + ' min-h-[120px]'} placeholder="Use {student_name}, {phone}, etc. for variables..." />
              <div className="mt-2 flex flex-wrap gap-1.5">{['{student_name}', '{phone}', '{email}', '{plan_name}', '{expiry_date}'].map(v => (<button key={v} type="button" onClick={() => setForm(p => ({ ...p, customBody: p.customBody + v }))} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 dark:bg-slate-800 dark:text-slate-400 transition-colors">{v}</button>))}</div>
            </div>
          </>)}
          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 transition-colors">← Back</button>
            <button onClick={() => setStep(3)} disabled={!form.templateId && !form.customBody} className="flex-1 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">Preview & Estimate →</button>
          </div>
        </div>
      )}

      {/* Step 3: Delivery */}
      {step === 3 && (
        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Delivery Options</h3></div>
          <div className="flex gap-2">
            {(['now', 'scheduled'] as const).map(m => (
              <button key={m} onClick={() => setForm(p => ({ ...p, scheduleMode: m }))} className={`flex-1 rounded-xl py-3 text-sm font-semibold transition-all ${form.scheduleMode === m ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>
                {m === 'now' ? 'Send Now' : 'Schedule'}
              </button>
            ))}
          </div>
          {form.scheduleMode === 'scheduled' && (<div><label className={lc}>Scheduled date and time</label><input type="datetime-local" value={form.scheduledAtUTC} onChange={e => setForm(p => ({ ...p, scheduledAtUTC: e.target.value }))} className={fc} /></div>)}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">ℹ️ Retry, quiet hours, and queue defaults come from Communication Hub settings and Smart Triggers.</div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 transition-colors">← Back</button>
            <button onClick={handlePreview} className="flex-1 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors">Preview & Estimate</button>
          </div>
        </div>
      )}

      {/* Step 4: Review & Send */}
      {step === 4 && (
        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Review & Send</h3></div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Recipients', value: preview?.recipientCount ?? 0, icon: Users, color: 'text-indigo-600' },
              { label: 'Est. Cost', value: `৳${(preview?.estimatedCost ?? 0).toFixed(2)}`, icon: BarChart3, color: 'text-amber-600' },
              { label: 'Channel', value: form.channelType.toUpperCase(), icon: Send, color: 'text-slate-800 dark:text-white' },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800 text-center">
                <s.icon className="h-6 w-6 mx-auto text-slate-400" />
                <p className="mt-1 text-xs font-medium text-slate-500">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          {preview?.sampleRendered && (
            <div><p className="mb-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 flex items-center gap-1.5"><FileText className="h-4 w-4" />Sample Message</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {preview.sampleRendered?.subject && <p className="mb-1 font-semibold">{preview.sampleRendered.subject}</p>}
                {preview.sampleRendered?.body}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"><ClipboardList className="h-4 w-4" />Summary</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              <li>Campaign: <strong className="text-slate-700 dark:text-slate-200">{form.campaignName}</strong></li>
              <li>Audience: <strong className="text-slate-700 dark:text-slate-200">{form.audienceType}</strong></li>
              <li>Locked from Contact Center: <strong className="text-slate-700 dark:text-slate-200">{lockedSelectedUserIds.length}</strong></li>
              <li>Guardian: <strong className="text-slate-700 dark:text-slate-200">{form.guardianTargeted ? 'Yes' : 'No'}</strong></li>
              <li>Content: <strong className="text-slate-700 dark:text-slate-200">{form.templateId ? 'Template' : 'Custom'}</strong></li>
              <li>Schedule: <strong className="text-slate-700 dark:text-slate-200">{form.scheduleMode === 'scheduled' && form.scheduledAtUTC ? new Date(form.scheduledAtUTC).toLocaleString() : 'Send now'}</strong></li>
            </ul>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 transition-colors">← Back</button>
            <button onClick={handleSend} disabled={sending} className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-3 text-sm font-bold text-white hover:from-emerald-700 hover:to-emerald-600 disabled:opacity-50 shadow-lg shadow-emerald-500/20 transition-all">
              {sending ? 'Sending...' : 'Launch Campaign'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Enhanced Templates Panel ────────────────────── */
function TemplatesPanel({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['campaign-templates'], queryFn: () => listTemplates({ limit: 100 }) });
  const templates = (data?.items ?? []) as NotificationTemplate[];
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<NotificationTemplate | null>(null);
  const [form, setForm] = useState({ templateKey: '', name: '', channel: 'sms', subject: '', body: '', htmlBody: '', bodyFormat: 'plain' as 'plain' | 'html', category: 'campaign' });

  const saveMut = useMutation({
    mutationFn: (v: { id?: string; data: Record<string, unknown> }) => v.id ? updateTemplate(v.id, v.data) : createTemplate(v.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign-templates'] }); showToast('Template saved'); setEditing(null); setCreating(false); },
    onError: () => showToast('Save failed', 'error'),
  });

  const startCreate = () => { setForm({ templateKey: '', name: '', channel: 'sms', subject: '', body: '', htmlBody: '', bodyFormat: 'plain', category: 'campaign' }); setCreating(true); setEditing(null); };
  const startEdit = (t: NotificationTemplate) => { setForm({ templateKey: t.templateKey, name: t.name, channel: t.channel, subject: t.subject ?? '', body: t.body, htmlBody: t.htmlBody ?? '', bodyFormat: t.bodyFormat ?? 'plain', category: t.category ?? 'campaign' }); setEditing(t); setCreating(false); };
  const duplicateTemplate = (t: NotificationTemplate) => { setForm({ templateKey: t.templateKey + '_copy', name: t.name + ' (Copy)', channel: t.channel, subject: t.subject ?? '', body: t.body, htmlBody: t.htmlBody ?? '', bodyFormat: t.bodyFormat ?? 'plain', category: t.category ?? 'campaign' }); setCreating(true); setEditing(null); };

  const fc = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 transition-all';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><FileText className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Templates</h3><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800">{templates.length}</span></div>
        <button onClick={startCreate} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm">+ New Template</button>
      </div>
      {(creating || editing) && (
        <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-slate-900 space-y-3 border-l-4 border-indigo-500">
          <h4 className="font-bold text-slate-800 dark:text-white">{editing ? 'Edit Template' : 'New Template'}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={fc} placeholder="Template Name" />
            <input value={form.templateKey} onChange={e => setForm(p => ({ ...p, templateKey: e.target.value }))} className={fc} placeholder="Template Key (e.g. EXAM_REMINDER)" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value }))} className={fc}><option value="sms">SMS</option><option value="email">Email</option></select>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={fc}>{['account', 'password', 'subscription', 'payment', 'exam', 'result', 'news', 'resource', 'support', 'campaign', 'guardian', 'other'].map(c => <option key={c} value={c}>{c}</option>)}</select>
          </div>
          {form.channel === 'email' && <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} className={fc} placeholder="Email Subject" />}
          {/* Body format toggle for email */}
          {form.channel === 'email' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Format:</span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                <button type="button" onClick={() => setForm(p => ({ ...p, bodyFormat: 'plain' }))} className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${form.bodyFormat === 'plain' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'}`}>Plain Text</button>
                <button type="button" onClick={() => setForm(p => ({ ...p, bodyFormat: 'html' }))} className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${form.bodyFormat === 'html' ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500'}`}>HTML Design</button>
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-slate-500">{form.bodyFormat === 'html' ? 'Plain Text Fallback' : 'Message Body'}</span><span className="text-xs text-slate-400">{form.body.length} chars</span></div>
            <textarea value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} className={fc + ' min-h-[80px]'} placeholder={form.bodyFormat === 'html' ? 'Plain text version for SMS or email clients that don\'t support HTML...' : 'Message body with {placeholders}...'} />
            <div className="mt-2 flex flex-wrap gap-1">{['{student_name}', '{phone}', '{email}', '{plan_name}', '{expiry_date}'].map(v => (<button key={v} type="button" onClick={() => setForm(p => ({ ...p, body: p.body + v }))} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 dark:bg-slate-800 transition-colors">{v}</button>))}</div>
          </div>
          {/* HTML Body Editor */}
          {form.channel === 'email' && form.bodyFormat === 'html' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500">HTML Email Body</span>
                  <span className="text-xs text-slate-400">{form.htmlBody.length} chars</span>
                </div>
                <textarea value={form.htmlBody} onChange={e => setForm(p => ({ ...p, htmlBody: e.target.value }))} className={fc + ' min-h-[200px] font-mono text-xs'} placeholder={'<!DOCTYPE html>\n<html>\n<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">\n  <div style="background: #4f46e5; padding: 24px; text-align: center;">\n    <h1 style="color: white; margin: 0;">CampusWay</h1>\n  </div>\n  <div style="padding: 24px;">\n    <p>Hi {student_name},</p>\n    <p>Your message here...</p>\n  </div>\n</body>\n</html>'} />
                <div className="mt-2 flex flex-wrap gap-1">
                  {['{student_name}', '{phone}', '{email}', '{plan_name}', '{expiry_date}', '{exam_title}', '{url}'].map(v => (<button key={v} type="button" onClick={() => setForm(p => ({ ...p, htmlBody: p.htmlBody + v }))} className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 dark:bg-slate-800 transition-colors">{v}</button>))}
                </div>
              </div>
              {/* Quick HTML presets */}
              <div>
                <span className="text-xs font-semibold text-slate-500 mb-1.5 block">Quick Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: 'Basic', html: '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><h2 style="color:#4f46e5;">CampusWay</h2><p>Hi {student_name},</p><p>Your content here.</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"><p style="color:#94a3b8;font-size:12px;">CampusWay Team</p></body></html>' },
                    { label: 'Branded', html: '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;"><div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px;text-align:center;border-radius:0 0 16px 16px;"><h1 style="color:white;margin:0;font-size:24px;">CampusWay</h1><p style="color:rgba(255,255,255,0.8);margin:8px 0 0;">Admission prep and live updates</p></div><div style="padding:32px;background:white;margin:16px;border-radius:12px;"><p>Hi <strong>{student_name}</strong>,</p><p>Your content here.</p><a href="{url}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin-top:16px;">Take Action</a></div><div style="text-align:center;padding:16px;color:#94a3b8;font-size:12px;">CampusWay &copy; 2025</div></body></html>' },
                    { label: 'Minimal', html: '<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;color:#1e293b;"><p>Hi {student_name},</p><p>Your content here.</p><p style="margin-top:24px;">— CampusWay</p></body></html>' },
                  ].map(preset => (
                    <button key={preset.label} type="button" onClick={() => setForm(p => ({ ...p, htmlBody: preset.html }))} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition-colors">{preset.label}</button>
                  ))}
                </div>
              </div>
              {/* Live Preview */}
              {form.htmlBody.trim() && (
                <div>
                  <span className="text-xs font-semibold text-slate-500 mb-1.5 block">Live Preview</span>
                  <div className="rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700">
                    <iframe title="Email preview" srcDoc={form.htmlBody.replace(/\{(\w+)\}/g, (_, k: string) => ({ student_name: 'John Doe', email: 'john@example.com', phone: '+8801XXXXXXXXX', plan_name: 'Premium', expiry_date: '2025-12-31', exam_title: 'Sample Exam', url: '#' } as Record<string, string>)[k] || `{${k}}`)} className="w-full min-h-[300px] rounded-lg border-0" sandbox="allow-same-origin" />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setCreating(false); setEditing(null); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400 transition-colors">Cancel</button>
            <button onClick={() => saveMut.mutate({ id: editing?._id, data: form })} disabled={!form.name || !form.body} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">Save</button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700"><th className="px-5 py-3.5">Name</th><th className="px-5 py-3.5">Key</th><th className="px-5 py-3.5">Channel</th><th className="px-5 py-3.5">Format</th><th className="px-5 py-3.5">Category</th><th className="px-5 py-3.5">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (<tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400">Loading...</td></tr>) : templates.length === 0 ? (<tr><td colSpan={6} className="px-5 py-8 text-center text-slate-400"><FileText className="h-8 w-8 mx-auto mb-2 text-slate-300" />No templates yet</td></tr>) : templates.map(t => (
              <tr key={t._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-slate-800 dark:text-slate-200">{t.name}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{t.templateKey}</td>
                <td className="px-5 py-3.5"><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-slate-800">{t.channel}</span></td>
                <td className="px-5 py-3.5"><span className={`rounded-lg px-2 py-1 text-xs font-medium ${t.bodyFormat === 'html' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>{t.bodyFormat === 'html' ? 'HTML' : 'Plain'}</span></td>
                <td className="px-5 py-3.5 text-slate-500">{t.category ?? '—'}</td>
                <td className="px-5 py-3.5">
                  <div className="flex gap-1.5">
                    <button onClick={() => startEdit(t)} className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 transition-colors">Edit</button>
                    <button onClick={() => duplicateTemplate(t)} className="rounded-lg bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 transition-colors">Duplicate</button>
                    <button onClick={() => setPreviewTpl(t)} className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 transition-colors">Preview</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Preview Modal */}
      {previewTpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setPreviewTpl(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-slate-800 dark:text-white">Template Preview</h3><button onClick={() => setPreviewTpl(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button></div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Name:</span> <span className="font-medium text-slate-800 dark:text-slate-200">{previewTpl.name}</span></div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Key:</span> <span className="font-mono text-slate-800 dark:text-slate-200">{previewTpl.templateKey}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Channel:</span> <span className="text-slate-800 dark:text-slate-200">{previewTpl.channel}</span></div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Format:</span> <span className="text-slate-800 dark:text-slate-200">{previewTpl.bodyFormat === 'html' ? 'HTML' : 'Plain'}</span></div>
              </div>
              {previewTpl.subject && <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Subject:</span> <span className="text-slate-800 dark:text-slate-200">{previewTpl.subject}</span></div>}
              {/* HTML Preview */}
              {previewTpl.bodyFormat === 'html' && previewTpl.htmlBody ? (
                <div>
                  <span className="text-xs font-semibold text-slate-500 block mb-2">HTML Preview:</span>
                  <div className="rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700">
                    <iframe title="Template preview" srcDoc={previewTpl.htmlBody.replace(/\{(\w+)\}/g, (_, k: string) => ({ student_name: 'John Doe', email: 'john@example.com', phone: '+8801XXXXXXXXX', plan_name: 'Premium', expiry_date: '2025-12-31' } as Record<string, string>)[k] || `{${k}}`)} className="w-full min-h-[250px] rounded-lg border-0" sandbox="allow-same-origin" />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500 block mb-2">Body:</span><p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">{previewTpl.body}</p></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Enhanced Delivery Logs Panel ────────────────── */
function LogsPanel() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['delivery-logs', { page, status: statusFilter }], queryFn: () => getDeliveryLogs({ page, limit: 30, status: statusFilter || undefined }) });
  const logs = (data?.items ?? []) as DeliveryLog[];
  const total = data?.total ?? logs.length;
  const pages = Math.ceil(total / 30);

  const filtered = useMemo(() => {
    if (!channelFilter) return logs;
    return logs.filter(l => l.channel === channelFilter);
  }, [logs, channelFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
        <div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-indigo-500" /><h3 className="text-base font-bold text-slate-800 dark:text-white">Delivery Logs</h3></div>
        <div className="ml-auto flex flex-wrap gap-2">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="">All Statuses</option><option value="sent">Sent</option><option value="failed">Failed</option><option value="pending">Pending</option>
          </select>
          <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="">All Channels</option><option value="sms">SMS</option><option value="email">Email</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <th className="px-5 py-3.5">Recipient</th><th className="px-5 py-3.5">Channel</th><th className="px-5 py-3.5">Status</th><th className="px-5 py-3.5">Provider</th><th className="px-5 py-3.5">Origin</th><th className="px-5 py-3.5">Cost</th><th className="px-5 py-3.5">Date</th><th className="px-5 py-3.5"></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {isLoading ? (<tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />Loading...</td></tr>
            ) : filtered.length === 0 ? (<tr><td colSpan={8} className="px-5 py-12 text-center text-slate-400"><Inbox className="h-8 w-8 mx-auto mb-2 text-slate-300" />No logs found</td></tr>
            ) : filtered.map(l => (
              <React.Fragment key={l._id}>
                <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" onClick={() => setExpandedLog(expandedLog === l._id ? null : l._id)}>
                  <td className="px-5 py-3"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{l.recipientDisplay || l.userId}</p><p className="font-mono text-[11px] text-slate-400">{l.userId}</p></td>
                  <td className="px-5 py-3"><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-slate-800">{l.channel}</span></td>
                  <td className="px-5 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${l.status === 'sent' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : l.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700'}`}>{l.status}</span></td>
                  <td className="px-5 py-3 text-xs text-slate-500">{l.providerUsed || '—'}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{l.originModule || 'campaign'}</td>
                  <td className="px-5 py-3 font-medium">৳{l.costAmount.toFixed(2)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-5 py-3 text-xs text-slate-400">{expandedLog === l._id ? '▲' : '▼'}</td>
                </tr>
                {expandedLog === l._id && (
                  <tr><td colSpan={8} className="bg-slate-50 px-5 py-4 dark:bg-slate-800/50">
                    <div className="grid gap-3 sm:grid-cols-3 text-xs">
                      <div><span className="font-semibold text-slate-500">Template:</span> <span className="font-mono text-slate-700 dark:text-slate-300">{l.templateKey || (l.messageMode === 'custom' ? 'CUSTOM' : '—')}</span></div>
                      <div><span className="font-semibold text-slate-500">Retries:</span> <span className="text-slate-700 dark:text-slate-300">{l.retryCount}</span></div>
                      <div><span className="font-semibold text-slate-500">Guardian:</span> <span className="text-slate-700 dark:text-slate-300">{l.guardianTargeted ? '✓ Yes' : '— No'}</span></div>
                      <div><span className="font-semibold text-slate-500">Recipient Mode:</span> <span className="text-slate-700 dark:text-slate-300">{l.guardianTargeted ? 'guardian' : (l.recipientMode || 'student')}</span></div>
                      <div><span className="font-semibold text-slate-500">Origin Entity:</span> <span className="font-mono text-slate-700 dark:text-slate-300">{l.originEntityId || '—'}</span></div>
                      {l.providerResponse && <div className="sm:col-span-3"><span className="font-semibold text-slate-500">Provider Response:</span> <span className="text-slate-700 dark:text-slate-300">{l.providerResponse}</span></div>}
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors">← Prev</button>
          <span className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">Page {page} of {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}

/* ─── Enhanced Settings Panel ─────────────────────── */
function SettingsPanel({ showToast }: { showToast: (m: string, t?: 'success' | 'error') => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['notification-settings'], queryFn: getNotificationSettings });
  const settings = (data ?? {}) as Partial<NotificationSettings>;
  const [form, setForm] = useState<Partial<NotificationSettings>>({});
  const merged = { ...settings, ...form };

  const saveMut = useMutation({
    mutationFn: (d: Partial<NotificationSettings>) => updateNotificationSettings(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notification-settings'] }); showToast('Settings saved ✓'); },
    onError: () => showToast('Save failed', 'error'),
  });

  const fc = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all';
  const lc = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5';

  if (isLoading) return <div className="py-10 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />Loading settings...</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Send Limits</h3></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={lc}>Daily SMS Limit</label><input type="number" value={merged.dailySmsLimit ?? 500} onChange={e => setForm(p => ({ ...p, dailySmsLimit: Number(e.target.value) }))} className={fc} /></div>
          <div><label className={lc}>Daily Email Limit</label><input type="number" value={merged.dailyEmailLimit ?? 2000} onChange={e => setForm(p => ({ ...p, dailyEmailLimit: Number(e.target.value) }))} className={fc} /></div>
          <div><label className={lc}>Monthly SMS Budget (BDT)</label><input type="number" value={merged.monthlySmsBudgetBDT ?? 10000} onChange={e => setForm(p => ({ ...p, monthlySmsBudgetBDT: Number(e.target.value) }))} className={fc} /></div>
          <div><label className={lc}>Monthly Email Budget (BDT)</label><input type="number" value={merged.monthlyEmailBudgetBDT ?? 5000} onChange={e => setForm(p => ({ ...p, monthlyEmailBudgetBDT: Number(e.target.value) }))} className={fc} /></div>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Quiet Hours</h3></div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={merged.quietHours?.enabled ?? false} onChange={e => setForm(p => ({ ...p, quietHours: { ...merged.quietHours!, enabled: e.target.checked } }))} className="rounded border-slate-300" /> Enable quiet hours</label>
        {merged.quietHours?.enabled && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label className={lc}>Start Hour (UTC)</label><input type="number" min={0} max={23} value={merged.quietHours?.startHour ?? 22} onChange={e => setForm(p => ({ ...p, quietHours: { ...merged.quietHours!, startHour: Number(e.target.value) } }))} className={fc} /></div>
            <div><label className={lc}>End Hour (UTC)</label><input type="number" min={0} max={23} value={merged.quietHours?.endHour ?? 7} onChange={e => setForm(p => ({ ...p, quietHours: { ...merged.quietHours!, endHour: Number(e.target.value) } }))} className={fc} /></div>
            <div><label className={lc}>Timezone</label><input value={merged.quietHours?.timezone ?? 'Asia/Dhaka'} onChange={e => setForm(p => ({ ...p, quietHours: { ...merged.quietHours!, timezone: e.target.value } }))} className={fc} /></div>
          </div>
        )}
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Retry & Duplicate Prevention</h3></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className={lc}>Max Retry Count</label><input type="number" value={merged.maxRetryCount ?? 2} onChange={e => setForm(p => ({ ...p, maxRetryCount: Number(e.target.value) }))} className={fc} /></div>
          <div><label className={lc}>Duplicate Window (mins)</label><input type="number" value={merged.duplicatePreventionWindowMinutes ?? 60} onChange={e => setForm(p => ({ ...p, duplicatePreventionWindowMinutes: Number(e.target.value) }))} className={fc} /></div>
          <div><label className={lc}>Retry Delay (mins)</label><input type="number" min={0} value={(merged as any).retryDelayMinutes ?? 5} onChange={e => setForm(p => ({ ...p, retryDelayMinutes: Number(e.target.value) } as any))} className={fc} /></div>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2"><Zap className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Automation</h3></div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={merged.resultPublishAutoSend ?? true} onChange={e => setForm(p => ({ ...p, resultPublishAutoSend: e.target.checked }))} className="rounded border-slate-300" /> Auto-send result notifications on publish</label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={merged.autoSyncCostToFinance ?? true} onChange={e => setForm(p => ({ ...p, autoSyncCostToFinance: e.target.checked }))} className="rounded border-slate-300" /> Auto-sync costs to Finance Center</label>
      </div>
      <div className="rounded-2xl bg-white p-6 shadow-sm dark:bg-slate-900 space-y-4">
        <div className="flex items-center gap-2"><Bell className="h-5 w-5 text-indigo-500" /><h3 className="text-lg font-bold text-slate-800 dark:text-white">Subscription Reminders</h3></div>
        <div><label className={lc}>Reminder Days Before Expiry (comma-separated)</label>
          <input value={((merged as any).subscriptionReminderDays ?? [7, 3, 1]).join(', ')} onChange={e => { const days = e.target.value.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n) && n > 0); setForm(p => ({ ...p, subscriptionReminderDays: days } as any)); }} className={fc} placeholder="7, 3, 1" />
          <p className="mt-1 text-xs text-slate-400">Days before subscription expiry to send reminder notifications</p>
        </div>
      </div>
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-50 to-indigo-100/50 p-5 flex items-center justify-between gap-4 dark:from-indigo-950/30 dark:to-indigo-900/20 dark:border-indigo-500/10">
        <div><p className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5"><Zap className="h-4 w-4 text-indigo-500" />Advanced Campaign Settings</p><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Frequency caps, budget guardrails, approval workflows, A/B testing, provider routing, and more.</p></div>
        <a href="/__cw_admin__/campaigns/advanced-settings" className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 transition-colors shadow-sm">Open →</a>
      </div>
      <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending} className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3.5 text-sm font-bold text-white hover:from-indigo-700 hover:to-indigo-600 disabled:opacity-50 shadow-lg shadow-indigo-500/20 transition-all">
        {saveMut.isPending ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}

/* ─── Enhanced Campaign Detail Modal ──────────────── */
function CampaignDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id) });
  const campaign = (data ?? null) as CampaignDetail | null;

  const progress = campaign ? (campaign.recipientCount && campaign.recipientCount > 0 ? Math.round(((campaign.sentCount ?? 0) / campaign.recipientCount) * 100) : 0) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
        {isLoading ? (
          <div className="py-10 text-center text-slate-400"><span className="animate-spin inline-block mr-2">⏳</span>Loading...</div>
        ) : campaign ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${campaign.channelType === 'email' ? 'bg-blue-100 dark:bg-blue-950/30' : 'bg-green-100 dark:bg-green-950/30'}`}>
                  {campaign.channelType === 'email' ? '📧' : '💬'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">{campaign.campaignName || 'Campaign Detail'}</h3>
                  <p className="text-xs text-slate-500">{new Date(campaign.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors">✕</button>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500">Delivery Progress</span>
                <span className="text-xs font-bold text-indigo-600">{progress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-2.5 rounded-full transition-all duration-500 ${campaign.status === 'failed' ? 'bg-red-500' : campaign.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.max(progress, 3)}%` }} />
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Recipients', value: campaign.recipientCount ?? 0, icon: '👥' },
                { label: 'Sent', value: campaign.sentCount ?? 0, icon: '✅' },
                { label: 'Failed', value: campaign.failedCount ?? 0, icon: '❌' },
              ].map(s => (
                <div key={s.label} className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                  <span className="text-lg">{s.icon}</span>
                  <p className="text-xs text-slate-500 mt-1">{s.label}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Details */}
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Channel:</span> <strong className="text-slate-800 dark:text-slate-200">{campaign.channelType}</strong></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Status:</span> <strong className={`${campaign.status === 'completed' ? 'text-emerald-600' : campaign.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>{campaign.status}</strong></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Audience:</span> <strong className="text-slate-800 dark:text-slate-200">{campaign.audienceType}</strong></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Est. Cost:</span> <strong className="text-slate-800 dark:text-slate-200">৳{(campaign.estimatedCost ?? 0).toFixed(2)}</strong></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Actual Cost:</span> <strong className="text-slate-800 dark:text-slate-200">৳{(campaign.actualCost ?? 0).toFixed(2)}</strong></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><span className="text-xs font-semibold text-slate-500">Guardian:</span> <strong className="text-slate-800 dark:text-slate-200">{campaign.guardianTargeted ? 'Yes' : 'No'}</strong></div>
            </div>

            {campaign.completedAt && (
              <div className="text-xs text-slate-500 text-center">Completed: {new Date(campaign.completedAt).toLocaleString()}</div>
            )}
          </div>
        ) : (
          <div className="py-10 text-center text-slate-400">Campaign not found</div>
        )}
      </div>
    </div>
  );
}
