import { Request, Response } from 'express';
import mongoose from 'mongoose';
import ContentBlock from '../models/ContentBlock';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middlewares/auth';
import { getClientIp } from '../utils/requestMeta';

/* ── helpers ── */

function asObjectId(value: unknown): mongoose.Types.ObjectId | null {
    const raw = String(value || '').trim();
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
    return new mongoose.Types.ObjectId(raw);
}

async function createAudit(req: AuthRequest, action: string, details?: Record<string, unknown>): Promise<void> {
    if (!req.user || !mongoose.Types.ObjectId.isValid(req.user._id)) return;
    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(req.user._id),
        actor_role: req.user.role,
        action,
        target_type: 'content_block',
        ip_address: getClientIp(req),
        details: details || {},
    });
}

const VALID_PLACEMENTS = [
    'HOME_TOP', 'HOME_MID', 'HOME_BOTTOM',
    'HOME_HERO', 'HOME_FEATURES', 'HOME_TESTIMONIALS', 'HOME_CTA',
    'EXAM_LIST', 'STUDENT_DASHBOARD', 'NEWS_PAGE',
    'UNIVERSITY_LIST', 'PRICING_PAGE',
];

/* ═══════════════════════════════════════════════════════════
   PUBLIC  ENDPOINTS
   ═══════════════════════════════════════════════════════════ */

/** GET /api/content-blocks?placement=HOME_TOP */
export async function getPublicContentBlocks(req: Request, res: Response): Promise<void> {
    const placement = String(req.query.placement || '').trim();
    if (!placement || !VALID_PLACEMENTS.includes(placement)) {
        res.status(400).json({ message: 'Valid placement query param required' });
        return;
    }

    const now = new Date();
    const blocks = await ContentBlock.find({
        isEnabled: true,
        placements: placement,
        $or: [{ startAtUTC: null }, { startAtUTC: { $lte: now } }],
        $and: [{ $or: [{ endAtUTC: null }, { endAtUTC: { $gte: now } }] }],
    })
        .select('title subtitle body imageUrl ctaText ctaUrl type styleVariant priority dismissible')
        .sort({ priority: -1, createdAt: -1 })
        .limit(10)
        .lean();

    res.json({ blocks });
}

/** POST /api/content-blocks/:id/impression */
export async function trackContentBlockImpression(req: Request, res: Response): Promise<void> {
    const id = asObjectId(req.params.id);
    if (!id) { res.status(400).json({ message: 'Invalid id' }); return; }
    await ContentBlock.findByIdAndUpdate(id, { $inc: { impressionCount: 1 } });
    res.json({ ok: true });
}

/** POST /api/content-blocks/:id/click */
export async function trackContentBlockClick(req: Request, res: Response): Promise<void> {
    const id = asObjectId(req.params.id);
    if (!id) { res.status(400).json({ message: 'Invalid id' }); return; }
    await ContentBlock.findByIdAndUpdate(id, { $inc: { clickCount: 1 } });
    res.json({ ok: true });
}

/* ═══════════════════════════════════════════════════════════
   ADMIN  ENDPOINTS
   ═══════════════════════════════════════════════════════════ */

