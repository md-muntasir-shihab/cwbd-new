import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import FinanceTransaction from '../models/FinanceTransaction';
import FinanceInvoice from '../models/FinanceInvoice';
import FinanceBudget from '../models/FinanceBudget';
import FinanceRecurringRule from '../models/FinanceRecurringRule';
import FinanceSettings from '../models/FinanceSettings';
import ChartOfAccounts from '../models/ChartOfAccounts';
import FinanceRefund from '../models/FinanceRefund';
import AuditLog from '../models/AuditLog';

// ── Counter for txnCode ─────────────────────────────────
let _txnCounter: number | null = null;

export async function nextTxnCode(): Promise<string> {
    if (_txnCounter === null) {
        const last = await FinanceTransaction.findOne({}, { txnCode: 1 })
            .sort({ createdAt: -1 })
            .lean();
        const match = last?.txnCode?.match(/CW-FIN-(\d+)/);
        _txnCounter = match ? parseInt(match[1], 10) : 0;
    }
    _txnCounter++;
    return `CW-FIN-${String(_txnCounter).padStart(6, '0')}`;
}

let _invCounter: number | null = null;

export async function nextInvoiceNo(): Promise<string> {
    const settings = await getOrCreateFinanceSettings();
    const prefix = String(settings.invoicePrefix || 'CW-INV')
        .trim()
        .replace(/[^a-z0-9_-]/gi, '')
        || 'CW-INV';
    const padding = Math.max(3, Math.min(12, Number(settings.invoiceNumberPadding || 6)));
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    if (_invCounter === null) {
        const last = await FinanceInvoice.findOne(
            { invoiceNo: { $regex: `^${escapedPrefix}-` } },
            { invoiceNo: 1 },
        )
            .sort({ createdAt: -1 })
            .lean();
        const match = last?.invoiceNo?.match(new RegExp(`^${escapedPrefix}-(\\d+)$`));
        _invCounter = match ? parseInt(match[1], 10) : 0;
    }
    _invCounter++;
    return `${prefix}-${String(_invCounter).padStart(padding, '0')}`;
}

// ── Auto-link: payment → income transaction ─────────────
export async function createIncomeFromPayment(opts: {
    paymentId: string;
    studentId: string;
    amount: number;
    method: string;
    sourceType: 'subscription_payment' | 'exam_payment' | 'service_sale' | 'manual_income';
    accountCode: string;
    categoryLabel: string;
    description: string;
    adminId: string;
    planId?: string;
    examId?: string;
    serviceId?: string;
    paidAtUTC?: Date;
}): Promise<typeof FinanceTransaction.prototype> {
    const existing = await FinanceTransaction.findOne({
        sourceType: opts.sourceType,
        sourceId: opts.paymentId,
        isDeleted: false,
    }).lean();
    if (existing) return existing;

    const txnCode = await nextTxnCode();
    const txn = await FinanceTransaction.create({
        txnCode,
        direction: 'income',
        amount: opts.amount,
        currency: 'BDT',
        dateUTC: opts.paidAtUTC || new Date(),
        accountCode: opts.accountCode,
        categoryLabel: opts.categoryLabel,
        description: opts.description,
        status: 'paid',
        method: opts.method || 'manual',
        sourceType: opts.sourceType,
        sourceId: opts.paymentId,
        studentId: opts.studentId ? new mongoose.Types.ObjectId(opts.studentId) : undefined,
        planId: opts.planId ? new mongoose.Types.ObjectId(opts.planId) : undefined,
        examId: opts.examId ? new mongoose.Types.ObjectId(opts.examId) : undefined,
        serviceId: opts.serviceId ? new mongoose.Types.ObjectId(opts.serviceId) : undefined,
        paidAtUTC: opts.paidAtUTC || new Date(),
        createdByAdminId: new mongoose.Types.ObjectId(opts.adminId),
    });

    // If there is an unpaid invoice for this resource, mark it paid
    const invoiceFilter: Record<string, unknown> = {
        status: { $in: ['unpaid', 'partial'] },
        isDeleted: false,
    };
    if (opts.studentId) invoiceFilter.studentId = new mongoose.Types.ObjectId(opts.studentId);
    if (opts.planId) invoiceFilter.planId = new mongoose.Types.ObjectId(opts.planId);
    if (opts.examId) invoiceFilter.examId = new mongoose.Types.ObjectId(opts.examId);

    const invoice = await FinanceInvoice.findOne(invoiceFilter);
    if (invoice) {
        invoice.paidAmountBDT = (invoice.paidAmountBDT || 0) + opts.amount;
        if (invoice.paidAmountBDT >= invoice.amountBDT) {
            invoice.status = 'paid';
            invoice.paidAtUTC = new Date();
        } else {
            invoice.status = 'partial';
        }
        invoice.linkedTxnIds.push(txn._id as mongoose.Types.ObjectId);
        await invoice.save();
    }

    return txn;
}

