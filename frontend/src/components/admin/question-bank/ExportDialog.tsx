import { useState, useCallback } from 'react';
import { X, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { exportQuestions, exportPdf } from '../../../api/adminQuestionBankApi';
import { downloadFile } from '../../../utils/download';
import type { BankQuestionFilters } from '../../../types/questionBank';

type ExportFormat = 'xlsx' | 'pdf';

interface ExportDialogProps {
    open: boolean;
    onClose: () => void;
    filters: BankQuestionFilters;
}

export default function ExportDialog({ open, onClose, filters }: ExportDialogProps) {
    const [format, setFormat] = useState<ExportFormat>('xlsx');
    const [loading, setLoading] = useState(false);

    const handleClose = useCallback(() => {
        if (loading) return;
        setFormat('xlsx');
        onClose();
    }, [loading, onClose]);

    const handleExport = async () => {
        setLoading(true);
        try {
            let blob: Blob;
            let filename: string;

            if (format === 'xlsx') {
                blob = await exportQuestions(filters, 'xlsx') as Blob;
                filename = 'question_bank_export.xlsx';
            } else {
                blob = await exportPdf(filters) as Blob;
                filename = 'question_bank_export.pdf';
            }

            downloadFile(blob, { filename });
            toast.success(`Exported as ${format.toUpperCase()}`);
            handleClose();
        } catch {
            toast.error('Export failed. Please try again.');
        } finally {
            setLoading(false);
        }
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
                aria-label="Export Questions"
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700/60 dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-indigo-500" />
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">Export Questions</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={loading}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-white/5 transition disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Format selection */}
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Select Format</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setFormat('xlsx')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${format === 'xlsx'
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                                        : 'border-slate-200 dark:border-slate-700/60 hover:border-indigo-500/40'
                                    }`}
                            >
                                <FileSpreadsheet className={`w-8 h-8 ${format === 'xlsx' ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'}`} />
                                <span className={`text-sm font-medium ${format === 'xlsx' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                    Excel (.xlsx)
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormat('pdf')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${format === 'pdf'
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                                        : 'border-slate-200 dark:border-slate-700/60 hover:border-indigo-500/40'
                                    }`}
                            >
                                <FileText className={`w-8 h-8 ${format === 'pdf' ? 'text-indigo-500' : 'text-slate-400 dark:text-slate-500'}`} />
                                <span className={`text-sm font-medium ${format === 'pdf' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                    PDF
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Active filters notice */}
                    {hasActiveFilters(filters) && (
                        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-500/30 px-4 py-3">
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                Current filters will be applied to the export.
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                            onClick={handleClose}
                            disabled={loading}
                            className="px-4 py-2 rounded-xl text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={loading}
                            className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2 hover:bg-indigo-500 disabled:opacity-60 transition"
                        >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {loading ? 'Exporting…' : 'Export'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function hasActiveFilters(filters: BankQuestionFilters): boolean {
    return !!(filters.q || filters.subject || filters.moduleCategory || filters.difficulty || filters.tag);
}
