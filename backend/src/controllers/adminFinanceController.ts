
import { Response } from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import AuditLog from '../models/AuditLog';
import ExpenseEntry from '../models/ExpenseEntry';
import ManualPayment, { type IManualPayment } from '../models/ManualPayment';
import StaffPayout from '../models/StaffPayout';
import StudentDueLedger from '../models/StudentDueLedger';
import StudentProfile from '../models/StudentProfile';
import User from '../models/User';
import SubscriptionPlan from '../models/SubscriptionPlan';
import { AuthRequest } from '../middlewares/auth';
import { addFinanceStreamClient, broadcastFinanceEvent } from '../realtime/financeStream';
import { getRuntimeSettingsSnapshot } from '../services/runtimeSettingsService';
import { ensureSecureUploadUrl } from '../services/secureUploadService';
import { getClientIp } from '../utils/requestMeta';
import { createStudentNotification } from '../services/adminAlertService';
import { createIncomeFromPayment } from '../services/financeCenterService';
import { activateSubscriptionFromPayment, recomputeStudentDueLedger } from '../services/subscriptionLifecycleService';
import { escapeRegex } from '../utils/escapeRegex';
import { ResponseBuilder } from '../utils/responseBuilder';

type DateRange = { from?: Date; to?: Date };
const SECURE_FINANCE_ACCESS_ROLES = ['superadmin', 'admin', 'finance_agent', 'moderator'];

function parseDate(value: unknown): Date | null {
    if (!value) return null;
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
}

function parseDateRange(query: Record<string, unknown>): DateRange {
    const from = parseDate(query.from);
    const to = parseDate(query.to);
    return {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
    };
}

function buildDateMatch(field: string, range: DateRange): Record<string, unknown> {
    const matcher: Record<string, unknown> = {};
    if (range.from) matcher.$gte = range.from;
    if (range.to) matcher.$lte = range.to;
    return Object.keys(matcher).length > 0 ? { [field]: matcher } : {};
}

function asObjectId(value: unknown): mongoose.Types.ObjectId | null {
    const raw = String(value || '').trim();
    if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return null;
    return new mongoose.Types.ObjectId(raw);
}

