import { useState, useCallback, useMemo } from 'react';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import {
    FileText,
    ListChecks,
    Settings,
    Calendar,
    Eye,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Copy,
    Wand2,
    GripVertical,
    Check,
    Trash2,
    Search,
    Plus,
    Minus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useCreateDraft,
    useUpdateQuestions,
    useAutoPick,
    useUpdateSettings,
    useUpdateScheduling,
    usePublishExam,
    useCloneExam,
    useQuestions,
} from '../../../hooks/useExamSystemQueries';
import CascadingDropdowns from '../../../components/admin/question-bank/CascadingDropdowns';
import type { CascadingDropdownsValue } from '../../../components/admin/question-bank/CascadingDropdowns';
import type {
    ExamInfoDto,
    ExamSettingsDto,
    ExamSchedulingDto,
    ExamScheduleType,
    QuestionFilters,
    DifficultyDistribution,
} from '../../../types/exam-system';

// ─── Constants ───────────────────────────────────────────────────────────

const STEPS = [
    { key: 'info', label: 'Info', icon: FileText },
    { key: 'questions', label: 'Questions', icon: ListChecks },
    { key: 'settings', label: 'Settings', icon: Settings },
    { key: 'scheduling', label: 'Scheduling', icon: Calendar },
    { key: 'preview', label: 'Preview', icon: Eye },
] as const;

const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';

const selectCls = `${inputCls} appearance-none`;

const btnPrimary =
    'flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors';

const btnSecondary =
    'flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors';

const EXAM_TYPES = ['Practice', 'Mock', 'Scheduled', 'Live', 'Custom'] as const;

const SCHEDULE_TYPES: { value: ExamScheduleType; label: string }[] = [
    { value: 'live', label: 'Live — Fixed start/end' },
    { value: 'practice', label: 'Practice — Always active' },
    { value: 'scheduled', label: 'Scheduled — Window period' },
    { value: 'upcoming', label: 'Upcoming — Published but not started' },
];

const VISIBILITY_OPTIONS = ['public', 'group_only', 'private', 'invite_only'] as const;

const RESULT_MODES = [
    { value: 'immediately', label: 'Immediately after submission' },
    { value: 'after_deadline', label: 'After exam deadline' },
    { value: 'manual', label: 'Manual publish' },
] as const;

// ─── Selected Question Item ──────────────────────────────────────────────

interface SelectedQuestion {
    id: string;
    text: string;
    difficulty: string;
    marks: number;
}

// ─── Toggle Field ────────────────────────────────────────────────────────

interface ToggleFieldProps {
    label: string;
    checked: boolean;
    onChange: (val: boolean) => void;
}

function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
    return (
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60">
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
            >
                <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                />
            </button>
            <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
        </label>
    );
}