/** GET /admin/content-blocks */
export async function adminGetContentBlocks(req: AuthRequest, res: Response): Promise<void> {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    const placement = String(req.query.placement || '').trim();
    if (placement && VALID_PLACEMENTS.includes(placement)) filter.placements = placement;
    if (req.query.type) filter.type = String(req.query.type);
    if (req.query.isEnabled === 'true') filter.isEnabled = true;
    if (req.query.isEnabled === 'false') filter.isEnabled = false;

    const [items, total] = await Promise.all([
        ContentBlock.find(filter)
            .populate('createdByAdminId', 'username full_name')
            .sort({ priority: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        ContentBlock.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
}

/** GET /admin/content-blocks/:id */
export async function adminGetContentBlock(req: AuthRequest, res: Response): Promise<void> {
    const id = asObjectId(req.params.id);
    if (!id) { res.status(400).json({ message: 'Invalid id' }); return; }

    const block = await ContentBlock.findById(id)
        .populate('createdByAdminId', 'username full_name')
        .lean();
    if (!block) { res.status(404).json({ message: 'Content block not found' }); return; }
    res.json({ data: block });
}

/** POST /admin/content-blocks */
export async function adminCreateContentBlock(req: AuthRequest, res: Response): Promise<void> {
    if (!req.user?._id) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    const { title, subtitle, body, imageUrl, ctaText, ctaUrl, type, placements, styleVariant, isEnabled, startAtUTC, endAtUTC, priority, dismissible, audienceRules } = req.body as Record<string, unknown>;

    if (!title || !type || !Array.isArray(placements) || placements.length === 0) {
        res.status(400).json({ message: 'title, type, and placements[] are required' });
        return;
    }

    const block = await ContentBlock.create({
        title: String(title).trim(),
        subtitle: subtitle ? String(subtitle).trim() : undefined,
        body: body ? String(body) : undefined,
        imageUrl: imageUrl ? String(imageUrl).trim() : undefined,
        ctaText: ctaText ? String(ctaText).trim() : undefined,
        ctaUrl: ctaUrl ? String(ctaUrl).trim() : undefined,
        type: String(type),
        placements,
        styleVariant: styleVariant ? String(styleVariant).trim() : undefined,
        isEnabled: isEnabled !== false,
        startAtUTC: startAtUTC ? new Date(String(startAtUTC)) : undefined,
        endAtUTC: endAtUTC ? new Date(String(endAtUTC)) : undefined,
        priority: typeof priority === 'number' ? priority : 0,
        dismissible: dismissible !== false,
        audienceRules: audienceRules || undefined,
        createdByAdminId: new mongoose.Types.ObjectId(String(req.user._id)),
    });

    await createAudit(req, 'content_block_created', { blockId: block._id, title: block.title });
    res.status(201).json({ data: block, message: 'Content block created' });
}

/** PUT /admin/content-blocks/:id */
export async function adminUpdateContentBlock(req: AuthRequest, res: Response): Promise<void> {
    const id = asObjectId(req.params.id);
    if (!id) { res.status(400).json({ message: 'Invalid id' }); return; }

    const body = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    const stringFields = ['title', 'subtitle', 'body', 'imageUrl', 'ctaText', 'ctaUrl', 'type', 'styleVariant'] as const;
    for (const field of stringFields) {
        if (typeof body[field] === 'string') update[field] = body[field];
    }
    if (Array.isArray(body.placements)) update.placements = body.placements;
    if (typeof body.isEnabled === 'boolean') update.isEnabled = body.isEnabled;
    if (body.startAtUTC !== undefined) update.startAtUTC = body.startAtUTC ? new Date(String(body.startAtUTC)) : null;
    if (body.endAtUTC !== undefined) update.endAtUTC = body.endAtUTC ? new Date(String(body.endAtUTC)) : null;
    if (typeof body.priority === 'number') update.priority = body.priority;
    if (typeof body.dismissible === 'boolean') update.dismissible = body.dismissible;
    if (body.audienceRules !== undefined) update.audienceRules = body.audienceRules;

    const block = await ContentBlock.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!block) { res.status(404).json({ message: 'Content block not found' }); return; }
    await createAudit(req, 'content_block_updated', { blockId: id });
    res.json({ data: block, message: 'Content block updated' });
}

/** DELETE /admin/content-blocks/:id */
export async function adminDeleteContentBlock(req: AuthRequest, res: Response): Promise<void> {
    const id = asObjectId(req.params.id);
    if (!id) { res.status(400).json({ message: 'Invalid id' }); return; }

    const block = await ContentBlock.findByIdAndDelete(id);
    if (!block) { res.status(404).json({ message: 'Content block not found' }); return; }
    await createAudit(req, 'content_block_deleted', { blockId: id, title: block.title });
    res.json({ message: 'Content block deleted' });
}

/** PATCH /admin/content-blocks/:id/toggle */
export async function adminToggleContentBlock(req: AuthRequest, res: Response): Promise<void> {
    const id = asObjectId(req.params.id);
    if (!id) { res.status(400).json({ message: 'Invalid id' }); return; }

    const block = await ContentBlock.findById(id);
    if (!block) { res.status(404).json({ message: 'Content block not found' }); return; }

    block.isEnabled = !block.isEnabled;
    await block.save();
    await createAudit(req, 'content_block_toggled', { blockId: id, isEnabled: block.isEnabled });
    res.json({ data: block, message: `Content block ${block.isEnabled ? 'enabled' : 'disabled'}` });
}