// ── Finance Dashboard Summary ───────────────────────────
export async function getFinanceSummary(month?: string) {
    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, mon - 1, 1));
    const endDate = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

    const dateFilter = { dateUTC: { $gte: startDate, $lte: endDate }, isDeleted: false };

    // Previous month for comparison
    const prevStart = new Date(Date.UTC(year, mon - 2, 1));
    const prevEnd = new Date(Date.UTC(year, mon - 1, 0, 23, 59, 59, 999));
    const prevDateFilter = { dateUTC: { $gte: prevStart, $lte: prevEnd }, isDeleted: false };

    const [
        incomeTxns,
        expenseTxns,
        receivables,
        payables,
        topIncome,
        topExpense,
        dailyCashflow,
        budgets,
        incomeBySourceAgg,
        expenseByCatAgg,
        prevIncome,
        prevExpense,
        recentActivity,
    ] = await Promise.all([
        // Total income
        FinanceTransaction.aggregate([
            { $match: { ...dateFilter, direction: 'income', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        // Total expense
        FinanceTransaction.aggregate([
            { $match: { ...dateFilter, direction: 'expense', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        // Receivables (unpaid invoices)
        FinanceInvoice.aggregate([
            { $match: { status: { $in: ['unpaid', 'partial', 'overdue'] }, isDeleted: false } },
            { $group: { _id: null, total: { $sum: { $subtract: ['$amountBDT', '$paidAmountBDT'] } }, count: { $sum: 1 } } },
        ]),
        // Payables (pending expenses)
        FinanceTransaction.aggregate([
            { $match: { direction: 'expense', status: 'pending', isDeleted: false } },
            { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]),
        // Top income sources
        FinanceTransaction.aggregate([
            { $match: { ...dateFilter, direction: 'income', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: '$categoryLabel', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
        ]),
        // Top expense categories
        FinanceTransaction.aggregate([
            { $match: { ...dateFilter, direction: 'expense', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: '$categoryLabel', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
        ]),
        // Daily cashflow trend
        FinanceTransaction.aggregate([
            { $match: { ...dateFilter, status: { $in: ['paid', 'approved'] } } },
            {
                $group: {
                    _id: {
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$dateUTC' } },
                        direction: '$direction',
                    },
                    total: { $sum: '$amount' },
                },
            },
            { $sort: { '_id.date': 1 } },
        ]),
        // Budget status
        FinanceBudget.find({ month: targetMonth }).lean(),
        // Income by sourceType
        FinanceTransaction.aggregate([
            { $match: { ...dateFilter, direction: 'income', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: '$sourceType', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
        ]),
        // Expense by category
        FinanceTransaction.aggregate([
            { $match: { ...dateFilter, direction: 'expense', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: '$categoryLabel', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
        ]),
        // Previous month income
        FinanceTransaction.aggregate([
            { $match: { ...prevDateFilter, direction: 'income', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        // Previous month expense
        FinanceTransaction.aggregate([
            { $match: { ...prevDateFilter, direction: 'expense', status: { $in: ['paid', 'approved'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        // Recent activity (last 10 transactions)
        FinanceTransaction.find({ isDeleted: false })
            .sort({ createdAt: -1 })
            .limit(10)
            .select('_id direction sourceType categoryLabel amount dateUTC description')
            .lean(),
    ]);

    const incomeTotal = incomeTxns[0]?.total || 0;
    const expenseTotal = expenseTxns[0]?.total || 0;
    const prevMonthIncome = prevIncome[0]?.total || 0;
    const prevMonthExpense = prevExpense[0]?.total || 0;

    // Revenue breakdowns by source type
    const sourceMap: Record<string, number> = {};
    for (const row of incomeBySourceAgg) {
        sourceMap[row._id || 'other'] = row.total;
    }

    // Compute budget status with actual spend
    const budgetStatus = await Promise.all(
        budgets.map(async (b) => {
            const actual = await FinanceTransaction.aggregate([
                {
                    $match: {
                        ...dateFilter,
                        direction: b.direction,
                        accountCode: b.accountCode,
                        status: { $in: ['paid', 'approved'] },
                    },
                },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]);
            const spent = actual[0]?.total || 0;
            const pct = b.amountLimit > 0 ? Math.round((spent / b.amountLimit) * 100) : 0;
            return {
                _id: b._id,
                month: b.month,
                accountCode: b.accountCode,
                categoryLabel: b.categoryLabel,
                direction: b.direction,
                amountLimit: b.amountLimit,
                spent,
                percentUsed: pct,
                alertThresholdPercent: b.alertThresholdPercent,
                exceeded: pct >= b.alertThresholdPercent,
            };
        })
    );

    // Build daily cashflow map
    const dailyMap: Record<string, { income: number; expense: number }> = {};
    for (const row of dailyCashflow) {
        const d = row._id.date;
        if (!dailyMap[d]) dailyMap[d] = { income: 0, expense: 0 };
        dailyMap[d][row._id.direction as 'income' | 'expense'] = row.total;
    }
    const dailyCashflowTrend = Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, vals]) => ({ date, ...vals, net: vals.income - vals.expense }));

    // Compute month-over-month change percentages
    const incomeChange = prevMonthIncome > 0
        ? ((incomeTotal - prevMonthIncome) / prevMonthIncome) * 100
        : (incomeTotal > 0 ? 100 : 0);
    const expenseChange = prevMonthExpense > 0
        ? ((expenseTotal - prevMonthExpense) / prevMonthExpense) * 100
        : (expenseTotal > 0 ? 100 : 0);

    const manualServiceRevenue = sourceMap['manual_income'] || 0;

    return {
        month: targetMonth,
        incomeTotal,
        expenseTotal,
        netProfit: incomeTotal - expenseTotal,
        subscriptionRevenue: sourceMap['subscription_payment'] || 0,
        examRevenue: sourceMap['exam_payment'] || 0,
        manualRevenue: manualServiceRevenue,
        manualServiceRevenue,
        refundTotal: sourceMap['refund'] || 0,
        prevMonthIncome,
        prevMonthExpense,
        monthOverMonthChange: {
            incomeChange: Number.isFinite(incomeChange) ? incomeChange : 0,
            expenseChange: Number.isFinite(expenseChange) ? expenseChange : 0,
        },
        receivablesTotal: receivables[0]?.total || 0,
        receivablesCount: receivables[0]?.count || 0,
        payablesTotal: payables[0]?.total || 0,
        payablesCount: payables[0]?.count || 0,
        activeBudgetUsagePercent: budgetStatus.length > 0
            ? Math.round(budgetStatus.reduce((s, b) => s + b.percentUsed, 0) / budgetStatus.length)
            : 0,
        topIncomeSources: topIncome.map((r) => ({ category: r._id, total: r.total })),
        topExpenseCategories: topExpense.map((r) => ({ category: r._id, total: r.total })),
        incomeBySource: incomeBySourceAgg.map((r) => ({ source: r._id || 'Other', total: r.total })),
        expenseByCategory: expenseByCatAgg.map((r) => ({ category: r._id || 'Other', total: r.total })),
        dailyCashflowTrend,
        budgetStatus,
        recentActivity: (recentActivity as any[]).map((t) => ({
            _id: String(t._id),
            type: t.direction as string,
            description: t.description || t.categoryLabel || '',
            amount: t.amount,
            timestamp: t.dateUTC || t.createdAt,
        })),
    };
}

// ── Recurring Rule Execution ────────────────────────────
export async function executeRecurringRule(ruleId: string, adminId: string) {
    const rule = await FinanceRecurringRule.findById(ruleId);
    if (!rule || !rule.isActive) throw new Error('Rule not found or inactive');

    const txnCode = await nextTxnCode();
    const txn = await FinanceTransaction.create({
        txnCode,
        direction: rule.direction,
        amount: rule.amount,
        currency: rule.currency,
        dateUTC: new Date(),
        accountCode: rule.accountCode,
        categoryLabel: rule.categoryLabel,
        description: rule.description || `Recurring: ${rule.name}`,
        status: 'paid',
        method: rule.method || 'manual',
        tags: rule.tags || [],
        costCenterId: rule.costCenterId,
        vendorId: rule.vendorId,
        sourceType: rule.direction === 'expense' ? 'expense' : 'manual_income',
        sourceId: String(rule._id),
        createdByAdminId: new mongoose.Types.ObjectId(adminId),
        paidAtUTC: new Date(),
    });

    // Update next run
    const nextRun = computeNextRun(rule.frequency, rule.dayOfMonth, rule.intervalDays);
    rule.lastRunAtUTC = new Date();
    rule.lastCreatedTxnId = txn._id as mongoose.Types.ObjectId;
    rule.nextRunAtUTC = nextRun;
    if (rule.endAtUTC && nextRun > rule.endAtUTC) {
        rule.isActive = false;
    }
    await rule.save();

    return txn;
}

function computeNextRun(frequency: string, dayOfMonth?: number | null, intervalDays?: number | null): Date {
    const now = new Date();
    switch (frequency) {
        case 'weekly':
            return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        case 'yearly':
            return new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
        case 'custom':
            return new Date(now.getTime() + (intervalDays || 30) * 24 * 60 * 60 * 1000);
        case 'monthly':
        default: {
            const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dayOfMonth || 1));
            return nextMonth;
        }
    }
}

// ── Process Due Recurring Rules ─────────────────────────
export async function processDueRecurringRules(): Promise<number> {
    const dueRules = await FinanceRecurringRule.find({
        isActive: true,
        nextRunAtUTC: { $lte: new Date() },
        $or: [{ endAtUTC: null }, { endAtUTC: { $gte: new Date() } }],
    }).lean();

    let processed = 0;
    for (const rule of dueRules) {
        try {
            await executeRecurringRule(String(rule._id), String(rule.createdByAdminId));
            processed++;
        } catch (err) {
            console.error(`[finance-recurring] Failed to process rule ${rule._id}:`, err);
        }
    }
    return processed;
}

// ── Audit Logger ────────────────────────────────────────
export async function logFinanceAudit(opts: {
    actorId: string;
    action: string;
    targetType: string;
    targetId?: string;
    details?: Record<string, unknown>;
    ip?: string;
    beforeSnapshot?: Record<string, unknown>;
    afterSnapshot?: Record<string, unknown>;
}) {
    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(opts.actorId),
        action: opts.action,
        target_type: opts.targetType,
        target_id: opts.targetId ? new mongoose.Types.ObjectId(opts.targetId) : undefined,
        details: {
            ...(opts.details || {}),
            ...(opts.beforeSnapshot ? { beforeSnapshot: opts.beforeSnapshot } : {}),
            ...(opts.afterSnapshot ? { afterSnapshot: opts.afterSnapshot } : {}),
        },
        ip_address: opts.ip,
        timestamp: new Date(),
    });
}

// ── Seed default COA — upsert to handle partial seeding ─
export async function seedDefaultChartOfAccounts(): Promise<void> {
    const defaults = [
        { code: 'REV_SUBSCRIPTION', name: 'Subscription Revenue', type: 'income' as const, isSystem: true },
        { code: 'REV_EXAM', name: 'Exam Fee Revenue', type: 'income' as const, isSystem: true },
        { code: 'REV_SERVICE', name: 'Service Revenue', type: 'income' as const, isSystem: true },
        { code: 'REV_OTHER', name: 'Other Income', type: 'income' as const, isSystem: true },
        { code: 'EXP_MARKETING', name: 'Marketing & Ads', type: 'expense' as const, isSystem: true },
        { code: 'EXP_HOSTING', name: 'Hosting & Infrastructure', type: 'expense' as const, isSystem: true },
        { code: 'EXP_SMS', name: 'SMS Costs', type: 'expense' as const, isSystem: true },
        { code: 'EXP_EMAIL', name: 'Email Costs', type: 'expense' as const, isSystem: true },
        { code: 'EXP_PAYROLL', name: 'Payroll & Staff', type: 'expense' as const, isSystem: true },
        { code: 'EXP_TOOLS', name: 'Tools & Software', type: 'expense' as const, isSystem: true },
        { code: 'EXP_OPERATIONS', name: 'Operations', type: 'expense' as const, isSystem: true },
        { code: 'EXP_MISC', name: 'Miscellaneous', type: 'expense' as const, isSystem: true },
    ];

    const ops = defaults.map((d) => ({
        updateOne: {
            filter: { code: d.code },
            update: { $setOnInsert: { ...d, isActive: true } },
            upsert: true,
        },
    }));
    const result = await ChartOfAccounts.bulkWrite(ops);
    if (result.upsertedCount > 0) {
        console.log(`[finance] Seeded ${result.upsertedCount} Chart of Accounts entries`);
    }
}

// ── Ensure single finance settings doc ──────────────────
export async function getOrCreateFinanceSettings() {
    let settings = await FinanceSettings.findOne({ key: 'default' });
    if (!settings) {
        settings = await FinanceSettings.create({ key: 'default' });
        return settings;
    }
    let touched = false;
    const patchDefault = (field: string, value: unknown) => {
        const current = (settings as unknown as Record<string, unknown>)[field];
        if (current === undefined || current === null || current === '') {
            (settings as unknown as Record<string, unknown>)[field] = value;
            touched = true;
        }
    };
    patchDefault('invoicePrefix', 'CW-INV');
    patchDefault('invoiceNumberPadding', 6);
    patchDefault('defaultPaymentMethod', 'manual');
    patchDefault('taxRatePercent', 0);
    patchDefault('exportLocale', 'en-BD');
    patchDefault('exportDateFormat', 'YYYY-MM-DD');
    patchDefault('autoPostSubscriptionRevenue', true);
    patchDefault('autoPostCampaignExpenses', true);
    patchDefault('autoPostInvoicePayments', true);
    patchDefault('reportCurrencyLabel', 'BDT');
    if (touched) await settings.save();
    return settings;
}

// ── Refund Code Counter ─────────────────────────────────
let _refundCounter: number | null = null;

export async function nextRefundCode(): Promise<string> {
    if (_refundCounter === null) {
        const last = await FinanceRefund.findOne({}, { refundCode: 1 })
            .sort({ createdAt: -1 })
            .lean();
        const match = last?.refundCode?.match(/CW-REF-(\d+)/);
        _refundCounter = match ? parseInt(match[1], 10) : 0;
    }
    _refundCounter++;
    return `CW-REF-${String(_refundCounter).padStart(6, '0')}`;
}

// ── P&L PDF Report ──────────────────────────────────────
export async function generatePLReportPDF(month: string): Promise<Buffer> {
    const [summary, settings] = await Promise.all([
        getFinanceSummary(month),
        getOrCreateFinanceSettings(),
    ]);
    const currencyLabel = String(settings.reportCurrencyLabel || settings.defaultCurrency || 'BDT').trim() || 'BDT';
    const formatMoney = (value: number) => `${currencyLabel} ${Number(value || 0).toLocaleString('en-BD')}`;

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.fontSize(20).text('CampusWay - Profit & Loss Report', { align: 'center' });
        doc.moveDown(0.3);
        doc.fontSize(12).text(`Month: ${summary.month}`, { align: 'center' });
        doc.moveDown(1);

        doc.fontSize(14).text('Summary', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        doc.text(`Total Income:       ${formatMoney(summary.incomeTotal)}`);
        doc.text(`Total Expense:      ${formatMoney(summary.expenseTotal)}`);
        doc.text(`Net Profit/Loss:    ${formatMoney(summary.netProfit)}`);
        doc.text(`Receivables:        ${formatMoney(summary.receivablesTotal)} (${summary.receivablesCount} invoices)`);
        doc.text(`Payables:           ${formatMoney(summary.payablesTotal)} (${summary.payablesCount} pending)`);
        doc.moveDown(1);

        doc.fontSize(14).text('Top Income Sources', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        if (summary.topIncomeSources.length === 0) {
            doc.text('No income recorded this month.');
        } else {
            for (const src of summary.topIncomeSources) {
                doc.text(`- ${src.category || 'Uncategorized'}: ${formatMoney(src.total)}`);
            }
        }
        doc.moveDown(1);

        doc.fontSize(14).text('Top Expense Categories', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        if (summary.topExpenseCategories.length === 0) {
            doc.text('No expenses recorded this month.');
        } else {
            for (const cat of summary.topExpenseCategories) {
                doc.text(`- ${cat.category || 'Uncategorized'}: ${formatMoney(cat.total)}`);
            }
        }
        doc.moveDown(1);

        if (summary.budgetStatus.length > 0) {
            doc.fontSize(14).text('Budget Status', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(11);
            for (const budget of summary.budgetStatus) {
                const flag = budget.exceeded ? ' OVER' : '';
                doc.text(`- ${budget.categoryLabel} (${budget.accountCode}): ${formatMoney(budget.spent)} / ${formatMoney(budget.amountLimit)} (${budget.percentUsed}%)${flag}`);
            }
            doc.moveDown(1);
        }

        doc.moveDown(2);
        doc.fontSize(9).fillColor('#888').text(`Generated on ${new Date().toISOString().slice(0, 16)} UTC - CampusWay Finance Center`, { align: 'center' });

        doc.end();
    });
}
