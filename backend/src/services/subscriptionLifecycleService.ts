import mongoose from 'mongoose';
import User from '../models/User';
import SubscriptionPlan from '../models/SubscriptionPlan';
import UserSubscription, { IUserSubscription, UserSubscriptionStatus } from '../models/UserSubscription';
import ManualPayment, { IManualPayment, PaymentStatus } from '../models/ManualPayment';
import FinanceInvoice from '../models/FinanceInvoice';
import StudentDueLedger from '../models/StudentDueLedger';
import FinanceTransaction from '../models/FinanceTransaction';
import { createIncomeFromPayment, nextInvoiceNo, nextTxnCode } from './financeCenterService';
import { triggerAutoSend } from './notificationOrchestrationService';

// ── Hub Integration: Finance + Campaign helpers ─────────────────────

async function emitFinanceTransaction(opts: {
    userId: string;
    planId: string;
    planName: string;
    amount: number;
    eventType: 'subscription_created' | 'subscription_activated' | 'subscription_renewed' | 'subscription_cancelled' | 'subscription_extended';
    actorId?: string | null;
}): Promise<void> {
    try {
        const direction = opts.eventType === 'subscription_cancelled' ? 'expense' : 'income';
        const txnCode = await nextTxnCode();
        await FinanceTransaction.create({
            txnCode,
            direction,
            amount: opts.amount,
            currency: 'BDT',
            dateUTC: new Date(),
            accountCode: direction === 'income' ? '4100' : '5100',
            categoryLabel: direction === 'income' ? 'Subscription Revenue' : 'Subscription Cancellation',
            description: `${opts.eventType.replace(/_/g, ' ')} — ${opts.planName}`,
            status: direction === 'income' ? 'paid' : 'recorded',
            method: 'system',
            sourceType: 'subscription_payment',
            sourceId: opts.planId,
            studentId: new mongoose.Types.ObjectId(opts.userId),
            planId: new mongoose.Types.ObjectId(opts.planId),
            paidAtUTC: new Date(),
            createdByAdminId: opts.actorId ? new mongoose.Types.ObjectId(opts.actorId) : new mongoose.Types.ObjectId(opts.userId),
        });
    } catch (err) {
        console.error(`[SubscriptionLifecycle] Finance transaction emit failed for ${opts.eventType}:`, err);
    }
}

async function emitCampaignTrigger(opts: {
    userId: string;
    planName: string;
    eventType: string;
    actorId?: string | null;
}): Promise<void> {
    try {
        await triggerAutoSend(
            opts.eventType,
            [opts.userId],
            { planName: opts.planName, eventType: opts.eventType },
            opts.actorId || opts.userId,
        );
    } catch (err) {
        console.error(`[SubscriptionLifecycle] Campaign trigger failed for ${opts.eventType}:`, err);
    }
}

type LeanPlan = Record<string, unknown> & {
    _id: mongoose.Types.ObjectId;
    code?: string;
    slug?: string;
    name?: string;
    durationDays?: number;
    priceBDT?: number;
    price?: number;
    isFree?: boolean;
    ctaLabel?: string;
    contactCtaLabel?: string;
    ctaUrl?: string;
    contactCtaUrl?: string;
    ctaMode?: string;
};

export type SubscriptionAssignmentInput = {
    userId: string;
    planId?: string;
    planCode?: string;
    actorId?: string | null;
    startAtUTC?: Date | string | null;
    expiresAtUTC?: Date | string | null;
    subscriptionStatus?: UserSubscriptionStatus | string | null;
    paymentAmount?: number | string | null;
    paymentStatus?: PaymentStatus | string | null;
    paymentMethod?: string | null;
    paymentDate?: Date | string | null;
    transactionId?: string | null;
    notes?: string | null;
    paymentNotes?: string | null;
    proofUrl?: string | null;
    recordPayment?: boolean | string | null;
    autoRenewEnabled?: boolean | string | null;
    replaceExisting?: boolean | string | null;
    dueDateUTC?: Date | string | null;
};

