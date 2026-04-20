import { useState, useRef, useCallback } from 'react';
import { Upload, X, RefreshCw, CheckCircle, AlertCircle, Download, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import { useImportPreview, useImportCommit } from '../../../hooks/useQuestionBankV2Queries';
import { downloadImportTemplate } from '../../../api/adminQuestionBankApi';
import type { ImportPreviewResponse, ImportCommitResponse } from '../../../types/questionBank';
import { downloadFile } from '../../../utils/download';

interface ImportDialogProps {
    open: boolean;
    onClose: () => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

export default function ImportDialog({ open, onClose }: ImportDialogProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [mode, setMode] = useState<'create' | 'upsert'>('create');
    const [result, setResult] = useState<ImportCommitResponse | null>(null);
    const [step, setStep] = useState<Step>('upload');
    const [dragOver, setDragOver] = useState(false);

    const previewMut = useImportPreview();
    const commitMut = useImportCommit();
    const loading = previewMut.isPending || commitMut.isPending;

    const reset = useCallback(() => {
        setFile(null);
        setPreview(null);
        setMapping({});
        setMode('create');
        setResult(null);
        setStep('upload');
        setDragOver(false);
    }, []);

    const handleClose = useCallback(() => {
        reset();
        onClose();
    }, [reset, onClose]);

    const handleFile = useCallback((f: File | null) => {
        if (!f) return;
        const ext = f.name.split('.').pop()?.toLowerCase();
        if (ext !== 'xlsx') {
            toast.error('Only .xlsx files are supported');
            return;
        }
        setFile(f);
        setPreview(null);
        setResult(null);
        setStep('upload');
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        handleFile(f || null);
    }, [handleFile]);

    const handlePreview = async () => {
        if (!file) return;
        try {
            const data = await previewMut.mutateAsync({
                file,
                mapping: Object.keys(mapping).length > 0 ? mapping : undefined,
            });
            setPreview(data);
            setMapping(data.mapping);
            setStep('preview');
            toast.success(`Preview ready: ${data.totalRows} rows`);
        } catch {
            toast.error('Preview failed');
        }
    };

    const handleCommit = async () => {
        if (!file || !preview) return;
        setStep('importing');
        try {
            const res = await commitMut.mutateAsync({ file, mapping, mode });
            setResult(res);
            setStep('result');
            if (res.failed > 0) {
                toast.error(`${res.failed} rows failed`);
            } else {
                toast.success(`Imported ${res.imported} of ${res.totalRows} questions`);
            }
        } catch {
            toast.error('Import failed');
            setStep('preview');
        }
    };

    const downloadErrorReport = () => {
        if (!result?.errorRows?.length) return;
        const headers = ['Row', 'Reason', 'Data'];
        const csvRows = result.errorRows.map((err) =>
            [err.row, `"${err.reason.replace(/"/g, '""')}"`, `"${JSON.stringify(err.data).replace(/"/g, '""')}"`].join(','),
        );
        const csv = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        downloadFile(blob, { filename: 'import_error_report.csv' });
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={handleClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Import Questions"
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/60 dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">Import Questions</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/5 transition"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Step: Upload */}
                    {step === 'upload' && (
                        <>
                            <div className="flex justify-end">
                                <button
                                    onClick={async () => {
                                        try {
                                            const blob = await downloadImportTemplate();
                                            downloadFile(blob as Blob, { filename: 'question_import_template.xlsx' });
                                            toast.success('Template downloaded');
                                        } catch {
                                            toast.error('Download failed');
                                        }
                                    }}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white transition"
                                >
                                    <Download className="w-3.5 h-3.5" /> Download Template
                                </button>
                            </div>

                            {/* Dropzone */}
                            <div
                                onClick={() => fileRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition ${dragOver
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                                        : 'border-slate-300 dark:border-slate-700/60 hover:border-indigo-500/40'
                                    }`}
                            >
                                <Upload className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
                                <p className="text-slate-600 dark:text-slate-300 text-sm">
                                    {file ? file.name : 'Drop .xlsx file here or click to browse'}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">Only .xlsx files are accepted</p>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".xlsx"
                                    className="hidden"
                                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                                />
                            </div>

                            {file && (
                                <div className="flex items-center justify-end gap-2">
                                    <button
                                        onClick={() => { setFile(null); }}
                                        className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        onClick={handlePreview}
                                        disabled={loading}
                                        className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-indigo-500 disabled:opacity-60 transition"
                                    >
                                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                        Preview Import
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* Step: Preview */}
                    {step === 'preview' && preview && (
                        <>
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                    <span className="font-semibold text-slate-900 dark:text-white">{preview.totalRows}</span> rows detected
                                </p>
                                <button
                                    onClick={() => { setStep('upload'); setPreview(null); }}
                                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
                                >
                                    ← Change file
                                </button>
                            </div>

                            {/* Column mapping */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                                    Column Mapping ({preview.headers.length} columns)
                                </h3>
                                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                                    <table className="text-sm w-full">
                                        <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300 sticky top-0">
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
                            </div>

                            {/* Preview rows */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                                    Preview ({preview.preview.length} of {preview.totalRows} rows)
                                </h3>
                                <div className="max-h-48 overflow-y-auto space-y-2">
                                    {preview.preview.map((row) => (
                                        <div
                                            key={row.rowIndex}
                                            className={`p-3 rounded-xl border text-sm ${row.errors.length > 0
                                                    ? 'border-rose-300 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-900/10'
                                                    : 'border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-900/40'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-slate-600 dark:text-slate-300 font-medium">Row {row.rowIndex}</span>
                                                {row.errors.length > 0 && (
                                                    <span className="flex items-center gap-1 text-rose-400 text-xs">
                                                        <AlertCircle className="w-3.5 h-3.5" /> {row.errors.length} error(s)
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-slate-900 dark:text-white truncate">
                                                {String(row.mapped.question_en || row.mapped.question_bn || '—')}
                                            </p>
                                            {row.errors.map((err, i) => (
                                                <p key={i} className="text-rose-400 text-xs mt-1">{err.field}: {err.message}</p>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Mode + Commit */}
                            <div className="flex items-center justify-between pt-2">
                                <select
                                    value={mode}
                                    onChange={(e) => setMode(e.target.value as 'create' | 'upsert')}
                                    className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300"
                                >
                                    <option value="create">Create (skip duplicates)</option>
                                    <option value="upsert">Upsert (update duplicates)</option>
                                </select>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleClose}
                                        className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCommit}
                                        disabled={loading}
                                        className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-emerald-500 disabled:opacity-60 transition"
                                    >
                                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                        Import {preview.totalRows} Questions
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Step: Importing */}
                    {step === 'importing' && (
                        <div className="flex flex-col items-center py-10 gap-4">
                            <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                            <p className="text-sm text-slate-600 dark:text-slate-300">Importing questions…</p>
                        </div>
                    )}

                    {/* Step: Result */}
                    {step === 'result' && result && (
                        <>
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 p-5 space-y-4">
                                <div className="flex items-center gap-2">
                                    {result.failed > 0 ? (
                                        <AlertCircle className="w-5 h-5 text-amber-500" />
                                    ) : (
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    )}
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Import Complete</h3>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/40 p-3 text-center">
                                        <p className="text-lg font-bold text-slate-900 dark:text-white">{result.totalRows}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Total Rows</p>
                                    </div>
                                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-500/30 p-3 text-center">
                                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{result.imported}</p>
                                        <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Imported</p>
                                    </div>
                                    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-500/30 p-3 text-center">
                                        <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{result.skipped}</p>
                                        <p className="text-xs text-amber-600/70 dark:text-amber-400/70">Duplicates</p>
                                    </div>
                                    <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-500/30 p-3 text-center">
                                        <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{result.failed}</p>
                                        <p className="text-xs text-rose-600/70 dark:text-rose-400/70">Failed</p>
                                    </div>
                                </div>

                                {result.errorRows.length > 0 && (
                                    <button
                                        onClick={downloadErrorReport}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-100 border border-amber-200 text-sm text-amber-700 hover:bg-amber-200 dark:bg-amber-500/15 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/25 transition"
                                    >
                                        <Download className="w-4 h-4" />
                                        Download Error Report ({result.errorRows.length} rows)
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    onClick={reset}
                                    className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition"
                                >
                                    Import Another
                                </button>
                                <button
                                    onClick={handleClose}
                                    className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 transition"
                                >
                                    Done
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
