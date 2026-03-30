import React, { useMemo, useState } from 'react';
import { useFcDashboard } from '../../../hooks/useFinanceCenterQueries';
import { fcApi } from '../../../api/adminFinanceApi';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
    BarChart, Bar, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
    TrendingUp, TrendingDown, Wallet, AlertTriangle, Receipt, RefreshCw,
    DollarSign, CreditCard, FileText, Download, ArrowUpRight, ArrowDownRight,
    BookOpen, GraduationCap, Briefcase, Activity,
} from 'lucide-react';
import type { FcBudgetStatus, FcActivityItem } from '../../../types/finance';



function fmt(n: number | undefined | null) {
    if (n == null || isNaN(n)) return '0';
    return new Intl.NumberFormat('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function monthKey(offset = 0) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const DONUT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export default function FinanceDashboardPage() {
    const [month, setMonth] = useState(monthKey());
    const { data, isLoading } = useFcDashboard(month);

    const months = useMemo(() => Array.from({ length: 12 }, (_, i) => monthKey(-i)), []);

    if (isLoading) return <div className="flex justify-center py-16"><span className="animate-pulse text-sm text-slate-500">Loading dashboard...</span></div>;
    if (!data) return <div className="py-8 text-center text-sm text-slate-500">No data available.</div>;

    const {
        incomeTotal = 0, expenseTotal = 0, netProfit = 0,
        receivablesTotal = 0, receivablesCount = 0,
        payablesTotal = 0, payablesCount = 0,
        refundTotal = 0,
        subscriptionRevenue = 0, examRevenue = 0, manualServiceRevenue = 0,
        activeBudgetUsagePercent = 0,
        monthOverMonthChange,
        topIncomeSources = [], topExpenseCategories = [],
        dailyCashflowTrend = [], budgetStatus = [],
        recentActivity = [],
        incomeBySource = [], expenseByCategory = [],
    } = data;

    const exceededBudgets = budgetStatus?.filter(b => b.exceeded) ?? [];
    const warningBudgets = budgetStatus?.filter(b => !b.exceeded && b.percentUsed >= b.alertThresholdPercent) ?? [];

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-col flex-wrap justify-between gap-4 rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/50 p-6 shadow-sm dark:border-slate-800/80 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:flex-row sm:items-center">
                <div>
                    <h2 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-black tracking-tight text-transparent dark:from-white dark:to-slate-300">Finance Dashboard</h2>
                    <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">Unified money control center</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                        <select
                            value={month}
                            onChange={e => setMonth(e.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        >
                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fcApi.downloadPLReport(month)}
                            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <Download size={13} /> P&L Report
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Primary KPI Cards (6) ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <KpiCard icon={<TrendingUp size={18} />} label="Total Income" value={`৳${fmt(incomeTotal)}`} color="green" change={monthOverMonthChange?.incomeChange} />
                <KpiCard icon={<TrendingDown size={18} />} label="Total Expense" value={`৳${fmt(expenseTotal)}`} color="red" change={monthOverMonthChange?.expenseChange} />
                <KpiCard icon={<Wallet size={18} />} label="Net Profit/Loss" value={`৳${fmt(netProfit)}`} color={netProfit >= 0 ? 'green' : 'red'} />
                <KpiCard icon={<FileText size={18} />} label="Receivables" value={`৳${fmt(receivablesTotal)}`} sub={`${receivablesCount} pending`} color="amber" />
                <KpiCard icon={<CreditCard size={18} />} label="Payables" value={`৳${fmt(payablesTotal)}`} sub={`${payablesCount} pending`} color="orange" />
                <KpiCard icon={<RefreshCw size={18} />} label="Refunds" value={`৳${fmt(refundTotal)}`} color="purple" />
            </div>

            {/* ── Secondary KPI Cards (4) ── */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <SecondaryKpi icon={<BookOpen size={16} />} label="Subscription Revenue" value={`৳${fmt(subscriptionRevenue)}`} />
                <SecondaryKpi icon={<GraduationCap size={16} />} label="Exam Revenue" value={`৳${fmt(examRevenue)}`} />
                <SecondaryKpi icon={<Briefcase size={16} />} label="Manual/Service Revenue" value={`৳${fmt(manualServiceRevenue)}`} />
                <SecondaryKpi icon={<Activity size={16} />} label="Budget Usage" value={`${activeBudgetUsagePercent ? Math.round(activeBudgetUsagePercent) : 0}%`} />
            </div>

            {/* ── Income vs Expense Trend ── */}
            {dailyCashflowTrend.length > 0 && (
                <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
                    <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Income vs Expense Trend</h3>
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={dailyCashflowTrend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip formatter={((v: number) => `৳${fmt(v)}`) as any} />
                            <Area type="monotone" dataKey="income" stroke="#22c55e" fill="#22c55e" fillOpacity={0.12} strokeWidth={2} name="Income" />
                            <Area type="monotone" dataKey="expense" stroke="#ef4444" fill="#ef4444" fillOpacity={0.12} strokeWidth={2} name="Expense" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* ── Dual Donuts: Income by Source + Expense by Category ── */}
            <div className="grid gap-4 md:grid-cols-2">
                <DonutWidget title="Income by Source" data={incomeBySource.length > 0 ? incomeBySource.map(d => ({ name: d.source, value: d.total })) : topIncomeSources.map(d => ({ name: d.category, value: d.total }))} />
                <DonutWidget title="Expense by Category" data={expenseByCategory.length > 0 ? expenseByCategory.map(d => ({ name: d.category, value: d.total })) : topExpenseCategories.map(d => ({ name: d.category, value: d.total }))} />
            </div>

            {/* ── Top Income / Top Expense bar charts ── */}
            <div className="grid gap-4 md:grid-cols-2">
                <MiniBar title="Top Income Sources" data={topIncomeSources} color="#22c55e" />
                <MiniBar title="Top Expense Categories" data={topExpenseCategories} color="#ef4444" />
            </div>

            {/* ── Budget Alerts & Warnings ── */}
            {(exceededBudgets.length > 0 || warningBudgets.length > 0) && (
                <div className="rounded-[1.5rem] border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        <AlertTriangle size={15} className="text-amber-500" /> Budget Alerts
                    </h3>
                    <div className="space-y-2">
                        {exceededBudgets.map(b => <BudgetRow key={b._id} budget={b} variant="exceeded" />)}
                        {warningBudgets.map(b => <BudgetRow key={b._id} budget={b} variant="warning" />)}
                    </div>
                </div>
            )}

            {/* ── Payables Banner ── */}
            {payablesTotal > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                        <DollarSign size={14} className="mr-1 inline" />
                        Outstanding Payables: ৳{fmt(payablesTotal)} ({payablesCount} pending)
                    </p>
                </div>
            )}

            {/* ── Recent Activity Feed ── */}
            {recentActivity.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                    <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Recent Activity</h3>
                    <div className="space-y-2">
                        {recentActivity.slice(0, 10).map((a) => (
                            <ActivityRow key={a._id} item={a} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── KPI Card (Primary) ─────────────────────────────────── */
function KpiCard({ icon, label, value, color, sub, change }: {
    icon: React.ReactNode; label: string; value: string; color: string; sub?: string; change?: number;
}) {
    const colors: Record<string, { ring: string; bg: string; text: string; iconBg: string; icon: string }> = {
        green: { ring: 'hover:ring-green-500/30 dark:hover:ring-green-400/30', bg: 'bg-gradient-to-br from-green-50 to-white dark:from-green-950/40 dark:to-slate-900', text: 'text-green-700 dark:text-green-400', iconBg: 'bg-green-100 dark:bg-green-900/50', icon: 'text-green-600 dark:text-green-400' },
        red: { ring: 'hover:ring-red-500/30 dark:hover:ring-red-400/30', bg: 'bg-gradient-to-br from-red-50 to-white dark:from-red-950/40 dark:to-slate-900', text: 'text-red-700 dark:text-red-400', iconBg: 'bg-red-100 dark:bg-red-900/50', icon: 'text-red-600 dark:text-red-400' },
        amber: { ring: 'hover:ring-amber-500/30 dark:hover:ring-amber-400/30', bg: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/40 dark:to-slate-900', text: 'text-amber-700 dark:text-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/50', icon: 'text-amber-600 dark:text-amber-400' },
        orange: { ring: 'hover:ring-orange-500/30 dark:hover:ring-orange-400/30', bg: 'bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/40 dark:to-slate-900', text: 'text-orange-700 dark:text-orange-400', iconBg: 'bg-orange-100 dark:bg-orange-900/50', icon: 'text-orange-600 dark:text-orange-400' },
        purple: { ring: 'hover:ring-purple-500/30 dark:hover:ring-purple-400/30', bg: 'bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/40 dark:to-slate-900', text: 'text-purple-700 dark:text-purple-400', iconBg: 'bg-purple-100 dark:bg-purple-900/50', icon: 'text-purple-600 dark:text-purple-400' },
        blue: { ring: 'hover:ring-blue-500/30 dark:hover:ring-blue-400/30', bg: 'bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/40 dark:to-slate-900', text: 'text-blue-700 dark:text-blue-400', iconBg: 'bg-blue-100 dark:bg-blue-900/50', icon: 'text-blue-600 dark:text-blue-400' },
    };
    const c = colors[color] ?? colors.blue;
    return (
        <div className={`group relative overflow-hidden rounded-[1.5rem] border border-slate-200/60 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:ring-2 ${c.ring} ${c.bg} dark:border-slate-800/60`}>
            <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-[0.03] duration-500 group-hover:scale-150 ${c.text} bg-current dark:opacity-5 transition-transform`} />
            <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-[1rem] ${c.iconBg} ${c.icon} shadow-inner`}>{icon}</div>
            <div className="relative z-10">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
            <p className={`mt-1 text-3xl font-black tracking-tight ${c.text}`}>{value}</p>
            {sub && <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{sub}</p>}
            {change != null && change !== 0 && (
                <div className={`mt-3 flex items-center gap-1 text-[11px] font-bold ${change > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {change > 0 ? <ArrowUpRight strokeWidth={3} size={14} /> : <ArrowDownRight strokeWidth={3} size={14} />}
                        {Math.abs(change).toFixed(1)}% <span className="font-medium text-slate-400 dark:text-slate-500">vs prev</span>
                    </div>
            )}
            </div>
        </div>
    );
}

/* ── Secondary KPI ──────────────────────────────────────── */
function SecondaryKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center gap-4 rounded-[1.5rem] border border-slate-200/60 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] bg-indigo-50 text-indigo-600 shadow-inner dark:bg-indigo-950/40 dark:text-indigo-400">{icon}</div>
            <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-0.5 text-xl font-black tracking-tight text-slate-900 dark:text-white">{value}</p>
            </div>
        </div>
    );
}

/* ── Donut Widget ───────────────────────────────────────── */
function DonutWidget({ title, data }: { title: string; data: { name: string; value: number }[] }) {
    if (!data.length) return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
            <p className="py-6 text-center text-xs text-slate-500">No data</p>
        </div>
    );
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
            <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                    <Pie
                        data={data}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={2}
                    >
                        {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={((v: number) => `৳${fmt(v)}`) as any} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}

/* ── Mini Bar Chart ─────────────────────────────────────── */
function MiniBar({ title, data, color }: { title: string; data: { category: string; total: number }[]; color: string }) {
    if (!data.length) return null;
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
            <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="category" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={((v: number) => `৳${fmt(v)}`) as any} />
                    <Bar dataKey="total" fill={color} radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

/* ── Budget Alert Row ───────────────────────────────────── */
function BudgetRow({ budget, variant }: { budget: FcBudgetStatus; variant: 'exceeded' | 'warning' }) {
    const pct = Math.min(budget.percentUsed, 100);
    const isExceeded = variant === 'exceeded';
    return (
        <div className={`rounded-lg border px-4 py-2 ${isExceeded ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'}`}>
            <div className="flex items-center justify-between text-sm">
                <span className={`font-medium ${isExceeded ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
                    {budget.categoryLabel}
                </span>
                <span className={`text-xs ${isExceeded ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    ৳{fmt(budget.spent)} / ৳{fmt(budget.amountLimit)} ({budget.percentUsed.toFixed(0)}%)
                </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <div
                    className={`h-full rounded-full transition-all ${isExceeded ? 'bg-red-500' : 'bg-amber-500'}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

/* ── Activity Feed Row ──────────────────────────────────── */
function ActivityRow({ item }: { item: FcActivityItem }) {
    const typeIcons: Record<string, React.ReactNode> = {
        income: <TrendingUp size={12} className="text-green-500" />,
        expense: <TrendingDown size={12} className="text-red-500" />,
        invoice: <Receipt size={12} className="text-blue-500" />,
        refund: <RefreshCw size={12} className="text-purple-500" />,
        budget_alert: <AlertTriangle size={12} className="text-amber-500" />,
    };
    return (
        <div className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="mt-0.5">{typeIcons[item.type] ?? <Activity size={12} className="text-slate-400" />}</div>
            <div className="flex-1">
                <p className="text-xs text-slate-700 dark:text-slate-300">{item.description}</p>
                <p className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleString()}</p>
            </div>
            {item.amount != null && (
                <span className={`text-xs font-medium ${item.type === 'expense' || item.type === 'refund' ? 'text-red-600' : 'text-green-600'}`}>
                    ৳{fmt(item.amount)}
                </span>
            )}
        </div>
    );
}
