import api, { buildSensitiveActionHeaders, type SensitiveActionProof } from '../services/api';

export interface CampaignListItem {
  _id: string;
  campaignName: string;
  audienceType: string;
  channelType: string;
  status: string;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  estimatedCost?: number;
  actualCost?: number;
  createdAt: string;
  scheduledAt?: string;
}

export interface CampaignDetail extends CampaignListItem {
  audienceRef?: string;
  templateIds?: string[];
  customBody?: string;
  guardianTargeted?: boolean;
  triggerKey?: string;
  quietHoursApplied?: boolean;
  completedAt?: string;
}

export interface CampaignPreview {
  recipientCount: number;
  estimatedCost: number;
  sampleRendered?: { subject?: string; body: string };
  channelBreakdown?: { sms: number; email: number };
}

export interface DeliveryLog {
  _id: string;
  jobId: string;
  userId: string;
  channel: string;
  status: string;
  providerUsed?: string;
  templateKey?: string;
  originModule?: string;
  originEntityId?: string;
  recipientMode?: string;
  messageMode?: string;
  recipientDisplay?: string;
  renderedPreview?: string;
  providerResponse?: string;
  costAmount: number;
  retryCount: number;
  guardianTargeted: boolean;
  createdAt: string;
}

export interface NotificationTemplate {
  _id: string;
  templateKey: string;
  name: string;
  channel: string;
  subject?: string;
  body: string;
  htmlBody?: string;
  bodyFormat?: 'plain' | 'html';
  designPreset?: string;
  category?: string;
  versionNo?: number;
  isActive: boolean;
}

export interface NotificationSettings {
  _id?: string;
  dailySmsLimit: number;
  dailyEmailLimit: number;
  monthlySmsBudgetBDT: number;
  monthlyEmailBudgetBDT: number;
  quietHours: { enabled: boolean; startHour: number; endHour: number; timezone: string };
  duplicatePreventionWindowMinutes: number;
  maxRetryCount: number;
  retryDelayMinutes: number;
  triggerToggles: { triggerKey: string; enabled: boolean; channels: string[]; guardianIncluded: boolean }[];
  subscriptionReminderDays: number[];
  resultPublishAutoSend: boolean;
  autoSyncCostToFinance: boolean;
}

export interface ExportHistoryItem {
  _id: string;
  direction: 'import' | 'export';
  category: string;
  format: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  performedByName?: string;
  createdAt: string;
}

export interface SubscriptionContactCenterPlanOverview {
  planId: string;
  planName: string;
  planCode: string;
  totalMembers: number;
  activeCount: number;
  expiredCount: number;
  renewalDueCount: number;
  cancelledCount: number;
  phoneReadyCount: number;
  emailReadyCount: number;
  lastUpdatedAtUTC: string | null;
}

export interface SubscriptionContactCenterMember {
  subscriptionId: string;
  userId: string;
  fullName: string;
  username: string;
  accountStatus: string;
  email: string;
  phone: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  planId: string;
  planName: string;
  planCode: string;
  subscriptionStatus: string;
  autoRenewEnabled: boolean;
  bucket: 'active' | 'expired' | 'renewal_due' | 'cancelled_paused' | 'pending';
  startAtUTC: string | null;
  expiresAtUTC: string | null;
  daysToExpiry: number | null;
  department: string;
  sscBatch: string;
  hscBatch: string;
  institutionName: string;
  groupNames: string[];
  pendingDue: number;
  paymentDue: boolean;
  profileScore: number;
  lastUpdatedAtUTC: string | null;
  openProfileRoute: string;
}

