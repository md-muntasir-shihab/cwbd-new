import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api, { adminGetSettings } from '../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PendingRegistration {
    _id: string;
    full_name: string;
    email: string;
    phone_number?: string;
    status: string;
    createdAt: string;
}

export interface ProfileChangeRequest {
    _id: string;
    student_id: string | { _id: string; full_name?: string; email?: string };
    requested_changes: Record<string, unknown>;
    previous_values: Record<string, unknown>;
    status: 'pending' | 'approved' | 'rejected';
    admin_feedback?: string;
    reviewed_at?: string | null;
    reviewed_by?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface PendingApprovalsResponse {
    registrations: PendingRegistration[];
    registrationCount: number;
    profileChanges: ProfileChangeRequest[];
    profileChangeCount: number;
}

export interface ProfileApprovalSettingResponse {
    profileApprovalEnabled: boolean;
}

// ─── Query Keys ──────────────────────────────────────────────────────────────

export const approvalKeys = {
    all: ['admin', 'student-approvals'] as const,
    pendingApprovals: () => [...approvalKeys.all, 'pending'] as const,
    profileRequests: () => [...approvalKeys.all, 'profile-requests'] as const,
    profileRequestDetail: (id: string) => [...approvalKeys.all, 'profile-requests', id] as const,
    profileApprovalSetting: () => [...approvalKeys.all, 'setting'] as const,
};

// ─── API Functions ───────────────────────────────────────────────────────────

const fetchPendingApprovals = (): Promise<PendingApprovalsResponse> =>
    api.get('/admin/students-v2/pending-approvals').then((r) => {
        const d = r.data || {};
        return {
            registrations: d.registrations || d.pendingRegistrations || [],
            registrationCount: d.registrationCount ?? 0,
            profileChanges: d.profileChanges || [],
            profileChangeCount: d.profileChangeCount ?? 0,
        };
    });

const approveRegistration = (id: string): Promise<void> =>
    api.post(`/admin/students-v2/approve-registration/${id}`).then((r) => r.data);

const rejectRegistration = ({ id, reason }: { id: string; reason: string }): Promise<void> =>
    api.post(`/admin/students-v2/reject-registration/${id}`, { reason }).then((r) => r.data);

const bulkApproveRegistrations = (payload: { userIds: string[]; action: 'approve' | 'reject'; reason?: string }): Promise<{ processed: number; failed: number }> =>
    api.post('/admin/students-v2/bulk-approve-registrations', payload).then((r) => r.data);

const fetchProfileChangeRequests = (): Promise<{ requests: ProfileChangeRequest[] }> =>
    api.get('/admin/students-v2/profile-requests').then((r) => r.data);

const fetchProfileChangeRequestDetail = (id: string): Promise<{ request: ProfileChangeRequest }> =>
    api.get(`/admin/students-v2/profile-requests/${id}`).then((r) => r.data);

const reviewProfileChange = ({ id, action, feedback }: { id: string; action: 'approve' | 'reject'; feedback?: string }): Promise<void> =>
    api.post(`/admin/students-v2/profile-requests/${id}/review`, { action, feedback }).then((r) => r.data);

const resetVerification = ({ id, type }: { id: string; type: 'phone' | 'email' }): Promise<void> =>
    api.post(`/admin/students-v2/${id}/reset-verification`, { type }).then((r) => r.data);

const fetchProfileApprovalSetting = async (): Promise<ProfileApprovalSettingResponse> => {
    const res = await adminGetSettings();
    return { profileApprovalEnabled: res.data?.profileApprovalEnabled ?? true };
};

const updateProfileApprovalSetting = (enabled: boolean): Promise<void> =>
    api.put('/admin/settings/profile-approval', { enabled }).then((r) => r.data);

// ─── Hooks ───────────────────────────────────────────────────────────────────

/** Fetch pending registrations and profile change counts */
export function usePendingApprovals() {
    return useQuery({
        queryKey: approvalKeys.pendingApprovals(),
        queryFn: fetchPendingApprovals,
        staleTime: 30_000,
    });
}

/** Approve a single pending registration */
export function useApproveRegistration() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => approveRegistration(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: approvalKeys.pendingApprovals() });
        },
    });
}

/** Reject a single pending registration */
export function useRejectRegistration() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { id: string; reason: string }) => rejectRegistration(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: approvalKeys.pendingApprovals() });
        },
    });
}

/** Bulk approve or reject registrations */
export function useBulkApproveRegistrations() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { userIds: string[]; action: 'approve' | 'reject'; reason?: string }) =>
            bulkApproveRegistrations(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: approvalKeys.pendingApprovals() });
        },
    });
}

/** Fetch pending profile change requests */
export function useProfileChangeRequests() {
    return useQuery({
        queryKey: approvalKeys.profileRequests(),
        queryFn: fetchProfileChangeRequests,
        staleTime: 30_000,
    });
}

/** Fetch a single profile change request detail */
export function useProfileChangeRequestDetail(id: string) {
    return useQuery({
        queryKey: approvalKeys.profileRequestDetail(id),
        queryFn: () => fetchProfileChangeRequestDetail(id),
        enabled: !!id,
    });
}

/** Approve or reject a profile change request */
export function useReviewProfileChange() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { id: string; action: 'approve' | 'reject'; feedback?: string }) =>
            reviewProfileChange(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: approvalKeys.profileRequests() });
            qc.invalidateQueries({ queryKey: approvalKeys.pendingApprovals() });
        },
    });
}

/** Reset phone or email verification for a student */
export function useResetVerification() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { id: string; type: 'phone' | 'email' }) => resetVerification(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: approvalKeys.all });
        },
    });
}

/** Read and toggle the profileApprovalEnabled setting */
export function useProfileApprovalSetting() {
    const qc = useQueryClient();
    const query = useQuery({
        queryKey: approvalKeys.profileApprovalSetting(),
        queryFn: fetchProfileApprovalSetting,
        staleTime: 60_000,
    });

    const mutation = useMutation({
        mutationFn: (enabled: boolean) => updateProfileApprovalSetting(enabled),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: approvalKeys.profileApprovalSetting() });
        },
    });

    return { ...query, toggle: mutation };
}
