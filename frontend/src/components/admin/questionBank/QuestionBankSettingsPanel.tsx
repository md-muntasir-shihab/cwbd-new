import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Settings, RefreshCw, Shield, FileText, Layers, ImageIcon, Languages, AlertTriangle, BarChart3 } from 'lucide-react';
import { useQBSettings, useUpdateQBSettings } from '../../../hooks/useQuestionBankV2Queries';
import type { QuestionBankSettings } from '../../../types/questionBank';

export default function QuestionBankSettingsPanel() {
    const { data: settings, isLoading } = useQBSettings();
    const updateMut = useUpdateQBSettings();
    const [form, setForm] = useState<Partial<QuestionBankSettings>>({});

    useEffect(() => { if (settings) setForm(settings); }, [settings]);

    function handleSave() {
        updateMut.mutate(form, { onSuccess: () => toast.success('Settings saved') });
    }

    if (isLoading) return (
        <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="ml-2 text-sm text-slate-500">Loading settings…</span>
        </div>
    );

    return (
        <div className="space-y-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                        <Settings className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Question Bank Settings</h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Configure versioning, scoring, import rules, and content policies</p>
                    </div>
                </div>
                <button onClick={handleSave} disabled={updateMut.isPending}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl disabled:opacity-50 transition-all">
                    {updateMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <span>💾</span>}
                    {updateMut.isPending ? 'Saving...' : 'Save Settings'}
                </button>
            </div>

            {updateMut.isSuccess && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 flex items-center gap-2">✅ Settings saved successfully.</div>}
            {updateMut.isError && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-400 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Failed to save settings.</div>}

            {/* Version & Archive Policy */}
            <SettingsCard icon={<Shield className="h-4 w-4" />} title="Version & Archive Policy" description="Control how questions are versioned and deleted">
                <ToggleRow label="Auto-version on edit if used" description="Create a new version instead of overwriting when a question has been used in exams" checked={!!form.versioningOnEditIfUsed} onChange={v => setForm({ ...form, versioningOnEditIfUsed: v })} />
                <ToggleRow label="Archive instead of delete" description="Soft-delete questions to the archive rather than permanently deleting" checked={!!form.archiveInsteadOfDelete} onChange={v => setForm({ ...form, archiveInsteadOfDelete: v })} />
            </SettingsCard>

            {/* Content & Language */}
            <SettingsCard icon={<Languages className="h-4 w-4" />} title="Content & Language" description="Image uploads and bilingual content support">
                <ToggleRow label="Allow image uploads" description="Enable image attachments in question options and explanations" checked={form.allowImageUploads !== false} onChange={v => setForm({ ...form, allowImageUploads: v })} />
                <ToggleRow label="Allow bilingual content" description="Enable both Bangla and English content for questions" checked={form.allowBothLanguages !== false} onChange={v => setForm({ ...form, allowBothLanguages: v })} />
            </SettingsCard>

            {/* Duplicate Detection */}
            <SettingsCard icon={<Layers className="h-4 w-4" />} title="Duplicate Detection" description="How strictly duplicate questions are detected during import and creation">
                <div>
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Detection Sensitivity</label>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        {[
                            { value: 1, label: 'Exact Match', desc: 'Content hash' },
                            { value: 0.85, label: 'Fuzzy Match', desc: 'Normalized text' },
                            { value: 0, label: 'Disabled', desc: 'No detection' },
                        ].map(opt => (
                            <button key={opt.value} type="button" onClick={() => setForm({ ...form, duplicateDetectionSensitivity: opt.value })}
                                className={`rounded-xl border p-3 text-left transition-all ${(form.duplicateDetectionSensitivity ?? 0.85) === opt.value ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-500/20 dark:border-indigo-500/50 dark:bg-indigo-500/10' : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'}`}>
                                <p className="text-sm font-semibold text-slate-800 dark:text-white">{opt.label}</p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            </SettingsCard>

            {/* Scoring Defaults */}
            <SettingsCard icon={<BarChart3 className="h-4 w-4" />} title="Scoring Defaults" description="Default marks and negative marks for new questions">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Default Marks</label>
                        <input type="number" step="0.5" min={0} value={form.defaultMarks ?? 1} onChange={e => setForm({ ...form, defaultMarks: +e.target.value })}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition-all" />
                        <p className="mt-1 text-[10px] text-slate-400">Applied to new questions by default</p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Default Negative Marks</label>
                        <input type="number" step="0.25" min={0} value={form.defaultNegativeMarks ?? 0} onChange={e => setForm({ ...form, defaultNegativeMarks: +e.target.value })}
                            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition-all" />
                        <p className="mt-1 text-[10px] text-slate-400">Penalty for wrong answers</p>
                    </div>
                </div>
            </SettingsCard>

            {/* Import Settings */}
            <SettingsCard icon={<FileText className="h-4 w-4" />} title="Import Settings" description="Control bulk import behavior and limits">
                <div>
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Max Import Rows</label>
                    <input type="number" min={100} max={50000} value={form.importSizeLimit ?? 5000} onChange={e => setForm({ ...form, importSizeLimit: +e.target.value })}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white transition-all" />
                    <p className="mt-1 text-[10px] text-slate-400">Maximum rows per import file (100 – 50,000)</p>
                    {/* Visual indicator */}
                    <div className="mt-3 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all" style={{ width: `${Math.min(((form.importSizeLimit ?? 5000) / 50000) * 100, 100)}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>100</span><span>50,000</span></div>
                </div>
            </SettingsCard>
        </div>
    );
}

/* ─── Shared Components ───────────────────────────── */
function SettingsCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400">{icon}</div>
                <div><h3 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h3><p className="text-[10px] text-slate-500 dark:text-slate-400">{description}</p></div>
            </div>
            <div className="space-y-4">{children}</div>
        </div>
    );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
            </div>
            <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
        </div>
    );
}