export interface SubscriptionContactCenterPreset {
  _id: string;
  name: string;
  prefix: string;
  suffix: string;
  separator: string;
  includeName: boolean;
  includeEmail: boolean;
  includeGuardian: boolean;
  includePlan: boolean;
  includeStatus: boolean;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface SubscriptionContactCenterLogItem {
  _id: string;
  kind: string;
  title: string;
  category: string;
  format: string;
  rowCount: number;
  performedByName: string;
  createdAt: string;
  details?: unknown;
}

export interface SubscriptionContactCenterFilters {
  planIds?: string[];
  planCodes?: string[];
  bucket?: string;
  subscriptionStatuses?: string[];
  accountStatuses?: string[];
  departments?: string[];
  batches?: string[];
  sscBatches?: string[];
  institutionNames?: string[];
  groupIds?: string[];
  search?: string;
  hasPhone?: boolean;
  hasEmail?: boolean;
  hasGuardian?: boolean;
  paymentDue?: boolean;
  renewalThresholdDays?: number;
  profileScoreRange?: { min?: number; max?: number };
  savedAudienceId?: string;
  selectedUserIds?: string[];
}

type Params = Record<string, string | number | boolean | undefined>;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function mapCampaignStatus(value: unknown): string {
  const status = String(value ?? '').toLowerCase();
  if (status === 'done') return 'completed';
  if (status === 'queued' || status === 'processing') return 'pending';
  if (status === 'partial') return 'partial';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return status || 'pending';
}

function normalizeChannelType(raw: Record<string, unknown>): string {
  if (typeof raw.channelType === 'string' && raw.channelType) return raw.channelType;
  if (typeof raw.channel === 'string' && raw.channel) return raw.channel;
  if (Array.isArray(raw.channels)) {
    const channels = raw.channels.map(ch => String(ch).toLowerCase());
    if (channels.includes('sms') && channels.includes('email')) return 'both';
    if (channels.includes('email')) return 'email';
    return 'sms';
  }
  return 'sms';
}

function normalizeCampaign(rawValue: unknown): CampaignDetail {
  const raw = asRecord(rawValue);
  const templateIds = Array.isArray(raw.templateIds)
    ? raw.templateIds.map(id => String(id))
    : [];

  return {
    _id: String(raw._id ?? ''),
    campaignName: String(raw.campaignName ?? raw.name ?? 'Untitled'),
    audienceType: String(raw.audienceType ?? raw.target ?? 'all'),
    channelType: normalizeChannelType(raw),
    status: mapCampaignStatus(raw.status),
    recipientCount: Number(raw.recipientCount ?? raw.totalTargets ?? 0),
    sentCount: Number(raw.sentCount ?? 0),
    failedCount: Number(raw.failedCount ?? 0),
    estimatedCost: Number(raw.estimatedCost ?? raw.estimatedCostBDT ?? 0),
    actualCost: Number(raw.actualCost ?? 0),
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    scheduledAt: typeof raw.scheduledAtUTC === 'string' ? raw.scheduledAtUTC : undefined,
    audienceRef: typeof raw.audienceRef === 'string' ? raw.audienceRef : undefined,
    templateIds,
    customBody: typeof raw.customBody === 'string' ? raw.customBody : undefined,
    guardianTargeted: Boolean(raw.guardianTargeted),
    triggerKey: typeof raw.triggerKey === 'string' ? raw.triggerKey : undefined,
    quietHoursApplied: Boolean(raw.quietHoursApplied),
    completedAt: String(raw.completedAt ?? raw.completedAtUTC ?? raw.processedAtUTC ?? ''),
  };
}

function normalizeTemplate(rawValue: unknown): NotificationTemplate {
  const raw = asRecord(rawValue);
  const templateKey = String(raw.templateKey ?? raw.key ?? '');
  return {
    _id: String(raw._id ?? ''),
    templateKey,
    name: String((raw.name ?? templateKey) || 'Untitled'),
    channel: String(raw.channel ?? 'sms'),
    subject: typeof raw.subject === 'string' ? raw.subject : undefined,
    body: String(raw.body ?? ''),
    htmlBody: typeof raw.htmlBody === 'string' ? raw.htmlBody : undefined,
    bodyFormat: raw.bodyFormat === 'html' ? 'html' : 'plain',
    designPreset: typeof raw.designPreset === 'string' ? raw.designPreset : undefined,
    category: typeof raw.category === 'string' ? raw.category : undefined,
    versionNo: Number(raw.versionNo ?? 1),
    isActive: Boolean(raw.isActive ?? raw.isEnabled ?? true),
  };
}

function normalizeSettings(rawValue: unknown): NotificationSettings {
  const raw = asRecord(rawValue);
  const quietHours = asRecord(raw.quietHours);
  const triggerToggles = Array.isArray(raw.triggerToggles)
    ? raw.triggerToggles
    : Array.isArray(raw.triggers)
      ? raw.triggers
      : [];

  return {
    _id: typeof raw._id === 'string' ? raw._id : undefined,
    dailySmsLimit: Number(raw.dailySmsLimit ?? 500),
    dailyEmailLimit: Number(raw.dailyEmailLimit ?? 2000),
    monthlySmsBudgetBDT: Number(raw.monthlySmsBudgetBDT ?? 5000),
    monthlyEmailBudgetBDT: Number(raw.monthlyEmailBudgetBDT ?? 1000),
    quietHours: {
      enabled: Boolean(quietHours.enabled),
      startHour: Number(quietHours.startHour ?? 22),
      endHour: Number(quietHours.endHour ?? 7),
      timezone: String(quietHours.timezone ?? 'Asia/Dhaka'),
    },
    duplicatePreventionWindowMinutes: Number(raw.duplicatePreventionWindowMinutes ?? 60),
    maxRetryCount: Number(raw.maxRetryCount ?? 3),
    retryDelayMinutes: Number(raw.retryDelayMinutes ?? 15),
    triggerToggles: triggerToggles as NotificationSettings['triggerToggles'],
    subscriptionReminderDays: Array.isArray(raw.subscriptionReminderDays) ? raw.subscriptionReminderDays as number[] : [7, 3, 1],
    resultPublishAutoSend: Boolean(raw.resultPublishAutoSend),
    autoSyncCostToFinance: Boolean(raw.autoSyncCostToFinance ?? true),
  };
}

function buildCampaignPayload(input: Record<string, unknown>, preview = false) {
  const channelType = String(input.channelType ?? input.channel ?? '').toLowerCase();
  const channels = Array.isArray(input.channels)
    ? input.channels.map(ch => String(ch).toLowerCase()).filter(ch => ch === 'sms' || ch === 'email') as Array<'sms' | 'email'>
    : channelType === 'both'
      ? ['sms', 'email']
      : channelType === 'email'
        ? ['email']
        : ['sms'];

  const audienceTypeRaw = String(input.audienceType ?? 'all').toLowerCase();
  const audienceType = (['all', 'group', 'filter', 'manual'].includes(audienceTypeRaw) ? audienceTypeRaw : 'all') as 'all' | 'group' | 'filter' | 'manual';
  const audienceRef = String(input.audienceRef ?? input.audienceGroupId ?? '').trim();
  const guardianTargeted = Boolean(input.guardianTargeted);
  const recipientMode = String(input.recipientMode ?? '').trim() || (guardianTargeted ? 'both' : 'student');
  const templateKey = String(input.templateKey ?? input.templateId ?? '').trim();

  return {
    campaignName: String(input.campaignName ?? input.name ?? (preview ? 'Preview' : 'Campaign')).trim() || (preview ? 'Preview' : 'Campaign'),
    channels,
    templateKey: templateKey || undefined,
    customBody: String(input.customBody ?? '').trim() || undefined,
    customSubject: String(input.subject ?? input.customSubject ?? '').trim() || undefined,
    vars: asRecord(input.vars),
    audienceType,
    audienceGroupId: audienceType === 'group' ? (audienceRef || undefined) : undefined,
    audienceFilters: audienceType === 'filter' ? asRecord(input.audienceFilters ?? input.filters) : undefined,
    manualStudentIds: audienceType === 'manual' && Array.isArray(input.manualStudentIds)
      ? input.manualStudentIds.map(id => String(id)).filter(Boolean)
      : undefined,
    includeUserIds: Array.isArray(input.includeUserIds)
      ? input.includeUserIds.map(id => String(id)).filter(Boolean)
      : undefined,
    excludeUserIds: Array.isArray(input.excludeUserIds)
      ? input.excludeUserIds.map(id => String(id)).filter(Boolean)
      : undefined,
    guardianTargeted,
    recipientMode,
    scheduledAtUTC: input.scheduledAtUTC,
    originModule: typeof input.originModule === 'string' ? input.originModule : undefined,
    originEntityId: typeof input.originEntityId === 'string' ? input.originEntityId : undefined,
    originAction: typeof input.originAction === 'string' ? input.originAction : undefined,
    triggerKey: typeof input.triggerKey === 'string' ? input.triggerKey : undefined,
    testSend: Boolean(input.testSend),
  };
}

export const listCampaigns = (params: Params = {}) =>
  api.get('/admin/notifications/campaigns', { params }).then((r) => {
    const payload = asRecord(r.data);
    const nested = asRecord(payload.data);
    const rawItems = Array.isArray(payload.jobs)
      ? payload.jobs
      : Array.isArray(nested.items)
        ? nested.items as unknown[]
        : Array.isArray(payload.items)
          ? payload.items
          : [];
    const items = rawItems.map(normalizeCampaign);
    return {
      items,
      total: Number(payload.total ?? nested.total ?? items.length),
      page: Number(payload.page ?? nested.page ?? 1),
      limit: Number(payload.limit ?? nested.limit ?? (items.length || 20)),
      totalPages: Number(payload.totalPages ?? nested.totalPages ?? 1),
    };
  });

export const getCampaign = (id: string) =>
  api.get(`/admin/notifications/campaigns/${id}`).then((r) => {
    const payload = asRecord(r.data);
    const raw = payload.job ?? payload.data ?? payload;
    return normalizeCampaign(raw);
  });

export const previewCampaign = (data: Record<string, unknown>) =>
  api.post('/admin/notifications/campaigns/preview', buildCampaignPayload(data, true)).then((r) => {
    const payload = asRecord(r.data);
    return {
      recipientCount: Number(payload.recipientCount ?? 0),
      estimatedCost: Number(payload.estimatedCost ?? payload.estimatedCostBDT ?? 0),
      sampleRendered: payload.sampleRendered as CampaignPreview['sampleRendered'],
      channelBreakdown: payload.channelBreakdown as CampaignPreview['channelBreakdown'],
    } as CampaignPreview;
  });

export const sendCampaign = (data: Record<string, unknown>) =>
  api.post('/admin/notifications/campaigns/send', buildCampaignPayload(data)).then(r => r.data);

export const retryCampaign = (id: string) =>
  api.post(`/admin/notifications/campaigns/${id}/retry`).then(r => r.data);

export const getCampaignDashboardSummary = () =>
  api.get('/admin/notifications/dashboard-summary').then((r) => r.data as CampaignDashboardSummary);

export const getDeliveryLogs = (params: Params = {}) =>
  api.get('/admin/notifications/delivery-logs', { params }).then((r) => {
    const payload = asRecord(r.data);
    const nested = asRecord(payload.data);
    const rawItems = Array.isArray(payload.logs)
      ? payload.logs
      : Array.isArray(nested.items)
        ? nested.items as unknown[]
        : Array.isArray(payload.items)
          ? payload.items
          : [];

    const items: DeliveryLog[] = rawItems.map((rawItem) => {
      const raw = asRecord(rawItem);
      return {
        _id: String(raw._id ?? ''),
        jobId: String(raw.jobId ?? ''),
        userId: String(raw.userId ?? raw.studentId ?? ''),
        channel: String(raw.channel ?? ''),
        status: String(raw.status ?? ''),
        providerUsed: typeof raw.providerUsed === 'string' ? raw.providerUsed : undefined,
        templateKey: typeof raw.templateKey === 'string' ? raw.templateKey : undefined,
        originModule: typeof raw.originModule === 'string' ? raw.originModule : undefined,
        originEntityId: typeof raw.originEntityId === 'string' ? raw.originEntityId : undefined,
        recipientMode: typeof raw.recipientMode === 'string' ? raw.recipientMode : undefined,
        messageMode: typeof raw.messageMode === 'string' ? raw.messageMode : undefined,
        recipientDisplay: typeof raw.recipientDisplay === 'string' ? raw.recipientDisplay : undefined,
        renderedPreview: typeof raw.renderedPreview === 'string' ? raw.renderedPreview : undefined,
        providerResponse: typeof raw.providerResponse === 'string'
          ? raw.providerResponse
          : (typeof raw.errorMessage === 'string' ? raw.errorMessage : undefined),
        costAmount: Number(raw.costAmount ?? 0),
        retryCount: Number(raw.retryCount ?? 0),
        guardianTargeted: Boolean(raw.guardianTargeted),
        createdAt: String(raw.createdAt ?? new Date().toISOString()),
      };
    });

    return {
      items,
      total: Number(payload.total ?? nested.total ?? items.length),
      page: Number(payload.page ?? nested.page ?? 1),
      limit: Number(payload.limit ?? nested.limit ?? (items.length || 20)),
      totalPages: Number(payload.totalPages ?? nested.totalPages ?? 1),
    };
  });

export const listTemplates = (params: Params = {}) =>
  api.get('/admin/notifications/templates', { params }).then((r) => {
    const payload = r.data;
    const rawItems = Array.isArray(payload)
      ? payload
      : Array.isArray(asRecord(payload).items)
        ? asRecord(payload).items as unknown[]
        : Array.isArray(asRecord(asRecord(payload).data).items)
          ? asRecord(asRecord(payload).data).items as unknown[]
          : [];
    const items = rawItems.map(normalizeTemplate);
    return { items, total: items.length };
  });

export const createTemplate = (data: Record<string, unknown>) =>
  api.post('/admin/notifications/templates', {
    key: String(data.templateKey ?? data.key ?? '').trim(),
    channel: data.channel,
    subject: data.subject,
    body: data.body,
    htmlBody: data.htmlBody ?? '',
    bodyFormat: data.bodyFormat ?? 'plain',
    designPreset: data.designPreset ?? '',
    category: data.category,
    isEnabled: data.isActive ?? data.enabled ?? true,
    placeholdersAllowed: data.placeholdersAllowed,
  }).then((r) => normalizeTemplate(r.data));

export const updateTemplate = (id: string, data: Record<string, unknown>) =>
  api.put(`/admin/notifications/templates/${id}`, {
    key: String(data.templateKey ?? data.key ?? '').trim(),
    channel: data.channel,
    subject: data.subject,
    body: data.body,
    htmlBody: data.htmlBody ?? '',
    bodyFormat: data.bodyFormat ?? 'plain',
    designPreset: data.designPreset ?? '',
    category: data.category,
    isEnabled: data.isActive ?? data.enabled ?? true,
    placeholdersAllowed: data.placeholdersAllowed,
  }).then((r) => normalizeTemplate(r.data));

export const getNotificationSettings = () =>
  api.get('/admin/notifications/settings').then(r => normalizeSettings(r.data));

export const updateNotificationSettings = (data: Partial<NotificationSettings>) =>
  api.put('/admin/notifications/settings', {
    ...data,
    triggers: data.triggerToggles,
  }).then(r => normalizeSettings(r.data));

export const getSubscriptionContactCenterOverview = (filters: SubscriptionContactCenterFilters = {}) =>
  api.get('/admin/subscription-contact-center/overview', { params: filters }).then(r => r.data as {
    summary: {
      totalMembers: number;
      activeCount: number;
      expiredCount: number;
      renewalDueCount: number;
      cancelledCount: number;
      phoneReadyCount: number;
      emailReadyCount: number;
    };
    plans: SubscriptionContactCenterPlanOverview[];
    filterOptions: {
      plans: Array<{ id: string; code: string; name: string }>;
      groups: Array<{ id: string; name: string }>;
      departments: string[];
      institutionNames: string[];
      savedAudiences: Array<{ id: string; name: string; memberCountCached: number }>;
    };
    renewalThresholdDays: number;
    thresholdOptions: number[];
  });

export const getSubscriptionContactCenterMembers = (params: SubscriptionContactCenterFilters & { page?: number; limit?: number } = {}) =>
  api.get('/admin/subscription-contact-center/members', { params }).then(r => r.data as {
    items: SubscriptionContactCenterMember[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    summary: {
      totalMembers: number;
      selectedFilterBucket: string;
      phoneReadyCount: number;
      emailReadyCount: number;
    };
    filterOptions: {
      plans: Array<{ id: string; code: string; name: string }>;
      groups: Array<{ id: string; name: string }>;
      departments: string[];
      institutionNames: string[];
      savedAudiences: Array<{ id: string; name: string; memberCountCached: number }>;
    };
    renewalThresholdDays: number;
    thresholdOptions: number[];
    permissions: {
      canViewGuardian: boolean;
      canExport: boolean;
      canPersonalOutreach: boolean;
    };
  });

export const previewSubscriptionContactCopy = (data: {
  filters?: SubscriptionContactCenterFilters;
  scope: 'phones' | 'emails' | 'combined' | 'guardian' | 'student_guardian' | 'raw';
  presetId?: string;
  preset?: Partial<SubscriptionContactCenterPreset>;
  mode?: 'copy_preview' | 'personal_outreach';
}) =>
  api.post('/admin/subscription-contact-center/copy-preview', data).then(r => r.data as {
    text: string;
    previewText: string;
    rowCount: number;
    fileName: string;
  });

export const exportSubscriptionContactCenter = async (data: {
  filters?: SubscriptionContactCenterFilters;
  scope: 'phones' | 'emails' | 'combined' | 'guardian' | 'student_guardian' | 'raw';
  format: 'xlsx' | 'csv' | 'txt' | 'json' | 'clipboard';
  presetId?: string;
  preset?: Partial<SubscriptionContactCenterPreset>;
}) => {
  if (data.format === 'json' || data.format === 'txt' || data.format === 'clipboard') {
    const res = await api.post('/admin/subscription-contact-center/export', data);
    return res.data as { text?: string; previewText?: string; rowCount?: number; fileName?: string; data?: Record<string, unknown>[]; count?: number };
  }
  return api.post('/admin/subscription-contact-center/export', data, { responseType: 'blob' });
};

export const getSubscriptionContactCenterPresets = () =>
  api.get('/admin/subscription-contact-center/presets').then(r => (r.data?.items ?? []) as SubscriptionContactCenterPreset[]);

export const createSubscriptionContactCenterPreset = (data: Partial<SubscriptionContactCenterPreset>) =>
  api.post('/admin/subscription-contact-center/presets', data).then(r => r.data?.item as SubscriptionContactCenterPreset);

export const updateSubscriptionContactCenterPreset = (id: string, data: Partial<SubscriptionContactCenterPreset>) =>
  api.patch(`/admin/subscription-contact-center/presets/${id}`, data).then(r => r.data?.item as SubscriptionContactCenterPreset);

export const deleteSubscriptionContactCenterPreset = (id: string) =>
  api.delete(`/admin/subscription-contact-center/presets/${id}`).then(r => r.data as { success: boolean });

export const getSubscriptionContactCenterLogs = (params: { page?: number; limit?: number } = {}) =>
  api.get('/admin/subscription-contact-center/logs', { params }).then(r => r.data as {
    items: SubscriptionContactCenterLogItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  });

type DataHubExportRequest = {
  category: string;
  format: string;
  filters?: Record<string, unknown>;
  selectedFields?: string[];
  groupId?: string;
  jobId?: string;
  channel?: string;
  includeGuardians?: boolean;
};

type DataHubTextOrJsonResponse = {
  text?: string;
  data?: Record<string, unknown>[];
  count?: number;
  rowCount?: number;
  fileName?: string;
};

export const exportDataHub = async (data: DataHubExportRequest) => {
  const format = String(data.format || 'xlsx').toLowerCase();
  if (format === 'json' || format === 'txt' || format === 'clipboard') {
    const res = await api.post('/admin/data-hub/export', data);
    return res.data as DataHubTextOrJsonResponse;
  }
  return api.post('/admin/data-hub/export', data, { responseType: 'blob' });
};

export const getExportHistory = (params: Params = {}) =>
  api.get('/admin/data-hub/history', { params }).then(r => r.data);

export const triggerNotification = (triggerKey: string) =>
  api.post('/admin/notifications/trigger', { triggerKey }).then(r => r.data);

export interface NotificationProvider {
  _id: string;
  type: 'sms' | 'email';
  provider: string;
  displayName: string;
  isEnabled: boolean;
  senderConfig: { fromName?: string; fromEmail?: string; smsSenderId?: string };
  rateLimit: { perMinute: number; perDay: number };
  createdAt: string;
  updatedAt: string;
}

export interface TriggerToggle {
  triggerKey: string;
  enabled: boolean;
  channels: ('sms' | 'email')[];
  guardianIncluded: boolean;
  templateKey?: string;
  delayMinutes?: number;
  batchSize?: number;
  retryEnabled?: boolean;
  quietHoursMode?: 'respect' | 'bypass';
  audienceMode?: 'affected' | 'subscription_active' | 'subscription_renewal_due' | 'custom';
}

export interface TriggerSettings {
  triggers: TriggerToggle[];
  resultPublishAutoSend: boolean;
  resultPublishChannels: ('sms' | 'email')[];
  resultPublishGuardianIncluded: boolean;
  subscriptionReminderDays: number[];
}

export interface CampaignDashboardSummary {
  totals: {
    totalCampaigns: number;
    queuedCount: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
    scheduledCount: number;
    sentToday: number;
    failedToday: number;
    activeTriggers: number;
    activeProviders: number;
    failedProviders: number;
  };
  audience: {
    totalMembers: number;
    activeCount: number;
    expiredCount: number;
    renewalDueCount: number;
    cancelledCount: number;
    phoneReadyCount: number;
    emailReadyCount: number;
  };
  upcomingJobs: Array<Record<string, unknown>>;
  providerHealth: Array<{
    id: string;
    name: string;
    type: string;
    provider: string;
    isEnabled: boolean;
    totalAttempts: number;
    failedAttempts: number;
    failureRate: number;
    lastSuccessAt: string | null;
    updatedAt: string;
  }>;
  recentFailures: Array<Record<string, unknown>>;
}

// ── Provider API ──────────────────────────────────────────────────────────────
export const listProviders = () =>
  api.get('/admin/notifications/providers').then((r) => (r.data.providers ?? []) as NotificationProvider[]);

export const createProvider = (data: Record<string, unknown>, proof?: SensitiveActionProof) =>
  api.post('/admin/notifications/providers', data, { headers: buildSensitiveActionHeaders(proof) }).then((r) => r.data as NotificationProvider);

export const updateProvider = (id: string, data: Record<string, unknown>, proof?: SensitiveActionProof) =>
  api.put(`/admin/notifications/providers/${id}`, data, { headers: buildSensitiveActionHeaders(proof) }).then((r) => r.data as NotificationProvider);

export const toggleProvider = (id: string, proof?: SensitiveActionProof) =>
  api.patch(`/admin/notifications/providers/${id}/toggle`, {}, { headers: buildSensitiveActionHeaders(proof) }).then((r) => r.data as { _id: string; isEnabled: boolean });

export const deleteProvider = (id: string, proof?: SensitiveActionProof) =>
  api.delete(`/admin/notifications/providers/${id}`, { headers: buildSensitiveActionHeaders(proof) }).then((r) => r.data);

// ── Trigger API ───────────────────────────────────────────────────────────────
export const getTriggerSettings = () =>
  api.get('/admin/notifications/triggers').then((r) => r.data as TriggerSettings);

export const updateTrigger = (triggerKey: string, data: Record<string, unknown>) =>
  api.put(`/admin/notifications/triggers/${triggerKey}`, data).then((r) => r.data);

export const bulkUpdateTriggers = (data: Record<string, unknown>) =>
  api.put('/admin/notifications/triggers', data).then((r) => r.data);