export type SubscriptionAssignmentResult = {
    user: { _id: mongoose.Types.ObjectId };
    plan: LeanPlan;
    subscription: IUserSubscription;
    payment: IManualPayment | null;
    invoice: mongoose.Document | null;
    cache: Record<string, unknown>;
};

function safeString(value: unknown, fallback = ''): string {
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim();
    return text || fallback;
}

function safeNumber(value: unknown, fallback = 0): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (value === null || value === undefined) return fallback;
    const text = String(value).trim().toLowerCase();
    if (!text) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(text);
}

function normalizePaymentMethod(value: unknown): IManualPayment['method'] {
    const method = safeString(value, 'manual').toLowerCase();
    if (['bkash', 'nagad', 'rocket', 'upay', 'cash', 'manual', 'bank', 'card', 'sslcommerz'].includes(method)) {
        return method as IManualPayment['method'];
    }
    return 'manual';
}

function normalizePaymentStatus(value: unknown): PaymentStatus | null {
    const status = safeString(value).toLowerCase();
    if (['pending', 'paid', 'failed', 'refunded', 'rejected'].includes(status)) {
        return status as PaymentStatus;
    }
    return null;
}

function normalizeSubscriptionStatus(value: unknown): UserSubscriptionStatus | null {
    const status = safeString(value).toLowerCase();
    if (['active', 'expired', 'pending', 'suspended'].includes(status)) {
        return status as UserSubscriptionStatus;
    }
    return null;
}

function toObjectId(value: unknown): mongoose.Types.ObjectId | null {
    const raw = safeString(value);
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
    return new mongoose.Types.ObjectId(raw);
}

function parseDate(value: unknown, fallback?: Date | null): Date | null {
    if (!value) return fallback ?? null;
    const parsed = new Date(String(value));
    return Number.isFinite(parsed.getTime()) ? parsed : (fallback ?? null);
}

