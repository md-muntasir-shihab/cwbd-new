import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
    AdminStudentExamItem,
    AdminStudentGroup,
    AdminStudentItem,
    adminCreateStudent,
    adminCreateStudentGroup,
    adminCreateSubscriptionPlan,
    adminDeleteStudentGroup,
    adminExportStudentGroups,
    adminGetStudentExams,
    adminGetStudentGroups,
    adminGetStudents,
    adminGetSubscriptionPlans,
    adminImportStudentGroups,
    adminExportStudents,
    adminDownloadStudentTemplate,
    adminInitStudentImport,
    adminValidateStudentImport,
    adminCommitStudentImport,
    adminToggleSubscriptionPlan,
    adminUpdateStudent,
    adminUpdateStudentGroups,
    adminUpdateStudentGroup,
    adminUpdateStudentSubscription,
    adminUpdateSubscriptionPlan,
    adminBulkStudentAction,
    AdminSubscriptionPlan,
} from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useAdminRuntimeFlags } from '../../hooks/useAdminRuntimeFlags';
import { downloadFile } from '../../utils/download';
import { showConfirmDialog, showPromptDialog } from '../../lib/appDialog';
import {
    Plus, Search,
    CreditCard, Layers,
    ChevronLeft, ChevronRight,
    Edit, Trash2, CheckCircle, XCircle, Clock, Pause, Users,
    X, RefreshCw, User, Mail, Hash, Phone, Crown, BookOpen, GraduationCap, Fingerprint, IdCard, Upload, Download
} from 'lucide-react';

/* UI Components */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-900/65 border border-indigo-500/15 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between z-10">
                    <h2 className="font-bold text-white text-lg tracking-tight">{title}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-all duration-200">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
}

