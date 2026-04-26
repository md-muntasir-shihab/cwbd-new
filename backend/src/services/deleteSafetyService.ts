/**
 * Delete Safety Service
 *
 * Provides pre-deletion dependency checks, safe group deletion with membership
 * cleanup, and bulk deletion with automatic skip for groups that have active
 * dependencies (members, exams, campaigns).
 *
 * Requirements: 9.1, 9.2, 9.3, 9.5
 */
import mongoose from 'mongoose';
import GroupMembership from '../models/GroupMembership';
import StudentGroup from '../models/StudentGroup';
import Exam from '../models/Exam';
import NotificationJob from '../models/NotificationJob';
import * as cacheService from './cacheService';

// ─── Interfaces ─────────────────────────────────────────────

export interface DeleteCheckResult {
    canDelete: boolean;
    blockers: {
        activeMemberCount: number;
        linkedExams: Array<{ _id: string; title: string }>;
        linkedCampaigns: Array<{ _id: string; campaignName: string }>;
    };
}

export interface BulkDeleteResult {
    deleted: string[];
    skipped: Array<{ id: string; reason: string }>;
}

// ─── Safety Check ───────────────────────────────────────────

/**
 * Checks whether a group can be safely deleted by querying for active
 * memberships, linked exams (via targetGroupIds), and linked campaigns
 * (via targetGroupId on NotificationJob).
 */
export async function canDeleteGroup(groupId: string): Promise<DeleteCheckResult> {
    const gid = new mongoose.Types.ObjectId(groupId);

    const [activeMemberCount, linkedExams, linkedCampaigns] = await Promise.all([
        GroupMembership.countDocuments({ groupId: gid, membershipStatus: 'active' }),
        Exam.find({ targetGroupIds: gid })
            .select('_id title')
            .lean(),
        NotificationJob.find({ targetGroupId: gid })
            .select('_id campaignName')
            .lean(),
    ]);

    const blockers = {
        activeMemberCount,
        linkedExams: linkedExams.map((e) => ({
            _id: String(e._id),
            title: e.title || '',
        })),
        linkedCampaigns: linkedCampaigns.map((c) => ({
            _id: String(c._id),
            campaignName: (c as any).campaignName || '',
        })),
    };

    const canDelete =
        activeMemberCount === 0 &&
        linkedExams.length === 0 &&
        linkedCampaigns.length === 0;

    return { canDelete, blockers };
}


// ─── Group Deletion ─────────────────────────────────────────

/**
 * Executes a safe group deletion:
 * 1. Sets all active GroupMembership records for the group to `removed`
 * 2. Deletes the StudentGroup document
 */
export async function executeGroupDeletion(groupId: string): Promise<void> {
    const gid = new mongoose.Types.ObjectId(groupId);

    // Set all active memberships to removed
    await GroupMembership.updateMany(
        { groupId: gid, membershipStatus: 'active' },
        {
            $set: {
                membershipStatus: 'removed',
                removedAtUTC: new Date(),
                note: 'Group deleted',
            },
        }
    );

    // Delete the StudentGroup document
    await StudentGroup.deleteOne({ _id: gid });
}

// ─── Bulk Deletion ──────────────────────────────────────────

/**
 * Attempts to delete multiple groups. Groups with active dependencies
 * (members, exams, campaigns) are skipped. Returns a summary of which
 * groups were deleted and which were skipped with reasons.
 */
export async function bulkDeleteGroups(groupIds: string[]): Promise<BulkDeleteResult> {
    const deleted: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const id of groupIds) {
        const check = await canDeleteGroup(id);

        if (!check.canDelete) {
            const reasons: string[] = [];
            if (check.blockers.activeMemberCount > 0) {
                reasons.push(`${check.blockers.activeMemberCount} active member(s)`);
            }
            if (check.blockers.linkedExams.length > 0) {
                reasons.push(`${check.blockers.linkedExams.length} linked exam(s)`);
            }
            if (check.blockers.linkedCampaigns.length > 0) {
                reasons.push(`${check.blockers.linkedCampaigns.length} linked campaign(s)`);
            }
            skipped.push({ id, reason: reasons.join(', ') });
            continue;
        }

        await executeGroupDeletion(id);
        deleted.push(id);
    }

    return { deleted, skipped };
}


// ─── University Cascade Deletion (Bug 1.30) ─────────────────

export interface CascadeDeleteResult {
    success: boolean;
    deletedCounts: Record<string, number>;
    error?: string;
}

/**
 * Cascade-deletes a university and all related records within a MongoDB transaction.
 * Deletes: ExamCenter, StudentApplication, UniversityCluster membership, cache entries.
 * If any deletion fails, the transaction is aborted.
 *
 * Requirements: 2.30
 */
export async function cascadeDeleteUniversity(
    universityId: string,
    session?: mongoose.ClientSession,
): Promise<CascadeDeleteResult> {
    const uid = new mongoose.Types.ObjectId(universityId);
    const deletedCounts: Record<string, number> = {};

    // Use provided session or create a new one
    const ownSession = !session;
    const txSession = session ?? await mongoose.startSession();

    try {
        if (ownSession) txSession.startTransaction();

        // 1. Delete related ExamCenter records
        const ExamCenter = mongoose.connection.collection('examcenters');
        const ecResult = await ExamCenter.deleteMany({ universityId: uid }, { session: txSession });
        deletedCounts.examCenters = ecResult.deletedCount;

        // 2. Delete related StudentApplication records
        const StudentApplication = mongoose.connection.collection('studentapplications');
        const saResult = await StudentApplication.deleteMany({ universityId: uid }, { session: txSession });
        deletedCounts.studentApplications = saResult.deletedCount;

        // 3. Remove from UniversityCluster membership arrays
        const UniversityCluster = mongoose.connection.collection('universityclusters');
        const ucResult = await UniversityCluster.updateMany(
            { universityIds: uid },
            { $pull: { universityIds: uid } as any },
            { session: txSession },
        );
        deletedCounts.clusterMemberships = ucResult.modifiedCount;

        // 4. Delete the university itself
        const University = mongoose.connection.collection('universities');
        const uResult = await University.deleteOne({ _id: uid }, { session: txSession });
        deletedCounts.university = uResult.deletedCount;

        if (ownSession) await txSession.commitTransaction();

        // 5. Invalidate cache entries (outside transaction)
        try {
            await cacheService.del(`university:${universityId}`);
            await cacheService.del(`universities:list`);
        } catch {
            // Cache invalidation is best-effort
        }

        return { success: true, deletedCounts };
    } catch (err) {
        if (ownSession) {
            try { await txSession.abortTransaction(); } catch { /* ignore */ }
        }
        return {
            success: false,
            deletedCounts,
            error: err instanceof Error ? err.message : String(err),
        };
    } finally {
        if (ownSession) txSession.endSession();
    }
}
