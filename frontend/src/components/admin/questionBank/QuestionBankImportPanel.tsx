import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Upload, RefreshCw, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useImportPreview, useImportCommit } from '../../../hooks/useQuestionBankV2Queries';
import { downloadImportTemplate } from '../../../api/adminQuestionBankApi';
import type { ImportPreviewResponse, ImportCommitResponse } from '../../../types/questionBank';
import { downloadFile } from '../../../utils/download';



export default function QuestionBankImportPanel() {
    const fileRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
    const [commitErrors, setCommitErrors] = useState<ImportCommitResponse['errorRows']>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [mode, setMode] = useState<'create' | 'upsert'>('create');

    const previewMut = useImportPreview();
    const commitMut = useImportCommit();

    async function handlePreview() {
        if (!file) return;
        try {
            const data = await previewMut.mutateAsync({ file, mapping: Object.keys(mapping).length > 0 ? mapping : undefined });
            setPreview(data);
            setMapping(data.mapping);
            toast.success(`Preview ready: ${data.totalRows} rows`);
        } catch { toast.error('Preview failed'); }
    }

    async function handleCommit() {
        if (!file || !preview) return;
        try {
            setCommitErrors([]);
            const result = await commitMut.mutateAsync({ file, mapping, mode });
            toast.success(`Imported ${result.imported} of ${result.totalRows} questions`);
            if (result.failed > 0) {
                toast.error(`${result.failed} rows failed`);
            }
            if (Array.isArray(result.errorRows) && result.errorRows.length > 0) {
                setCommitErrors(result.errorRows);
            } else {
                setFile(null);
                setPreview(null);
            }
        } catch { toast.error('Import failed'); }
    }

    const loading = previewMut.isPending || commitMut.isPending;

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Import Questions</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={async () => {
                            try {
                                const blob = await downloadImportTemplate();
                                downloadFile(blob as Blob, { filename: 'question_import_template.xlsx' });
                                toast.success('Template downloaded');
                            } catch { toast.error('Download failed'); }
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white transition"
                    >
                        <Download className="w-4 h-4" /> Download Template
                    </button>
                </div>
            </div>

            {/* Upload zone */}
            <div
                onClick={() => fileRef.current?.click()}
                className="relative border-2 border-dashed border-slate-300 dark:border-slate-700/60 rounded-2xl p-10 text-center cursor-pointer hover:border-indigo-500/40 transition"
            >
                <div className="absolute right-4 top-4">
                </div>
                <Upload className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
                <p className="text-slate-600 dark:text-slate-300 text-sm">{file ? file.name : 'Click to upload .xlsx or .csv file'}</p>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
            </div>

            {file && !preview && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePreview}
                        disabled={loading}
                        className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-indigo-500 disabled:opacity-60 transition"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Preview Import
                    </button>
                </div>
            )}

            {/* Column mapping */}
            {preview && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Column Mapping ({preview.headers.length} columns detected)</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="text-sm w-full">
                            <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                                <tr>
                                    <th className="p-2 text-left font-medium">File Column</th>
                                    <th className="p-2 text-left font-medium">Maps To</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {preview.headers.map((header) => (
                                    <tr key={header} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                                        <td className="p-2 text-slate-600 dark:text-slate-300">{header}</td>
                                        <td className="p-2">
                                            <select
                                                value={mapping[header] || ''}
                                                onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                                                className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900 dark:border-slate-700/60 dark:text-slate-300"
                                            >
                                                <option value="">(skip)</option>
                                                {preview.availableColumns.map((col) => (
                                                    <option key={col} value={col}>{col}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Preview rows */}
                    <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Preview ({preview.preview.length} of {preview.totalRows} rows)</h3>
                    <div className="space-y-2">
                        {preview.preview.map((row) => (
                            <div key={row.rowIndex} className={`p-3 rounded-xl border text-sm ${row.errors.length > 0 ? 'border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-900/10' : 'border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/40'}`}>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-slate-600 dark:text-slate-300 font-medium">Row {row.rowIndex}</span>
                                    {row.errors.length > 0 && (
                                        <span className="flex items-center gap-1 text-rose-400 text-xs">
                                            <AlertCircle className="w-3.5 h-3.5" /> {row.errors.length} error(s)
                                        </span>
                                    )}
                                </div>
                                <p className="text-slate-900 dark:text-white truncate">{String(row.mapped.question_en || row.mapped.question_bn || '—')}</p>
                                {row.errors.map((err, i) => (
                                    <p key={i} className="text-rose-400 text-xs mt-1">{err.field}: {err.message}</p>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Commit */}
                    <div className="flex items-center gap-4 pt-2">
                        <div className="flex items-center gap-2">
                            <select value={mode} onChange={(e) => setMode(e.target.value as 'create' | 'upsert')} className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300">
                                <option value="create">Create (skip duplicates)</option>
                                <option value="upsert">Upsert (update duplicates)</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCommit}
                                disabled={loading}
                                className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-emerald-500 disabled:opacity-60 transition"
                            >
                                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                Import {preview.totalRows} Questions
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => { setFile(null); setPreview(null); }} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Row-level import errors */}
            {commitErrors.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-rose-500 flex items-center gap-1.5">
                            <AlertCircle className="w-4 h-4" /> {commitErrors.length} Row Error{commitErrors.length !== 1 ? 's' : ''}
                        </h3>
                        <button
                            onClick={() => { setCommitErrors([]); setFile(null); setPreview(null); }}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                        >
                            Dismiss
                        </button>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {commitErrors.map((err, i) => (
                            <div key={i} className="p-3 rounded-xl border border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-900/10 text-sm">
                                <span className="font-medium text-slate-700 dark:text-slate-300">Row {err.row}:</span>{' '}
                                <span className="text-rose-600 dark:text-rose-400">{err.reason}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
