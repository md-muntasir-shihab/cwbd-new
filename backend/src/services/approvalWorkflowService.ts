/**
 * Approval Workflow Service
 *
 * Implements a state machine for campaign approval lifecycle:
 *   Draft → Pending_Approval (threshold exceeded)
 *   Draft → Scheduled (no threshold exceeded)
 *   Pending_Approval → Approved (approver approves)
 *   Pending_Approval → Draft (approver rejects)
 *   Approved → Scheduled (schedule confirmed)
 *
 * Evaluates audience size, estimated cost, and sensitive segment
 * thresholds to determine whether approval is required.
 * All transitions are logged via the Settings Audit Logger.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7
 */

import mongoose from 'mongoose';
import { ApprovalPolicy } from '../types/campaignSettings';
import { log } from './settingsAuditLoggerService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CampaignApprovalStatus =
    | 'draft'
    | 'pending_approval'
    | 'approved'
    | 'scheduled'
    | 'rejected';

// ─── State Machine Definition ────────────────────────────────────────────────

/**
 * Valid transitions keyed by current status.
 * Req 5.5: Enforce Draft → Pending_Approval → Approved → Scheduled,
 *          and Draft → Scheduled (no threshold exceeded).
 */
const VALID_TRANSITIONS: Record<CampaignApprovalStatus, CampaignApprovalStatus[]> = {
    draft: ['pending_approval', 'scheduled'],
    pending_approval: ['approved', 'draft'],
    approved: ['scheduled'],
    scheduled: [],
    rejected: [],
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate a campaign against the approval policy thresholds.
 *
 * Returns 'pending_approval' if ANY threshold is exceeded:
 *  - audience size exceeds audienceSizeThreshold (Req 5.2)
 *  - estimated cost exceeds estimatedCostThreshold (Req 5.3)
 *  - any segment ID is in the sensitive list (Req 5.4)
 *
 * Otherwise returns 'scheduled' (no approval required).
 */
export function evaluate(
    campaign: { audienceSize: number; estimatedCost: number; segmentIds: string[] },
    policy: ApprovalPolicy,
): CampaignApprovalStatus {
    // Req 5.2 — audience size threshold
    if (campaign.audienceSize > policy.audienceSizeThreshold) {
        return 'pending_approval';
    }

    // Req 5.3 — estimated cost threshold
    if (campaign.estimatedCost > policy.estimatedCostThreshold) {
        return 'pending_approval';
    }

    // Req 5.4 — sensitive segment check
    if (
        policy.sensitiveSegmentIds.length > 0 &&
        campaign.segmentIds.some((id) => policy.sensitiveSegmentIds.includes(id))
    ) {
        return 'pending_approval';
    }

    return 'scheduled';
}


/**
 * Transition a campaign from one approval status to another.
 *
 * Validates that the transition is allowed by the state machine,
 * then logs the transition via the Settings Audit Logger.
 *
 * Req 5.5: Reject any transition that violates the state machine order.
 * Req 5.6: Log approval action with actor, timestamp, and reason.
 * Req 5.7: Log rejection with actor, timestamp, and reason.
 *
 * @throws Error if the transition is invalid.
 */
export async function transition(
    campaignId: mongoose.Types.ObjectId,
    from: CampaignApprovalStatus,
    to: CampaignApprovalStatus,
    actorId: mongoose.Types.ObjectId,
    reason: string,
): Promise<void> {
    const allowed = VALID_TRANSITIONS[from];

    if (!allowed || !allowed.includes(to)) {
        throw new Error(
            `Invalid approval transition: cannot move from "${from}" to "${to}"`,
        );
    }

    // Log the transition via Settings Audit Logger — Req 5.6, 5.7
    await log({
        actorId,
        actorRole: 'approver',
        timestamp: new Date(),
        ipAddress: 'system',
        section: 'approval_workflow',
        beforeSnapshot: { campaignId: campaignId.toString(), status: from },
        afterSnapshot: { campaignId: campaignId.toString(), status: to },
        diff: [
            { field: 'status', oldValue: from, newValue: to },
            { field: 'reason', oldValue: null, newValue: reason },
        ],
    });
}

/**
 * Return the list of valid target statuses for a given current status.
 * Req 5.5
 */
export function getValidTransitions(
    currentStatus: CampaignApprovalStatus,
): CampaignApprovalStatus[] {
    return VALID_TRANSITIONS[currentStatus] ?? [];
}