function numeric(input: unknown, fallback = 0): number {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePage(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
    const page = Math.max(1, Math.floor(numeric(query.page, 1)));
    const limit = Math.max(1, Math.min(200, Math.floor(numeric(query.limit, 20))));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

function paymentMethods(): string[] {
    return ['bkash', 'nagad', 'rocket', 'upay', 'cash', 'manual', 'bank', 'sslcommerz', 'card'];
}

function paymentEntryTypes(): string[] {
    return ['subscription', 'due_settlement', 'exam_fee', 'other_income'];
}

function toCanonicalPayment(item: any): Record<string, unknown> {
    const student = item?.studentId;
    return {
        ...item,
        userId: String(item?.studentId?._id || item?.studentId || ''),
        examId: item?.examId ? String(item.examId?._id || item.examId) : null,
        amount: Number(item?.amount || 0),
        currency: String(item?.currency || 'BDT'),
        method: String(item?.method || 'manual'),
        status: String(item?.status || 'pending'),
        transactionId: String(item?.transactionId || item?.reference || ''),
        reference: String(item?.reference || ''),
        proofFileUrl: String(item?.proofFileUrl || item?.proofUrl || ''),
        verifiedByAdminId: item?.verifiedByAdminId || item?.approvedBy || null,
        createdAt: item?.createdAt || item?.date || new Date(),
        paidAt: item?.paidAt || (item?.status === 'paid' ? item?.date : null),
        studentProfileLink: String(item?.studentId?._id || item?.studentId || ''),
        student: {
            _id: String(student?._id || item?.studentId || ''),
            username: String(student?.username || ''),
            email: String(student?.email || ''),
            full_name: String(student?.full_name || student?.fullName || ''),
        },
    };
}

function buildPaymentFilter(query: Record<string, unknown>): Record<string, unknown> {
    const range = parseDateRange(query);
    const dateMatch = buildDateMatch('date', range);
    const filter: Record<string, unknown> = { ...dateMatch };

    const studentId = asObjectId(query.studentId || query.userId || query.user);
    if (studentId) filter.studentId = studentId;

    const examId = asObjectId(query.examId);
    if (examId) filter.examId = examId;

    const method = String(query.method || '').trim();
    if (method && paymentMethods().includes(method)) filter.method = method;

    const status = String(query.status || '').trim();
    if (status) filter.status = status;

    const entryType = String(query.entryType || '').trim();
    if (entryType) filter.entryType = entryType;

    const q = String(query.q || '').trim();
    if (q) {
        const safeQ = escapeRegex(q);
        filter.$or = [
            { reference: { $regex: safeQ, $options: 'i' } },
            { transactionId: { $regex: safeQ, $options: 'i' } },
            { notes: { $regex: safeQ, $options: 'i' } },
        ];
    }
    return filter;
}

async function settleSuccessfulPayment(
    payment: any,
    actorId: mongoose.Types.ObjectId | null,
): Promise<void> {
    if (payment.entryType === 'subscription' && payment.subscriptionPlanId) {
        await activateSubscriptionFromPayment(payment, actorId ? String(actorId) : String(payment.recordedBy || payment.studentId));
    }

    if (payment.entryType === 'due_settlement' || payment.entryType === 'subscription' || payment.entryType === 'exam_fee') {
        await StudentDueLedger.findOneAndUpdate(
            { studentId: payment.studentId },
            {
                $inc: {
                    computedDue: -Number(payment.amount || 0),
                    netDue: -Number(payment.amount || 0),
                },
                $set: {
                    updatedBy: actorId || payment.recordedBy || payment.studentId,
                    lastComputedAt: new Date(),
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    }

    // ── Auto-post income to Finance Center ──
    try {
        const sourceType = payment.entryType === 'subscription' ? 'subscription_payment'
            : payment.entryType === 'exam_fee' ? 'exam_payment'
                : 'manual_income';
        await createIncomeFromPayment({
            paymentId: String(payment._id),
            studentId: String(payment.studentId),
            amount: Number(payment.amount),
            method: String(payment.method || 'manual'),
            sourceType,
            accountCode: sourceType === 'subscription_payment' ? '4100' : sourceType === 'exam_payment' ? '4200' : '4900',
            categoryLabel: sourceType === 'subscription_payment' ? 'Subscription Revenue' : sourceType === 'exam_payment' ? 'Exam Fee Revenue' : 'Other Income',
            description: `Auto-posted from admin payment ${String(payment._id)}`,
            adminId: actorId ? String(actorId) : String(payment.recordedBy || payment.studentId),
            planId: payment.subscriptionPlanId ? String(payment.subscriptionPlanId) : undefined,
            examId: payment.examId ? String(payment.examId) : undefined,
            paidAtUTC: payment.date || new Date(),
        });
    } catch (fcErr) {
        console.error('[settleSuccessfulPayment] Finance auto-post failed:', fcErr);
    }

    if (payment.entryType === 'subscription') {
        await recomputeStudentDueLedger(
            String(payment.studentId),
            actorId ? String(actorId) : String(payment.recordedBy || payment.studentId),
            `Subscription payment settled ${String(payment._id)}`
        );
    }
}

function periodKey(date: Date, bucket: 'day' | 'month'): string {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    if (bucket === 'month') return `${year}-${month}`;
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function createAudit(req: AuthRequest, action: string, details?: Record<string, unknown>): Promise<void> {
    if (!req.user || !mongoose.Types.ObjectId.isValid(req.user._id)) return;
    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(req.user._id),
        actor_role: req.user.role,
        action,
        target_type: 'finance',
        ip_address: getClientIp(req),
        details: details || {},
    });
}

async function notifyStudentPaymentStatus(input: {
    payment: IManualPayment;
    status: 'paid' | 'rejected';
    remarks?: string;
    actorId?: string | mongoose.Types.ObjectId | null;
}): Promise<void> {
    const studentId = String(input.payment.studentId || '').trim();
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) return;

    const amountLabel = Number(input.payment.amount || 0).toFixed(2);
    const statusLabel = input.status === 'paid' ? 'approved' : 'rejected';
    const message = input.status === 'paid'
        ? `Your payment of ${amountLabel} BDT was approved.`
        : String(input.remarks || 'Your payment submission was rejected. Please review the remarks and resubmit if needed.');

    await createStudentNotification({
        title: input.status === 'paid' ? 'Payment approved' : 'Payment rejected',
        message,
        type: input.status === 'paid' ? 'payment_verified' : 'payment_rejected',
        messagePreview: String(input.remarks || `${String(input.payment.method || 'manual')} payment review completed`).trim(),
        linkUrl: '/payments',
        category: 'update',
        sourceType: 'manual_payment',
        sourceId: String(input.payment._id),
        targetRoute: '/payments',
        targetEntityId: String(input.payment._id),
        priority: input.status === 'paid' ? 'normal' : 'high',
        targetRole: 'student',
        targetUserIds: [studentId],
        createdBy: input.actorId || null,
        dedupeKey: `payment_status:${String(input.payment._id)}:${input.status}`,
    });
}

async function readSummary(range: DateRange): Promise<{
    income: number;
    expense: number;
    payouts: number;
    net: number;
}> {
    const [incomeRow, expenseRow, payoutRow] = await Promise.all([
        ManualPayment.aggregate([
            { $match: buildDateMatch('date', range) },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        ExpenseEntry.aggregate([
            { $match: buildDateMatch('date', range) },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        StaffPayout.aggregate([
            { $match: buildDateMatch('paidAt', range) },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
    ]);

    const income = numeric(incomeRow[0]?.total, 0);
    const expense = numeric(expenseRow[0]?.total, 0);
    const payouts = numeric(payoutRow[0]?.total, 0);
    const net = income - expense - payouts;
    return { income, expense, payouts, net };
}

async function broadcastSummary(range: DateRange): Promise<void> {
    const summary = await readSummary(range);
    broadcastFinanceEvent('finance-updated', summary as unknown as Record<string, unknown>);
}

export async function adminFinanceStream(_req: AuthRequest, res: Response): Promise<void> {
    addFinanceStreamClient(res);
}

export async function adminGetPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const { page, limit, skip } = parsePage(query);
        const filter = buildPaymentFilter(query);

        const [items, total] = await Promise.all([
            ManualPayment.find(filter)
                .populate('studentId', 'username email full_name')
                .populate('subscriptionPlanId', 'name code')
                .populate('examId', 'title subject')
                .populate('recordedBy', 'username full_name role')
                .populate('approvedBy', 'username full_name role')
                .sort({ paidAt: -1, date: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ManualPayment.countDocuments(filter),
        ]);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            items: items.map((item) => toCanonicalPayment(item)),
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit)),
        }));
    } catch (error) {
        console.error('adminGetPayments error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminExportPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const format = String(query.format || 'xlsx').toLowerCase();
        const filter = buildPaymentFilter(query);

        const csvHeader = [
            'paymentId',
            'userId',
            'name',
            'examId',
            'amount',
            'currency',
            'method',
            'status',
            'transactionId',
            'reference',
            'proofFileUrl',
            'verifiedByAdminId',
            'createdAt',
            'paidAt',
        ];

        if (format === 'csv') {
            // Bug 1.4 fix: Use cursor-based streaming for CSV export
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="payments_export_${Date.now()}.csv"`);
            res.setHeader('Transfer-Encoding', 'chunked');

            // Write CSV header row
            res.write(csvHeader.join(',') + '\n');

            const cursor = ManualPayment.find(filter)
                .populate('studentId', 'username email full_name')
                .populate('examId', 'title subject')
                .sort({ paidAt: -1, date: -1, createdAt: -1 })
                .cursor();

            for await (const item of cursor) {
                const row = toCanonicalPayment(item.toObject ? item.toObject() : item);
                const student = (row.student as Record<string, unknown>) || {};
                const values = [
                    String((row as any)._id || ''),
                    String(row.userId || ''),
                    String(student.full_name || student.username || '').replace(/,/g, ' '),
                    String(row.examId || ''),
                    Number(row.amount || 0),
                    String(row.currency || 'BDT'),
                    String(row.method || ''),
                    String(row.status || ''),
                    String(row.transactionId || ''),
                    String(row.reference || ''),
                    String(row.proofFileUrl || ''),
                    String(row.verifiedByAdminId || ''),
                    row.createdAt ? new Date(String(row.createdAt)).toISOString() : '',
                    row.paidAt ? new Date(String(row.paidAt)).toISOString() : '',
                ];
                res.write(values.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n');
            }

            res.end();
            return;
        }

        // XLSX format: still needs in-memory for ExcelJS workbook construction
        const rowsRaw = await ManualPayment.find(filter)
            .populate('studentId', 'username email full_name')
            .populate('examId', 'title subject')
            .sort({ paidAt: -1, date: -1, createdAt: -1 })
            .lean();
        const rows = rowsRaw.map((item) => toCanonicalPayment(item));

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Payments');
        sheet.columns = [
            { header: 'Payment ID', key: 'paymentId', width: 28 },
            { header: 'User ID', key: 'userId', width: 28 },
            { header: 'Name', key: 'name', width: 24 },
            { header: 'Exam ID', key: 'examId', width: 28 },
            { header: 'Amount', key: 'amount', width: 12 },
            { header: 'Currency', key: 'currency', width: 12 },
            { header: 'Method', key: 'method', width: 14 },
            { header: 'Status', key: 'status', width: 14 },
            { header: 'Transaction ID', key: 'transactionId', width: 24 },
            { header: 'Reference', key: 'reference', width: 24 },
            { header: 'Proof File URL', key: 'proofFileUrl', width: 36 },
            { header: 'Verified By', key: 'verifiedByAdminId', width: 28 },
            { header: 'Created At', key: 'createdAt', width: 24 },
            { header: 'Paid At', key: 'paidAt', width: 24 },
        ];
        sheet.getRow(1).font = { bold: true };

        rows.forEach((row) => {
            const student = (row.student as Record<string, unknown>) || {};
            sheet.addRow({
                paymentId: String((row as any)._id || ''),
                userId: String(row.userId || ''),
                name: String(student.full_name || student.username || ''),
                examId: String(row.examId || ''),
                amount: Number(row.amount || 0),
                currency: String(row.currency || 'BDT'),
                method: String(row.method || ''),
                status: String(row.status || ''),
                transactionId: String(row.transactionId || ''),
                reference: String(row.reference || ''),
                proofFileUrl: String(row.proofFileUrl || ''),
                verifiedByAdminId: String(row.verifiedByAdminId || ''),
                createdAt: row.createdAt ? new Date(String(row.createdAt)).toISOString() : '',
                paidAt: row.paidAt ? new Date(String(row.paidAt)).toISOString() : '',
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="payments_export_${Date.now()}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('adminExportPayments error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminCreatePayment(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Authentication required'));
            return;
        }

        const body = req.body as Record<string, unknown>;
        const studentId = asObjectId(body.studentId);
        if (!studentId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Valid studentId is required'));
            return;
        }

        const student = await User.findById(studentId).select('role');
        if (!student || student.role !== 'student') {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Student not found'));
            return;
        }

        const recordedBy = asObjectId(req.user._id);
        if (!recordedBy) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid actor id'));
            return;
        }

        const amount = numeric(body.amount, -1);
        if (amount < 0) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Amount must be non-negative'));
            return;
        }

        const date = parseDate(body.date) || new Date();
        const methodRaw = String(body.method || 'manual').trim();
        const method = paymentMethods().includes(methodRaw) ? methodRaw : 'manual';

        const entryTypeRaw = String(body.entryType || 'subscription').trim();
        const entryType = paymentEntryTypes().includes(entryTypeRaw) ? entryTypeRaw : 'subscription';

        const subscriptionPlanId = asObjectId(body.subscriptionPlanId);
        const examId = asObjectId(body.examId);
        const status = ['pending', 'paid', 'failed', 'refunded', 'rejected'].includes(String(body.status || ''))
            ? String(body.status || 'pending')
            : 'pending';
        const paidAt = status === 'paid' ? (parseDate(body.paidAt) || date) : null;

        const rawProofUrl = String(body.proofFileUrl || body.proofUrl || '').trim();
        const secureProofUrl = rawProofUrl
            ? await ensureSecureUploadUrl({
                url: rawProofUrl,
                category: 'payment_proof',
                visibility: 'protected',
                ownerUserId: studentId,
                ownerRole: 'student',
                uploadedBy: recordedBy,
                accessRoles: SECURE_FINANCE_ACCESS_ROLES,
            })
            : '';

        const created = await ManualPayment.create({
            studentId,
            ...(subscriptionPlanId ? { subscriptionPlanId } : {}),
            ...(examId ? { examId } : {}),
            amount,
            currency: String(body.currency || 'BDT'),
            method,
            date,
            paidAt,
            status,
            transactionId: String(body.transactionId || '').trim(),
            entryType,
            reference: String(body.reference || '').trim(),
            proofFileUrl: secureProofUrl,
            proofUrl: secureProofUrl,
            notes: String(body.notes || '').trim(),
            recordedBy,
        });

        await createAudit(req, 'manual_payment_created', {
            paymentId: String(created._id),
            studentId: String(studentId),
            amount,
            method,
            entryType,
        });

        broadcastFinanceEvent(status === 'paid' ? 'payment-updated' : 'payment-recorded', {
            paymentId: String(created._id),
            studentId: String(studentId),
            amount,
            status,
        });

        // Sync with StudentDueLedger for relevant types
        if (status === 'paid') {
            await settleSuccessfulPayment(created, recordedBy);
        }

        await broadcastSummary({});

        ResponseBuilder.send(res, 201, ResponseBuilder.created({ item: toCanonicalPayment(created.toObject()) }, 'Payment recorded successfully'));
    } catch (error) {
        console.error('adminCreatePayment error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminUpdatePayment(req: AuthRequest, res: Response): Promise<void> {
    try {
        const existing = await ManualPayment.findById(req.params.id);
        if (!existing) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Payment entry not found'));
            return;
        }

        const body = req.body as Record<string, unknown>;
        const update: Record<string, unknown> = {};

        if (body.amount !== undefined) {
            const amount = numeric(body.amount, -1);
            if (amount < 0) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Amount must be non-negative'));
                return;
            }
            update.amount = amount;
        }

        if (body.date !== undefined) {
            const date = parseDate(body.date);
            if (!date) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid date'));
                return;
            }
            update.date = date;
        }

        if (body.method !== undefined) {
            const methodRaw = String(body.method || '').trim();
            if (!paymentMethods().includes(methodRaw)) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid payment method'));
                return;
            }
            update.method = methodRaw;
        }

        if (body.entryType !== undefined) {
            const entryTypeRaw = String(body.entryType || '').trim();
            if (!paymentEntryTypes().includes(entryTypeRaw)) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid entry type'));
                return;
            }
            update.entryType = entryTypeRaw;
        }

        if (body.subscriptionPlanId !== undefined) {
            const planId = asObjectId(body.subscriptionPlanId);
            update.subscriptionPlanId = planId;
        }
        if (body.examId !== undefined) {
            update.examId = asObjectId(body.examId);
        }
        if (body.status !== undefined) {
            const nextStatus = String(body.status || '').trim();
            if (!['pending', 'paid', 'failed', 'refunded', 'rejected'].includes(nextStatus)) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid payment status'));
                return;
            }
            update.status = nextStatus;
            if (nextStatus === 'paid') {
                const paidAt = parseDate(body.paidAt);
                update.paidAt = paidAt || new Date();
                update.verifiedByAdminId = asObjectId(req.user?._id || '') || existing.verifiedByAdminId || null;
            } else if (['pending', 'failed', 'refunded', 'rejected'].includes(nextStatus)) {
                update.paidAt = null;
            }
        }
        if (body.currency !== undefined) update.currency = String(body.currency || 'BDT').trim() || 'BDT';
        if (body.transactionId !== undefined) update.transactionId = String(body.transactionId || '').trim();
        if (body.proofFileUrl !== undefined || body.proofUrl !== undefined) {
            const nextProofUrl = String(body.proofFileUrl || body.proofUrl || '').trim();
            const secureProofUrl = nextProofUrl
                ? await ensureSecureUploadUrl({
                    url: nextProofUrl,
                    category: 'payment_proof',
                    visibility: 'protected',
                    ownerUserId: existing.studentId,
                    ownerRole: 'student',
                    uploadedBy: req.user?._id || null,
                    accessRoles: SECURE_FINANCE_ACCESS_ROLES,
                })
                : '';
            update.proofFileUrl = secureProofUrl;
            update.proofUrl = secureProofUrl;
        }

        if (body.reference !== undefined) update.reference = String(body.reference || '').trim();
        if (body.notes !== undefined) update.notes = String(body.notes || '').trim();

        const item = await ManualPayment.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
        if (!item) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Payment entry not found'));
            return;
        }

        const transitionedToPaid = String(existing.status || '') !== 'paid' && String(item.status || '') === 'paid';
        if (transitionedToPaid) {
            await settleSuccessfulPayment(item, asObjectId(req.user?._id || ''));
        }

        await createAudit(req, 'manual_payment_updated', {
            paymentId: String(item._id),
            updatedFields: Object.keys(update),
        });

        broadcastFinanceEvent('payment-updated', {
            paymentId: String(item._id),
            updated: true,
            status: item.status,
            studentId: String(item.studentId || ''),
        });
        await broadcastSummary({});

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ item: toCanonicalPayment(item.toObject()) }, 'Payment updated successfully'));
    } catch (error) {
        console.error('adminUpdatePayment error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminApprovePayment(req: AuthRequest, res: Response): Promise<void> {
    try {
        const paymentId = req.params.id;
        const { status, remarks } = req.body;

        if (!['paid', 'rejected'].includes(status)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid status. Use paid or rejected.'));
            return;
        }

        const payment = await ManualPayment.findById(paymentId);
        if (!payment) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Payment not found'));
            return;
        }

        if (payment.status !== 'pending') {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Payment is already ${payment.status}'));
            return;
        }

        payment.status = status;
        payment.notes = remarks || payment.notes;
        payment.approvedBy = req.user!._id as any;
        payment.approvedAt = new Date();
        payment.verifiedByAdminId = req.user!._id as any;
        if (status === 'paid') {
            payment.paidAt = new Date();
            payment.date = payment.paidAt;
        }
        await payment.save();

        if (status === 'paid') {
            await settleSuccessfulPayment(payment, asObjectId(req.user!._id));
        }
        await notifyStudentPaymentStatus({
            payment,
            status,
            remarks: String(remarks || '').trim(),
            actorId: req.user!._id,
        });

        await createAudit(req, `payment_${status}`, {
            paymentId: String(payment._id),
            studentId: String(payment.studentId),
            amount: payment.amount,
            remarks
        });

        broadcastFinanceEvent('payment-updated', {
            paymentId: String(payment._id),
            status: payment.status,
            studentId: String(payment.studentId)
        });

        await broadcastSummary({});

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ item: toCanonicalPayment(payment.toObject()) }, `Payment ${status} successfully`));
    } catch (error) {
        console.error('adminApprovePayment error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetStudentPayments(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = asObjectId(req.params.id);
        if (!studentId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid student id'));
            return;
        }

        const items = await ManualPayment.find({ studentId })
            .populate('subscriptionPlanId', 'name code')
            .populate('examId', 'title subject')
            .populate('studentId', 'username email full_name')
            .populate('recordedBy', 'username full_name role')
            .populate('approvedBy', 'username full_name role')
            .sort({ date: -1, createdAt: -1 })
            .lean();

        const totalPaid = items
            .filter((item) => String((item as { status?: string }).status || '') === 'paid')
            .reduce((sum, item) => sum + numeric((item as { amount?: number }).amount, 0), 0);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ items: items.map((item) => toCanonicalPayment(item)), totalPaid }));
    } catch (error) {
        console.error('adminGetStudentPayments error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}
export async function adminGetExpenses(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const { page, limit, skip } = parsePage(query);
        const range = parseDateRange(query);
        const dateMatch = buildDateMatch('date', range);

        const filter: Record<string, unknown> = { ...dateMatch };
        const category = String(query.category || '').trim();
        if (category) filter.category = category;

        const [items, total] = await Promise.all([
            ExpenseEntry.find(filter)
                .populate('recordedBy', 'username full_name role')
                .populate('linkedStaffId', 'username full_name role')
                .sort({ date: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ExpenseEntry.countDocuments(filter),
        ]);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) }));
    } catch (error) {
        console.error('adminGetExpenses error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminCreateExpense(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Authentication required'));
            return;
        }

        const body = req.body as Record<string, unknown>;
        const amount = numeric(body.amount, -1);
        if (amount < 0) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Amount must be non-negative'));
            return;
        }

        const allowedCategories = ['server', 'marketing', 'staff_salary', 'moderator_salary', 'tools', 'misc'];
        const categoryRaw = String(body.category || 'misc').trim();
        const category = allowedCategories.includes(categoryRaw) ? categoryRaw : 'misc';

        const recordedBy = asObjectId(req.user._id);
        if (!recordedBy) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid actor id'));
            return;
        }

        const linkedStaffId = asObjectId(body.linkedStaffId);

        const item = await ExpenseEntry.create({
            category,
            amount,
            date: parseDate(body.date) || new Date(),
            vendor: String(body.vendor || '').trim(),
            notes: String(body.notes || '').trim(),
            ...(linkedStaffId ? { linkedStaffId } : {}),
            recordedBy,
        });

        await createAudit(req, 'expense_created', {
            expenseId: String(item._id),
            category,
            amount,
        });

        broadcastFinanceEvent('expense-recorded', {
            expenseId: String(item._id),
            category,
            amount,
        });
        await broadcastSummary({});

        ResponseBuilder.send(res, 201, ResponseBuilder.created({ item }, 'Expense recorded successfully'));
    } catch (error) {
        console.error('adminCreateExpense error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminUpdateExpense(req: AuthRequest, res: Response): Promise<void> {
    try {
        const body = req.body as Record<string, unknown>;
        const update: Record<string, unknown> = {};

        if (body.amount !== undefined) {
            const amount = numeric(body.amount, -1);
            if (amount < 0) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Amount must be non-negative'));
                return;
            }
            update.amount = amount;
        }

        if (body.date !== undefined) {
            const date = parseDate(body.date);
            if (!date) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid date'));
                return;
            }
            update.date = date;
        }

        if (body.category !== undefined) {
            const category = String(body.category || '').trim();
            const allowed = ['server', 'marketing', 'staff_salary', 'moderator_salary', 'tools', 'misc'];
            if (!allowed.includes(category)) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid category'));
                return;
            }
            update.category = category;
        }

        if (body.vendor !== undefined) update.vendor = String(body.vendor || '').trim();
        if (body.notes !== undefined) update.notes = String(body.notes || '').trim();
        if (body.linkedStaffId !== undefined) update.linkedStaffId = asObjectId(body.linkedStaffId);

        const item = await ExpenseEntry.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
        if (!item) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Expense entry not found'));
            return;
        }

        await createAudit(req, 'expense_updated', {
            expenseId: String(item._id),
            updatedFields: Object.keys(update),
        });

        broadcastFinanceEvent('expense-recorded', {
            expenseId: String(item._id),
            updated: true,
        });
        await broadcastSummary({});

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ item }, 'Expense updated successfully'));
    } catch (error) {
        console.error('adminUpdateExpense error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetStaffPayouts(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const { page, limit, skip } = parsePage(query);
        const range = parseDateRange(query);
        const paidAtMatch = buildDateMatch('paidAt', range);

        const filter: Record<string, unknown> = { ...paidAtMatch };
        const role = String(query.role || '').trim();
        if (role) filter.role = role;

        const [items, total] = await Promise.all([
            StaffPayout.find(filter)
                .populate('userId', 'username full_name role')
                .populate('recordedBy', 'username full_name role')
                .sort({ paidAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            StaffPayout.countDocuments(filter),
        ]);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) }));
    } catch (error) {
        console.error('adminGetStaffPayouts error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminCreateStaffPayout(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Authentication required'));
            return;
        }

        const body = req.body as Record<string, unknown>;
        const userId = asObjectId(body.userId);
        if (!userId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Valid userId is required'));
            return;
        }

        const targetUser = await User.findById(userId).select('role');
        if (!targetUser || targetUser.role === 'student') {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Staff user not found'));
            return;
        }

        const amount = numeric(body.amount, -1);
        if (amount < 0) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Amount must be non-negative'));
            return;
        }

        const periodMonth = String(body.periodMonth || '').trim();
        if (!/^\d{4}\-(0[1-9]|1[0-2])$/.test(periodMonth)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'periodMonth must use YYYY-MM format'));
            return;
        }

        const recordedBy = asObjectId(req.user._id);
        if (!recordedBy) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid actor id'));
            return;
        }

        const methodRaw = String(body.method || 'manual').trim();
        const methods = ['bkash', 'cash', 'manual', 'bank'];
        const method = methods.includes(methodRaw) ? methodRaw : 'manual';

        const item = await StaffPayout.create({
            userId,
            role: String(body.role || targetUser.role || 'moderator').trim(),
            amount,
            periodMonth,
            paidAt: parseDate(body.paidAt) || new Date(),
            method,
            notes: String(body.notes || '').trim(),
            recordedBy,
        });

        await createAudit(req, 'staff_payout_created', {
            payoutId: String(item._id),
            userId: String(userId),
            amount,
            periodMonth,
        });

        broadcastFinanceEvent('payout-recorded', {
            payoutId: String(item._id),
            userId: String(userId),
            amount,
        });
        await broadcastSummary({});

        ResponseBuilder.send(res, 201, ResponseBuilder.created({ item }, 'Staff payout recorded successfully'));
    } catch (error) {
        console.error('adminCreateStaffPayout error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetFinanceSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
        const range = parseDateRange(req.query as Record<string, unknown>);
        const summary = await readSummary(range);
        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            totalIncome: summary.income,
            totalExpenses: summary.expense + summary.payouts,
            directExpenses: summary.expense,
            salaryPayouts: summary.payouts,
            netProfit: summary.net,
            window: {
                from: range.from || null,
                to: range.to || null,
            },
        }));
    } catch (error) {
        console.error('adminGetFinanceSummary error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetFinanceRevenueSeries(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const range = parseDateRange(query);
        const bucket = String(query.bucket || 'month').trim() === 'day' ? 'day' : 'month';

        const rows = await ManualPayment.find(buildDateMatch('date', range)).select('amount date').lean();
        const grouped = new Map<string, number>();

        for (const row of rows) {
            const date = new Date(String((row as { date?: Date }).date || new Date()));
            const key = periodKey(date, bucket);
            grouped.set(key, numeric(grouped.get(key), 0) + numeric((row as { amount?: number }).amount, 0));
        }

        const series = Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, amount]) => ({ period, amount }));

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ bucket, series }));
    } catch (error) {
        console.error('adminGetFinanceRevenueSeries error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetFinanceExpenseBreakdown(req: AuthRequest, res: Response): Promise<void> {
    try {
        const range = parseDateRange(req.query as Record<string, unknown>);

        const [expenseRows, payoutRows] = await Promise.all([
            ExpenseEntry.aggregate([
                { $match: buildDateMatch('date', range) },
                { $group: { _id: '$category', total: { $sum: '$amount' } } },
            ]),
            StaffPayout.aggregate([
                { $match: buildDateMatch('paidAt', range) },
                {
                    $group: {
                        _id: {
                            $cond: [
                                { $regexMatch: { input: '$role', regex: /moderator/i } },
                                'moderator_salary',
                                'staff_salary',
                            ],
                        },
                        total: { $sum: '$amount' },
                    },
                },
            ]),
        ]);

        const map = new Map<string, number>();
        for (const row of expenseRows) {
            map.set(String(row._id || 'misc'), numeric(row.total, 0));
        }
        for (const row of payoutRows) {
            const key = String(row._id || 'staff_salary');
            map.set(key, numeric(map.get(key), 0) + numeric(row.total, 0));
        }

        const items = Array.from(map.entries())
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ items }));
    } catch (error) {
        console.error('adminGetFinanceExpenseBreakdown error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}
export async function adminGetFinanceCashflow(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const range = parseDateRange(query);
        const bucket: 'day' | 'month' = String(query.bucket || 'month').trim() === 'day' ? 'day' : 'month';

        const [payments, expenses, payouts] = await Promise.all([
            ManualPayment.find(buildDateMatch('date', range)).select('amount date').lean(),
            ExpenseEntry.find(buildDateMatch('date', range)).select('amount date').lean(),
            StaffPayout.find(buildDateMatch('paidAt', range)).select('amount paidAt').lean(),
        ]);

        const timeline = new Map<string, { income: number; expense: number }>();

        const applyIncome = (date: Date, amount: number) => {
            const key = periodKey(date, bucket);
            const current = timeline.get(key) || { income: 0, expense: 0 };
            current.income += amount;
            timeline.set(key, current);
        };

        const applyExpense = (date: Date, amount: number) => {
            const key = periodKey(date, bucket);
            const current = timeline.get(key) || { income: 0, expense: 0 };
            current.expense += amount;
            timeline.set(key, current);
        };

        for (const row of payments) {
            applyIncome(new Date(String((row as { date?: Date }).date || new Date())), numeric((row as { amount?: number }).amount, 0));
        }
        for (const row of expenses) {
            applyExpense(new Date(String((row as { date?: Date }).date || new Date())), numeric((row as { amount?: number }).amount, 0));
        }
        for (const row of payouts) {
            applyExpense(new Date(String((row as { paidAt?: Date }).paidAt || new Date())), numeric((row as { amount?: number }).amount, 0));
        }

        const items = Array.from(timeline.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, value]) => ({
                period,
                income: value.income,
                expense: value.expense,
                net: value.income - value.expense,
            }));

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ bucket, items }));
    } catch (error) {
        console.error('adminGetFinanceCashflow error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetFinanceStudentGrowth(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const range = parseDateRange(query);
        const bucket: 'day' | 'month' = String(query.bucket || 'month').trim() === 'day' ? 'day' : 'month';

        const rows = await User.find({
            role: 'student',
            ...buildDateMatch('createdAt', range)
        }).select('createdAt').lean();

        const timeline = new Map<string, number>();

        for (const row of rows) {
            const date = new Date(String(row.createdAt || new Date()));
            const key = periodKey(date, bucket);
            timeline.set(key, (timeline.get(key) || 0) + 1);
        }

        const items = Array.from(timeline.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, count]) => ({ period, count }));

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ bucket, items }));
    } catch (error) {
        console.error('adminGetFinanceStudentGrowth error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetFinancePlanDistribution(_req: AuthRequest, res: Response): Promise<void> {
    try {
        const distribution = await User.aggregate([
            { $match: { role: 'student', 'subscription.planCode': { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: '$subscription.planCode',
                    count: { $sum: 1 },
                    planName: { $first: '$subscription.planName' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ distribution }));
    } catch (error) {
        console.error('adminGetFinancePlanDistribution error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetFinanceTestBoard(req: AuthRequest, res: Response): Promise<void> {
    try {
        const range = parseDateRange(req.query as Record<string, unknown>);
        const summary = await readSummary(range);
        const [dueRow, operationalRow, subscriptionBreakdown] = await Promise.all([
            StudentDueLedger.aggregate([{ $group: { _id: null, totalDue: { $sum: '$netDue' } } }]),
            ExpenseEntry.aggregate([
                { $match: { category: { $in: ['server', 'tools', 'marketing', 'misc'] } } },
                { $group: { _id: null, totalOperational: { $sum: '$amount' } } },
            ]),
            ManualPayment.aggregate([
                { $match: { entryType: 'subscription' } },
                {
                    $lookup: {
                        from: 'subscriptionplans',
                        localField: 'subscriptionPlanId',
                        foreignField: '_id',
                        as: 'plan',
                    },
                },
                { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: { $ifNull: ['$plan.code', 'unassigned'] },
                        total: { $sum: '$amount' },
                    },
                },
                { $sort: { total: -1 } },
            ]),
        ]);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            liveIncome: summary.income,
            liveExpense: summary.expense + summary.payouts,
            netPosition: summary.net,
            totalLiabilities: numeric(dueRow[0]?.totalDue, 0),
            totalOperationalCost: numeric(operationalRow[0]?.totalOperational, 0),
            subscriptionRevenueTracking: subscriptionBreakdown.map((item) => ({
                planCode: String(item._id || 'unassigned'),
                amount: numeric(item.total, 0),
            })),
            asOf: new Date().toISOString(),
        }));
    } catch (error) {
        console.error('adminGetFinanceTestBoard error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetDues(req: AuthRequest, res: Response): Promise<void> {
    try {
        const query = req.query as Record<string, unknown>;
        const { page, limit, skip } = parsePage(query);

        const dueStatus = String(query.status || '').trim();
        const filter: Record<string, unknown> = {};
        if (dueStatus === 'due') filter.netDue = { $gt: 0 };
        if (dueStatus === 'cleared') filter.netDue = { $lte: 0 };

        const [items, total] = await Promise.all([
            StudentDueLedger.find(filter)
                .populate('studentId', 'username email full_name')
                .populate('updatedBy', 'username full_name role')
                .sort({ netDue: -1, updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            StudentDueLedger.countDocuments(filter),
        ]);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) }));
    } catch (error) {
        console.error('adminGetDues error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminUpdateDue(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user) {
            ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Authentication required'));
            return;
        }

        const studentId = asObjectId(req.params.studentId);
        if (!studentId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid student id'));
            return;
        }

        const body = req.body as Record<string, unknown>;
        const computedDue = numeric(body.computedDue, 0);
        const manualAdjustment = numeric(body.manualAdjustment, 0);
        const waiverAmount = numeric(body.waiverAmount, 0);
        const netDue = computedDue + manualAdjustment - waiverAmount;

        const updatedBy = asObjectId(req.user._id);
        if (!updatedBy) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid actor id'));
            return;
        }

        const item = await StudentDueLedger.findOneAndUpdate(
            { studentId },
            {
                $set: {
                    computedDue,
                    manualAdjustment,
                    waiverAmount,
                    netDue,
                    note: String(body.note || '').trim(),
                    lastComputedAt: new Date(),
                    updatedBy,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        await createAudit(req, 'student_due_updated', {
            studentId: String(studentId),
            computedDue,
            manualAdjustment,
            waiverAmount,
            netDue,
        });

        broadcastFinanceEvent('due-updated', {
            studentId: String(studentId),
            netDue,
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ item }, 'Due ledger updated'));
    } catch (error) {
        console.error('adminUpdateDue error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminSendDueReminder(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = asObjectId(req.params.studentId);
        if (!studentId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid student id'));
            return;
        }

        const ledger = await StudentDueLedger.findOne({ studentId }).lean();
        if (!ledger) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Due ledger not found for this student'));
            return;
        }

        const [student, runtime] = await Promise.all([
            User.findById(studentId).select('username email full_name role').lean(),
            getRuntimeSettingsSnapshot(true),
        ]);

        if (!student || student.role !== 'student') {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Student not found'));
            return;
        }

        await createAudit(req, 'due_reminder_sent', {
            studentId: String(studentId),
            netDue: ledger.netDue,
            channels: {
                email: runtime.featureFlags.emailReminderEnabled,
                sms: runtime.featureFlags.smsReminderEnabled,
                inApp: true,
            },
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            student: {
                _id: student._id,
                username: student.username,
                email: student.email,
                fullName: student.full_name || student.username,
            },
            channels: {
                email: runtime.featureFlags.emailReminderEnabled,
                sms: runtime.featureFlags.smsReminderEnabled,
                inApp: true,
            },
            netDue: ledger.netDue,
        }, 'Due reminder logged successfully'));
    } catch (error) {
        console.error('adminSendDueReminder error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminDispatchReminders(req: AuthRequest, res: Response): Promise<void> {
    try {
        const runtime = await getRuntimeSettingsSnapshot(true);
        const now = new Date();
        const dayMs = 24 * 60 * 60 * 1000;
        const days7 = new Date(now.getTime() + 7 * dayMs);
        const days3 = new Date(now.getTime() + 3 * dayMs);

        const expiringUsers = await User.find({
            role: 'student',
            'subscription.expiryDate': { $gte: now, $lte: days7 },
        }).select('_id username email full_name subscription.expiryDate').lean();

        const highPriorityExpiring = expiringUsers.filter((user) => {
            const expiry = parseDate((user as { subscription?: { expiryDate?: Date } }).subscription?.expiryDate);
            return Boolean(expiry && expiry.getTime() <= days3.getTime());
        });

        const dueUsers = await StudentDueLedger.find({ netDue: { $gt: 0 } })
            .select('studentId netDue')
            .sort({ netDue: -1 })
            .lean();

        await createAudit(req, 'reminders_dispatched', {
            expiryReminderCount: expiringUsers.length,
            expiryHighPriorityCount: highPriorityExpiring.length,
            dueReminderCount: dueUsers.length,
            channels: {
                email: runtime.featureFlags.emailReminderEnabled,
                sms: runtime.featureFlags.smsReminderEnabled,
                inApp: true,
            },
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            summary: {
                expiryReminderCount: expiringUsers.length,
                expiryHighPriorityCount: highPriorityExpiring.length,
                dueReminderCount: dueUsers.length,
                channels: {
                    email: runtime.featureFlags.emailReminderEnabled,
                    sms: runtime.featureFlags.smsReminderEnabled,
                    inApp: true,
                },
            },
        }, 'Reminder dispatch completed'));
    } catch (error) {
        console.error('adminDispatchReminders error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function adminGetStudentLtv(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = asObjectId(req.params.id);
        if (!studentId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid student id'));
            return;
        }

        const [student, payments, profile] = await Promise.all([
            User.findById(studentId).select('username email full_name role createdAt').lean(),
            ManualPayment.find({ studentId }).select('amount date entryType').sort({ date: 1 }).lean(),
            StudentProfile.findOne({ user_id: studentId }).select('admittedAt').lean(),
        ]);

        if (!student || student.role !== 'student') {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Student not found'));
            return;
        }

        const lifetimeIncome = payments.reduce((sum, item) => sum + numeric((item as { amount?: number }).amount, 0), 0);
        const firstPaymentDate = payments.length ? (payments[0] as { date?: Date }).date || null : null;
        const lastPaymentDate = payments.length ? (payments[payments.length - 1] as { date?: Date }).date || null : null;

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            student: {
                _id: student._id,
                username: student.username,
                email: student.email,
                fullName: student.full_name || student.username,
                joinedAt: profile?.admittedAt || student.createdAt,
            },
            ltv: {
                lifetimeIncome,
                totalTransactions: payments.length,
                firstPaymentDate,
                lastPaymentDate,
                avgTransactionValue: payments.length > 0 ? Number((lifetimeIncome / payments.length).toFixed(2)) : 0,
            },
        }));
    } catch (error) {
        console.error('adminGetStudentLtv error:', error);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}