function buildExpiryDate(startAtUTC: Date, plan: LeanPlan): Date {
    const durationDays = Math.max(1, safeNumber(plan.durationDays, 30));
    return new Date(startAtUTC.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

async function resolvePlanDocument(input: {
    planId?: string;
    planCode?: string;
}): Promise<LeanPlan | null> {
    const planId = safeString(input.planId);
    const planCode = safeString(input.planCode).toLowerCase();
    if (planId && mongoose.Types.ObjectId.isValid(planId)) {
        const plan = await SubscriptionPlan.findById(planId).lean();
        if (plan) return plan as unknown as LeanPlan;
    }
    if (planCode) {
        const plan = await SubscriptionPlan.findOne({ code: planCode }).lean();
        if (plan) return plan as unknown as LeanPlan;
    }
    return null;
}

export async function syncUserSubscriptionCache(payload: {
    userId: string;
    plan: LeanPlan | Record<string, unknown> | null;
    status: string;
    startAtUTC?: Date | null;
    expiresAtUTC?: Date | null;
}) {
    const plan = payload.plan;
    const startAtUTC = payload.startAtUTC || new Date();
    const expiresAtUTC = payload.expiresAtUTC || null;
    const active = payload.status === 'active' && !!expiresAtUTC && new Date(expiresAtUTC).getTime() > Date.now();
    const planObjectId = plan && mongoose.Types.ObjectId.isValid(String(plan._id || ''))
        ? new mongoose.Types.ObjectId(String(plan._id))
        : null;
    const cache = {
        plan: plan ? safeString(plan.code || plan.slug || plan._id) : '',
        planCode: plan ? safeString(plan.code) : '',
        planId: planObjectId,
        planSlug: plan ? safeString(plan.slug || plan.code) : '',
        planName: plan ? safeString(plan.name) : '',
        isActive: active,
        startDate: startAtUTC,
        expiryDate: expiresAtUTC,
        ctaLabel: plan ? safeString(plan.ctaLabel || plan.contactCtaLabel, 'Subscribe Now') : 'View Plans',
        ctaUrl: plan ? safeString(plan.ctaUrl || plan.contactCtaUrl, '/subscription-plans') : '/subscription-plans',
        ctaMode: plan ? safeString(plan.ctaMode, 'contact') : 'contact',
        assignedBy: null,
        assignedAt: new Date(),
    };
    await User.findByIdAndUpdate(payload.userId, { $set: { subscription: cache } });
    return cache;
}

export async function recomputeStudentDueLedger(studentId: string, actorId?: string | null, note?: string) {
    const studentObjectId = toObjectId(studentId);
    if (!studentObjectId) return null;

    const totals = await FinanceInvoice.aggregate([
        {
            $match: {
                studentId: studentObjectId,
                isDeleted: false,
                status: { $in: ['unpaid', 'partial', 'overdue'] },
            },
        },
        {
            $group: {
                _id: null,
                totalDue: {
                    $sum: {
                        $max: [
                            { $subtract: ['$amountBDT', '$paidAmountBDT'] },
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    const existing = await StudentDueLedger.findOne({ studentId: studentObjectId }).lean();
    const computedDue = Math.max(0, safeNumber(totals[0]?.totalDue, 0));
    const manualAdjustment = safeNumber(existing?.manualAdjustment, 0);
    const waiverAmount = safeNumber(existing?.waiverAmount, 0);
    const updatedBy = toObjectId(actorId) || existing?.updatedBy || studentObjectId;

    return StudentDueLedger.findOneAndUpdate(
        { studentId: studentObjectId },
        {
            $set: {
                computedDue,
                netDue: computedDue + manualAdjustment - waiverAmount,
                updatedBy,
                lastComputedAt: new Date(),
                ...(note ? { note } : {}),
            },
            $setOnInsert: {
                manualAdjustment,
                waiverAmount,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function expireCurrentSubscriptions(
    userId: string,
    actorId?: string | null,
    exceptSubscriptionId?: string | null,
) {
    const filter: Record<string, unknown> = {
        userId: toObjectId(userId),
        status: { $in: ['active', 'pending', 'suspended'] },
    };
    if (exceptSubscriptionId && mongoose.Types.ObjectId.isValid(exceptSubscriptionId)) {
        filter._id = { $ne: new mongoose.Types.ObjectId(exceptSubscriptionId) };
    }
    await UserSubscription.updateMany(
        filter,
        {
            $set: {
                status: 'expired',
                expiresAtUTC: new Date(),
                ...(toObjectId(actorId) ? { activatedByAdminId: toObjectId(actorId) } : {}),
            },
        }
    );
}

async function ensureSubscriptionInvoice(input: {
    studentId: mongoose.Types.ObjectId;
    planId: mongoose.Types.ObjectId;
    amountBDT: number;
    dueDateUTC?: Date | null;
    notes?: string;
    actorId?: string | null;
}) {
    if (!(input.amountBDT > 0)) return null;

    const existing = await FinanceInvoice.findOne({
        studentId: input.studentId,
        planId: input.planId,
        purpose: 'subscription',
        isDeleted: false,
        status: { $in: ['unpaid', 'partial', 'overdue'] },
    }).sort({ createdAt: -1 });

    const dueDateUTC = input.dueDateUTC || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (existing) {
        existing.amountBDT = input.amountBDT;
        existing.status = existing.paidAmountBDT > 0 ? 'partial' : 'unpaid';
        existing.dueDateUTC = dueDateUTC;
        existing.notes = input.notes || existing.notes || '';
        await existing.save();
        return existing;
    }

    const createdByAdminId = toObjectId(input.actorId) || input.studentId;
    const invoiceNo = await nextInvoiceNo();
    return FinanceInvoice.create({
        invoiceNo,
        studentId: input.studentId,
        purpose: 'subscription',
        planId: input.planId,
        amountBDT: input.amountBDT,
        paidAmountBDT: 0,
        status: 'unpaid',
        dueDateUTC,
        issuedAtUTC: new Date(),
        notes: input.notes || '',
        createdByAdminId,
    });
}

async function findRecentEquivalentAssignment(input: {
    userId: mongoose.Types.ObjectId;
    planId: mongoose.Types.ObjectId;
    subscriptionStatus: UserSubscriptionStatus;
    startAtUTC: Date;
    expiresAtUTC: Date;
    planIsFree: boolean;
    planAmount: number;
    paymentStatus: PaymentStatus | null;
}) {
    const duplicateWindowStart = new Date(Date.now() - (2 * 60 * 1000));
    const existingSubscription = await UserSubscription.findOne({
        userId: input.userId,
        planId: input.planId,
        createdAt: { $gte: duplicateWindowStart },
    }).sort({ createdAt: -1, updatedAt: -1 });

    if (!existingSubscription) return null;

    const sameStatus = existingSubscription.status === input.subscriptionStatus;
    const sameStart = Math.abs(existingSubscription.startAtUTC.getTime() - input.startAtUTC.getTime()) <= 60 * 1000;
    const sameExpiry = Math.abs(existingSubscription.expiresAtUTC.getTime() - input.expiresAtUTC.getTime()) <= 60 * 1000;
    if (!sameStatus || !sameStart || !sameExpiry) {
        return null;
    }

    let payment: IManualPayment | null = null;
    if (input.planIsFree) {
        if (existingSubscription.paymentId) return null;
    } else {
        payment = existingSubscription.paymentId
            ? await ManualPayment.findById(existingSubscription.paymentId)
            : await ManualPayment.findOne({
                studentId: input.userId,
                subscriptionPlanId: input.planId,
                createdAt: { $gte: duplicateWindowStart },
            }).sort({ createdAt: -1, updatedAt: -1 });

        if (!payment) return null;
        if (Math.abs(Number(payment.amount || 0) - input.planAmount) > 0.001) return null;
        if (input.paymentStatus && payment.status !== input.paymentStatus) return null;
    }

    const invoice = !input.planIsFree && input.paymentStatus !== 'paid'
        ? await FinanceInvoice.findOne({
            studentId: input.userId,
            planId: input.planId,
            purpose: 'subscription',
            isDeleted: false,
            status: { $in: ['unpaid', 'partial', 'overdue'] },
        }).sort({ createdAt: -1, updatedAt: -1 })
        : null;

    return {
        subscription: existingSubscription,
        payment,
        invoice,
    };
}

export async function assignSubscriptionLifecycle(input: SubscriptionAssignmentInput): Promise<SubscriptionAssignmentResult> {
    const userObjectId = toObjectId(input.userId);
    if (!userObjectId) {
        throw new Error('Valid userId is required');
    }

    const [user, plan] = await Promise.all([
        User.findById(userObjectId).select('_id role').lean(),
        resolvePlanDocument({ planId: input.planId, planCode: input.planCode }),
    ]);

    if (!user) {
        throw new Error('User not found');
    }
    if (!plan) {
        throw new Error('Plan not found');
    }

    const startAtUTC = parseDate(input.startAtUTC, new Date()) || new Date();
    const expiresAtUTC = parseDate(input.expiresAtUTC, buildExpiryDate(startAtUTC, plan)) || buildExpiryDate(startAtUTC, plan);
    const actorObjectId = toObjectId(input.actorId) || null;
    const replaceExisting = input.replaceExisting === undefined ? true : toBoolean(input.replaceExisting, true);
    const planAmount = Math.max(0, safeNumber(input.paymentAmount, safeNumber(plan.priceBDT, safeNumber(plan.price, 0))));
    const planIsFree = toBoolean(plan.isFree, false) || planAmount <= 0;

    const requestedSubscriptionStatus = normalizeSubscriptionStatus(input.subscriptionStatus);
    const requestedPaymentStatus = normalizePaymentStatus(input.paymentStatus);

    let paymentStatus: PaymentStatus | null = null;
    if (!planIsFree) {
        paymentStatus = requestedPaymentStatus;
        if (!paymentStatus) {
            if (requestedSubscriptionStatus && requestedSubscriptionStatus !== 'active') {
                paymentStatus = 'pending';
            } else if (input.recordPayment !== undefined) {
                paymentStatus = toBoolean(input.recordPayment, true) ? 'paid' : 'pending';
            } else {
                paymentStatus = 'paid';
            }
        }
    }

    const subscriptionStatus: UserSubscriptionStatus = requestedSubscriptionStatus
        || (planIsFree ? 'active' : (paymentStatus === 'paid' ? 'active' : 'pending'));
    const planObjectId = new mongoose.Types.ObjectId(String(plan._id));

    const recentEquivalentAssignment = await findRecentEquivalentAssignment({
        userId: userObjectId,
        planId: planObjectId,
        subscriptionStatus,
        startAtUTC,
        expiresAtUTC,
        planIsFree,
        planAmount,
        paymentStatus,
    });

    if (recentEquivalentAssignment) {
        const cache = await syncUserSubscriptionCache({
            userId: String(userObjectId),
            plan,
            status: recentEquivalentAssignment.subscription.status,
            startAtUTC: recentEquivalentAssignment.subscription.startAtUTC,
            expiresAtUTC: recentEquivalentAssignment.subscription.expiresAtUTC,
        });

        await recomputeStudentDueLedger(
            String(userObjectId),
            input.actorId,
            safeString(input.notes || `Subscription sync for ${safeString(plan.name)}`),
        );

        return {
            user: { _id: userObjectId },
            plan,
            subscription: recentEquivalentAssignment.subscription,
            payment: recentEquivalentAssignment.payment,
            invoice: recentEquivalentAssignment.invoice,
            cache,
        };
    }

    if (replaceExisting) {
        await expireCurrentSubscriptions(String(userObjectId), input.actorId);
    }

    const subscription = await UserSubscription.create({
        userId: userObjectId,
        planId: planObjectId,
        status: subscriptionStatus,
        startAtUTC,
        expiresAtUTC,
        activatedByAdminId: actorObjectId,
        notes: safeString(input.notes || `Assigned ${safeString(plan.name, 'subscription plan')}`),
        autoRenewEnabled: toBoolean(input.autoRenewEnabled, false),
    });

    let payment: IManualPayment | null = null;
    let invoice: mongoose.Document | null = null;
    if (!planIsFree && planAmount > 0) {
        const paymentDate = parseDate(input.paymentDate, new Date()) || new Date();
        payment = await ManualPayment.create({
            studentId: userObjectId,
            subscriptionPlanId: planObjectId,
            amount: planAmount,
            currency: 'BDT',
            method: normalizePaymentMethod(input.paymentMethod),
            status: paymentStatus || 'pending',
            date: paymentDate,
            paidAt: paymentStatus === 'paid' ? paymentDate : null,
            approvedAt: paymentStatus === 'paid' ? paymentDate : null,
            approvedBy: paymentStatus === 'paid' ? actorObjectId : null,
            verifiedByAdminId: paymentStatus === 'paid' ? actorObjectId : null,
            transactionId: safeString(input.transactionId),
            reference: safeString(input.transactionId),
            proofUrl: safeString(input.proofUrl),
            proofFileUrl: safeString(input.proofUrl),
            notes: safeString(input.paymentNotes || input.notes || `Subscription payment for ${safeString(plan.name)}`),
            entryType: 'subscription',
            recordedBy: actorObjectId || userObjectId,
        });

        subscription.paymentId = payment._id as mongoose.Types.ObjectId;
        await subscription.save();

        if (paymentStatus === 'paid') {
            await createIncomeFromPayment({
                paymentId: String(payment._id),
                studentId: String(userObjectId),
                amount: planAmount,
                method: payment.method,
                sourceType: 'subscription_payment',
                accountCode: '4100',
                categoryLabel: 'Subscription Revenue',
                description: `Subscription payment for ${safeString(plan.name)}`,
                adminId: String(actorObjectId || userObjectId),
                planId: String(plan._id),
                paidAtUTC: paymentDate,
            });
        } else {
            invoice = await ensureSubscriptionInvoice({
                studentId: userObjectId,
                planId: planObjectId,
                amountBDT: planAmount,
                dueDateUTC: parseDate(input.dueDateUTC, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
                notes: safeString(input.paymentNotes || input.notes || `Subscription due for ${safeString(plan.name)}`),
                actorId: input.actorId,
            });
        }
    }

    const cache = await syncUserSubscriptionCache({
        userId: String(userObjectId),
        plan,
        status: subscriptionStatus,
        startAtUTC,
        expiresAtUTC,
    });

    await recomputeStudentDueLedger(String(userObjectId), input.actorId, safeString(input.notes || `Subscription sync for ${safeString(plan.name)}`));

    // ── Hub Integration: emit finance transaction + campaign trigger ──
    const planAmountForFinance = planIsFree ? 0 : planAmount;
    if (planAmountForFinance > 0) {
        await emitFinanceTransaction({
            userId: String(userObjectId),
            planId: String(plan._id),
            planName: safeString(plan.name, 'subscription plan'),
            amount: planAmountForFinance,
            eventType: 'subscription_created',
            actorId: input.actorId,
        });
    }
    await emitCampaignTrigger({
        userId: String(userObjectId),
        planName: safeString(plan.name, 'subscription plan'),
        eventType: 'subscription_created',
        actorId: input.actorId,
    });

    return {
        user: { _id: userObjectId },
        plan,
        subscription,
        payment,
        invoice,
        cache,
    };
}

export async function activateSubscriptionFromPayment(
    paymentLike: IManualPayment | Record<string, unknown>,
    actorId?: string | null,
) {
    const paymentId = toObjectId(paymentLike._id);
    const studentId = toObjectId(paymentLike.studentId);
    const planId = toObjectId(paymentLike.subscriptionPlanId);
    if (!paymentId || !studentId || !planId) return null;

    const plan = await SubscriptionPlan.findById(planId).lean();
    if (!plan) return null;

    let subscription = await UserSubscription.findOne({ paymentId }).sort({ updatedAt: -1, createdAt: -1 });
    if (!subscription) {
        subscription = await UserSubscription.findOne({
            userId: studentId,
            planId,
            status: { $in: ['pending', 'suspended', 'active'] },
        }).sort({ updatedAt: -1, createdAt: -1 });
    }

    const startAtUTC = parseDate(
        (paymentLike as { paidAt?: Date | string | null; date?: Date | string | null }).paidAt
        || (paymentLike as { date?: Date | string | null }).date,
        new Date()
    ) || new Date();
    const expiresAtUTC = buildExpiryDate(startAtUTC, plan as unknown as LeanPlan);
    const actorObjectId = toObjectId(actorId) || toObjectId((paymentLike as { recordedBy?: unknown }).recordedBy);

    if (!subscription) {
        subscription = await UserSubscription.create({
            userId: studentId,
            planId,
            status: 'active',
            startAtUTC,
            expiresAtUTC,
            activatedByAdminId: actorObjectId,
            paymentId,
            notes: `Activated from payment ${String(paymentId)}`,
        });
    } else {
        subscription.status = 'active';
        subscription.startAtUTC = startAtUTC;
        subscription.expiresAtUTC = expiresAtUTC;
        subscription.paymentId = paymentId;
        subscription.activatedByAdminId = actorObjectId || subscription.activatedByAdminId;
        await subscription.save();
    }

    await expireCurrentSubscriptions(String(studentId), actorId, String(subscription._id));
    const cache = await syncUserSubscriptionCache({
        userId: String(studentId),
        plan: plan as unknown as LeanPlan,
        status: 'active',
        startAtUTC,
        expiresAtUTC,
    });

    await recomputeStudentDueLedger(String(studentId), actorId, `Subscription activated from payment ${String(paymentId)}`);

    // ── Hub Integration: emit finance transaction + campaign trigger ──
    const activationAmount = typeof paymentLike.amount === 'number' ? paymentLike.amount : 0;
    if (activationAmount > 0) {
        await emitFinanceTransaction({
            userId: String(studentId),
            planId: String(planId),
            planName: safeString((plan as Record<string, unknown>).name, 'subscription plan'),
            amount: activationAmount,
            eventType: 'subscription_activated',
            actorId,
        });
    }
    await emitCampaignTrigger({
        userId: String(studentId),
        planName: safeString((plan as Record<string, unknown>).name, 'subscription plan'),
        eventType: 'subscription_activated',
        actorId,
    });

    return { subscription, plan, cache };
}

export async function extendSubscriptionForUser(userId: string, days: number, actorId?: string | null, notes?: string) {
    const studentId = toObjectId(userId);
    if (!studentId) throw new Error('Valid userId is required');
    if (!Number.isFinite(days) || days <= 0) throw new Error('Valid extension days are required');

    const subscription = await UserSubscription.findOne({ userId: studentId, status: 'active' }).sort({ updatedAt: -1, createdAt: -1 });
    if (!subscription) throw new Error('No active subscription found');

    subscription.expiresAtUTC = new Date(subscription.expiresAtUTC.getTime() + Math.floor(days) * 24 * 60 * 60 * 1000);
    if (notes) {
        subscription.notes = subscription.notes ? `${subscription.notes} | ${notes}` : notes;
    }
    await subscription.save();

    const plan = await SubscriptionPlan.findById(subscription.planId).lean();
    const cache = await syncUserSubscriptionCache({
        userId,
        plan: (plan as unknown as LeanPlan | null),
        status: subscription.status,
        startAtUTC: subscription.startAtUTC,
        expiresAtUTC: subscription.expiresAtUTC,
    });

    // ── Hub Integration: emit finance transaction + campaign trigger ──
    await emitFinanceTransaction({
        userId,
        planId: String(subscription.planId),
        planName: safeString((plan as Record<string, unknown> | null)?.name, 'subscription plan'),
        amount: 0,
        eventType: 'subscription_extended',
        actorId,
    });
    await emitCampaignTrigger({
        userId,
        planName: safeString((plan as Record<string, unknown> | null)?.name, 'subscription plan'),
        eventType: 'subscription_renewed',
        actorId,
    });

    return { subscription, plan, cache };
}

export async function expireSubscriptionForUser(userId: string, actorId?: string | null, notes?: string) {
    const studentId = toObjectId(userId);
    if (!studentId) throw new Error('Valid userId is required');

    const subscription = await UserSubscription.findOne({
        userId: studentId,
        status: { $in: ['active', 'pending', 'suspended'] },
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (!subscription) throw new Error('No subscription found');

    subscription.status = 'expired';
    subscription.expiresAtUTC = new Date();
    if (notes) {
        subscription.notes = subscription.notes ? `${subscription.notes} | ${notes}` : notes;
    }
    await subscription.save();

    const plan = await SubscriptionPlan.findById(subscription.planId).lean();
    const cache = await syncUserSubscriptionCache({
        userId,
        plan: (plan as unknown as LeanPlan | null),
        status: 'expired',
        startAtUTC: subscription.startAtUTC,
        expiresAtUTC: subscription.expiresAtUTC,
    });

    await recomputeStudentDueLedger(userId, actorId, 'Subscription expired');

    // ── Hub Integration: emit finance transaction + campaign trigger ──
    await emitFinanceTransaction({
        userId,
        planId: String(subscription.planId),
        planName: safeString((plan as Record<string, unknown> | null)?.name, 'subscription plan'),
        amount: 0,
        eventType: 'subscription_cancelled',
        actorId,
    });
    await emitCampaignTrigger({
        userId,
        planName: safeString((plan as Record<string, unknown> | null)?.name, 'subscription plan'),
        eventType: 'subscription_cancelled',
        actorId,
    });

    return { subscription, plan, cache };
}

export async function toggleAutoRenewForUser(userId: string) {
    const studentId = toObjectId(userId);
    if (!studentId) throw new Error('Valid userId is required');

    const subscription = await UserSubscription.findOne({ userId: studentId, status: 'active' }).sort({ updatedAt: -1, createdAt: -1 });
    if (!subscription) throw new Error('No active subscription found');

    subscription.autoRenewEnabled = !subscription.autoRenewEnabled;
    await subscription.save();
    return subscription;
}
