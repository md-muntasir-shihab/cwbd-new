import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Download,
    Edit,
    Eye,
    Lock,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Trash2,
    Upload,
    XCircle,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import QuestionImporter from './QuestionImporter';
import {
    adminApproveGlobalQuestion,
    adminCreateGlobalQuestion,
    adminCreateQuestionMedia,
    adminDeleteGlobalQuestion,
    adminExportGlobalQuestions,
    adminGetGlobalQuestionById,
    adminGetGlobalQuestions,
    adminLockGlobalQuestion,
    adminRevertGlobalQuestionRevision,
    adminSearchSimilarGlobalQuestions,
    adminUpdateGlobalQuestion,
    adminUploadMedia,
    type AdminQBankListResponse,
    type AdminQBankQuestion,
    type QBankSimilarityMatch,
} from '../../services/api';
import { showConfirmDialog, showPromptDialog } from '../../lib/appDialog';
import { downloadFile } from '../../utils/download';

type LanguageMode = 'EN' | 'BN' | 'BOTH';

function readLocalizedEn(
    value?: { en?: string; bn?: string },
    fallback?: string,
): string {
    return String(value?.en || fallback || '').trim();
}

function readLocalizedBn(
    value?: { en?: string; bn?: string },
    fallback?: string,
): string {
    return String(value?.bn || fallback || '').trim();
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 md:p-4" onClick={onClose}>
            <div
                className="w-full h-[100dvh] md:h-auto md:max-w-5xl rounded-none md:rounded-2xl border border-cyan-500/20 bg-slate-900/90 backdrop-blur-lg md:max-h-[92vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700/50 bg-slate-900/90 px-5 py-3">
                    <h3 className="text-sm font-semibold text-white">{title}</h3>
                    <button onClick={onClose} className="text-slate-300 hover:text-white">×</button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

type QuestionFormProps = {
    initial?: AdminQBankQuestion | null;
    onSaved: () => Promise<void>;
    onClose: () => void;
};

function QuestionForm({ initial, onSaved, onClose }: QuestionFormProps) {
    const [submitting, setSubmitting] = useState(false);
    const [similar, setSimilar] = useState<QBankSimilarityMatch[]>([]);
    const [checkingSimilar, setCheckingSimilar] = useState(false);
    const [imageMode, setImageMode] = useState<'none' | 'link' | 'upload'>(
        initial?.image_media_id ? 'link' : 'none',
    );
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [form, setForm] = useState({
        languageMode: (initial?.languageMode || 'EN') as LanguageMode,
        questionTextEn: readLocalizedEn(initial?.questionText, initial?.question_text || initial?.question || ''),
        questionTextBn: readLocalizedBn(initial?.questionText),
        subject: initial?.subject || '',
        chapter: initial?.chapter || '',
        class_level: initial?.class_level || '',
        department: initial?.department || '',
        topic: initial?.topic || '',
        difficulty: initial?.difficulty || 'medium',
        optionAEn: initial?.optionsLocalized?.find((item) => item.key === 'A')?.text?.en || initial?.optionA || '',
        optionABn: readLocalizedBn(initial?.optionsLocalized?.find((item) => item.key === 'A')?.text),
        optionBEn: initial?.optionsLocalized?.find((item) => item.key === 'B')?.text?.en || initial?.optionB || '',
        optionBBn: readLocalizedBn(initial?.optionsLocalized?.find((item) => item.key === 'B')?.text),
        optionCEn: initial?.optionsLocalized?.find((item) => item.key === 'C')?.text?.en || initial?.optionC || '',
        optionCBn: readLocalizedBn(initial?.optionsLocalized?.find((item) => item.key === 'C')?.text),
        optionDEn: initial?.optionsLocalized?.find((item) => item.key === 'D')?.text?.en || initial?.optionD || '',
        optionDBn: readLocalizedBn(initial?.optionsLocalized?.find((item) => item.key === 'D')?.text),
        correctAnswer: (initial?.correct_answer?.[0] || initial?.correctAnswer || 'A').toUpperCase(),
        explanationEn: readLocalizedEn(initial?.explanationText, initial?.explanation_text || initial?.explanation || ''),
        explanationBn: readLocalizedBn(initial?.explanationText),
        tags: (initial?.tags || []).join(', '),
        estimated_time: Number(initial?.estimated_time || 60),
        image_url: '',
        media_alt_text_bn: initial?.media_alt_text_bn || '',
        status: initial?.status || 'draft',
    });

    const showEnglishFields = form.languageMode !== 'BN';
    const showBanglaFields = form.languageMode !== 'EN';
    const activeQuestionText = (showEnglishFields ? form.questionTextEn : '') || form.questionTextBn;
    const activeExplanationText = (showEnglishFields ? form.explanationEn : '') || form.explanationBn;

    const normalizedPayload = useMemo(() => ({
        languageMode: form.languageMode,
        question_text: activeQuestionText,
        question: activeQuestionText,
        questionText: {
            en: form.questionTextEn.trim(),
            bn: form.questionTextBn.trim(),
        },
        subject: form.subject,
        chapter: form.chapter,
        class_level: form.class_level,
        department: form.department,
        topic: form.topic,
        difficulty: form.difficulty,
        optionA: (showEnglishFields ? form.optionAEn : '') || form.optionABn,
        optionB: (showEnglishFields ? form.optionBEn : '') || form.optionBBn,
        optionC: (showEnglishFields ? form.optionCEn : '') || form.optionCBn,
        optionD: (showEnglishFields ? form.optionDEn : '') || form.optionDBn,
        optionsLocalized: [
            { key: 'A', text: { en: form.optionAEn.trim(), bn: form.optionABn.trim() } },
            { key: 'B', text: { en: form.optionBEn.trim(), bn: form.optionBBn.trim() } },
            { key: 'C', text: { en: form.optionCEn.trim(), bn: form.optionCBn.trim() } },
            { key: 'D', text: { en: form.optionDEn.trim(), bn: form.optionDBn.trim() } },
        ],
        correctAnswer: form.correctAnswer,
        explanation: activeExplanationText,
        explanation_text: activeExplanationText,
        explanationText: {
            en: form.explanationEn.trim(),
            bn: form.explanationBn.trim(),
        },
        estimated_time: form.estimated_time,
        tags: form.tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        status: form.status,
    }), [activeExplanationText, activeQuestionText, form, showEnglishFields]);

    const runSimilarityCheck = async () => {
        if (!activeQuestionText.trim()) return;
        setCheckingSimilar(true);
        try {
            const response = await adminSearchSimilarGlobalQuestions({
                question_text: activeQuestionText,
                optionA: (showEnglishFields ? form.optionAEn : '') || form.optionABn,
                optionB: (showEnglishFields ? form.optionBEn : '') || form.optionBBn,
                optionC: (showEnglishFields ? form.optionCEn : '') || form.optionCBn,
                optionD: (showEnglishFields ? form.optionDEn : '') || form.optionDBn,
                subject: form.subject,
                excludeId: initial?._id,
            });
            setSimilar(response.data.matches || []);
        } catch (error) {
            console.error(error);
            toast.error('সাদৃশ্য পরীক্ষা করা যায়নি');
        } finally {
            setCheckingSimilar(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            let image_media_id: string | undefined;
            let questionImage: string | undefined;

            if (imageMode === 'link' && form.image_url.trim()) {
                const mediaResp = await adminCreateQuestionMedia({
                    sourceType: 'external_link',
                    url: form.image_url.trim(),
                    alt_text_bn: form.media_alt_text_bn.trim(),
                    approveNow: false,
                });
                image_media_id = String(mediaResp.data.media?._id || '');
                questionImage = form.image_url.trim();
            }

            if (imageMode === 'upload' && imageFile) {
                const uploadResp = await adminUploadMedia(imageFile);
                const uploadedUrl = uploadResp.data.url || (uploadResp.data as any).absoluteUrl || '';
                const mediaResp = await adminCreateQuestionMedia({
                    sourceType: 'upload',
                    url: uploadedUrl,
                    alt_text_bn: form.media_alt_text_bn.trim(),
                    mimeType: uploadResp.data.mimetype,
                    sizeBytes: uploadResp.data.size,
                    approveNow: true,
                });
                image_media_id = String(mediaResp.data.media?._id || '');
                questionImage = uploadedUrl;
            }

            const payload = {
                ...normalizedPayload,
                image_media_id: image_media_id || undefined,
                questionImage: questionImage || undefined,
                media_alt_text_bn: form.media_alt_text_bn.trim(),
            };

            if (initial?._id) {
                const response = await adminUpdateGlobalQuestion(initial._id, payload);
                if (response.data.warning) toast.error(response.data.warning);
                toast.success('প্রশ্ন আপডেট হয়েছে');
            } else {
                const response = await adminCreateGlobalQuestion(payload);
                if (response.data.warning) toast.error(response.data.warning);
                toast.success('প্রশ্ন যোগ হয়েছে');
            }
            await onSaved();
            onClose();
        } catch (error: any) {
            const message = error?.response?.data?.message || 'সংরক্ষণ করা যায়নি';
            toast.error(message);
        } finally {
            setSubmitting(false);
        }
    };

    const getOptionValue = (option: 'A' | 'B' | 'C' | 'D', language: 'En' | 'Bn'): string => {
        if (option === 'A' && language === 'En') return form.optionAEn;
        if (option === 'A' && language === 'Bn') return form.optionABn;
        if (option === 'B' && language === 'En') return form.optionBEn;
        if (option === 'B' && language === 'Bn') return form.optionBBn;
        if (option === 'C' && language === 'En') return form.optionCEn;
        if (option === 'C' && language === 'Bn') return form.optionCBn;
        if (option === 'D' && language === 'En') return form.optionDEn;
        return form.optionDBn;
    };

    const setOptionValue = (option: 'A' | 'B' | 'C' | 'D', language: 'En' | 'Bn', value: string): void => {
        setForm((prev) => {
            if (option === 'A' && language === 'En') return { ...prev, optionAEn: value };
            if (option === 'A' && language === 'Bn') return { ...prev, optionABn: value };
            if (option === 'B' && language === 'En') return { ...prev, optionBEn: value };
            if (option === 'B' && language === 'Bn') return { ...prev, optionBBn: value };
            if (option === 'C' && language === 'En') return { ...prev, optionCEn: value };
            if (option === 'C' && language === 'Bn') return { ...prev, optionCBn: value };
            if (option === 'D' && language === 'En') return { ...prev, optionDEn: value };
            return { ...prev, optionDBn: value };
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
                {(['EN', 'BN', 'BOTH'] as LanguageMode[]).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, languageMode: mode }))}
                        className={`rounded-lg px-3 py-1.5 text-xs ${form.languageMode === mode ? 'bg-cyan-500/25 text-cyan-100 border border-cyan-400/40' : 'bg-slate-800 text-slate-300 border border-slate-700'}`}
                    >
                        {mode}
                    </button>
                ))}
                <p className="text-[11px] text-slate-400">Language mode</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {showEnglishFields ? (
                    <div className={showBanglaFields ? '' : 'md:col-span-2'}>
                        <label className="text-xs text-slate-300 mb-1 block">Question (EN)</label>
                        <textarea
                            value={form.questionTextEn}
                            onChange={(e) => setForm((prev) => ({ ...prev, questionTextEn: e.target.value }))}
                            className="w-full h-24 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                            required={!showBanglaFields}
                        />
                    </div>
                ) : null}
                {showBanglaFields ? (
                    <div className={showEnglishFields ? '' : 'md:col-span-2'}>
                        <label className="text-xs text-slate-300 mb-1 block">Question (BN)</label>
                        <textarea
                            value={form.questionTextBn}
                            onChange={(e) => setForm((prev) => ({ ...prev, questionTextBn: e.target.value }))}
                            className="w-full h-24 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                            required={!showEnglishFields}
                        />
                    </div>
                ) : null}
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">বিষয়</label>
                    <input
                        value={form.subject}
                        onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        required
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">অধ্যায়</label>
                    <input
                        value={form.chapter}
                        onChange={(e) => setForm((prev) => ({ ...prev, chapter: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">শ্রেণি</label>
                    <input
                        value={form.class_level}
                        onChange={(e) => setForm((prev) => ({ ...prev, class_level: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">বিভাগ</label>
                    <input
                        value={form.department}
                        onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">টপিক</label>
                    <input
                        value={form.topic}
                        onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">কঠিনতা</label>
                    <select
                        value={form.difficulty}
                        onChange={(e) => setForm((prev) => ({ ...prev, difficulty: e.target.value as 'easy' | 'medium' | 'hard' }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    >
                        <option value="easy">easy</option>
                        <option value="medium">medium</option>
                        <option value="hard">hard</option>
                    </select>
                </div>
            </div>

            <div className="space-y-3">
                {(['A', 'B', 'C', 'D'] as const).map((option) => (
                    <div key={option} className="rounded-xl border border-slate-700/50 bg-slate-950/30 p-3">
                        <p className="text-xs font-semibold text-slate-200 mb-2">অপশন {option}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {showEnglishFields ? (
                                <input
                                    value={getOptionValue(option, 'En')}
                                    onChange={(e) => setOptionValue(option, 'En', e.target.value)}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                                    placeholder={`Option ${option} (EN)`}
                                    required={(option === 'A' || option === 'B') && !showBanglaFields}
                                />
                            ) : null}
                            {showBanglaFields ? (
                                <input
                                    value={getOptionValue(option, 'Bn')}
                                    onChange={(e) => setOptionValue(option, 'Bn', e.target.value)}
                                    className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                                    placeholder={`Option ${option} (BN)`}
                                    required={(option === 'A' || option === 'B') && !showEnglishFields}
                                />
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">সঠিক উত্তর</label>
                    <select
                        value={form.correctAnswer}
                        onChange={(e) => setForm((prev) => ({ ...prev, correctAnswer: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">আনুমানিক সময় (সেকেন্ড)</label>
                    <input
                        type="number"
                        min={10}
                        value={form.estimated_time}
                        onChange={(e) => setForm((prev) => ({ ...prev, estimated_time: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {showEnglishFields ? (
                    <div>
                        <label className="text-xs text-slate-300 mb-1 block">Explanation (EN)</label>
                        <textarea
                            value={form.explanationEn}
                            onChange={(e) => setForm((prev) => ({ ...prev, explanationEn: e.target.value }))}
                            className="w-full h-20 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        />
                    </div>
                ) : null}
                {showBanglaFields ? (
                    <div>
                        <label className="text-xs text-slate-300 mb-1 block">Explanation (BN)</label>
                        <textarea
                            value={form.explanationBn}
                            onChange={(e) => setForm((prev) => ({ ...prev, explanationBn: e.target.value }))}
                            className="w-full h-20 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        />
                    </div>
                ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">ট্যাগ (কমা দিয়ে আলাদা)</label>
                    <input
                        value={form.tags}
                        onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-300 mb-1 block">স্ট্যাটাস</label>
                    <select
                        value={form.status}
                        onChange={(e) =>
                            setForm((prev) => ({
                                ...prev,
                                status: e.target.value as 'draft' | 'pending_review' | 'approved' | 'rejected' | 'archived',
                            }))
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    >
                        <option value="draft">draft</option>
                        <option value="pending_review">pending_review</option>
                        <option value="approved">approved</option>
                    </select>
                </div>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-300 mb-2">ইমেজ (ঐচ্ছিক)</p>
                <div className="flex flex-wrap gap-2 mb-3">
                    {(['none', 'link', 'upload'] as const).map((mode) => (
                        <button
                            type="button"
                            key={mode}
                            onClick={() => setImageMode(mode)}
                            className={`px-3 py-1 rounded-lg text-xs ${imageMode === mode ? 'bg-cyan-500/25 text-cyan-200' : 'bg-slate-800 text-slate-300'}`}
                        >
                            {mode === 'none' ? 'ইমেজ নেই' : mode === 'link' ? 'ইমেজ লিংক' : 'ফাইল আপলোড'}
                        </button>
                    ))}
                </div>
                {imageMode === 'link' ? (
                    <input
                        value={form.image_url}
                        onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
                        placeholder="https://example.com/image.jpg"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white mb-3"
                    />
                ) : null}
                {imageMode === 'upload' ? (
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white mb-3"
                    />
                ) : null}
                {imageMode !== 'none' ? (
                    <input
                        value={form.media_alt_text_bn}
                        onChange={(e) => setForm((prev) => ({ ...prev, media_alt_text_bn: e.target.value }))}
                        placeholder="ইমেজের বাংলা alt text"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                    />
                ) : null}
            </div>

            {similar.length > 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-xs text-amber-200 mb-2">সম্ভাব্য ডুপ্লিকেট ({similar.length})</p>
                    <ul className="space-y-1 text-[11px] text-amber-100 max-h-24 overflow-auto">
                        {similar.slice(0, 5).map((item) => (
                            <li key={item.questionId}>{item.score.toFixed(2)} - {item.questionText}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <button
                    type="button"
                    onClick={runSimilarityCheck}
                    disabled={checkingSimilar}
                    className="px-4 py-2 text-xs rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700"
                >
                    {checkingSimilar ? 'পরীক্ষা হচ্ছে...' : 'ডুপ্লিকেট চেক করুন'}
                </button>
                <div className="flex gap-2 ml-auto">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-300">বাতিল</button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="px-5 py-2 rounded-xl text-sm bg-gradient-to-r from-cyan-600 to-indigo-600 text-white disabled:opacity-50"
                    >
                        {submitting ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
                    </button>
                </div>
            </div>
        </form>
    );
}

export default function QuestionBankPanel() {
    const queryClient = useQueryClient();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [questions, setQuestions] = useState<AdminQBankQuestion[]>([]);
    const [pagination, setPagination] = useState<AdminQBankListResponse['pagination']>({
        total: 0,
        page: 1,
        limit: 20,
        pages: 1,
    });
    const [facets, setFacets] = useState<AdminQBankListResponse['facets']>({});
    const [capabilities, setCapabilities] = useState<AdminQBankListResponse['capabilities']>({});
    const [selected, setSelected] = useState<AdminQBankQuestion | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [reviewModal, setReviewModal] = useState<{
        question: AdminQBankQuestion | null;
        revisions: Array<Record<string, unknown>>;
    }>({ question: null, revisions: [] });

    const [filters, setFilters] = useState({
        page: 1,
        limit: 20,
        search: '',
        subject: '',
        chapter: '',
        difficulty: '',
        status: '',
        has_image: '',
        has_explanation: '',
        quality_score_min: '',
    });

    const invalidateQuestionBankQueries = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['question_bank'] }),
            queryClient.invalidateQueries({ queryKey: ['question-bank'] }),
        ]);
    }, [queryClient]);

    const loadQuestions = useCallback(async () => {
        setLoading(true);
        try {
            const response = await adminGetGlobalQuestions({
                page: filters.page,
                limit: filters.limit,
                search: filters.search,
                subject: filters.subject,
                chapter: filters.chapter,
                difficulty: filters.difficulty,
                status: filters.status,
                has_image: filters.has_image,
                has_explanation: filters.has_explanation,
                quality_score_min: filters.quality_score_min,
            });
            setQuestions(response.data.questions || []);
            setPagination(response.data.pagination);
            setFacets(response.data.facets || {});
            setCapabilities(response.data.capabilities || {});
        } catch (error) {
            console.error(error);
            toast.error('রিভিশন লোড করা যায়নি');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        loadQuestions();
    }, [loadQuestions]);

    const refresh = async () => {
        setRefreshing(true);
        await loadQuestions();
        setRefreshing(false);
    };

    const openReview = async (questionId: string) => {
        try {
            const response = await adminGetGlobalQuestionById(questionId);
            setReviewModal({
                question: response.data.question,
                revisions: response.data.revisions || [],
            });
        } catch (error) {
            console.error(error);
            toast.error('এক্সপোর্ট করা যায়নি');
        }
    };

    const exportData = async () => {
        try {
            const response = await adminExportGlobalQuestions({
                format: 'xlsx',
                filters: {
                    search: filters.search,
                    subject: filters.subject,
                    chapter: filters.chapter,
                    difficulty: filters.difficulty,
                    status: filters.status,
                },
            });
            downloadFile(response, { filename: `qbank-export-${Date.now()}.xlsx` });
            toast.success('এক্সপোর্ট সম্পন্ন');
        } catch (error) {
            console.error(error);
            toast.error('এক্সপোর্ট ব্যর্থ হয়েছে');
        }
    };

    const handleDelete = async (id: string) => {
        const confirmed = await showConfirmDialog({
            title: 'প্রশ্ন আর্কাইভ',
            message: 'প্রশ্নটি আর্কাইভ করতে চান?',
            confirmLabel: 'আর্কাইভ',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await adminDeleteGlobalQuestion(id);
            toast.success('প্রশ্ন আর্কাইভ হয়েছে');
            await loadQuestions();
            await invalidateQuestionBankQueries();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'আর্কাইভ করা যায়নি');
        }
    };

    return (
        <div className={showCreate ? 'space-y-5 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-5' : 'space-y-5'}>
            <div className="space-y-5 min-w-0">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-white">প্রশ্ন ব্যাংক</h2>
                        <p className="text-sm text-slate-400">মোট প্রশ্ন: {pagination.total}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={refresh} className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 hover:text-white inline-flex items-center gap-2">
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            রিফ্রেশ
                        </button>
                        <button onClick={exportData} className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 hover:text-white inline-flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            এক্সপোর্ট
                        </button>
                        {capabilities?.questionBulkImport ? (
                            <button onClick={() => setShowImport(true)} className="px-3 py-2 rounded-xl bg-slate-800 text-white inline-flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                বাল্ক ইমপোর্ট
                            </button>
                        ) : null}
                        {capabilities?.questionCreate ? (
                            <button onClick={() => { setSelected(null); setShowCreate(true); }} className="px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white inline-flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                নতুন প্রশ্ন
                            </button>
                        ) : null}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-9 gap-3">
                        <div className="lg:col-span-2 relative">
                            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                            <input
                                value={filters.search}
                                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
                                placeholder="প্রশ্ন/ট্যাগ খুঁজুন"
                                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 pl-9 pr-3 py-2 text-sm text-white"
                            />
                        </div>
                        <input
                            value={filters.subject}
                            onChange={(e) => setFilters((prev) => ({ ...prev, subject: e.target.value, page: 1 }))}
                            placeholder="বিষয়"
                            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        />
                        <input
                            value={filters.chapter}
                            onChange={(e) => setFilters((prev) => ({ ...prev, chapter: e.target.value, page: 1 }))}
                            placeholder="অধ্যায়"
                            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        />
                        <select
                            value={filters.difficulty}
                            onChange={(e) => setFilters((prev) => ({ ...prev, difficulty: e.target.value, page: 1 }))}
                            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        >
                            <option value="">সব কঠিনতা</option>
                            <option value="easy">easy</option>
                            <option value="medium">medium</option>
                            <option value="hard">hard</option>
                        </select>
                        <select
                            value={filters.status}
                            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value, page: 1 }))}
                            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        >
                            <option value="">সব স্ট্যাটাস</option>
                            <option value="draft">draft</option>
                            <option value="pending_review">pending_review</option>
                            <option value="approved">approved</option>
                            <option value="rejected">rejected</option>
                            <option value="archived">archived</option>
                        </select>
                        <select
                            value={filters.has_image}
                            onChange={(e) => setFilters((prev) => ({ ...prev, has_image: e.target.value, page: 1 }))}
                            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        >
                            <option value="">ইমেজ সব</option>
                            <option value="true">ইমেজ আছে</option>
                            <option value="false">ইমেজ নেই</option>
                        </select>
                        <select
                            value={filters.has_explanation}
                            onChange={(e) => setFilters((prev) => ({ ...prev, has_explanation: e.target.value, page: 1 }))}
                            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        >
                            <option value="">ব্যাখ্যা সব</option>
                            <option value="true">ব্যাখ্যা আছে</option>
                            <option value="false">ব্যাখ্যা নেই</option>
                        </select>
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={filters.quality_score_min}
                            onChange={(e) => setFilters((prev) => ({ ...prev, quality_score_min: e.target.value, page: 1 }))}
                            placeholder="কোয়ালিটি মিন"
                            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white"
                        />
                    </div>
                    {facets?.subjects?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {facets.subjects.slice(0, 12).map((subject) => (
                                <button
                                    key={subject}
                                    onClick={() => setFilters((prev) => ({ ...prev, subject, page: 1 }))}
                                    className="text-[11px] px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-200 border border-cyan-500/20"
                                >
                                    {subject}
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <div className="md:hidden space-y-3">
                    {loading ? (
                        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 text-center text-slate-400">
                            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                            লোড হচ্ছে...
                        </div>
                    ) : questions.length === 0 ? (
                        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 text-center text-slate-500">
                            <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                            কোন প্রশ্ন পাওয়া যায়নি
                        </div>
                    ) : (
                        questions.map((question) => (
                            <article key={question._id} className="rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-3">
                                <div>
                                    <p className="text-white text-sm font-semibold line-clamp-3">{question.questionText?.bn || question.questionText?.en || question.question_text || question.question}</p>
                                    <div className="mt-2 flex gap-1 flex-wrap">
                                        {(question.tags || []).slice(0, 3).map((tag) => (
                                            <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-200">{tag}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-[11px] text-slate-300 sm:grid-cols-2">
                                    <p>{question.subject || '-'}</p>
                                    <p className="text-right">{question.chapter || '-'}</p>
                                    <p>Quality: {Number(question.quality_score || 0).toFixed(1)}</p>
                                    <p className="text-right">Used: {question.usage_count || 0}</p>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    <button onClick={() => openReview(question._id)} className="p-1.5 rounded bg-slate-800 text-slate-200 hover:text-white" title="রিভিশন">
                                        <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    {capabilities?.questionEdit ? (
                                        <button onClick={() => { setSelected(question); setShowCreate(true); }} className="p-1.5 rounded bg-indigo-500/20 text-indigo-200 hover:text-white" title="এডিট">
                                            <Edit className="w-3.5 h-3.5" />
                                        </button>
                                    ) : null}
                                    {capabilities?.questionApprove && question.status === 'pending_review' ? (
                                        <>
                                            <button
                                                onClick={async () => {
                                                    await adminApproveGlobalQuestion(question._id, { action: 'approve' });
                                                    toast.success('প্রশ্ন অনুমোদিত হয়েছে');
                                                    await loadQuestions();
                                                    await invalidateQuestionBankQueries();
                                                }}
                                                className="p-1.5 rounded bg-emerald-500/20 text-emerald-200 hover:text-white"
                                                title="Approve"
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    const reason = await showPromptDialog({
                                                        title: 'রিজেক্ট কারণ',
                                                        message: 'রিজেক্ট কারণ লিখুন',
                                                        confirmLabel: 'রিজেক্ট করুন',
                                                        allowEmpty: true,
                                                    }) || '';
                                                    await adminApproveGlobalQuestion(question._id, { action: 'reject', reason });
                                                    toast.success('প্রশ্ন রিজেক্ট হয়েছে');
                                                    await loadQuestions();
                                                    await invalidateQuestionBankQueries();
                                                }}
                                                className="p-1.5 rounded bg-rose-500/20 text-rose-200 hover:text-white"
                                                title="Reject"
                                            >
                                                <XCircle className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    ) : null}
                                    {capabilities?.questionLock ? (
                                        <button
                                            onClick={async () => {
                                                await adminLockGlobalQuestion(question._id, { locked: !Boolean(question.locked), force: true });
                                                toast.success(question.locked ? 'লক খোলা হয়েছে' : 'লক করা হয়েছে');
                                                await loadQuestions();
                                                await invalidateQuestionBankQueries();
                                            }}
                                            className={`p-1.5 rounded ${question.locked ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-800 text-slate-300'} hover:text-white`}
                                            title="Lock"
                                        >
                                            <Lock className="w-3.5 h-3.5" />
                                        </button>
                                    ) : null}
                                    {capabilities?.questionDelete ? (
                                        <button onClick={() => handleDelete(question._id)} className="p-1.5 rounded bg-rose-500/20 text-rose-200 hover:text-white" title="আর্কাইভ">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        ))
                    )}
                </div>

                <div className="hidden md:block rounded-2xl border border-slate-700/60 bg-slate-900/50 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-800/60 text-slate-300">
                                <tr>
                                    <th className="p-3 font-medium">প্রশ্ন</th>
                                    <th className="p-3 font-medium">বিষয়/অধ্যায়</th>
                                    <th className="p-3 font-medium">স্ট্যাটাস</th>
                                    <th className="p-3 font-medium">কোয়ালিটি</th>
                                    <th className="p-3 font-medium">ব্যবহার</th>
                                    <th className="p-3 font-medium text-right">অ্যাকশন</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-400">
                                            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                                            লোড হচ্ছে...
                                        </td>
                                    </tr>
                                ) : questions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">
                                            <AlertCircle className="w-5 h-5 mx-auto mb-2" />
                                            কোন প্রশ্ন পাওয়া যায়নি
                                        </td>
                                    </tr>
                                ) : (
                                    questions.map((question) => (
                                        <tr key={question._id} className="hover:bg-white/[0.02]">
                                            <td className="p-3">
                                                <p className="text-white line-clamp-2">{question.questionText?.bn || question.questionText?.en || question.question_text || question.question}</p>
                                                <div className="mt-1 flex gap-1 flex-wrap">
                                                    {(question.tags || []).slice(0, 3).map((tag) => (
                                                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-200">{tag}</span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="p-3 text-xs text-slate-300">
                                                <p>{question.subject || '-'}</p>
                                                <p className="text-slate-500">{question.chapter || '-'}</p>
                                            </td>
                                            <td className="p-3">
                                                <span className={`text-[10px] px-2 py-1 rounded-full border ${question.status === 'approved'
                                                        ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                                                        : question.status === 'pending_review'
                                                            ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                                                            : question.status === 'rejected'
                                                                ? 'text-rose-300 border-rose-500/30 bg-rose-500/10'
                                                                : 'text-slate-300 border-slate-500/30 bg-slate-500/10'
                                                    }`}>
                                                    {question.status || 'draft'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-slate-200">{Number(question.quality_score || 0).toFixed(1)}</td>
                                            <td className="p-3 text-xs text-slate-300">
                                                <p>count: {question.usage_count || 0}</p>
                                                <p className="text-slate-500">avg: {question.avg_correct_pct ? `${question.avg_correct_pct}%` : '-'}</p>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => openReview(question._id)} className="p-1.5 rounded bg-slate-800 text-slate-200 hover:text-white" title="রিভিশন">
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>
                                                    {capabilities?.questionEdit ? (
                                                        <button onClick={() => { setSelected(question); setShowCreate(true); }} className="p-1.5 rounded bg-indigo-500/20 text-indigo-200 hover:text-white" title="এডিট">
                                                            <Edit className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : null}
                                                    {capabilities?.questionApprove && question.status === 'pending_review' ? (
                                                        <>
                                                            <button
                                                                onClick={async () => {
                                                                    await adminApproveGlobalQuestion(question._id, { action: 'approve' });
                                                                    toast.success('প্রশ্ন অনুমোদিত হয়েছে');
                                                                    await loadQuestions();
                                                                    await invalidateQuestionBankQueries();
                                                                }}
                                                                className="p-1.5 rounded bg-emerald-500/20 text-emerald-200 hover:text-white"
                                                                title="Approve"
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={async () => {
                                                                    const reason = await showPromptDialog({
                                                                        title: 'রিজেক্ট কারণ',
                                                                        message: 'রিজেক্ট কারণ লিখুন',
                                                                        confirmLabel: 'রিজেক্ট করুন',
                                                                        allowEmpty: true,
                                                                    }) || '';
                                                                    await adminApproveGlobalQuestion(question._id, { action: 'reject', reason });
                                                                    toast.success('প্রশ্ন রিজেক্ট হয়েছে');
                                                                    await loadQuestions();
                                                                    await invalidateQuestionBankQueries();
                                                                }}
                                                                className="p-1.5 rounded bg-rose-500/20 text-rose-200 hover:text-white"
                                                                title="Reject"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    ) : null}
                                                    {capabilities?.questionLock ? (
                                                        <button
                                                            onClick={async () => {
                                                                await adminLockGlobalQuestion(question._id, { locked: !Boolean(question.locked), force: true });
                                                                toast.success(question.locked ? 'লক খোলা হয়েছে' : 'লক করা হয়েছে');
                                                                await loadQuestions();
                                                                await invalidateQuestionBankQueries();
                                                            }}
                                                            className={`p-1.5 rounded ${question.locked ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-800 text-slate-300'} hover:text-white`}
                                                            title="Lock"
                                                        >
                                                            <Lock className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : null}
                                                    {capabilities?.questionDelete ? (
                                                        <button onClick={() => handleDelete(question._id)} className="p-1.5 rounded bg-rose-500/20 text-rose-200 hover:text-white" title="আর্কাইভ">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {pagination.pages > 1 ? (
                    <div className="flex justify-center gap-2">
                        {Array.from({ length: pagination.pages }).map((_, index) => {
                            const pageNo = index + 1;
                            return (
                                <button
                                    key={pageNo}
                                    onClick={() => setFilters((prev) => ({ ...prev, page: pageNo }))}
                                    className={`w-8 h-8 rounded-lg text-sm ${filters.page === pageNo ? 'bg-cyan-600 text-white' : 'bg-slate-900 text-slate-300 border border-slate-700'}`}
                                >
                                    {pageNo}
                                </button>
                            );
                        })}
                    </div>
                ) : null}
            </div>

            {showCreate ? (
                <div className="hidden lg:block rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
                    <h3 className="text-sm font-semibold text-white mb-3">{selected ? 'প্রশ্ন সম্পাদনা' : 'নতুন প্রশ্ন'}</h3>
                    <QuestionForm
                        initial={selected}
                        onSaved={async () => {
                            await loadQuestions();
                            await invalidateQuestionBankQueries();
                        }}
                        onClose={() => {
                            setShowCreate(false);
                            setSelected(null);
                        }}
                    />
                </div>
            ) : null}

            {showCreate ? (
                <div className="lg:hidden">
                    <Modal title={selected ? 'প্রশ্ন সম্পাদনা' : 'নতুন প্রশ্ন'} onClose={() => { setShowCreate(false); setSelected(null); }}>
                        <QuestionForm
                            initial={selected}
                            onSaved={async () => {
                                await loadQuestions();
                                await invalidateQuestionBankQueries();
                            }}
                            onClose={() => {
                                setShowCreate(false);
                                setSelected(null);
                            }}
                        />
                    </Modal>
                </div>
            ) : null}

            {showImport ? (
                <Modal title="প্রশ্ন বাল্ক ইমপোর্ট" onClose={() => setShowImport(false)}>
                    <QuestionImporter
                        onClose={() => setShowImport(false)}
                        onImported={() => {
                            loadQuestions();
                            void invalidateQuestionBankQueries();
                        }}
                    />
                </Modal>
            ) : null}

            {reviewModal.question ? (
                <Modal title="রিভিশন ও অডিট" onClose={() => setReviewModal({ question: null, revisions: [] })}>
                    <div className="space-y-3">
                        <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-3">
                            <p className="text-sm text-white">{reviewModal.question.questionText?.bn || reviewModal.question.questionText?.en || reviewModal.question.question_text || reviewModal.question.question}</p>
                            <p className="text-xs text-slate-400 mt-1">Revision: {reviewModal.question.revision_no || '-'}</p>
                        </div>
                        <div className="space-y-2 max-h-72 overflow-auto">
                            {reviewModal.revisions.length === 0 ? (
                                <p className="text-xs text-slate-400">কোন রিভিশন পাওয়া যায়নি</p>
                            ) : reviewModal.revisions.map((revision) => (
                                <div key={String(revision._id)} className="rounded-xl border border-slate-700/60 bg-slate-950/40 p-3 flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs text-white">Revision #{String(revision.revisionNo || '-')}</p>
                                        <p className="text-[11px] text-slate-400">{String(revision.changedAt || '-')}</p>
                                    </div>
                                    {capabilities?.questionEdit ? (
                                        <button
                                            onClick={async () => {
                                                const revisionNo = Number(revision.revisionNo || 0);
                                                if (!revisionNo) return;
                                                await adminRevertGlobalQuestionRevision(String(reviewModal.question?._id), revisionNo);
                                                toast.success('রিভিশন রিস্টোর হয়েছে');
                                                await loadQuestions();
                                                await invalidateQuestionBankQueries();
                                                await openReview(String(reviewModal.question?._id));
                                            }}
                                            className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500/20 text-indigo-200 hover:text-white inline-flex items-center gap-1"
                                        >
                                            <ShieldCheck className="w-3.5 h-3.5" />
                                            Revert
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                </Modal>
            ) : null}
        </div>
    );
}

