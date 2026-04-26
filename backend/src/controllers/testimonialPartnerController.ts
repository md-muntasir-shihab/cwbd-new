import { Request, Response } from 'express';
import slugify from 'slugify';
import Testimonial from '../models/Testimonial';
import Partner from '../models/Partner';
import { ResponseBuilder } from '../utils/responseBuilder';

const str = (v: unknown, max = 500) => String(v || '').trim().slice(0, max);
const num = (v: unknown, min: number, max: number, def: number) => Math.min(max, Math.max(min, Number(v) || def));
const enumVal = <T extends string>(v: unknown, allowed: T[], def: T): T => allowed.includes(v as T) ? (v as T) : def;
const CATEGORIES = ['student', 'parent', 'teacher', 'alumni', 'other'] as const;
const STATUSES = ['draft', 'pending', 'approved', 'rejected', 'archived'] as const;

// ═══════════════════════════════════════════════════════════
//  PUBLIC
// ═══════════════════════════════════════════════════════════
export async function getPublicTestimonials(req: Request, res: Response): Promise<void> {
    try {
        const category = str(req.query.category, 30);
        const filter: Record<string, unknown> = { status: 'approved' };
        if (category && category !== 'all') filter.category = category;
        const items = await Testimonial.find(filter).sort({ featured: -1, displayOrder: 1, createdAt: -1 })
            .select('-createdBy -reviewedBy -rejectionReason -linkedUserId').lean();
        ResponseBuilder.send(res, 200, ResponseBuilder.success(items));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}
export async function getPublicFeaturedTestimonials(_req: Request, res: Response): Promise<void> {
    try {
        const items = await Testimonial.find({ status: 'approved', featured: true }).sort({ displayOrder: 1 }).limit(6)
            .select('-createdBy -reviewedBy -rejectionReason -linkedUserId').lean();
        ResponseBuilder.send(res, 200, ResponseBuilder.success(items));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}
export async function getPublicTestimonialBySlug(req: Request, res: Response): Promise<void> {
    try {
        const item = await Testimonial.findOne({ slug: req.params.slug, status: 'approved' })
            .select('-createdBy -reviewedBy -rejectionReason -linkedUserId').lean();
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(item));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}
export async function getPublicPartners(_req: Request, res: Response): Promise<void> {
    try {
        const items = await Partner.find({ isActive: true }).sort({ order: 1 }).lean();
        ResponseBuilder.send(res, 200, ResponseBuilder.success(items));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}


// ═══════════════════════════════════════════════════════════
//  ADMIN TESTIMONIALS
// ═══════════════════════════════════════════════════════════
function buildTestimonialPayload(body: Record<string, unknown>, actorId?: string) {
    const name = str(body.name, 100);
    return {
        name,
        role: str(body.role, 80) || 'Student',
        university: str(body.university, 200),
        department: str(body.department, 100),
        batch: str(body.batch, 20),
        location: str(body.location, 100),
        avatarUrl: str(body.avatarUrl, 500),
        shortQuote: str(body.shortQuote, 200),
        fullQuote: str(body.fullQuote || body.quote, 2000),
        rating: num(body.rating, 1, 5, 5),
        category: enumVal(body.category, [...CATEGORIES], 'student'),
        status: enumVal(body.status, [...STATUSES], 'approved'),
        featured: Boolean(body.featured),
        displayOrder: num(body.displayOrder || body.order, 0, 9999, 0),
        sourceType: enumVal(body.sourceType, ['admin', 'user_submitted', 'imported'], 'admin'),
        socialProofLabel: str(body.socialProofLabel, 60),
        examReference: str(body.examReference, 100),
        slug: str(body.slug, 100) || slugify(name, { lower: true, strict: true }),
        ...(actorId ? { createdBy: actorId } : {}),
    };
}

export async function adminGetTestimonials(req: Request, res: Response): Promise<void> {
    try {
        const status = str(req.query.status, 20);
        const category = str(req.query.category, 30);
        const q = str(req.query.q || req.query.search, 100);
        const filter: Record<string, unknown> = {};
        if (status && status !== 'all') filter.status = status;
        if (category && category !== 'all') filter.category = category;
        if (q) filter.name = { $regex: q, $options: 'i' };
        const items = await Testimonial.find(filter).sort({ displayOrder: 1, createdAt: -1 }).lean();
        const counts = {
            total: await Testimonial.countDocuments({}),
            approved: await Testimonial.countDocuments({ status: 'approved' }),
            pending: await Testimonial.countDocuments({ status: 'pending' }),
            featured: await Testimonial.countDocuments({ featured: true, status: 'approved' }),
        };
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ items, counts }));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}

export async function adminCreateTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const actorId = (req as any).user?._id;
        const payload = buildTestimonialPayload(req.body, actorId);
        if (!payload.name || !payload.fullQuote) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Name and quote are required'));
            return;
        }
        const item = await Testimonial.create(payload);
        ResponseBuilder.send(res, 201, ResponseBuilder.created(item));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Create failed')); }
}

