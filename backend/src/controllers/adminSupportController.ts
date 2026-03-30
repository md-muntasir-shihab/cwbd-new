import { Response } from 'express';
import mongoose from 'mongoose';
import AnnouncementNotice from '../models/AnnouncementNotice';
import AuditLog from '../models/AuditLog';
import Notification from '../models/Notification';
import StudentProfile from '../models/StudentProfile';
import { AuthRequest } from '../middlewares/auth';
import { broadcastStudentDashboardEvent } from '../realtime/studentDashboardStream';
import { getClientIp } from '../utils/requestMeta';

function asObjectId(value: unknown): mongoose.Types.ObjectId | null {
    const raw = String(value || '').trim();
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
    return new mongoose.Types.ObjectId(raw);
}

function parsePage(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.max(1, Math.min(200, Number(query.limit || 20)));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

async function createAudit(req: AuthRequest, action: string, details?: Record<string, unknown>): Promise<void> {
    if (!req.user || !mongoose.Types.ObjectId.isValid(req.user._id)) return;
    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(req.user._id),
        actor_role: req.user.role,
        action,
        target_type: 'communication',
        ip_address: getClientIp(req),
        details: details || {},
    });
}

function toObjectIdList(values: string[]): mongoose.Types.ObjectId[] {
    const unique = new Set<string>();
    const output: mongoose.Types.ObjectId[] = [];
    for (const value of values) {
        const cleaned = String(value || '').trim();
        if (!mongoose.Types.ObjectId.isValid(cleaned)) continue;
        if (unique.has(cleaned)) continue;
        unique.add(cleaned);
        output.push(new mongoose.Types.ObjectId(cleaned));
    }
    return output;
}

async function resolveNoticeTargetUserIds(
    target: 'all' | 'groups' | 'students',
    targetIds: string[],
): Promise<mongoose.Types.ObjectId[]> {
    if (target === 'all') return [];
    if (target === 'students') {
        return toObjectIdList(targetIds);
    }

    const groupIds = toObjectIdList(targetIds);
    if (groupIds.length === 0) return [];

    const profiles = await StudentProfile.find({ groupIds: { $in: groupIds } })
        .select('user_id')
        .lean();

    const userIds = profiles.map((profile) => String(profile.user_id || '')).filter(Boolean);
    return toObjectIdList(userIds);
}

