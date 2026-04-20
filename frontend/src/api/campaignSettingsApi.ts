// ─── Campaign Settings API Client ────────────────────────────────────────────
// Typed fetch functions for all advanced campaign settings endpoints.
// Requirements: 16.1

import api from '../services/api';
import type {
    AdvancedNotificationSettings,
    SimulationResult,
    AuditTrailResponse,
} from '../types/campaignSettings';

/** GET /api/admin/notification-settings — read settings with migration defaults */
export const getAdvancedSettings = () =>
    api.get<AdvancedNotificationSettings>('/admin/notification-settings').then((r) => r.data);

/** PUT /api/admin/notification-settings — update settings (validated + RBAC + audit) */
export const updateAdvancedSettings = (data: Partial<AdvancedNotificationSettings>) =>
    api.put<AdvancedNotificationSettings>('/admin/notification-settings', data).then((r) => r.data);

/** POST /api/admin/notification-settings/simulate — test configuration simulation */
export const simulateSettings = (
    params: Record<string, unknown>,
) =>
    api.post<SimulationResult>('/admin/notification-settings/simulate', params).then((r) => r.data);

/** GET /api/admin/notification-settings/versions/:version — read historical version */
export const getSettingsVersion = (version: number) =>
    api
        .get<Record<string, unknown>>(`/admin/notification-settings/versions/${version}`)
        .then((r) => r.data);

/** GET /api/admin/notification-settings/audit-trail — query settings audit trail */
export const getSettingsAuditTrail = (params: {
    section?: string;
    limit?: number;
    offset?: number;
} = {}) =>
    api
        .get<AuditTrailResponse>('/admin/notification-settings/audit-trail', { params })
        .then((r) => r.data);