function ImportWizard({ groups, plans, onSuccess, onClose }: {
    groups: AdminStudentGroup[];
    plans: AdminSubscriptionPlan[];
    onSuccess: () => void;
    onClose: () => void;
}) {
    const [step, setStep] = useState<'upload' | 'mapping' | 'validate' | 'commit'>('upload');
    const [loading, setLoading] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [sampleRows, setSampleRows] = useState<any[]>([]);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [defaults, setDefaults] = useState<Record<string, any>>({
        targetGroupId: '',
        targetPlanCode: '',
        status: 'active'
    });
    const [validationSummary, setValidationSummary] = useState<any>(null);
    const [commitSummary, setCommitSummary] = useState<any>(null);

    const dbFields = [
        { key: 'email', label: 'Email (Required)', required: true },
        { key: 'fullName', label: 'Full Name' },
        { key: 'username', label: 'Username' },
        { key: 'phoneNumber', label: 'Phone Number' },
        { key: 'userUniqueId', label: 'University ID' },
        { key: 'batch', label: 'HSC Batch' },
        { key: 'ssc_batch', label: 'SSC Batch' },
        { key: 'department', label: 'Department' },
        { key: 'guardianName', label: 'Guardian Name' },
        { key: 'guardianNumber', label: 'Guardian Phone' },
        { key: 'rollNumber', label: 'Roll Number' },
        { key: 'registrationNumber', label: 'Reg Number' },
    ];

    const handleUpload = async (file: File) => {
        setLoading(true);
        try {
            const res = await adminInitStudentImport(file);
            setJobId(res.data.jobId);
            setHeaders(res.data.headers);
            setSampleRows(res.data.sampleRows);

            // Auto-mapping
            const initialMapping: Record<string, string> = {};
            dbFields.forEach(field => {
                const match = res.data.headers.find(h =>
                    h.toLowerCase().replace(/[^a-z]/g, '') === field.key.toLowerCase().replace(/[^a-z]/g, '') ||
                    h.toLowerCase().replace(/[^a-z]/g, '') === field.label.toLowerCase().replace(/[^a-z]/g, '')
                );
                if (match) initialMapping[field.key] = match;
            });
            setMapping(initialMapping);
            setStep('mapping');
        } catch (err: unknown) {
            const errMsg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
                || (err as { message?: string })?.message
                || 'Upload failed';
            toast.error(errMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleValidate = async () => {
        if (!jobId) return;
        if (!mapping.email) return toast.error('Email mapping is required');

        setLoading(true);
        try {
            const res = await adminValidateStudentImport(jobId, { mapping, defaults });
            setValidationSummary(res.data.summary);
            setStep('validate');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Validation failed');
        } finally {
            setLoading(false);
        }
    };

    const handleCommit = async () => {
        if (!jobId) return;
        setLoading(true);
        try {
            const res = await adminCommitStudentImport(jobId, { dryRun: false });
            setCommitSummary(res.data.summary);
            setStep('commit');
            toast.success('Import completed successfully');
            onSuccess();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Commit failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Stepper */}
            <div className="flex items-center justify-center mb-8">
                {['upload', 'mapping', 'validate', 'commit'].map((s, idx) => (
                    <div key={s} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s ? 'bg-indigo-600 text-white ring-4 ring-indigo-500/20' : idx < ['upload', 'mapping', 'validate', 'commit'].indexOf(step) ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                            {idx < ['upload', 'mapping', 'validate', 'commit'].indexOf(step) ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                        </div>
                        {idx < 3 && <div className={`w-12 h-0.5 ${idx < ['upload', 'mapping', 'validate', 'commit'].indexOf(step) ? 'bg-emerald-500' : 'bg-slate-800'}`} />}
                    </div>
                ))}
            </div>

            {step === 'upload' && (
                <div className="space-y-6 text-center py-4">
                    <div className="mx-auto w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center">
                        <Upload className="w-8 h-8 text-indigo-500" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">Upload Students File</h3>
                        <p className="text-slate-400 text-sm mt-1">Select an XLSX or CSV file to begin</p>
                    </div>
                    <div className="max-w-md mx-auto">
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
                            className="hidden"
                            id="student-import-file"
                            disabled={loading}
                        />
                        <label
                            htmlFor="student-import-file"
                            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-indigo-500/20 rounded-2xl bg-indigo-500/5 hover:bg-indigo-500/10 hover:border-indigo-500/40 cursor-pointer transition-all group"
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <Plus className="w-8 h-8 text-indigo-400 group-hover:scale-110 transition-transform mb-2" />
                                <p className="text-sm text-slate-400">Click to browse or drag & drop</p>
                            </div>
                        </label>
                    </div>
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={async () => {
                                try {
                                    const res = await adminDownloadStudentTemplate();
                                    downloadFile(res, { filename: 'student_import_template.xlsx' });
                                } catch (err) {
                                    toast.error('Failed to download template');
                                }
                            }}
                            className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 text-xs font-bold transition-all"
                        >
                            <Download className="w-4 h-4" /> Download Example Template
                        </button>
                    </div>
                </div>
            )}

            {step === 'mapping' && (
                <div className="space-y-6">
                    <div className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl">
                        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Field Mapping</h3>
                        <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                            {dbFields.map(field => (
                                <div key={field.key} className="flex items-center gap-4 bg-slate-950/40 p-3 rounded-xl border border-white/5">
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-slate-200">{field.label}</p>
                                    </div>
                                    <div className="flex-1">
                                        <select
                                            value={mapping[field.key] || ''}
                                            onChange={e => setMapping({ ...mapping, [field.key]: e.target.value })}
                                            className="w-full bg-slate-900 border border-white/10 rounded-lg py-1.5 px-3 text-xs text-white outline-none focus:border-indigo-500/50 transition-all"
                                        >
                                            <option value="">-- Skip Field --</option>
                                            {headers.map((h, idx) => <option key={`${h}-${idx}`} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Initial Group</label>
                            <select
                                value={defaults.targetGroupId}
                                onChange={e => setDefaults({ ...defaults, targetGroupId: e.target.value })}
                                className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all text-sm"
                            >
                                <option value="">No Group</option>
                                {groups.map((g, idx) => <option key={`${g._id}-${idx}`} value={g._id}>{g.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Initial Package</label>
                            <select
                                value={defaults.targetPlanCode}
                                onChange={e => setDefaults({ ...defaults, targetPlanCode: e.target.value })}
                                className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl px-4 py-3 text-white focus:border-indigo-500/50 outline-none transition-all text-sm"
                            >
                                <option value="">No Package (Free)</option>
                                {plans.map((p, idx) => <option key={`${p._id}-${idx}`} value={p.code}>{p.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-between pt-4">
                        <button onClick={() => setStep('upload')} className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white transition-all font-bold">Back</button>
                        <button
                            onClick={handleValidate}
                            disabled={loading || !mapping.email}
                            className="flex items-center gap-2 px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20"
                        >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                            Validate Data
                        </button>
                    </div>
                </div>
            )}

            {step === 'validate' && validationSummary && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                        <div className="bg-slate-900/60 p-4 rounded-2xl border border-indigo-500/10">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total Rows</p>
                            <p className="text-2xl font-bold text-white">{validationSummary.totalRows}</p>
                        </div>
                        <div className="bg-emerald-500/10 p-4 rounded-2xl border border-emerald-500/20">
                            <p className="text-[10px] text-emerald-200 uppercase font-bold tracking-widest">Valid Rows</p>
                            <p className="text-2xl font-bold text-emerald-100">{validationSummary.validRows}</p>
                        </div>
                        <div className="bg-rose-500/10 p-4 rounded-2xl border border-rose-500/20">
                            <p className="text-[10px] text-rose-200 uppercase font-bold tracking-widest">Failed Rows</p>
                            <p className="text-2xl font-bold text-rose-100">{validationSummary.failedRows}</p>
                        </div>
                    </div>

                    {validationSummary.failedRows > 0 && (
                        <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                            <h3 className="text-xs font-bold text-rose-400 uppercase mb-2">Errors Found</h3>
                            <div className="max-h-32 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                                {validationSummary.errors?.map((err: any, idx: number) => (
                                    <div key={idx} className="text-xs text-rose-300/80 bg-rose-500/5 px-2 py-1 rounded">
                                        Row {err.row}: {err.message}
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-2 italic">Malformed or duplicate data will be skipped during commit.</p>
                        </div>
                    )}

                    <div className="bg-indigo-500/5 p-4 rounded-2xl border border-indigo-500/10 text-left">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2">Data Preview</h4>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px] text-slate-400">
                                <thead>
                                    <tr className="border-b border-white/5">
                                        <th className="text-left py-1 pr-4">Email</th>
                                        <th className="text-left py-1 pr-4">Name</th>
                                        <th className="text-left py-1">Batch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sampleRows.slice(0, 3).map((row, idx) => (
                                        <tr key={idx} className="border-b border-white/5 last:border-0">
                                            <td className="py-2 truncate max-w-[120px]">{row[mapping.email] || '-'}</td>
                                            <td className="py-2 truncate max-w-[120px]">{row[mapping.fullName] || '-'}</td>
                                            <td className="py-2">{row[mapping.batch] || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-between pt-4">
                        <button onClick={() => setStep('mapping')} className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white transition-all font-bold">Back to Mapping</button>
                        <button
                            onClick={handleCommit}
                            disabled={loading || validationSummary.validRows === 0}
                            className="flex items-center gap-2 px-10 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:opacity-90 text-white rounded-xl font-bold disabled:opacity-50 transition-all shadow-xl shadow-indigo-500/30"
                        >
                            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Commit Import
                        </button>
                    </div>
                </div>
            )}

            {step === 'commit' && commitSummary && (
                <div className="space-y-6 text-center py-4">
                    <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-white">Import Complete!</h3>
                        <p className="text-slate-400 text-sm mt-1">Found {commitSummary.totalRows} students in file</p>
                    </div>

                    <div className="mx-auto grid max-w-sm grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl">
                            <p className="text-2xl font-bold text-indigo-400">{commitSummary.createdCount}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">New Profiles</p>
                        </div>
                        <div className="bg-slate-900 border border-white/5 p-4 rounded-2xl">
                            <p className="text-2xl font-bold text-cyan-400">{commitSummary.updatedCount}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Updated</p>
                        </div>
                    </div>

                    <div className="flex justify-center gap-4 pt-4">
                        <button
                            onClick={onClose}
                            className="px-12 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* Form Components */

function StudentForm({ initial, onSave, plans, onClose }: {
    initial?: AdminStudentItem;
    onSave: (data: any) => Promise<void>;
    plans: AdminSubscriptionPlan[];
    onClose: () => void;
}) {
    const [form, setForm] = useState({
        full_name: initial?.fullName || '',
        username: initial?.username || '',
        email: initial?.email || '',
        phone_number: initial?.phoneNumber || '',
        user_id: initial?.userUniqueId || '',
        hsc_batch: initial?.batch || '',
        ssc_batch: initial?.ssc_batch || '',
        department: initial?.department || '',
        guardian_name: initial?.guardianName || '',
        guardian_number: initial?.guardianNumber || '',
        roll_number: initial?.rollNumber || '',
        registration_number: initial?.registrationNumber || '',
        status: initial?.status || 'active',
        planCode: initial?.subscription?.planCode || '',
        days: 365,
        password: '',
        mustChangePassword: true,
        recordPayment: true,
        paymentAmount: 0,
        paymentStatus: 'paid',
        paymentMethod: 'manual',
        paymentNotes: '',
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                fullName: form.full_name,
                username: form.username,
                email: form.email,
                phoneNumber: form.phone_number,
                userUniqueId: form.user_id,
                batch: form.hsc_batch,
                ssc_batch: form.ssc_batch,
                department: form.department,
                guardianName: form.guardian_name,
                guardianNumber: form.guardian_number,
                rollNumber: form.roll_number,
                registrationNumber: form.registration_number,
                status: form.status,
                password: !initial && form.password.trim() ? form.password.trim() : undefined,
                mustChangePassword: !initial ? form.mustChangePassword : undefined,
                subscription: !initial && form.planCode ? {
                    planCode: form.planCode,
                    isActive: true,
                    startDate: new Date().toISOString(),
                    expiryDate: new Date(Date.now() + form.days * 86400000).toISOString(),
                } : undefined,
                recordPayment: !initial ? form.recordPayment : undefined,
                paymentAmount: !initial && form.recordPayment ? Number(form.paymentAmount || 0) : undefined,
                paymentStatus: !initial && form.recordPayment ? form.paymentStatus : undefined,
                paymentMethod: !initial && form.recordPayment ? form.paymentMethod : undefined,
                paymentNotes: !initial && form.recordPayment ? form.paymentNotes : undefined,
            };
            await onSave(payload);
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Action failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Full Name</label>
                    <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 transition-all outline-none" placeholder="John Doe" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Username</label>
                    <div className="relative">
                        <Hash className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 transition-all outline-none" placeholder="johndoe123" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 transition-all outline-none" placeholder="john@example.com" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">HSC Batch</label>
                    <div className="relative">
                        <Layers className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input value={form.hsc_batch} onChange={e => setForm({ ...form, hsc_batch: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 transition-all outline-none" placeholder="2024" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Phone Number</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input required value={form.phone_number} onChange={e => setForm({ ...form, phone_number: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="017..." />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">University ID (User ID)</label>
                    <div className="relative">
                        <Fingerprint className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input required value={form.user_id} onChange={e => setForm({ ...form, user_id: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="CW-1001" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">SSC Batch</label>
                    <div className="relative">
                        <GraduationCap className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input value={form.ssc_batch} onChange={e => setForm({ ...form, ssc_batch: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="2022" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Department</label>
                    <div className="relative">
                        <BookOpen className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="Science / Commerce / Arts" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Guardian Name</label>
                    <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input value={form.guardian_name} onChange={e => setForm({ ...form, guardian_name: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="Guardian Name" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Guardian Number</label>
                    <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input value={form.guardian_number} onChange={e => setForm({ ...form, guardian_number: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="Guardian Number" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Roll Number</label>
                    <div className="relative">
                        <Hash className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input value={form.roll_number} onChange={e => setForm({ ...form, roll_number: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="Roll" />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Registration Number</label>
                    <div className="relative">
                        <IdCard className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input value={form.registration_number} onChange={e => setForm({ ...form, registration_number: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="Reg" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Status</label>
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-3 text-sm text-white outline-none">
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="suspended">Suspended</option>
                        <option value="blocked">Blocked</option>
                    </select>
                </div>
                {!initial && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Initial Package</label>
                        <select
                            value={form.planCode}
                            onChange={e => {
                                const nextCode = e.target.value;
                                const nextPlan = plans.find((plan) => plan.code === nextCode);
                                const nextAmount = Number(nextPlan?.priceBDT ?? nextPlan?.price ?? 0);
                                setForm((prev) => ({
                                    ...prev,
                                    planCode: nextCode,
                                    paymentAmount: prev.paymentAmount > 0 ? prev.paymentAmount : Math.max(0, nextAmount),
                                }));
                            }}
                            className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-3 text-sm text-white outline-none"
                        >
                            <option value="">No Package</option>
                            {plans.map((p, idx) => <option key={`${p._id}-${idx}`} value={p.code}>{p.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {!initial && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Initial Password (optional)</label>
                        <input
                            type="text"
                            value={form.password}
                            onChange={e => setForm({ ...form, password: e.target.value })}
                            className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none"
                            placeholder="Leave empty to auto-generate"
                        />
                    </div>
                    <label className="mt-6 inline-flex items-center gap-2 text-xs text-slate-300">
                        <input
                            type="checkbox"
                            checked={form.mustChangePassword}
                            onChange={e => setForm({ ...form, mustChangePassword: e.target.checked })}
                            className="h-4 w-4 rounded border-indigo-500/40 bg-slate-950/80 text-indigo-500 focus:ring-indigo-500/40"
                        />
                        Force password change on first login
                    </label>
                </div>
            )}

            {!initial && (
                <div className="space-y-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-200">
                        <input
                            type="checkbox"
                            checked={form.recordPayment}
                            onChange={e => setForm({ ...form, recordPayment: e.target.checked })}
                            className="h-4 w-4 rounded border-indigo-500/40 bg-slate-950/80 text-indigo-500 focus:ring-indigo-500/40"
                        />
                        Auto add enrollment payment to finance
                    </label>
                    {form.recordPayment && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-300">Payment Amount (BDT)</label>
                                <input
                                    type="number"
                                    min={0}
                                    value={form.paymentAmount}
                                    onChange={e => setForm({ ...form, paymentAmount: Number(e.target.value || 0) })}
                                    className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-300">Payment Status</label>
                                <select
                                    value={form.paymentStatus}
                                    onChange={e => setForm({ ...form, paymentStatus: e.target.value })}
                                    className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-3 text-sm text-white outline-none"
                                >
                                    <option value="paid">Paid</option>
                                    <option value="pending">Pending</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-300">Payment Method</label>
                                <select
                                    value={form.paymentMethod}
                                    onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                                    className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-3 text-sm text-white outline-none"
                                >
                                    <option value="manual">Manual</option>
                                    <option value="bkash">bKash</option>
                                    <option value="nagad">Nagad</option>
                                    <option value="rocket">Rocket</option>
                                    <option value="cash">Cash</option>
                                    <option value="bank">Bank</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-300">Payment Notes</label>
                                <input
                                    type="text"
                                    value={form.paymentNotes}
                                    onChange={e => setForm({ ...form, paymentNotes: e.target.value })}
                                    className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none"
                                    placeholder="Optional note"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="pt-4 flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-slate-300 font-medium hover:bg-white/10 transition-all">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 text-white font-bold hover:opacity-90 transition-all disabled:opacity-50">
                    {loading ? 'Saving...' : initial ? 'Update Student' : 'Create Student'}
                </button>
            </div>
        </form>
    );
}

function GroupForm({ initial, plans, onSave, onClose }: {
    initial?: AdminStudentGroup;
    plans: AdminSubscriptionPlan[];
    onSave: (data: any) => Promise<void>;
    onClose: () => void;
}) {
    const [name, setName] = useState(initial?.name || '');
    const [type, setType] = useState<'manual' | 'dynamic'>(initial?.type || 'manual');
    const [rules, setRules] = useState<NonNullable<AdminStudentGroup['rules']>>(initial?.rules || {
        batches: [],
        sscBatches: [],
        departments: [],
        statuses: [],
        planCodes: [],
    });
    const [newTag, setNewTag] = useState<Record<string, string>>({
        batches: '',
        sscBatches: '',
        departments: '',
        statuses: '',
    });
    const [loading, setLoading] = useState(false);
    const [fetchingMembers, setFetchingMembers] = useState(false);
    const [currentMembers, setCurrentMembers] = useState<AdminStudentItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<AdminStudentItem[]>([]);
    const [addedIds, setAddedIds] = useState<string[]>([]);
    const [removedIds, setRemovedIds] = useState<string[]>([]);

    useEffect(() => {
        if (initial?._id && type === 'manual') {
            fetchMembers();
        }
    }, [initial?._id, type]);

    const fetchMembers = async () => {
        setFetchingMembers(true);
        try {
            const res = await adminGetStudents({ group: initial?._id, limit: 100 });
            setCurrentMembers(res.data.items);
        } catch (err) {
            toast.error('Failed to fetch group members');
        } finally {
            setFetchingMembers(false);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.length < 2) {
            setSearchResults([]);
            return;
        }
        try {
            const res = await adminGetStudents({ search: query, limit: 10 });
            // Filter out existing members
            const existingIds = currentMembers.map((member) => resolveStudentId(member)).filter(Boolean);
            setSearchResults(
                res.data.items.filter((student: AdminStudentItem) => {
                    const studentId = resolveStudentId(student);
                    return Boolean(studentId) && !existingIds.includes(studentId);
                })
            );
        } catch (err) {
            console.error('Search error:', err);
        }
    };

    const addStudent = (student: AdminStudentItem) => {
        const studentId = resolveStudentId(student);
        if (!studentId) return;
        if (currentMembers.find((member) => resolveStudentId(member) === studentId)) return;
        setAddedIds((prev) => [...prev, studentId]);
        setCurrentMembers(prev => [...prev, student]);
        setSearchResults((prev) => prev.filter((item) => resolveStudentId(item) !== studentId));
        setRemovedIds((prev) => prev.filter((id) => id !== studentId));
    };

    const removeStudent = (studentId: string) => {
        const safeId = String(studentId || '').trim();
        if (!safeId) return;
        setRemovedIds((prev) => [...prev, safeId]);
        setCurrentMembers((prev) => prev.filter((member) => resolveStudentId(member) !== safeId));
        setAddedIds((prev) => prev.filter((id) => id !== safeId));
    };

    const addTag = (field: keyof typeof rules, value: string) => {
        if (!value.trim()) return;
        const current = rules[field] as string[] || [];
        if (current.includes(value.trim())) return;
        setRules(prev => ({ ...prev, [field]: [...current, value.trim()] }));
        setNewTag(prev => ({ ...prev, [field]: '' }));
    };

    const removeTag = (field: keyof typeof rules, value: string) => {
        const current = rules[field] as string[] || [];
        setRules(prev => ({ ...prev, [field]: current.filter(v => v !== value) }));
    };

    const togglePlanCode = (code: string) => {
        const current = rules.planCodes || [];
        if (current.includes(code)) {
            setRules(prev => ({ ...prev, planCodes: current.filter(c => c !== code) }));
        } else {
            setRules(prev => ({ ...prev, planCodes: [...current, code] }));
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave({
                name,
                type,
                rules: type === 'dynamic' ? rules : undefined,
                addStudentIds: type === 'manual' ? addedIds : [],
                removeStudentIds: type === 'manual' ? removedIds : []
            });
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 col-span-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Group Name</label>
                    <div className="relative">
                        <Layers className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none transition-all" placeholder="e.g. Batch A - Science" />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Group Type</label>
                    <div className="flex bg-slate-950/65 border border-indigo-500/20 rounded-xl p-1">
                        <button
                            type="button"
                            onClick={() => setType('manual')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'manual' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Manual
                        </button>
                        <button
                            type="button"
                            onClick={() => setType('dynamic')}
                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${type === 'dynamic' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Dynamic
                        </button>
                    </div>
                </div>
            </div>

            {type === 'dynamic' ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 space-y-4">
                        <div className="flex items-center gap-2 text-indigo-400 mb-2">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Segmentation Rules</span>
                        </div>

                        {/* Tag Rules: Batches, SSC Batches, Departments, Statuses */}
                        {(['batches', 'sscBatches', 'departments', 'statuses'] as const).map(field => (
                            <div key={field} className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{field.replace(/([A-Z])/g, ' $1')}</label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {(rules[field] as string[] || []).map((val, idx) => (
                                        <span key={`${field}-${val}-${idx}`} className="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg text-xs font-medium border border-indigo-500/20">
                                            {val}
                                            <button type="button" onClick={() => removeTag(field, val)} className="hover:text-white"><X className="w-3 h-3" /></button>
                                        </span>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={newTag[field]}
                                        onChange={e => setNewTag(prev => ({ ...prev, [field]: e.target.value }))}
                                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(field, newTag[field]))}
                                        className="flex-1 bg-slate-950/65 border border-indigo-500/20 rounded-xl px-3 py-1.5 text-xs text-white outline-none"
                                        placeholder={`Add ${field.slice(0, -1)}...`}
                                    />
                                    <button type="button" onClick={() => addTag(field, newTag[field])} className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl hover:bg-indigo-500/30 transition-all">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {/* Plan Selection */}
                        <div className="space-y-2 pt-2 border-t border-indigo-500/10">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Subscription Packages</label>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {plans.map((plan: AdminSubscriptionPlan, idx: number) => (
                                    <button
                                        key={`${plan._id}-${idx}`}
                                        type="button"
                                        onClick={() => togglePlanCode(plan.code)}
                                        className={`px-3 py-2 rounded-xl text-left text-[10px] font-bold border transition-all ${rules.planCodes?.includes(plan.code) ? 'bg-indigo-500/20 border-indigo-500/50 text-white' : 'bg-slate-950/65 border-white/5 text-slate-500 hover:border-indigo-500/30'}`}
                                    >
                                        {plan.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Group Members</label>
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-bold">
                            {currentMembers.length} Students
                        </span>
                    </div>

                    {/* Add Student Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input
                            value={searchQuery}
                            onChange={e => handleSearch(e.target.value)}
                            className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 pl-10 pr-4 text-sm text-white focus:border-indigo-500/50 outline-none"
                            placeholder="Search student to add..."
                        />
                        {searchResults.length > 0 && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-indigo-500/30 rounded-xl shadow-2xl z-20 max-h-48 overflow-y-auto">
                                {searchResults.map((s, idx) => (
                                    <button
                                        key={`${resolveStudentId(s) || `search-${idx}`}-${idx}`}
                                        type="button"
                                        onClick={() => addStudent(s)}
                                        className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-indigo-600/20 flex items-center justify-between group"
                                    >
                                        <div>
                                            <div className="font-semibold text-white">{s.fullName}</div>
                                            <div className="text-[10px] text-slate-500">UID: {s.userUniqueId} | {s.phoneNumber}</div>
                                        </div>
                                        <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Members List */}
                    <div className="bg-slate-950/40 rounded-xl border border-white/5 max-h-60 overflow-y-auto divide-y divide-white/5">
                        {fetchingMembers ? (
                            <div className="p-8 text-center text-slate-500 text-sm">
                                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                                Loading members...
                            </div>
                        ) : currentMembers.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 text-sm italic">
                                No students in this group yet.
                            </div>
                        ) : (
                            currentMembers.map((member, idx) => (
                                <div key={`${resolveStudentId(member) || `member-${idx}`}-${idx}`} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                                            <User className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-slate-200">{member.fullName}</div>
                                            <div className="text-[10px] text-slate-500">UID: {member.userUniqueId}</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeStudent(resolveStudentId(member))}
                                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                                        title="Remove from group"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            <div className="pt-4 flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl bg-white/5 text-slate-300 font-medium hover:bg-white/10 transition-all border border-white/10">
                    Cancel
                </button>
                <button type="submit" disabled={loading} className="flex-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {loading ? 'Processing...' : 'Save Changes'}
                </button>
            </div>
        </form>
    );
}

function PlanForm({ initial, onSave, onClose }: {
    initial?: AdminSubscriptionPlan;
    onSave: (data: any) => Promise<void>;
    onClose: () => void;
}) {
    const [form, setForm] = useState({
        name: initial?.name || '',
        code: initial?.code || '',
        durationDays: initial?.durationDays || 30,
        durationValue: initial?.durationValue || initial?.durationDays || 30,
        durationUnit: initial?.durationUnit || 'days',
        price: Number(initial?.price || 0),
        includedModules: Array.isArray(initial?.includedModules) ? initial?.includedModules.join(', ') : '',
        sortOrder: Number(initial?.sortOrder || initial?.priority || 100),
        description: initial?.description || '',
    });
    const [loading, setLoading] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave({
                ...form,
                includedModules: form.includedModules
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
            });
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Subscription Plan Name</label>
                    <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="One Year Access" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Code</label>
                    <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="PRO1Y" disabled={!!initial} />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Duration Value</label>
                    <input required type="number" min={1} value={form.durationValue} onChange={e => setForm({ ...form, durationValue: Number(e.target.value), durationDays: form.durationUnit === 'months' ? Number(e.target.value || 1) * 30 : Number(e.target.value) })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Duration Unit</label>
                    <select value={form.durationUnit} onChange={e => setForm({ ...form, durationUnit: e.target.value as 'days' | 'months', durationDays: e.target.value === 'months' ? form.durationValue * 30 : form.durationValue })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none">
                        <option value="days">Days</option>
                        <option value="months">Months</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Price (BDT)</label>
                    <input type="number" min={0} value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Sort Order</label>
                    <input type="number" min={1} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none" />
                </div>
            </div>
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Included Modules (comma separated)</label>
                <input value={form.includedModules} onChange={e => setForm({ ...form, includedModules: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none" placeholder="Question Bank, Premium Course, Test Series" />
            </div>
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none h-20 resize-none" />
            </div>
            <div className="pt-4 flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-slate-300 font-medium hover:bg-white/10 transition-all">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
                    {loading ? 'Saving...' : 'Save Subscription Plan'}
                </button>
            </div>
        </form>
    );
}

function RenewForm({ student, plans, onSave, onClose }: {
    student: AdminStudentItem;
    plans: AdminSubscriptionPlan[];
    onSave: (data: any) => Promise<void>;
    onClose: () => void;
}) {
    const initialPlan = plans.find((plan) => plan.code === student.subscription?.planCode);
    const initialAmount = Number(initialPlan?.priceBDT ?? initialPlan?.price ?? 0);
    const [form, setForm] = useState({
        planCode: student.subscription?.planCode || '',
        days: 365,
        recordPayment: true,
        paymentAmount: Math.max(0, initialAmount),
        paymentStatus: 'paid',
        paymentMethod: 'manual',
        paymentNotes: '',
    });
    const [loading, setLoading] = useState(false);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(form);
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-xl mb-4">
                <p className="text-sm text-slate-300">Renewing subscription for <span className="text-white font-bold">{student.fullName}</span></p>
            </div>
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Select Package</label>
                <select
                    value={form.planCode}
                    onChange={e => {
                        const nextCode = e.target.value;
                        const nextPlan = plans.find((plan) => plan.code === nextCode);
                        const nextAmount = Number(nextPlan?.priceBDT ?? nextPlan?.price ?? 0);
                        setForm((prev) => ({
                            ...prev,
                            planCode: nextCode,
                            paymentAmount: Math.max(0, nextAmount),
                        }));
                    }}
                    className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-3 text-sm text-white outline-none"
                >
                    <option value="">Select Package</option>
                    {plans.map((p, idx) => <option key={`${p._id}-${idx}`} value={p.code}>{p.name} ({p.durationValue || p.durationDays} {p.durationUnit || 'days'})</option>)}
                </select>
            </div>
            <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400">Additional Days</label>
                <input type="number" value={form.days} onChange={e => setForm({ ...form, days: Number(e.target.value) })} className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none" />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                <input
                    type="checkbox"
                    checked={form.recordPayment}
                    onChange={e => setForm({ ...form, recordPayment: e.target.checked })}
                    className="h-4 w-4 rounded border-indigo-500/40 bg-slate-950/80 text-indigo-500 focus:ring-indigo-500/40"
                />
                Auto add renewal payment to finance
            </label>
            {form.recordPayment && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Payment Amount (BDT)</label>
                        <input
                            type="number"
                            min={0}
                            value={form.paymentAmount}
                            onChange={e => setForm({ ...form, paymentAmount: Number(e.target.value || 0) })}
                            className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Payment Status</label>
                        <select
                            value={form.paymentStatus}
                            onChange={e => setForm({ ...form, paymentStatus: e.target.value })}
                            className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-3 text-sm text-white outline-none"
                        >
                            <option value="paid">Paid</option>
                            <option value="pending">Pending</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Payment Method</label>
                        <select
                            value={form.paymentMethod}
                            onChange={e => setForm({ ...form, paymentMethod: e.target.value })}
                            className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-3 text-sm text-white outline-none"
                        >
                            <option value="manual">Manual</option>
                            <option value="bkash">bKash</option>
                            <option value="nagad">Nagad</option>
                            <option value="rocket">Rocket</option>
                            <option value="cash">Cash</option>
                            <option value="bank">Bank</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-400">Payment Notes</label>
                        <input
                            type="text"
                            value={form.paymentNotes}
                            onChange={e => setForm({ ...form, paymentNotes: e.target.value })}
                            className="w-full bg-slate-950/65 border border-indigo-500/20 rounded-xl py-2 px-4 text-sm text-white focus:border-indigo-500/50 outline-none"
                            placeholder="Optional note"
                        />
                    </div>
                </div>
            )}
            <div className="pt-4 flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-slate-300 font-medium hover:bg-white/10 transition-all">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
                    {loading ? 'Renewing...' : 'Confirm Renewal'}
                </button>
            </div>
        </form>
    );
}

function GroupAssignForm({ student, groups, onSave, onClose }: {
    student: AdminStudentItem;
    groups: AdminStudentGroup[];
    onSave: (groupSlugs: string[]) => Promise<void>;
    onClose: () => void;
}) {
    const [selected, setSelected] = useState<string[]>(student.groups?.map(g => g.slug) || []);
    const [loading, setLoading] = useState(false);

    const toggle = (slug: string) => {
        setSelected(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(selected);
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {groups.map((g, idx) => (
                    <div key={`${g._id}-${idx}`} onClick={() => toggle(g.slug)} className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${selected.includes(g.slug) ? 'bg-indigo-600/10 border-indigo-600' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                        <div className={`w-4 h-4 rounded flex items-center justify-center border ${selected.includes(g.slug) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600'}`}>
                            {selected.includes(g.slug) && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm text-slate-200">{g.name}</span>
                    </div>
                ))}
            </div>
            <div className="pt-4 flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-slate-300 font-medium hover:bg-white/10 transition-all">Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all disabled:opacity-50">
                    {loading ? 'Updating...' : 'Update Groups'}
                </button>
            </div>
        </form>
    );
}

type Tab = 'students' | 'groups' | 'plans';

function fmtDate(v?: string | null) {
    if (!v) return '-';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

function resolveStudentId(student?: Partial<AdminStudentItem> | null): string {
    if (!student) return '';
    const raw = student as unknown as Record<string, unknown>;
    const fromPrimary = String(raw._id || '').trim();
    if (fromPrimary) return fromPrimary;
    const fromLegacy = String(raw.id || '').trim();
    if (fromLegacy) return fromLegacy;
    return '';
}

export default function StudentManagementPanel({ initialTab = 'students' }: { initialTab?: Tab }) {
    const runtimeFlags = useAdminRuntimeFlags();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<Tab>(initialTab);
    const [students, setStudents] = useState<AdminStudentItem[]>([]);
    const [groups, setGroups] = useState<AdminStudentGroup[]>([]);
    const [plans, setPlans] = useState<AdminSubscriptionPlan[]>([]);
    const [examItems, setExamItems] = useState<AdminStudentExamItem[]>([]);
    const [examStudentName, setExamStudentName] = useState('');
    const [examOpen, setExamOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [summary, setSummary] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(false);
    const [studentFilters, setStudentFilters] = useState({
        batch: '',
        sscBatch: '',
        department: '',
        group: '',
        planCode: '',
        status: '',
        profileScoreBand: '',
        paymentStatus: '',
        startDate: '',
        endDate: '',
    });

    // Modal States
    const [studentModal, setStudentModal] = useState<{ mode: 'add' | 'edit'; data?: AdminStudentItem } | null>(null);
    const [groupModal, setGroupModal] = useState<{ mode: 'add' | 'edit'; data?: AdminStudentGroup } | null>(null);
    const [planModal, setPlanModal] = useState<{ mode: 'add' | 'edit'; data?: AdminSubscriptionPlan } | null>(null);
    const [renewModal, setRenewModal] = useState<AdminStudentItem | null>(null);
    const [groupAssignModal, setGroupAssignModal] = useState<AdminStudentItem | null>(null);
    const [bulkImportOpen, setBulkImportOpen] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const groupImportInputRef = useRef<HTMLInputElement | null>(null);
    const visibleStudentIds = useMemo(
        () => students.map((student) => resolveStudentId(student)).filter(Boolean),
        [students]
    );
    const visibleStudentIdSet = useMemo(() => new Set(visibleStudentIds), [visibleStudentIds]);
    const selectedVisibleStudentIds = useMemo(
        () => selectedStudentIds.filter((id) => visibleStudentIdSet.has(id)),
        [selectedStudentIds, visibleStudentIdSet]
    );
    const selectedVisibleCount = selectedVisibleStudentIds.length;
    const allVisibleSelected = visibleStudentIds.length > 0 && selectedVisibleCount === visibleStudentIds.length;

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab]);

    const fetchStudents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminGetStudents({
                page,
                limit: 20,
                search: search || undefined,
                batch: studentFilters.batch || undefined,
                sscBatch: studentFilters.sscBatch || undefined,
                department: studentFilters.department || undefined,
                group: studentFilters.group || undefined,
                planCode: studentFilters.planCode || undefined,
                status: studentFilters.status || undefined,
                profileScoreBand: (studentFilters.profileScoreBand || undefined) as 'lt70' | 'gte70' | undefined,
                paymentStatus: (studentFilters.paymentStatus || undefined) as 'pending' | 'paid' | 'clear' | undefined,
                startDate: studentFilters.startDate || undefined,
                endDate: studentFilters.endDate || undefined,
            });
            setStudents(res.data.items || []);
            setPages(Math.max(1, Number(res.data.pages || 1)));
            setSummary(res.data.summary || {});
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Failed to load students');
        } finally {
            setLoading(false);
        }
    }, [page, search, studentFilters]);

    const fetchGroups = useCallback(async () => {
        try {
            const res = await adminGetStudentGroups();
            setGroups(res.data.items || []);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Failed to load groups');
        }
    }, []);

    const fetchPlans = useCallback(async () => {
        try {
            const res = await adminGetSubscriptionPlans();
            setPlans(res.data.items || []);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Failed to load packages');
        }
    }, []);

    useEffect(() => { void fetchStudents(); }, [fetchStudents]);
    useEffect(() => { void fetchGroups(); void fetchPlans(); }, [fetchGroups, fetchPlans]);
    useEffect(() => { setPage(1); }, [search, studentFilters]);
    useEffect(() => {
        setSelectedStudentIds((prev) => prev.filter((id) => visibleStudentIdSet.has(id)));
    }, [visibleStudentIdSet]);

    const invalidateSubscriptionQueries = async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['plans'] }),
            queryClient.invalidateQueries({ queryKey: ['home'] }),
            queryClient.invalidateQueries({ queryKey: ['student_me'] }),
        ]);
    };

    const handleRenew = async (data: any) => {
        if (!renewModal) return;
        const renewStudentId = resolveStudentId(renewModal);
        if (!renewStudentId) {
            toast.error('Invalid student id');
            return;
        }
        try {
            const res = await adminUpdateStudentSubscription(renewStudentId, data);
            toast.success('Subscription renewed');
            if (res.data?.paymentSyncWarning) {
                toast.error(String(res.data.paymentSyncWarning));
            }
            await invalidateSubscriptionQueries();
            await fetchStudents();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Renewal failed');
        }
    };

    const handleAssignGroups = async (groupSlugs: string[]) => {
        if (!groupAssignModal) return;
        const groupStudentId = resolveStudentId(groupAssignModal);
        if (!groupStudentId) {
            toast.error('Invalid student id');
            return;
        }
        try {
            await adminUpdateStudentGroups(groupStudentId, groupSlugs);
            toast.success('Groups updated');
            await fetchStudents();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Update failed');
        }
    };

    const handleDeleteGroup = async (id: string) => {
        const confirmed = await showConfirmDialog({
            title: 'Delete group',
            message: 'Are you sure you want to delete this group?',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await adminDeleteStudentGroup(id);
            toast.success('Group deleted');
            await fetchGroups();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Delete failed');
        }
    };

    const handleExportGroups = async () => {
        try {
            const res = await adminExportStudentGroups({ q: search || undefined, format: 'csv' });
            downloadFile(res, { filename: `student-groups-${new Date().toISOString().split('T')[0]}.csv` });
            toast.success('Groups exported');
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Group export failed');
        }
    };

    const handleImportGroups = async (file: File | null) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await adminImportStudentGroups(formData);
            toast.success(res.data.message || 'Groups imported');
            if (Array.isArray(res.data.errors) && res.data.errors.length > 0) {
                toast.error(`Import warnings: ${res.data.errors.length}`);
            }
            await fetchGroups();
            await fetchStudents();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Group import failed');
        }
    };

    const handleTogglePlan = async (id: string) => {
        try {
            await adminToggleSubscriptionPlan(id);
            toast.success('Status toggled');
            await invalidateSubscriptionQueries();
            await fetchPlans();
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Toggle failed');
        }
    };

    const openExams = async (student: AdminStudentItem) => {
        const studentId = resolveStudentId(student);
        if (!studentId) {
            toast.error('Invalid student id');
            return;
        }
        try {
            const res = await adminGetStudentExams(studentId);
            setExamItems(res.data.items || []);
            setExamStudentName(student.fullName);
            setExamOpen(true);
        } catch (e: any) {
            toast.error(e.response?.data?.message || 'Failed to load exam details');
        }
    };

    const handleBulkAction = async (action: string, groupId?: string) => {
        if (selectedVisibleStudentIds.length === 0) {
            toast.error('Select at least one student');
            return;
        }
        if (action === 'delete') {
            if (runtimeFlags.requireDeleteKeywordConfirm) {
                const typed = await showPromptDialog({
                    title: 'Delete students',
                    message: `Type DELETE to remove ${selectedVisibleStudentIds.length} students.`,
                    expectedValue: 'DELETE',
                    confirmLabel: 'Delete',
                    tone: 'danger',
                });
                if (typed !== 'DELETE') {
                    toast.error('Bulk delete cancelled');
                    return;
                }
            } else {
                const confirmed = await showConfirmDialog({
                    title: 'Delete students',
                    message: `Are you sure you want to delete ${selectedVisibleStudentIds.length} students?`,
                    confirmLabel: 'Delete',
                    tone: 'danger',
                });
                if (!confirmed) return;
            }
        }

        setLoading(true);
        try {
            await adminBulkStudentAction({
                studentIds: selectedVisibleStudentIds,
                action,
                groupId
            });
            toast.success('Bulk action completed');
            setSelectedStudentIds([]);
            await fetchStudents();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Bulk action failed');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedStudentIds((prev) => prev.filter((id) => !visibleStudentIdSet.has(id)));
            return;
        }
        setSelectedStudentIds((prev) => {
            const next = new Set(prev);
            visibleStudentIds.forEach((id) => next.add(id));
            return Array.from(next);
        });
    };

    const toggleSelectStudent = (id: string) => {
        const safeId = String(id || '').trim();
        if (!safeId) return;
        setSelectedStudentIds((prev) =>
            prev.includes(safeId)
                ? prev.filter((item) => item !== safeId)
                : [...prev, safeId]
        );
    };

    const batchOptions = Array.from(new Set(students.map((item) => String(item.batch || '').trim()).filter(Boolean))).sort();
    const sscBatchOptions = Array.from(new Set(students.map((item) => String(item.ssc_batch || '').trim()).filter(Boolean))).sort();
    const departmentOptions = Array.from(new Set(students.map((item) => String(item.department || '').trim()).filter(Boolean))).sort();

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Student Management</h1>
                    <p className="text-slate-400 text-sm mt-1">Manage enrollments, batches, and subscription plans</p>
                </div>
                <div className="flex gap-2 p-1.5 bg-slate-900 border border-indigo-500/10 rounded-2xl">
                    <button onClick={() => setTab('students')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'students' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Students</button>
                    <button onClick={() => setTab('groups')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'groups' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Groups</button>
                    <button onClick={() => setTab('plans')} className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${tab === 'plans' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Subscription Plans</button>
                </div>
            </div>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-slate-900/40 border border-indigo-500/10 p-4 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                        <User className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-400">Total Students</p>
                        <h3 className="text-xl font-bold text-white">{summary.total || 0}</h3>
                    </div>
                </div>
                <div className="bg-slate-900/40 border border-emerald-500/10 p-4 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                        <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-400">Active</p>
                        <h3 className="text-xl font-bold text-white">{summary.active || 0}</h3>
                    </div>
                </div>
                <div className="bg-slate-900/40 border border-amber-500/10 p-4 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center">
                        <Clock className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-400">Pending Pay</p>
                        <h3 className="text-xl font-bold text-white">{summary.paymentPending || 0}</h3>
                    </div>
                </div>
                <div className="bg-slate-900/40 border border-rose-500/10 p-4 rounded-2xl flex items-center gap-4">
                    <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center">
                        <XCircle className="w-6 h-6 text-rose-400" />
                    </div>
                    <div>
                        <p className="text-xs font-medium text-slate-400">Suspended</p>
                        <h3 className="text-xl font-bold text-white">{summary.inactive || 0}</h3>
                    </div>
                </div>

                {/* Bulk Action Bar */}
                <AnimatePresence>
                    {selectedVisibleCount > 0 && (
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-2xl px-6 py-4 shadow-2xl flex items-center gap-6"
                        >
                            <div className="flex items-center gap-3 pr-6 border-r border-white/10">
                                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                    {selectedVisibleCount}
                                </div>
                                <span className="text-sm font-medium text-slate-200 whitespace-nowrap">Selected</span>
                                <button onClick={toggleSelectAll} className="text-xs text-indigo-400 hover:text-indigo-300 font-bold ml-2">
                                    {allVisibleSelected ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleBulkAction('activate')}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold transition-all"
                                >
                                    <CheckCircle className="w-4 h-4" /> Activate
                                </button>
                                <button
                                    onClick={() => handleBulkAction('suspend')}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-all"
                                >
                                    <Pause className="w-4 h-4" /> Suspend
                                </button>
                                <button
                                    onClick={() => handleBulkAction('delete')}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition-all"
                                >
                                    <Trash2 className="w-4 h-4" /> Delete
                                </button>

                                <div className="h-4 w-px bg-white/10 mx-2" />

                                <div className="relative group/group-select">
                                    <button
                                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 text-xs font-bold transition-all"
                                    >
                                        <Users className="w-4 h-4" /> Add to Group
                                    </button>
                                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 border border-white/10 rounded-xl py-2 shadow-xl opacity-0 translate-y-2 pointer-events-none group-hover/group-select:opacity-100 group-hover/group-select:translate-y-0 group-hover/group-select:pointer-events-auto transition-all max-h-48 overflow-y-auto">
                                        {groups.filter(g => g.type !== 'dynamic').length === 0 ? (
                                            <p className="px-4 py-2 text-[10px] text-slate-500">No manual groups</p>
                                        ) : (
                                            groups.filter(g => g.type !== 'dynamic').map((g, idx) => (
                                                <button
                                                    key={`${g._id}-${idx}`}
                                                    onClick={() => handleBulkAction('add_to_group', g._id)}
                                                    className="w-full text-left px-4 py-2 hover:bg-white/5 text-xs text-slate-300 hover:text-white transition-all"
                                                >
                                                    {g.name}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setSelectedStudentIds([])}
                                className="ml-4 p-2 text-slate-500 hover:text-white transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Actions Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder={`Search ${tab}...`}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-indigo-500/30 outline-none transition-all"
                    />
                </div>
                <div className="flex items-center justify-end gap-3">
                    {tab === 'students' && (
                        <>
                            <button
                                onClick={async () => {
                                    setLoading(true);
                                    try {
                                        const res = await adminExportStudents({
                                            search: search || undefined,
                                            ...studentFilters,
                                            profileScoreBand: (studentFilters.profileScoreBand || undefined) as 'lt70' | 'gte70' | undefined,
                                            paymentStatus: (studentFilters.paymentStatus || undefined) as 'pending' | 'paid' | 'clear' | undefined,
                                            format: 'csv',
                                        });
                                        downloadFile(res, { filename: `students-export-${new Date().toISOString().split('T')[0]}.csv` });
                                        toast.success('Export completed');
                                    } catch (err) {
                                        toast.error('Export failed');
                                    } finally {
                                        setLoading(false);
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/65 border border-indigo-500/10 hover:border-indigo-500/30 text-slate-300 hover:text-white rounded-xl text-sm font-bold transition-all"
                            >
                                <Download className="w-4 h-4" /> Export
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        const res = await adminDownloadStudentTemplate();
                                        downloadFile(res, { filename: 'student_import_template.xlsx' });
                                    } catch (err) {
                                        toast.error('Failed to download template');
                                    }
                                }}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/65 border border-indigo-500/10 hover:border-indigo-500/30 text-indigo-400 hover:text-indigo-300 rounded-xl text-sm font-bold transition-all"
                            >
                                <Download className="w-4 h-4" /> Template
                            </button>
                            <button onClick={() => setBulkImportOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600/10 border border-indigo-500/20 hover:border-indigo-500/40 text-indigo-400 hover:text-indigo-300 rounded-xl text-sm font-bold transition-all">
                                <Upload className="w-4 h-4" /> Import Wizard
                            </button>
                            <button onClick={() => setStudentModal({ mode: 'add' })} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
                                <Plus className="w-4 h-4" /> Add Student
                            </button>
                        </>
                    )}
                    {tab === 'groups' && (
                        <>
                            <button
                                onClick={() => void handleExportGroups()}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/65 border border-indigo-500/10 hover:border-indigo-500/30 text-slate-300 hover:text-white rounded-xl text-sm font-bold transition-all"
                            >
                                <Download className="w-4 h-4" /> Export
                            </button>
                            <button
                                onClick={() => groupImportInputRef.current?.click()}
                                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900/65 border border-indigo-500/10 hover:border-indigo-500/30 text-indigo-400 hover:text-indigo-300 rounded-xl text-sm font-bold transition-all"
                            >
                                <Upload className="w-4 h-4" /> Import
                            </button>
                            <button onClick={() => setGroupModal({ mode: 'add' })} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
                                <Plus className="w-4 h-4" /> New Group
                            </button>
                        </>
                    )}
                    {tab === 'plans' && (
                        <button onClick={() => setPlanModal({ mode: 'add' })} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20">
                            <Plus className="w-4 h-4" /> Create Package
                        </button>
                    )}
                </div>
            </div>
            <input
                ref={groupImportInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    void handleImportGroups(file);
                    event.currentTarget.value = '';
                }}
            />

            {tab === 'students' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                        <div className="rounded-xl border border-indigo-500/10 bg-slate-900/65 p-3">
                            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Total</p>
                            <p className="text-xl font-bold text-white">{Number(summary.total || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                            <p className="text-[11px] text-emerald-200 uppercase tracking-wider">Active</p>
                            <p className="text-xl font-bold text-emerald-100">{Number(summary.active || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                            <p className="text-[11px] text-amber-200 uppercase tracking-wider">Profile &lt; 70</p>
                            <p className="text-xl font-bold text-amber-100">{Number(summary.profileBelow70 || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
                            <p className="text-[11px] text-rose-200 uppercase tracking-wider">Payment Pending</p>
                            <p className="text-xl font-bold text-rose-100">{Number(summary.paymentPending || 0)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-500/20 bg-slate-800/70 p-3">
                            <p className="text-[11px] text-slate-300 uppercase tracking-wider">Suspended</p>
                            <p className="text-xl font-bold text-white">{Number(summary.suspended || 0)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <select
                            value={studentFilters.batch}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, batch: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">HSC Batch: All</option>
                            {batchOptions.map((option) => <option key={`hsc-${option}`} value={option}>{option}</option>)}
                        </select>
                        <select
                            value={studentFilters.sscBatch}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, sscBatch: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">SSC Batch: All</option>
                            {sscBatchOptions.map((option) => <option key={`ssc-${option}`} value={option}>{option}</option>)}
                        </select>
                        <select
                            value={studentFilters.department}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, department: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">Department: All</option>
                            {departmentOptions.map((option) => <option key={`dept-${option}`} value={option}>{option}</option>)}
                        </select>
                        <select
                            value={studentFilters.status}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, status: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">Status: All</option>
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="suspended">Suspended</option>
                            <option value="blocked">Blocked</option>
                        </select>
                        <select
                            value={studentFilters.profileScoreBand}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, profileScoreBand: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">Profile Score: All</option>
                            <option value="lt70">Below 70</option>
                            <option value="gte70">70 and above</option>
                        </select>
                        <select
                            value={studentFilters.paymentStatus}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, paymentStatus: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">Payment: All</option>
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="clear">No Due</option>
                        </select>
                        <select
                            value={studentFilters.group}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, group: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">Group: All</option>
                            {groups.map((group, idx) => <option key={`${group._id}-${idx}`} value={group.slug}>{group.name}</option>)}
                        </select>
                        <select
                            value={studentFilters.planCode}
                            onChange={(e) => setStudentFilters((prev) => ({ ...prev, planCode: e.target.value }))}
                            className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2.5 px-3 text-sm text-white outline-none"
                        >
                            <option value="">Plan: All</option>
                            {plans.map((plan, idx) => <option key={`${plan._id}-${idx}`} value={plan.code}>{plan.name}</option>)}
                        </select>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                value={studentFilters.startDate}
                                onChange={(e) => setStudentFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                                className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2 px-3 text-xs text-slate-300 outline-none focus:border-indigo-500/30"
                                title="Start Date"
                            />
                            <span className="text-slate-500 text-xs">to</span>
                            <input
                                type="date"
                                value={studentFilters.endDate}
                                onChange={(e) => setStudentFilters((prev) => ({ ...prev, endDate: e.target.value }))}
                                className="bg-slate-900/65 border border-indigo-500/10 rounded-xl py-2 px-3 text-xs text-slate-300 outline-none focus:border-indigo-500/30"
                                title="End Date"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Content Area */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-slate-400 text-sm">Loading data...</p>
                </div>
            ) : (
                <>
                    {tab === 'students' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {students.length === 0 ? (
                                <div className="sm:col-span-2 lg:col-span-3 rounded-2xl border border-indigo-500/10 bg-slate-900/65 p-8 text-center text-slate-400 text-sm">
                                    No students matched this filter.
                                </div>
                            ) : students.map((s, idx) => {
                                const studentId = resolveStudentId(s);
                                const isSelected = Boolean(studentId && selectedStudentIds.includes(studentId));
                                return (
                                    <div key={`${studentId || `unknown-${idx}`}-${idx}`} className="group bg-slate-900/65 border border-indigo-500/10 rounded-2xl p-5 hover:border-indigo-500/30 transition-all duration-300 relative overflow-hidden text-left">
                                        <div className="absolute top-0 left-0 p-3 z-10">
                                            <button
                                                type="button"
                                                disabled={!studentId}
                                                onClick={() => toggleSelectStudent(studentId)}
                                                className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white/5 border-white/10 text-transparent hover:border-indigo-500/50'} ${!studentId ? 'cursor-not-allowed opacity-40' : ''}`}
                                                title={studentId ? 'Select student' : 'Missing student id'}
                                            >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <div className="absolute top-0 right-0 p-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            <button onClick={() => setStudentModal({ mode: 'edit', data: s })} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-all"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => setRenewModal(s)} title="Renew Subscription" className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-lg text-indigo-400 hover:text-indigo-300 transition-all"><Clock className="w-4 h-4" /></button>
                                        </div>
                                        <div className="flex items-start gap-4">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg transition-all duration-300 ${s.subscription?.isActive ? 'bg-gradient-to-br from-amber-400 to-yellow-600 text-white shadow-[0_0_15px_rgba(251,191,36,0.4)] ring-2 ring-amber-400/50' : 'bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 text-indigo-400'}`}>
                                                {s.fullName.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <h3 className="text-white font-bold truncate">{s.fullName}</h3>
                                                    {s.subscription?.isActive && <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shadow-sm" />}
                                                </div>
                                                <p className="text-xs text-slate-500 truncate">{s.email}</p>
                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                    <span className="text-[10px] rounded-md bg-slate-800 px-1.5 py-0.5 text-slate-300">@{s.username || '-'}</span>
                                                    <span className="text-[10px] rounded-md bg-slate-800 px-1.5 py-0.5 text-slate-400">ID: {s.userUniqueId || '-'}</span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>{s.status}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${Number(s.profileScore || 0) >= 70 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>
                                                        Profile {Number(s.profileScore || 0)}%
                                                    </span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${s.paymentStatus === 'pending' ? 'bg-rose-500/10 text-rose-300' : 'bg-indigo-500/10 text-indigo-300'}`}>
                                                        Payment {s.paymentStatus || 'clear'}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-medium">Batch: {s.batch || 'N/A'}</span>
                                                    {s.department && <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full font-medium">{s.department}</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-indigo-500/5 pt-4 sm:grid-cols-2">
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Subscription Plan</p>
                                                <p className="text-xs text-slate-200 truncate">{s.subscription?.planName || 'None'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Expiry</p>
                                                <p className={`text-xs ${s.subscription?.daysLeft <= 0 ? 'text-rose-400' : 'text-slate-200'}`}>{fmtDate(s.subscription?.expiryDate)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Pending Due</p>
                                                <p className={`text-xs ${Number(s.pendingDue || 0) > 0 ? 'text-rose-300' : 'text-slate-200'}`}>
                                                    BDT {Number(s.pendingDue || 0).toLocaleString('en-US')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Exams</p>
                                                <p className="text-xs text-slate-200">{Number(s.examStats?.totalAttempts || 0)} attempts</p>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide pb-2">
                                            {s.groups.map((g, groupIndex) => (
                                                <span key={`${studentId || 'unknown'}-${g._id}-${groupIndex}`} className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md whitespace-nowrap">{g.name}</span>
                                            ))}
                                            <button onClick={() => setGroupAssignModal(s)} className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-md hover:bg-indigo-500/20 whitespace-nowrap">+ Edit Groups</button>
                                            <button onClick={() => openExams(s)} className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md hover:bg-amber-500/20 whitespace-nowrap">History</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {tab === 'groups' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {groups.map((g, idx) => (
                                <div key={`${g._id}-${idx}`} className="bg-slate-900/65 border border-indigo-500/10 rounded-2xl p-5 hover:border-indigo-500/30 transition-all duration-300">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400"><Layers className="w-5 h-5" /></div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setGroupModal({ mode: 'edit', data: g })} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 transition-all"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => handleDeleteGroup(g._id)} className="p-1.5 hover:bg-rose-500/10 rounded-lg text-rose-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                    <h3 className="text-white font-bold">{g.name}</h3>
                                    <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">{g.slug}</p>
                                    <div className="mt-4 pt-4 border-t border-indigo-500/5 flex items-center justify-between">
                                        <span className="text-xs text-slate-400">Total Students</span>
                                        <span className="text-sm font-bold text-white">{g.studentCount || 0}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'plans' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {plans.map((p, idx) => (
                                <motion.div
                                    key={`${p._id}-${idx}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="group relative bg-slate-900/65 border border-indigo-500/10 rounded-3xl p-6 hover:border-indigo-500/30 transition-all duration-300 overflow-hidden"
                                >
                                    {/* Glass Decor */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-all duration-500" />

                                    <div className="relative flex justify-between items-start mb-6">
                                        <div className={`p-4 rounded-2xl ${p.isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-800 text-slate-500 border border-white/5'}`}>
                                            <CreditCard className="w-6 h-6" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setPlanModal({ mode: 'edit', data: p })}
                                                className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all border border-white/5"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleTogglePlan(p._id)}
                                                className={`p-2 rounded-xl transition-all border ${p.isActive ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}
                                            >
                                                {p.isActive ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <h3 className="text-xl font-bold text-white tracking-tight">{p.name}</h3>
                                        <div className="flex items-baseline gap-1 mt-2">
                                            <span className="text-2xl font-black text-white">BDT {Number(p.price || 0).toLocaleString('en-US')}</span>
                                            <span className="text-slate-500 text-xs font-medium italic">/ {p.durationValue || p.durationDays} {p.durationUnit || 'days'}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2 p-2 bg-white/5 rounded-lg inline-block border border-white/5 font-mono">CODE: {p.code}</p>
                                    </div>

                                    <div className="relative mt-6 pt-6 border-t border-indigo-500/10">
                                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-3">Included Features</p>
                                        <div className="space-y-2.5">
                                            {p.includedModules.length > 0 ? (
                                                p.includedModules.map((mod, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                                                        <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        </div>
                                                        {mod}
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-xs text-slate-600 italic">No specific features listed</p>
                                            )}
                                        </div>
                                    </div>

                                    {p.description && (
                                        <div className="mt-6">
                                            <p className="text-xs text-slate-500 line-clamp-2 italic leading-relaxed">
                                                {p.description}
                                            </p>
                                        </div>
                                    )}

                                    <div className="mt-6 flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
                                        <span className="text-slate-600">Priority: {p.sortOrder || p.priority || 100}</span>
                                        <span className={p.isActive ? 'text-emerald-500' : 'text-rose-500'}>
                                            {p.isActive ? 'Publicly Visible' : 'Hidden from Site'}
                                        </span>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {tab === 'students' && (
                        <div className="flex items-center justify-between pt-6">
                            <p className="text-xs text-slate-500">Showing page {page} of {pages}</p>
                            <div className="flex gap-2">
                                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 bg-slate-900/65 border border-indigo-500/10 rounded-xl text-slate-400 hover:text-white disabled:opacity-50 transition-all"><ChevronLeft className="w-4 h-4" /></button>
                                <button disabled={page === pages} onClick={() => setPage(p => p + 1)} className="p-2 bg-slate-900/65 border border-indigo-500/10 rounded-xl text-slate-400 hover:text-white disabled:opacity-50 transition-all"><ChevronRight className="w-4 h-4" /></button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Modals */}
            {studentModal && (
                <Modal title={studentModal.mode === 'add' ? 'Add New Student' : 'Edit Student'} onClose={() => setStudentModal(null)}>
                    <StudentForm
                        initial={studentModal.data}
                        plans={plans}
                        onClose={() => setStudentModal(null)}
                        onSave={async (data: any) => {
                            if (studentModal.mode === 'add') {
                                const res = await adminCreateStudent(data);
                                toast.success('Student created');
                                if (res.data?.inviteSent) {
                                    toast.success('Password setup link sent');
                                }
                                if (res.data?.paymentSyncWarning) {
                                    toast.error(String(res.data.paymentSyncWarning));
                                }
                            } else {
                                const editStudentId = resolveStudentId(studentModal.data || null);
                                if (!editStudentId) {
                                    toast.error('Invalid student id');
                                    return;
                                }
                                await adminUpdateStudent(editStudentId, data);
                                toast.success('Student updated');
                            }
                            await fetchStudents();
                        }}
                    />
                </Modal>
            )}

            {groupModal && (
                <Modal title={groupModal.mode === 'add' ? 'Create New Group' : 'Edit Group'} onClose={() => setGroupModal(null)}>
                    <GroupForm
                        initial={groupModal.data}
                        plans={plans}
                        onClose={() => setGroupModal(null)}
                        onSave={async (data: any) => {
                            if (groupModal.mode === 'add') await adminCreateStudentGroup(data);
                            else await adminUpdateStudentGroup(groupModal.data?._id!, data);
                            toast.success('Group saved');
                            await fetchGroups();
                        }}
                    />
                </Modal>
            )}

            {planModal && (
                <Modal title={planModal.mode === 'add' ? 'Create Package' : 'Edit Package'} onClose={() => setPlanModal(null)}>
                    <PlanForm
                        initial={planModal.data}
                        onClose={() => setPlanModal(null)}
                        onSave={async (data: any) => {
                            if (planModal.mode === 'add') await adminCreateSubscriptionPlan(data);
                            else await adminUpdateSubscriptionPlan(planModal.data?._id!, data);
                            toast.success('Package saved');
                            await invalidateSubscriptionQueries();
                            await fetchPlans();
                        }}
                    />
                </Modal>
            )}

            {renewModal && (
                <Modal title="Renew Subscription" onClose={() => setRenewModal(null)}>
                    <RenewForm student={renewModal} plans={plans} onClose={() => setRenewModal(null)} onSave={handleRenew} />
                </Modal>
            )}

            {groupAssignModal && (
                <Modal title="Assign Groups" onClose={() => setGroupAssignModal(null)}>
                    <GroupAssignForm student={groupAssignModal} groups={groups} onClose={() => setGroupAssignModal(null)} onSave={handleAssignGroups} />
                </Modal>
            )}

            {bulkImportOpen && (
                <Modal title="Student Import Wizard" onClose={() => setBulkImportOpen(false)}>
                    <ImportWizard
                        groups={groups}
                        plans={plans}
                        onClose={() => setBulkImportOpen(false)}
                        onSuccess={async () => {
                            await fetchStudents();
                        }}
                    />
                </Modal>
            )}

            {examOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setExamOpen(false)}>
                    <div className="w-full max-w-2xl bg-slate-900/65 border border-indigo-500/20 rounded-2xl p-6 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-white text-lg font-bold">{examStudentName} - Exam History</h3>
                            <button onClick={() => setExamOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-all"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
                            {examItems.length === 0 ? <div className="text-center py-10 text-slate-500 text-sm">No exam history recorded.</div> : examItems.map((r) => (
                                <div key={r.resultId} className="rounded-xl border border-indigo-500/10 bg-slate-950/65 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <p className="text-white font-bold">{r.examTitle}</p>
                                        <p className="text-xs text-slate-400 mt-1">{r.subject} - Attempt {r.attemptNo} - {new Date(r.submittedAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex items-center gap-4 text-right">
                                        <div>
                                            <p className="text-lg font-bold text-indigo-400">{r.percentage.toFixed(1)}%</p>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Marks: {r.obtainedMarks}/{r.totalMarks}</p>
                                        </div>
                                        <div className="px-3 py-1 bg-indigo-500/10 rounded-lg text-indigo-400 text-xs font-bold">Rank: {r.rank || 'N/A'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