// ─── Step Indicator ──────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: number }) {
    return (
        <nav aria-label="Wizard steps" className="mb-8">
            <ol className="flex items-center justify-between gap-2">
                {STEPS.map((step, idx) => {
                    const Icon = step.icon;
                    const isActive = idx === currentStep;
                    const isCompleted = idx < currentStep;
                    return (
                        <li key={step.key} className="flex flex-1 items-center gap-2">
                            <div className="flex flex-col items-center gap-1 flex-1">
                                <div
                                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${isActive
                                        ? 'bg-indigo-600 text-white'
                                        : isCompleted
                                            ? 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
                                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                        }`}
                                    aria-current={isActive ? 'step' : undefined}
                                >
                                    {isCompleted ? <Check size={16} /> : <Icon size={16} />}
                                </div>
                                <span
                                    className={`text-xs font-medium ${isActive
                                        ? 'text-indigo-600 dark:text-indigo-400'
                                        : isCompleted
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-slate-400 dark:text-slate-500'
                                        }`}
                                >
                                    {step.label}
                                </span>
                            </div>
                            {idx < STEPS.length - 1 && (
                                <div
                                    className={`hidden sm:block h-0.5 flex-1 rounded ${idx < currentStep
                                        ? 'bg-green-300 dark:bg-green-700'
                                        : 'bg-slate-200 dark:bg-slate-700'
                                        }`}
                                />
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}

// ─── Step 1: Info ────────────────────────────────────────────────────────

function StepInfo({
    data,
    hierarchy,
    onChange,
    onHierarchyChange,
}: {
    data: ExamInfoDto;
    hierarchy: CascadingDropdownsValue;
    onChange: (d: ExamInfoDto) => void;
    onHierarchyChange: (v: CascadingDropdownsValue) => void;
}) {
    const update = (patch: Partial<ExamInfoDto>) => onChange({ ...data, ...patch });

    return (
        <div className="space-y-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Step 1 — Exam Information</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="exam-title" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title (English) *</label>
                    <input id="exam-title" type="text" value={data.title} onChange={(e) => update({ title: e.target.value })} placeholder="Exam title" className={inputCls} />
                </div>
                <div>
                    <label htmlFor="exam-title-bn" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Title (বাংলা)</label>
                    <input id="exam-title-bn" type="text" value={data.title_bn ?? ''} onChange={(e) => update({ title_bn: e.target.value })} placeholder="পরীক্ষার শিরোনাম" className={inputCls} />
                </div>
            </div>

            <div>
                <label htmlFor="exam-desc" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Description</label>
                <textarea id="exam-desc" value={data.description ?? ''} onChange={(e) => update({ description: e.target.value })} placeholder="Brief description" rows={3} className={inputCls} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="exam-type" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Exam Type</label>
                    <select id="exam-type" value={data.exam_type ?? ''} onChange={(e) => update({ exam_type: e.target.value || undefined })} className={selectCls}>
                        <option value="">Select type…</option>
                        {EXAM_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                </div>
                <div>
                    <label htmlFor="exam-dur" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Duration (minutes) *</label>
                    <input id="exam-dur" type="number" min={1} value={data.durationMinutes} onChange={(e) => update({ durationMinutes: Math.max(1, Number(e.target.value) || 1) })} className={inputCls} />
                </div>
            </div>

            <div>
                <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">Hierarchy Filter (Group / Sub-Group / Subject)</p>
                <CascadingDropdowns value={hierarchy} onChange={onHierarchyChange} />
            </div>
        </div>
    );
}

// ─── Step 2: Question Selection ──────────────────────────────────────────

function StepQuestions({
    selectedQuestions,
    onSelectedChange,
    hierarchy,
}: {
    selectedQuestions: SelectedQuestion[];
    onSelectedChange: (q: SelectedQuestion[]) => void;
    hierarchy: CascadingDropdownsValue;
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [showAutoPick, setShowAutoPick] = useState(false);
    const [autoPickCount, setAutoPickCount] = useState(20);
    const [distribution, setDistribution] = useState<DifficultyDistribution>({ easy: 30, medium: 50, hard: 20 });
    const [dragIdx, setDragIdx] = useState<number | null>(null);

    const filters: QuestionFilters = useMemo(() => ({
        q: searchQuery || undefined,
        group_id: hierarchy.group_id,
        sub_group_id: hierarchy.sub_group_id,
        subject_id: hierarchy.subject_id,
        chapter_id: hierarchy.chapter_id,
        topic_id: hierarchy.topic_id,
        status: 'published',
        limit: 20,
        page: 1,
    }), [searchQuery, hierarchy]);

    const { data: questionsResponse, isLoading: isLoadingQuestions } = useQuestions(filters);

    const questionList = useMemo(() => {
        if (!questionsResponse) return [];
        const items = 'data' in questionsResponse && Array.isArray(questionsResponse.data) ? questionsResponse.data : [];
        return items as Array<Record<string, unknown>>;
    }, [questionsResponse]);

    const selectedIds = useMemo(() => new Set(selectedQuestions.map((q) => q.id)), [selectedQuestions]);

    const toggleQuestion = useCallback((q: Record<string, unknown>) => {
        const id = String(q._id ?? q.id ?? '');
        if (!id) return;
        if (selectedIds.has(id)) {
            onSelectedChange(selectedQuestions.filter((sq) => sq.id !== id));
        } else {
            const text = String(q.question_en ?? q.question_bn ?? q.questionText ?? 'Untitled');
            const difficulty = String(q.difficulty ?? 'medium');
            const marks = Number(q.marks ?? 1);
            onSelectedChange([...selectedQuestions, { id, text, difficulty, marks }]);
        }
    }, [selectedIds, selectedQuestions, onSelectedChange]);

    const removeQuestion = useCallback((id: string) => {
        onSelectedChange(selectedQuestions.filter((q) => q.id !== id));
    }, [selectedQuestions, onSelectedChange]);

    const updateMarks = useCallback((id: string, marks: number) => {
        onSelectedChange(selectedQuestions.map((q) => (q.id === id ? { ...q, marks: Math.max(0, marks) } : q)));
    }, [selectedQuestions, onSelectedChange]);

    const handleDragStart = (idx: number) => setDragIdx(idx);
    const handleDragEnd = () => setDragIdx(null);
    const handleDrop = (targetIdx: number) => {
        if (dragIdx === null || dragIdx === targetIdx) return;
        const items = [...selectedQuestions];
        const [moved] = items.splice(dragIdx, 1);
        items.splice(targetIdx, 0, moved);
        onSelectedChange(items);
        setDragIdx(null);
    };

    const adjustDistribution = (key: keyof DifficultyDistribution, delta: number) => {
        const newVal = Math.max(0, Math.min(100, distribution[key] + delta));
        const diff = newVal - distribution[key];
        if (diff === 0) return;
        const others = (Object.keys(distribution) as Array<keyof DifficultyDistribution>).filter((k) => k !== key);
        const otherTotal = others.reduce((sum, k) => sum + distribution[k], 0);
        if (otherTotal === 0 && diff > 0) return;
        const newDist = { ...distribution, [key]: newVal };
        let remaining = -diff;
        for (const k of others) {
            const share = otherTotal > 0 ? Math.round((distribution[k] / otherTotal) * remaining) : 0;
            newDist[k] = Math.max(0, distribution[k] + share);
        }
        const total = newDist.easy + newDist.medium + newDist.hard;
        if (total !== 100) {
            const fixKey = others.find((k) => newDist[k] > 0) ?? others[0];
            newDist[fixKey] += 100 - total;
        }
        setDistribution(newDist);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Step 2 — Question Selection</h2>

            <div className="flex items-center gap-3">
                <button type="button" onClick={() => setShowAutoPick(!showAutoPick)} className={showAutoPick ? btnPrimary : btnSecondary}>
                    <Wand2 size={14} /> Auto-Pick
                </button>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedQuestions.length} question{selectedQuestions.length !== 1 ? 's' : ''} selected
                </span>
            </div>

            {showAutoPick && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
                    <h3 className="mb-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300">Auto-Pick Configuration</h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                        <div>
                            <label htmlFor="auto-count" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Count</label>
                            <input id="auto-count" type="number" min={1} value={autoPickCount} onChange={(e) => setAutoPickCount(Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
                        </div>
                        {(['easy', 'medium', 'hard'] as const).map((level) => (
                            <div key={level}>
                                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400 capitalize">{level} %</label>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => adjustDistribution(level, -5)} className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`Decrease ${level}`}><Minus size={14} /></button>
                                    <span className="w-10 text-center text-sm font-medium text-slate-900 dark:text-white">{distribution[level]}</span>
                                    <button type="button" onClick={() => adjustDistribution(level, 5)} className="rounded p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label={`Increase ${level}`}><Plus size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Total: {distribution.easy + distribution.medium + distribution.hard}%
                        {distribution.easy + distribution.medium + distribution.hard !== 100 && <span className="ml-1 text-red-500">(must equal 100%)</span>}
                    </p>
                </div>
            )}

            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search questions…" className={`${inputCls} pl-9`} aria-label="Search questions" />
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                {isLoadingQuestions ? (
                    <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-indigo-500" /></div>
                ) : questionList.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No questions found. Adjust filters or search.</p>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800" role="listbox" aria-label="Available questions">
                        {questionList.map((q) => {
                            const id = String(q._id ?? q.id ?? '');
                            const isSelected = selectedIds.has(id);
                            const text = String(q.question_en ?? q.question_bn ?? q.questionText ?? 'Untitled');
                            const difficulty = String(q.difficulty ?? '');
                            return (
                                <li key={id} role="option" aria-selected={isSelected} className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : ''}`} onClick={() => toggleQuestion(q)}>
                                    <input type="checkbox" checked={isSelected} readOnly className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" tabIndex={-1} />
                                    <span className="flex-1 truncate text-slate-800 dark:text-slate-200">{text}</span>
                                    {difficulty && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">{difficulty}</span>}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {selectedQuestions.length > 0 && (
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Selected Questions ({selectedQuestions.length})</h3>
                    <ul className="space-y-1" role="list" aria-label="Selected questions">
                        {selectedQuestions.map((q, idx) => (
                            <li key={q.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(idx)} onDragEnd={handleDragEnd}
                                className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${dragIdx === idx ? 'border-indigo-400 bg-indigo-50 opacity-60 dark:bg-indigo-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
                                <span className="cursor-grab text-slate-300 dark:text-slate-600" aria-hidden><GripVertical size={14} /></span>
                                <span className="text-xs font-medium text-slate-400 dark:text-slate-500 w-6">{idx + 1}.</span>
                                <span className="flex-1 truncate text-sm text-slate-800 dark:text-slate-200">{q.text}</span>
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">{q.difficulty}</span>
                                <label className="flex items-center gap-1 shrink-0">
                                    <span className="text-[10px] text-slate-400">Marks:</span>
                                    <input type="number" min={0} step={0.5} value={q.marks} onChange={(e) => updateMarks(q.id, Number(e.target.value))} className="w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-center text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white" aria-label={`Marks for question ${idx + 1}`} />
                                </label>
                                <button type="button" onClick={() => removeQuestion(q.id)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400" aria-label={`Remove question ${idx + 1}`}><Trash2 size={13} /></button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}


// ─── Step 3: Settings ────────────────────────────────────────────────────

function StepSettings({ data, onChange }: { data: ExamSettingsDto; onChange: (d: ExamSettingsDto) => void }) {
    const update = (patch: Partial<ExamSettingsDto>) => onChange({ ...data, ...patch });
    const antiCheat = data.antiCheatSettings ?? {};

    return (
        <div className="space-y-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Step 3 — Exam Settings</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                    <label htmlFor="marks-per-q" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Marks Per Question</label>
                    <input id="marks-per-q" type="number" min={0} step={0.5} value={data.marksPerQuestion ?? 1} onChange={(e) => update({ marksPerQuestion: Number(e.target.value) })} className={inputCls} />
                </div>
                <div>
                    <label htmlFor="negative-marks" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Negative Marks</label>
                    <input id="negative-marks" type="number" min={0} step={0.25} value={data.negativeMarks ?? 0} onChange={(e) => update({ negativeMarks: Number(e.target.value) })} className={inputCls} />
                </div>
                <div>
                    <label htmlFor="pass-pct" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Pass Percentage</label>
                    <input id="pass-pct" type="number" min={0} max={100} value={data.passPercentage ?? 40} onChange={(e) => update({ passPercentage: Number(e.target.value) })} className={inputCls} />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ToggleField label="Shuffle Questions" checked={data.shuffleQuestions ?? false} onChange={(v) => update({ shuffleQuestions: v })} />
                <ToggleField label="Shuffle Options" checked={data.shuffleOptions ?? false} onChange={(v) => update({ shuffleOptions: v })} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="result-mode" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Show Result Mode</label>
                    <select id="result-mode" value={data.showResultMode ?? 'immediately'} onChange={(e) => update({ showResultMode: e.target.value as ExamSettingsDto['showResultMode'] })} className={selectCls}>
                        {RESULT_MODES.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                    </select>
                </div>
                <div>
                    <label htmlFor="max-attempts" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Max Attempts</label>
                    <input id="max-attempts" type="number" min={1} value={data.maxAttempts ?? 1} onChange={(e) => update({ maxAttempts: Math.max(1, Number(e.target.value) || 1) })} className={inputCls} />
                </div>
            </div>

            <div>
                <label htmlFor="visibility" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Visibility</label>
                <select id="visibility" value={data.visibility ?? 'public'} onChange={(e) => update({ visibility: e.target.value as ExamSettingsDto['visibility'] })} className={selectCls}>
                    {VISIBILITY_OPTIONS.map((v) => (<option key={v} value={v}>{v.replace('_', ' ')}</option>))}
                </select>
            </div>

            <div>
                <label htmlFor="assigned-groups" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Assigned Groups (comma-separated IDs)</label>
                <input id="assigned-groups" type="text" value={(data.assignedGroups ?? []).join(', ')} onChange={(e) => update({ assignedGroups: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="group-id-1, group-id-2" className={inputCls} />
            </div>

            <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Anti-Cheat Settings</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ToggleField label="Tab Switch Detection" checked={antiCheat.tabSwitchDetect ?? true} onChange={(v) => update({ antiCheatSettings: { ...antiCheat, tabSwitchDetect: v } })} />
                    <ToggleField label="Fullscreen Mode" checked={antiCheat.fullscreenMode ?? false} onChange={(v) => update({ antiCheatSettings: { ...antiCheat, fullscreenMode: v } })} />
                    <ToggleField label="Copy/Paste Disabled" checked={antiCheat.copyPasteDisabled ?? true} onChange={(v) => update({ antiCheatSettings: { ...antiCheat, copyPasteDisabled: v } })} />
                </div>
            </div>
        </div>
    );
}

// ─── Step 4: Scheduling & Pricing ────────────────────────────────────────

function StepScheduling({ data, onChange }: { data: ExamSchedulingDto; onChange: (d: ExamSchedulingDto) => void }) {
    const update = (patch: Partial<ExamSchedulingDto>) => onChange({ ...data, ...patch });
    const pricing = data.pricing ?? { isFree: true };

    return (
        <div className="space-y-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Step 4 — Scheduling & Pricing</h2>

            <div>
                <label htmlFor="schedule-type" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Schedule Type *</label>
                <select id="schedule-type" value={data.examScheduleType} onChange={(e) => update({ examScheduleType: e.target.value as ExamScheduleType })} className={selectCls}>
                    {SCHEDULE_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </select>
            </div>

            {(data.examScheduleType === 'live' || data.examScheduleType === 'scheduled') && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor="start-time" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Start Time (UTC)</label>
                        <input id="start-time" type="datetime-local" value={data.examWindowStartUTC ?? ''} onChange={(e) => update({ examWindowStartUTC: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                        <label htmlFor="end-time" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">End Time (UTC)</label>
                        <input id="end-time" type="datetime-local" value={data.examWindowEndUTC ?? ''} onChange={(e) => update({ examWindowEndUTC: e.target.value })} className={inputCls} />
                    </div>
                </div>
            )}

            <div>
                <label htmlFor="result-publish" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Result Publish Time (UTC)</label>
                <input id="result-publish" type="datetime-local" value={data.resultPublishAtUTC ?? ''} onChange={(e) => update({ resultPublishAtUTC: e.target.value })} className={inputCls} />
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Pricing</h3>
                <ToggleField label="Free Exam" checked={pricing.isFree} onChange={(v) => update({ pricing: { ...pricing, isFree: v, amountBDT: v ? undefined : pricing.amountBDT } })} />
                {!pricing.isFree && (
                    <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                            <label htmlFor="price-bdt" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Amount (BDT)</label>
                            <input id="price-bdt" type="number" min={0} value={pricing.amountBDT ?? 0} onChange={(e) => update({ pricing: { ...pricing, amountBDT: Number(e.target.value) } })} className={inputCls} />
                        </div>
                        <div>
                            <label htmlFor="coupon-codes" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Coupon Codes (comma-separated)</label>
                            <input id="coupon-codes" type="text" value={(pricing.couponCodes ?? []).join(', ')} onChange={(e) => update({ pricing: { ...pricing, couponCodes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) } })} placeholder="SAVE10, EXAM20" className={inputCls} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Step 5: Preview & Publish ───────────────────────────────────────────

function StepPreview({
    info,
    selectedQuestions,
    settings,
    scheduling,
}: {
    info: ExamInfoDto;
    selectedQuestions: SelectedQuestion[];
    settings: ExamSettingsDto;
    scheduling: ExamSchedulingDto;
}) {
    const pricing = scheduling.pricing ?? { isFree: true };
    const antiCheat = settings.antiCheatSettings ?? {};

    const SummaryRow = ({ label, value }: { label: string; value: string | number | undefined }) => (
        <div className="flex justify-between py-1.5 text-sm border-b border-slate-100 dark:border-slate-800 last:border-0">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className="font-medium text-slate-900 dark:text-white text-right max-w-[60%] truncate">{value ?? '—'}</span>
        </div>
    );

    return (
        <div className="space-y-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Step 5 — Preview & Publish</h2>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Exam Info</h3>
                <SummaryRow label="Title" value={info.title} />
                <SummaryRow label="Title (বাংলা)" value={info.title_bn} />
                <SummaryRow label="Type" value={info.exam_type} />
                <SummaryRow label="Duration" value={`${info.durationMinutes} min`} />
                <SummaryRow label="Description" value={info.description} />
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Questions ({selectedQuestions.length})</h3>
                {selectedQuestions.length === 0 ? (
                    <p className="text-sm text-slate-400">No questions selected</p>
                ) : (
                    <ul className="space-y-1 max-h-40 overflow-y-auto">
                        {selectedQuestions.map((q, idx) => (
                            <li key={q.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                <span className="text-xs text-slate-400 w-6">{idx + 1}.</span>
                                <span className="flex-1 truncate">{q.text}</span>
                                <span className="text-xs text-slate-400">{q.marks} marks</span>
                            </li>
                        ))}
                    </ul>
                )}
                <p className="mt-2 text-xs text-slate-500">
                    Total marks: {selectedQuestions.reduce((sum, q) => sum + q.marks, 0)}
                </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Settings</h3>
                <SummaryRow label="Marks/Question" value={settings.marksPerQuestion ?? 1} />
                <SummaryRow label="Negative Marks" value={settings.negativeMarks ?? 0} />
                <SummaryRow label="Pass %" value={`${settings.passPercentage ?? 40}%`} />
                <SummaryRow label="Shuffle Questions" value={settings.shuffleQuestions ? 'Yes' : 'No'} />
                <SummaryRow label="Shuffle Options" value={settings.shuffleOptions ? 'Yes' : 'No'} />
                <SummaryRow label="Result Mode" value={settings.showResultMode ?? 'immediately'} />
                <SummaryRow label="Max Attempts" value={settings.maxAttempts ?? 1} />
                <SummaryRow label="Visibility" value={settings.visibility ?? 'public'} />
                <SummaryRow label="Tab Switch Detect" value={antiCheat.tabSwitchDetect !== false ? 'Yes' : 'No'} />
                <SummaryRow label="Fullscreen Mode" value={antiCheat.fullscreenMode ? 'Yes' : 'No'} />
                <SummaryRow label="Copy/Paste Disabled" value={antiCheat.copyPasteDisabled !== false ? 'Yes' : 'No'} />
            </div>

            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Scheduling & Pricing</h3>
                <SummaryRow label="Schedule Type" value={scheduling.examScheduleType} />
                <SummaryRow label="Start" value={scheduling.examWindowStartUTC} />
                <SummaryRow label="End" value={scheduling.examWindowEndUTC} />
                <SummaryRow label="Result Publish" value={scheduling.resultPublishAtUTC} />
                <SummaryRow label="Pricing" value={pricing.isFree ? 'Free' : `৳${pricing.amountBDT ?? 0}`} />
                {!pricing.isFree && pricing.couponCodes && pricing.couponCodes.length > 0 && (
                    <SummaryRow label="Coupons" value={pricing.couponCodes.join(', ')} />
                )}
            </div>
        </div>
    );
}

// ─── Main ExamBuilderWizard ──────────────────────────────────────────────

/**
 * 5-step exam creation wizard: Info → Questions → Settings → Scheduling → Preview/Publish.
 *
 * Persists data across steps in local state. Calls backend APIs on step transitions
 * and on final publish. Supports clone exam functionality.
 *
 * @requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11
 */
export default function ExamBuilderWizard() {
    const [currentStep, setCurrentStep] = useState(0);
    const [examId, setExamId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Step 1 state
    const [info, setInfo] = useState<ExamInfoDto>({
        title: '',
        title_bn: '',
        description: '',
        exam_type: undefined,
        durationMinutes: 60,
    });
    const [hierarchy, setHierarchy] = useState<CascadingDropdownsValue>({});

    // Step 2 state
    const [selectedQuestions, setSelectedQuestions] = useState<SelectedQuestion[]>([]);

    // Step 3 state
    const [settings, setSettings] = useState<ExamSettingsDto>({
        marksPerQuestion: 1,
        negativeMarks: 0,
        passPercentage: 40,
        shuffleQuestions: false,
        shuffleOptions: false,
        showResultMode: 'immediately',
        maxAttempts: 1,
        visibility: 'public',
        antiCheatSettings: {
            tabSwitchDetect: true,
            fullscreenMode: false,
            copyPasteDisabled: true,
        },
    });

    // Step 4 state
    const [scheduling, setScheduling] = useState<ExamSchedulingDto>({
        examScheduleType: 'practice',
        pricing: { isFree: true },
    });

    // Mutations
    const createDraft = useCreateDraft();
    const updateQuestionsMut = useUpdateQuestions();
    const autoPickMut = useAutoPick();
    const updateSettingsMut = useUpdateSettings();
    const updateSchedulingMut = useUpdateScheduling();
    const publishExamMut = usePublishExam();
    const cloneExamMut = useCloneExam();

    // Sync hierarchy into info DTO
    const infoWithHierarchy: ExamInfoDto = useMemo(() => ({
        ...info,
        group_id: hierarchy.group_id,
        sub_group_id: hierarchy.sub_group_id,
        subject_id: hierarchy.subject_id,
    }), [info, hierarchy]);

    // ── Step validation ──────────────────────────────────────────────────

    const validateStep = useCallback((step: number): boolean => {
        switch (step) {
            case 0:
                if (!info.title.trim()) { toast.error('Exam title is required'); return false; }
                if (info.durationMinutes < 1) { toast.error('Duration must be at least 1 minute'); return false; }
                return true;
            case 1:
                if (selectedQuestions.length < 1) { toast.error('Select at least 1 question'); return false; }
                return true;
            case 2:
                return true;
            case 3:
                return true;
            default:
                return true;
        }
    }, [info, selectedQuestions]);

    // ── Step transitions with API calls ──────────────────────────────────

    const handleNext = useCallback(async () => {
        if (!validateStep(currentStep)) return;

        setIsSaving(true);
        try {
            if (currentStep === 0) {
                // Create draft on leaving Step 1
                if (!examId) {
                    const result = await createDraft.mutateAsync(infoWithHierarchy);
                    const data = result?.data as Record<string, unknown> | undefined;
                    const newId = data ? String(data._id ?? data.id ?? '') : '';
                    if (newId) setExamId(newId);
                }
            } else if (currentStep === 1 && examId) {
                // Save question selection on leaving Step 2
                await updateQuestionsMut.mutateAsync({
                    examId,
                    payload: { questionIds: selectedQuestions.map((q) => q.id) },
                });
            } else if (currentStep === 2 && examId) {
                // Save settings on leaving Step 3
                await updateSettingsMut.mutateAsync({ examId, payload: settings });
            } else if (currentStep === 3 && examId) {
                // Save scheduling on leaving Step 4
                await updateSchedulingMut.mutateAsync({ examId, payload: scheduling });
            }

            setCurrentStep((prev) => Math.min(prev + 1, STEPS.length - 1));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save';
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    }, [currentStep, examId, info, infoWithHierarchy, selectedQuestions, settings, scheduling, validateStep, createDraft, updateQuestionsMut, updateSettingsMut, updateSchedulingMut]);

    const handlePrev = useCallback(() => {
        setCurrentStep((prev) => Math.max(prev - 1, 0));
    }, []);

    // ── Publish ──────────────────────────────────────────────────────────

    const handlePublish = useCallback(async () => {
        if (!examId) {
            toast.error('No exam draft found. Please complete all steps first.');
            return;
        }
        setIsSaving(true);
        try {
            await publishExamMut.mutateAsync(examId);
            toast.success('Exam published successfully!');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to publish';
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    }, [examId, publishExamMut]);

    // ── Clone ────────────────────────────────────────────────────────────

    const handleClone = useCallback(async () => {
        if (!examId) {
            toast.error('No exam to clone');
            return;
        }
        setIsSaving(true);
        try {
            const result = await cloneExamMut.mutateAsync(examId);
            const cloneData = result?.data as Record<string, unknown> | undefined;
            const clonedId = cloneData ? String(cloneData._id ?? cloneData.id ?? '') : '';
            if (clonedId) {
                setExamId(clonedId);
                setCurrentStep(0);
                toast.success('Exam cloned! You can now edit the new draft.');
            } else {
                toast.success('Exam cloned successfully');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to clone';
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    }, [examId, cloneExamMut]);

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
            {/* Page header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                        <FileText size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Exam Builder</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {examId ? `Draft: ${examId.slice(0, 8)}…` : 'Create a new exam'}
                        </p>
                    </div>
                </div>
                {examId && (
                    <button type="button" onClick={handleClone} disabled={isSaving} className={btnSecondary}>
                        <Copy size={14} /> Clone Exam
                    </button>
                )}
            </div>

            <StepIndicator currentStep={currentStep} />

            {/* Step content */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {currentStep === 0 && (
                    <StepInfo data={info} hierarchy={hierarchy} onChange={setInfo} onHierarchyChange={setHierarchy} />
                )}
                {currentStep === 1 && (
                    <StepQuestions selectedQuestions={selectedQuestions} onSelectedChange={setSelectedQuestions} hierarchy={hierarchy} />
                )}
                {currentStep === 2 && (
                    <StepSettings data={settings} onChange={setSettings} />
                )}
                {currentStep === 3 && (
                    <StepScheduling data={scheduling} onChange={setScheduling} />
                )}
                {currentStep === 4 && (
                    <StepPreview info={infoWithHierarchy} selectedQuestions={selectedQuestions} settings={settings} scheduling={scheduling} />
                )}
            </div>

            {/* Navigation buttons */}
            <div className="mt-6 flex items-center justify-between">
                <button
                    type="button"
                    onClick={handlePrev}
                    disabled={currentStep === 0 || isSaving}
                    className={btnSecondary}
                >
                    <ChevronLeft size={16} /> Previous
                </button>

                {currentStep < STEPS.length - 1 ? (
                    <button type="button" onClick={handleNext} disabled={isSaving} className={btnPrimary}>
                        {isSaving && <Loader2 size={14} className="animate-spin" />}
                        Next <ChevronRight size={16} />
                    </button>
                ) : (
                    <button type="button" onClick={handlePublish} disabled={isSaving || !examId} className={`${btnPrimary} bg-green-600 hover:bg-green-700`}>
                        {isSaving && <Loader2 size={14} className="animate-spin" />}
                        Publish Exam
                    </button>
                )}
            </div>
        </div>
    );
}
