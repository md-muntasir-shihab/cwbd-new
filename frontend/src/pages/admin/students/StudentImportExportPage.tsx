import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Upload, Download, FileSpreadsheet, Clock, CheckCircle, XCircle,
  RefreshCcw, Filter,
} from 'lucide-react';
import {
  getImportExportLogs,
  importStudentsPreview,
  importStudentsCommit,
} from '../../../api/adminStudentApi';
import api, { resolveSensitiveActionHeaders } from '../../../services/api';
import { downloadFile } from '../../../utils/download';

type LogEntry = {
  _id: string; direction: string; category: string; format: string;
  totalRows: number; successRows: number; failedRows: number;
  performedBy?: { full_name?: string }; createdAt: string;
};

export default function StudentImportExportPage() {
  const [dirFilter, setDirFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  const { data: logsData, refetch: refetchLogs } = useQuery({
    queryKey: ['import-export-logs', dirFilter, catFilter],
    queryFn: () => getImportExportLogs({ direction: dirFilter || undefined, category: catFilter || undefined }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Select a file');
      const fd = new FormData();
      fd.append('file', importFile);

      const preview = await importStudentsPreview(fd) as Record<string, unknown>;
      const rows = Array.isArray(preview?.allRows)
        ? preview.allRows as Record<string, string>[]
        : [];
      const mapping = (preview?.suggestedMapping ?? {}) as Record<string, string>;
      if (rows.length === 0) {
        return { created: 0, updated: 0, skipped: 0, errors: [] };
      }

      return importStudentsCommit({
        mode: 'create_only',
        dedupeField: 'email',
        mapping,
        rows,
      });
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportFile(null);
      refetchLogs();
    },
  });

  const exportMutation = useMutation({
    mutationFn: async (format: string) => {
      const headers = await resolveSensitiveActionHeaders({
        actionLabel: 'export student records',
        defaultReason: 'Student import/export page data export',
        requireOtpHint: true,
      });
      const res = await api.get(`/admin/students-v2/export?format=${format}`, {
        responseType: 'blob',
        headers,
      });
      downloadFile(res, { filename: `students-export.${format}` });
    },
    onSuccess: () => refetchLogs(),
  });

  const downloadTemplate = async () => {
    const res = await api.get('/admin/students-v2/template.xlsx', { responseType: 'blob' });
    downloadFile(res, { filename: 'students_import_template.xlsx' });
  };

  const logs: LogEntry[] = logsData?.logs ?? [];
  const inputCls = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none';

  return (
    <div className="space-y-6">
      {/* Import Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-green-600" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Import Students</h3>
          </div>
          <div className="space-y-3">
            <div className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center dark:border-slate-600">
              <input type="file" accept=".xlsx,.csv" onChange={e => setImportFile(e.target.files?.[0] ?? null)} className="hidden" id="import-file" />
              <label htmlFor="import-file" className="cursor-pointer">
                <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {importFile ? importFile.name : 'Click to select .xlsx or .csv file'}
                </p>
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={() => importMutation.mutate()} disabled={!importFile || importMutation.isPending}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {importMutation.isPending ? 'Importing...' : 'Start Import'}
              </button>
              <button onClick={downloadTemplate} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                Template
              </button>
            </div>
            {importResult && (
              <div className="space-y-2">
                <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
                  {(() => {
                    const result = importResult as Record<string, unknown>;
                    const created = Number(result.created ?? 0);
                    const updated = Number(result.updated ?? 0);
                    const skipped = Number(result.skipped ?? 0);
                    const errors = Array.isArray(result.errors) ? result.errors.length : 0;
                    return `Import complete: ${created} created, ${updated} updated, ${skipped} skipped, ${errors} failed`;
                  })()}
                </div>
                {Array.isArray((importResult as Record<string, unknown>).errors) && ((importResult as Record<string, unknown>).errors as Array<Record<string, unknown>>).length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                    <p className="mb-2 text-xs font-semibold text-red-700 dark:text-red-400">Row-level errors:</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {((importResult as Record<string, unknown>).errors as Array<Record<string, unknown>>).slice(0, 50).map((err, i) => (
                        <p key={i} className="text-xs text-red-600 dark:text-red-400">
                          {err.row != null ? `Row ${err.row}: ` : ''}{String(err.field ? `[${err.field}] ` : '')}{String(err.message || err.error || JSON.stringify(err))}
                        </p>
                      ))}
                      {((importResult as Record<string, unknown>).errors as Array<Record<string, unknown>>).length > 50 && (
                        <p className="text-xs text-red-500 font-medium">...and {((importResult as Record<string, unknown>).errors as Array<Record<string, unknown>>).length - 50} more errors</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {importMutation.isError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {(importMutation.error as Error)?.message || 'Import failed'}
              </div>
            )}
          </div>
        </section>

        {/* Export Section */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <Download className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Export Students</h3>
          </div>
          <p className="mb-4 text-sm text-slate-500">Export all student records in your preferred format.</p>
          <div className="grid grid-cols-2 gap-3">
            {['xlsx', 'csv'].map(fmt => (
              <button key={fmt} onClick={() => exportMutation.mutate(fmt)} disabled={exportMutation.isPending}
                className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                <FileSpreadsheet className="mx-auto mb-1 h-6 w-6 text-slate-400" />
                Export .{fmt.toUpperCase()}
              </button>
            ))}
          </div>
          {exportMutation.isPending && (
            <p className="mt-3 text-center text-xs text-slate-500">Preparing download...</p>
          )}
        </section>
      </div>

      {/* Logs */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Import / Export History</h3>
          </div>
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400" />
            <select className={inputCls} value={dirFilter} onChange={e => setDirFilter(e.target.value)}>
              <option value="">All Directions</option>
              <option value="import">Import</option>
              <option value="export">Export</option>
            </select>
            <select className={inputCls} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">All Categories</option>
              {['student', 'result', 'payment', 'group', 'attendance'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button onClick={() => refetchLogs()} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <RefreshCcw size={14} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 dark:border-slate-700">
                <th className="pb-2 pr-4">Direction</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">Format</th>
                <th className="pb-2 pr-4">Rows</th>
                <th className="pb-2 pr-4">Success</th>
                <th className="pb-2 pr-4">Failed</th>
                <th className="pb-2 pr-4">By</th>
                <th className="pb-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map(log => (
                <tr key={log._id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2 pr-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${log.direction === 'import' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                      {log.direction === 'import' ? <Upload size={10} /> : <Download size={10} />}
                      {log.direction}
                    </span>
                  </td>
                  <td className="py-2 pr-4 capitalize">{log.category}</td>
                  <td className="py-2 pr-4 uppercase text-xs">{log.format}</td>
                  <td className="py-2 pr-4">{log.totalRows}</td>
                  <td className="py-2 pr-4"><span className="flex items-center gap-1 text-green-600"><CheckCircle size={12} />{log.successRows}</span></td>
                  <td className="py-2 pr-4"><span className="flex items-center gap-1 text-red-500"><XCircle size={12} />{log.failedRows}</span></td>
                  <td className="py-2 pr-4">{log.performedBy?.full_name ?? '—'}</td>
                  <td className="py-2 text-xs text-slate-500">{new Date(log.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">No logs found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