export async function adminUpdateTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const payload = buildTestimonialPayload(req.body);
        const item = await Testimonial.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true });
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(item));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Update failed')); }
}

export async function adminDeleteTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const item = await Testimonial.findByIdAndDelete(req.params.id);
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ message: 'Deleted' }));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Delete failed')); }
}

export async function adminApproveTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const actorId = (req as any).user?._id;
        const item = await Testimonial.findByIdAndUpdate(req.params.id, {
            $set: { status: 'approved', reviewedBy: actorId, reviewedAt: new Date(), rejectionReason: '' },
        }, { new: true });
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(item, 'Approved'));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}

export async function adminRejectTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const actorId = (req as any).user?._id;
        const item = await Testimonial.findByIdAndUpdate(req.params.id, {
            $set: { status: 'rejected', reviewedBy: actorId, reviewedAt: new Date(), rejectionReason: str(req.body.reason, 500) },
        }, { new: true });
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(item, 'Rejected'));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}

export async function adminToggleFeatureTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const item = await Testimonial.findById(req.params.id);
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        item.featured = !item.featured;
        await item.save();
        ResponseBuilder.send(res, 200, ResponseBuilder.success(item, item.featured ? 'Featured' : 'Unfeatured'));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}

export async function adminReorderTestimonial(req: Request, res: Response): Promise<void> {
    try {
        const ids = req.body.ids;
        if (!Array.isArray(ids)) { ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'ids array required')); return; }
        await Promise.all(ids.map((id: string, i: number) => Testimonial.findByIdAndUpdate(id, { $set: { displayOrder: i } })));
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ message: 'Reordered', count: ids.length }));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}

// ═══════════════════════════════════════════════════════════
//  ADMIN PARTNERS
// ═══════════════════════════════════════════════════════════
export async function adminGetPartners(_req: Request, res: Response): Promise<void> {
    try {
        const items = await Partner.find({}).sort({ order: 1, createdAt: -1 }).lean();
        ResponseBuilder.send(res, 200, ResponseBuilder.success(items));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}
export async function adminCreatePartner(req: Request, res: Response): Promise<void> {
    try {
        const item = await Partner.create({
            name: str(req.body.name, 100), logoUrl: str(req.body.logoUrl, 500),
            websiteUrl: str(req.body.websiteUrl, 500),
            tier: enumVal(req.body.tier, ['platinum', 'gold', 'silver', 'bronze', 'partner'], 'partner'),
            isActive: req.body.isActive !== false, order: num(req.body.order, 0, 9999, 0),
        });
        ResponseBuilder.send(res, 201, ResponseBuilder.created(item));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}
export async function adminUpdatePartner(req: Request, res: Response): Promise<void> {
    try {
        const item = await Partner.findByIdAndUpdate(req.params.id, {
            $set: {
                name: str(req.body.name, 100), logoUrl: str(req.body.logoUrl, 500),
                websiteUrl: str(req.body.websiteUrl, 500),
                tier: enumVal(req.body.tier, ['platinum', 'gold', 'silver', 'bronze', 'partner'], 'partner'),
                isActive: req.body.isActive !== false, order: num(req.body.order, 0, 9999, 0),
            }
        }, { new: true });
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success(item));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}
export async function adminDeletePartner(req: Request, res: Response): Promise<void> {
    try {
        const item = await Partner.findByIdAndDelete(req.params.id);
        if (!item) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Not found')); return; }
        ResponseBuilder.send(res, 200, ResponseBuilder.success({ message: 'Deleted' }));
    } catch { ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Failed')); }
}
