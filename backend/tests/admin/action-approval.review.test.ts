import User from '../../src/models/User';
import { approveApproval, getPendingApprovals, requestApproval } from '../../src/services/actionApprovalService';

describe('action approval review context', () => {
    test('stores enriched review metadata and blocks self-approval', async () => {
        const admin = await User.create({
            full_name: 'Review Admin',
            email: 'review-admin@test.local',
            username: 'review-admin',
            password: 'hashed-password',
            role: 'admin',
            status: 'active',
        });
        const studentA = await User.create({
            full_name: 'Student One',
            email: 'student-one@test.local',
            username: 'student-one',
            password: 'hashed-password',
            role: 'student',
            status: 'active',
        });
        const studentB = await User.create({
            full_name: 'Student Two',
            email: 'student-two@test.local',
            username: 'student-two',
            password: 'hashed-password',
            role: 'student',
            status: 'active',
        });

        const approval = await requestApproval({
            actionKey: 'students.bulk_delete',
            module: 'students',
            action: 'bulk-delete',
            routePath: '/admin/students/bulk-delete',
            method: 'DELETE',
            paramsSnapshot: {},
            querySnapshot: {},
            payloadSnapshot: {
                studentIds: [String(studentA._id), String(studentB._id)],
            },
            actor: {
                userId: String(admin._id),
                role: 'admin',
            },
            requestContext: {
                ipAddress: '10.0.0.5',
                deviceInfo: 'Chrome on Windows',
                browser: 'Chrome',
                platform: 'Windows',
                sessionId: 'session-123',
            },
        });

        expect(approval.targetSummary?.targetType).toBe('students');
        expect(approval.reviewSummary).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'Students selected', value: '2' }),
        ]));
        expect((approval.beforeSnapshot as any)?.students).toHaveLength(2);
        expect(approval.requestContext?.browser).toBe('Chrome');
        expect(approval.afterSnapshot).toEqual(expect.objectContaining({
            effect: expect.stringContaining('Delete student users'),
        }));

        const pending = await getPendingApprovals();
        expect(pending).toHaveLength(1);
        expect(pending[0].reviewSummary).toEqual(expect.arrayContaining([
            expect.objectContaining({ label: 'Action', value: 'Delete selected student accounts and linked records' }),
        ]));
        expect(pending[0].requestContext?.sessionId).toBe('session-123');

        await expect(
            approveApproval(String(approval._id), { userId: String(admin._id), role: 'admin' }),
        ).rejects.toThrow('SELF_APPROVAL_FORBIDDEN');
    });
});