export async function adminGetNotices(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const { page, limit, skip } = parsePage(query);

        const filter: Record<string, unknown> = {};
        const target = String(query.target || '').trim();
        if (target) filter.target = target;
        const sourceNewsId = String(query.sourceNewsId || '').trim();
        if (sourceNewsId && mongoose.Types.ObjectId.isValid(sourceNewsId)) {
            filter.sourceNewsId = new mongoose.Types.ObjectId(sourceNewsId);
        }

        const status = String(query.status || '').trim().toLowerCase();
        if (status === 'active') filter.isActive = true;
        if (status === 'inactive') filter.isActive = false;

        const [items, total] = await Promise.all([
            AnnouncementNotice.find(filter)
                .populate('createdBy', 'username full_name role')
                .sort({ startAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AnnouncementNotice.countDocuments(filter),
        ]);

        res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
    } catch (error) {
        console.error('adminGetNotices error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminCreateNotice(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        const body = req.body as Record<string, unknown>;
        const title = String(body.title || '').trim();
        const message = String(body.message || '').trim();
        if (!title || !message) {
            res.status(400).json({ message: 'title and message are required' });
            return;
        }

        const targetRaw = String(body.target || 'all').trim();
        const target = targetRaw === 'groups' || targetRaw === 'students' ? targetRaw : 'all';
        const classification = body.classification && typeof body.classification === 'object'
            ? body.classification as Record<string, unknown>
            : {};

        const createdBy = asObjectId(req.user._id);
        if (!createdBy) {
            res.status(400).json({ message: 'Invalid actor id' });
            return;
        }

        const notice = await AnnouncementNotice.create({
            title,
            message,
            target,
            targetIds: Array.isArray(body.targetIds)
                ? body.targetIds.map((item) => String(item).trim()).filter(Boolean)
                : [],
            sourceNewsId: asObjectId(body.sourceNewsId),
            priority: ['priority', 'breaking'].includes(String(body.priority || '').trim()) ? String(body.priority).trim() : 'normal',
            classification: {
                primaryCategory: String(classification.primaryCategory || body.primaryCategory || '').trim(),
                tags: Array.isArray(classification.tags)
                    ? classification.tags.map((item: unknown) => String(item).trim()).filter(Boolean)
                    : [],
                universityIds: Array.isArray(classification.universityIds)
                    ? classification.universityIds
                        .map((item: unknown) => asObjectId(item))
                        .filter(Boolean)
                    : [],
                clusterIds: Array.isArray(classification.clusterIds)
                    ? classification.clusterIds
                        .map((item: unknown) => asObjectId(item))
                        .filter(Boolean)
                    : [],
                groupIds: Array.isArray(classification.groupIds)
                    ? classification.groupIds
                        .map((item: unknown) => asObjectId(item))
                        .filter(Boolean)
                    : [],
            },
            templateRef: String(body.templateRef || '').trim(),
            triggerRef: String(body.triggerRef || '').trim(),
            startAt: body.startAt ? new Date(String(body.startAt)) : new Date(),
            endAt: body.endAt ? new Date(String(body.endAt)) : null,
            isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
            createdBy,
        });

        const reminderKey = `notice:${String(notice._id)}`;
        const targetUserIds = await resolveNoticeTargetUserIds(target, notice.targetIds || []);
        await Notification.updateOne(
            { reminderKey },
            {
                $set: {
                    title,
                    message,
                    messagePreview: message.slice(0, 220),
                    category: 'update',
                    publishAt: notice.startAt,
                    expireAt: notice.endAt || null,
                    isActive: notice.isActive,
                    linkUrl: '/support',
                    attachmentUrl: '',
                    sourceType: 'notice',
                    sourceId: String(notice._id),
                    targetRoute: '/support',
                    targetEntityId: String(notice._id),
                    priority: notice.priority === 'breaking' ? 'urgent' : (notice.priority === 'priority' ? 'high' : 'normal'),
                    targetRole: 'student',
                    targetUserIds,
                    createdBy,
                    updatedBy: createdBy,
                },
                $setOnInsert: { reminderKey },
            },
            { upsert: true }
        );

        broadcastStudentDashboardEvent({
            type: 'notification_updated',
            meta: { action: 'create', source: 'notice', noticeId: String(notice._id) },
        });

        await createAudit(req, 'notice_created', {
            noticeId: String(notice._id),
            target,
            sourceNewsId: notice.sourceNewsId ? String(notice.sourceNewsId) : '',
            targetIdsCount: Array.isArray(notice.targetIds) ? notice.targetIds.length : 0,
        });

        res.status(201).json({ item: notice, message: 'Notice created successfully' });
    } catch (error) {
        console.error('adminCreateNotice error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function adminToggleNotice(req: AuthRequest, res: Response): Promise<void> {
    try {
        const notice = await AnnouncementNotice.findById(req.params.id);
        if (!notice) {
            res.status(404).json({ message: 'Notice not found' });
            return;
        }

        notice.isActive = !notice.isActive;
        await notice.save();

        const actorId = req.user ? asObjectId(req.user._id) : null;
        await Notification.updateOne(
            { reminderKey: `notice:${String(notice._id)}` },
            {
                $set: {
                    isActive: notice.isActive,
                    updatedBy: actorId || undefined,
                },
            }
        );

        broadcastStudentDashboardEvent({
            type: 'notification_updated',
            meta: { action: 'toggle', source: 'notice', noticeId: String(notice._id), isActive: notice.isActive },
        });

        await createAudit(req, 'notice_toggled', {
            noticeId: String(notice._id),
            isActive: notice.isActive,
        });

        res.json({ item: notice, message: notice.isActive ? 'Notice activated' : 'Notice deactivated' });
    } catch (error) {
        console.error('adminToggleNotice error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function studentGetNotices(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            res.status(401).json({ message: 'Authentication required' });
            return;
        }

        const now = new Date();
        const profile = await StudentProfile.findOne({ user_id: req.user._id }).select('groupIds').lean();
        const groupIds = Array.isArray(profile?.groupIds) ? profile.groupIds.map((id) => String(id)) : [];

        const items = await AnnouncementNotice.find({
            isActive: true,
            startAt: { $lte: now },
            $or: [
                { endAt: null },
                { endAt: { $gte: now } },
            ],
            $and: [
                {
                    $or: [
                        { target: 'all' },
                        { target: 'students', targetIds: String(req.user._id) },
                        ...(groupIds.length > 0 ? [{ target: 'groups', targetIds: { $in: groupIds } }] : []),
                    ],
                },
            ],
        })
            .sort({ startAt: -1, createdAt: -1 })
            .lean();

        res.json({ items });
    } catch (error) {
        console.error('studentGetNotices error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}
