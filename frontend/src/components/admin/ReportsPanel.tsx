import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, Loader2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    adminExportExamInsights,
    adminExportReportsSummary,
    adminGetExamInsightsReport,
    adminGetExams,
    adminGetReportsSummary,
} from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { downloadFile } from '../../utils/download';

type ReportsPanelProps = {
    exams?: Array<Record<string, any>>;
    users?: Array<Record<string, any>>;
};

export default function ReportsPanel(_props: ReportsPanelProps = {}) {
    const [filters, setFilters] = useState<{ from: string; to: string }>({ from: '', to: '' });
    const [selectedExamId, setSelectedExamId] = useState('');

    const summaryQuery = useQuery({
        queryKey: [...queryKeys.reportsSummary, filters.from, filters.to],
        queryFn: async () => (await adminGetReportsSummary({
            from: filters.from || undefined,
            to: filters.to || undefined,
        })).data,
    });

    const examsQuery = useQuery({
        queryKey: ['admin', 'report-exams-options'],
        queryFn: async () => {
            const response = await adminGetExams({ page: 1, limit: 100 });
            return response.data.exams || [];
        },
    });

    const insightsQuery = useQuery({
        queryKey: [...queryKeys.examInsights, selectedExamId],
        enabled: Boolean(selectedExamId),
        queryFn: async () => (await adminGetExamInsightsReport(selectedExamId)).data,
    });

    const exportSummary = async (format: 'csv' | 'xlsx') => {
        try {
            const response = await adminExportReportsSummary({
                from: filters.from || undefined,
                to: filters.to || undefined,
                format,
            });
            downloadFile(response, { filename: `reports-summary-${Date.now()}.${format}` });
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Summary export failed');
        }
    };

    const exportInsights = async (format: 'csv' | 'xlsx') => {
        if (!selectedExamId) {
            toast.error('Select an exam first');
            return;
        }
        try {
            const response = await adminExportExamInsights(selectedExamId, format);
            downloadFile(response, { filename: `exam-insights-${selectedExamId}-${Date.now()}.${format}` });
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Exam insights export failed');
        }
    };

    const summary = summaryQuery.data;
    const examOptions = examsQuery.data || [];

    return (
        <div className="space-y-4">
            <section className="card-flat p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-semibold cw-text">
                            <BarChart3 className="h-5 w-5 text-primary" />
                            Reports Dashboard
                        </h2>
                        <p className="mt-1 text-sm cw-muted">Daily student growth, subscriptions, payments, exams, support, and resources.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-outline text-sm" onClick={() => void exportSummary('csv')}>Export CSV</button>
                        <button type="button" className="btn-outline text-sm" onClick={() => void exportSummary('xlsx')}>Export XLSX</button>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                        type="date"
                        className="input-field"
                        value={filters.from}
                        onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
                    />
                    <input
                        type="date"
                        className="input-field"
                        value={filters.to}
                        onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
                    />
                    <button type="button" onClick={() => summaryQuery.refetch()} className="btn-outline inline-flex items-center justify-center gap-2 text-sm">
                        <RefreshCw className={`h-4 w-4 ${summaryQuery.isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </section>

            {summaryQuery.isLoading ? (
                <section className="card-flat p-5 text-sm cw-muted">
                    <div className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading report summary...
                    </div>
                </section>
            ) : summaryQuery.isError ? (
                <section className="card-flat border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-300">
                    Failed to load report summary.
                    <button type="button" className="btn-outline ml-3 text-sm" onClick={() => summaryQuery.refetch()}>Retry</button>
                </section>
            ) : summary ? (
                <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <article className="card-flat p-4">
                        <p className="text-xs uppercase tracking-widest cw-muted">Active Subscriptions</p>
                        <p className="mt-1 text-2xl font-bold cw-text">{(Number(summary.activeSubscriptions) || 0).toLocaleString()}</p>
                    </article>
                    <article className="card-flat p-4">
                        <p className="text-xs uppercase tracking-widest cw-muted">Payments Received</p>
                        <p className="mt-1 text-2xl font-bold cw-text">{(Number(summary.payments?.receivedAmount) || 0).toLocaleString()}</p>
                        <p className="text-xs cw-muted">{Number(summary.payments?.receivedCount) || 0} transactions</p>
                    </article>
                    <article className="card-flat p-4">
                        <p className="text-xs uppercase tracking-widest cw-muted">Pending Payments</p>
                        <p className="mt-1 text-2xl font-bold cw-text">{(Number(summary.payments?.pendingCount) || 0).toLocaleString()}</p>
                    </article>
                    <article className="card-flat p-4">
                        <p className="text-xs uppercase tracking-widest cw-muted">Exam Attempts / Submits</p>
                        <p className="mt-1 text-2xl font-bold cw-text">{(Number(summary.exams?.attempted) || 0).toLocaleString()} / {(Number(summary.exams?.submitted) || 0).toLocaleString()}</p>
                    </article>
                    <article className="card-flat p-4">
                        <p className="text-xs uppercase tracking-widest cw-muted">Support (Opened/Resolved)</p>
                        <p className="mt-1 text-2xl font-bold cw-text">{Number(summary.supportTickets?.opened) || 0} / {Number(summary.supportTickets?.resolved) || 0}</p>
                    </article>
                    <article className="card-flat p-4">
                        <p className="text-xs uppercase tracking-widest cw-muted">Resource Downloads</p>
                        <p className="mt-1 text-2xl font-bold cw-text">{(Number(summary.resourceDownloads?.eventCount) || 0).toLocaleString()}</p>
                        <p className="text-xs cw-muted">Counter: {(Number(summary.resourceDownloads?.totalCounter) || 0).toLocaleString()}</p>
                    </article>
                    <article className="card-flat p-4 md:col-span-2 xl:col-span-2">
                        <p className="text-xs uppercase tracking-widest cw-muted">Top News Sources</p>
                        {!Array.isArray(summary.topNewsSources) || summary.topNewsSources.length === 0 ? (
                            <p className="mt-2 text-sm cw-muted">No sources in this range.</p>
                        ) : (
                            <ul className="mt-2 space-y-1">
                                {(summary.topNewsSources || []).slice(0, 5).map((row) => (
                                    <li key={`${row.source}-${row.count}`} className="flex items-center justify-between rounded-lg border cw-border px-3 py-2 text-sm">
                                        <span className="cw-text">{row.source}</span>
                                        <span className="font-semibold cw-text">{row.count}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </article>
                </section>
            ) : (
                <section className="card-flat p-5 text-sm cw-muted">No summary data available for current range.</section>
            )}

            <section className="card-flat p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-semibold cw-text">Exam Insights</h3>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-outline text-sm" onClick={() => void exportInsights('csv')}>
                            <Download className="mr-1 inline h-4 w-4" />
                            Export CSV
                        </button>
                        <button type="button" className="btn-outline text-sm" onClick={() => void exportInsights('xlsx')}>
                            <Download className="mr-1 inline h-4 w-4" />
                            Export XLSX
                        </button>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                    <select
                        className="input-field"
                        value={selectedExamId}
                        onChange={(event) => setSelectedExamId(event.target.value)}
                    >
                        <option value="">Select exam</option>
                        {examOptions.map((exam: any) => (
                            <option key={String(exam._id)} value={String(exam._id)}>
                                {String(exam.title || 'Exam')}
                            </option>
                        ))}
                    </select>
                    <button type="button" className="btn-outline text-sm" onClick={() => insightsQuery.refetch()} disabled={!selectedExamId}>
                        Refresh Insights
                    </button>
                </div>

                {!selectedExamId ? (
                    <p className="mt-3 text-sm cw-muted">Select an exam to load question accuracy and topic weakness.</p>
                ) : insightsQuery.isLoading ? (
                    <p className="mt-3 text-sm cw-muted">Loading exam insights...</p>
                ) : insightsQuery.isError ? (
                    <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                        Failed to load exam insights.
                    </div>
                ) : insightsQuery.data ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        <article className="rounded-xl border cw-border cw-surface p-3">
                            <h4 className="text-sm font-semibold cw-text">Topic Weakness</h4>
                            {insightsQuery.data.topicWeakness.length === 0 ? (
                                <p className="mt-2 text-sm cw-muted">No topic data available.</p>
                            ) : (
                                <div className="mt-2 space-y-1">
                                    {insightsQuery.data.topicWeakness.slice(0, 8).map((row) => (
                                        <div key={row.topic} className="flex items-center justify-between rounded-lg border cw-border px-2.5 py-1.5 text-sm">
                                            <span className="cw-text">{row.topic}</span>
                                            <span className="cw-text">{row.accuracy}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>
                        <article className="rounded-xl border cw-border cw-surface p-3">
                            <h4 className="text-sm font-semibold cw-text">Suspicious Activity</h4>
                            {insightsQuery.data.suspiciousActivity.length === 0 ? (
                                <p className="mt-2 text-sm cw-muted">No suspicious activity detected.</p>
                            ) : (
                                <div className="mt-2 space-y-1">
                                    {insightsQuery.data.suspiciousActivity.slice(0, 8).map((row) => (
                                        <div key={`${row.studentId}-${row.tabSwitchCount}`} className="flex items-center justify-between rounded-lg border cw-border px-2.5 py-1.5 text-sm">
                                            <span className="cw-text">{row.studentId || 'Unknown'}</span>
                                            <span className="cw-text">Tabs: {row.tabSwitchCount}, Flags: {row.cheatFlags}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>
                    </div>
                ) : (
                    <p className="mt-3 text-sm cw-muted">No insights available for this exam.</p>
                )}
            </section>
        </div>
    );
}
