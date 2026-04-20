import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
    Paintbrush, Bot, Share2, Workflow, Rss, Trash2, Clock, Eye, EyeOff,
    Globe, Languages, Sparkles, ShieldCheck, Copy, Send, ChevronDown,
} from 'lucide-react';
import {
    ApiNewsV2Settings,
    adminGetNewsSettings,
    adminNewsV2UploadMedia,
    adminUpdateNewsSettings,
} from '../../../services/api';
import { extractUploadUrl, extractUploadError } from '../../../components/common/CompressedImageInput';

// ─── Types ───────────────────────────────────────────────────────────────────

type SettingsPanel = 'appearance' | 'workflow' | 'ai' | 'share';

interface Props {
    initialPanel?: SettingsPanel;
}

type MediaFieldKey =
    | 'headerBannerUrl'
    | 'defaultBannerUrl'
    | 'defaultThumbUrl'
    | 'defaultSourceIconUrl';

interface CoreFormState {
    pageTitle: string;
    pageSubtitle: string;
    headerBannerUrl: string;
    defaultBannerUrl: string;
    defaultThumbUrl: string;
    defaultSourceIconUrl: string;
    // Extraction
    fetchFullArticleEnabled: boolean;
    fullArticleFetchMode: 'rss_content' | 'readability_scrape' | 'both' | 'ai_extract';
    aiExtractionFallback: boolean;
    // Workflow
    workflowAutoDraftFromRSS: boolean;
    workflowAllowScheduling: boolean;
    workflowOpenOriginalWhenExtractionIncomplete: boolean;
    workflowAutoExpireDays: string;
    newsTrashRetentionDays: string;
    // AI
    aiEnabled: boolean;
    aiLanguage: 'bn' | 'en' | 'mixed';
    aiStylePreset: 'short' | 'standard' | 'detailed';
    aiApiProviderUrl: string;
    aiApiKey: string;
    aiStrictNoHallucination: boolean;
    aiDuplicateSensitivity: 'strict' | 'medium' | 'loose';
    aiMaxLength: number;
    aiPromptTemplate: string;
    aiAutoTagging: boolean;
    aiAutoCategory: boolean;
    aiAutoSummary: boolean;
    // Share
    shareWhatsapp: string;
    shareFacebook: string;
    shareMessenger: string;
    shareTelegram: string;
    btnWhatsapp: boolean;
    btnFacebook: boolean;
    btnMessenger: boolean;
    btnTelegram: boolean;
    btnCopyLink: boolean;
}

const EMPTY_CORE_FORM: CoreFormState = {
    pageTitle: '',
    pageSubtitle: '',
    headerBannerUrl: '',
    defaultBannerUrl: '',
    defaultThumbUrl: '',
    defaultSourceIconUrl: '',
    fetchFullArticleEnabled: true,
    fullArticleFetchMode: 'both',
    aiExtractionFallback: false,
    workflowAutoDraftFromRSS: true,
    workflowAllowScheduling: true,
    workflowOpenOriginalWhenExtractionIncomplete: true,
    workflowAutoExpireDays: '',
    newsTrashRetentionDays: '30',
    aiEnabled: false,
    aiLanguage: 'en',
    aiStylePreset: 'standard',
    aiApiProviderUrl: '',
    aiApiKey: '',
    aiStrictNoHallucination: true,
    aiDuplicateSensitivity: 'medium',
    aiMaxLength: 1200,
    aiPromptTemplate: '',
    aiAutoTagging: true,
    aiAutoCategory: true,
    aiAutoSummary: true,
    shareWhatsapp: '{title}\n{summary}\n{public_url}',
    shareFacebook: '{title} | {source_name}\n{public_url}',
    shareMessenger: '{title}\n{summary}\n{public_url}',
    shareTelegram: '{title}\n{summary}\n{public_url}',
    btnWhatsapp: true,
    btnFacebook: true,
    btnMessenger: true,
    btnTelegram: true,
    btnCopyLink: true,
};

function mapSettingsToCoreForm(settings: ApiNewsV2Settings | undefined): CoreFormState {
    if (!settings) return EMPTY_CORE_FORM;
    const autoExpireDays = settings.workflow?.autoExpireDays;
    return {
        pageTitle: settings.pageTitle || '',
        pageSubtitle: settings.pageSubtitle || '',
        headerBannerUrl: settings.headerBannerUrl || '',
        defaultBannerUrl: settings.defaultBannerUrl || '',
        defaultThumbUrl: settings.defaultThumbUrl || '',
        defaultSourceIconUrl: settings.defaultSourceIconUrl || '',
        fetchFullArticleEnabled: settings.fetchFullArticleEnabled !== false,
        fullArticleFetchMode: (settings as any).fullArticleFetchMode || 'both',
        aiExtractionFallback: settings.aiExtractionFallback ?? false,
        workflowAutoDraftFromRSS: settings.workflow?.autoDraftFromRSS !== false,
        workflowAllowScheduling: settings.workflow?.allowScheduling !== false,
        workflowOpenOriginalWhenExtractionIncomplete: settings.workflow?.openOriginalWhenExtractionIncomplete !== false,
        workflowAutoExpireDays: autoExpireDays === null || autoExpireDays === undefined ? '' : String(autoExpireDays),
        newsTrashRetentionDays: settings.cleanup?.newsTrashRetentionDays == null ? '30' : String(settings.cleanup.newsTrashRetentionDays),
        aiEnabled: settings.aiSettings?.enabled ?? false,
        aiLanguage: String(settings.aiSettings?.language || 'en').toLowerCase() as 'bn' | 'en' | 'mixed',
        aiStylePreset: (settings.aiSettings?.stylePreset === 'very_short' ? 'short' : (settings.aiSettings?.stylePreset || 'standard')) as CoreFormState['aiStylePreset'],
        aiApiProviderUrl: settings.aiSettings?.apiProviderUrl || '',
        aiApiKey: settings.aiSettings?.apiKey || '',
        aiStrictNoHallucination: settings.aiSettings?.strictNoHallucination ?? settings.aiSettings?.strictMode ?? true,
        aiDuplicateSensitivity: settings.aiSettings?.duplicateSensitivity || 'medium',
        aiMaxLength: Number(settings.aiSettings?.maxLength || 1200),
        aiPromptTemplate: settings.aiSettings?.promptTemplate || settings.aiSettings?.customPrompt || '',
        aiAutoTagging: (settings.aiSettings as any)?.autoTagging ?? true,
        aiAutoCategory: (settings.aiSettings as any)?.autoCategory ?? true,
        aiAutoSummary: (settings.aiSettings as any)?.autoSummary ?? true,
        shareWhatsapp: settings.shareTemplates?.whatsapp || '',
        shareFacebook: settings.shareTemplates?.facebook || '',
        shareMessenger: settings.shareTemplates?.messenger || '',
        shareTelegram: settings.shareTemplates?.telegram || '',
        btnWhatsapp: settings.share?.shareButtons?.whatsapp ?? true,
        btnFacebook: settings.share?.shareButtons?.facebook ?? true,
        btnMessenger: settings.share?.shareButtons?.messenger ?? true,
        btnTelegram: settings.share?.shareButtons?.telegram ?? true,
        btnCopyLink: settings.share?.shareButtons?.copyLink ?? true,
    };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminNewsSettingsHub({ initialPanel = 'appearance' }: Props) {
    const queryClient = useQueryClient();
    const [panel, setPanel] = useState<SettingsPanel>(initialPanel === 'ai' ? 'workflow' : initialPanel as SettingsPanel);
    const [coreForm, setCoreForm] = useState<CoreFormState>(EMPTY_CORE_FORM);
    const [uploadingField, setUploadingField] = useState<MediaFieldKey | null>(null);
    const [showApiKey, setShowApiKey] = useState(false);

    const settingsQuery = useQuery({
        queryKey: ['adminNewsSettings'],
        queryFn: async () => (await adminGetNewsSettings()).data,
    });

    useEffect(() => {
        if (initialPanel === 'ai') setPanel('workflow');
        else setPanel(initialPanel as SettingsPanel);
    }, [initialPanel]);

    useEffect(() => {
        setCoreForm(mapSettingsToCoreForm(settingsQuery.data?.settings));
    }, [settingsQuery.data?.settings]);

    const saveCoreMutation = useMutation({
        mutationFn: async () => {
            const current = settingsQuery.data?.settings;
            const autoExpireValue = coreForm.workflowAutoExpireDays.trim();
            const autoExpireDays = autoExpireValue === '' ? null : Number(autoExpireValue);
            const newsTrashValue = coreForm.newsTrashRetentionDays.trim();
            const newsTrashRetentionDays = newsTrashValue === '' ? 30 : Number(newsTrashValue);
            const normalizedEnabledChannels = Array.from(
                new Set(
                    (Array.isArray(current?.share?.enabledChannels) ? current.share.enabledChannels : ['whatsapp', 'facebook', 'messenger', 'telegram', 'copy_link'])
                        .map((ch) => String(ch || '').trim())
                        .filter((ch) => ch && ch !== 'copy_text')
                )
            ) as NonNullable<ApiNewsV2Settings['share']>['enabledChannels'];

            const payload: Partial<ApiNewsV2Settings> = {
                pageTitle: coreForm.pageTitle,
                pageSubtitle: coreForm.pageSubtitle,
                headerBannerUrl: coreForm.headerBannerUrl,
                defaultBannerUrl: coreForm.defaultBannerUrl,
                defaultThumbUrl: coreForm.defaultThumbUrl,
                defaultSourceIconUrl: coreForm.defaultSourceIconUrl,
                fetchFullArticleEnabled: coreForm.fetchFullArticleEnabled,
                fullArticleFetchMode: coreForm.fullArticleFetchMode === 'ai_extract' ? 'both' : coreForm.fullArticleFetchMode,
                aiExtractionFallback: coreForm.fullArticleFetchMode === 'ai_extract' ? true : coreForm.aiExtractionFallback,
                workflow: {
                    requireApprovalBeforePublish: current?.workflow?.requireApprovalBeforePublish ?? true,
                    allowAutoPublishFromAi: current?.workflow?.allowAutoPublishFromAi ?? false,
                    autoDraftFromRSS: coreForm.workflowAutoDraftFromRSS,
                    defaultIncomingStatus: 'pending_review',
                    allowScheduling: coreForm.workflowAllowScheduling,
                    allowSchedulePublish: coreForm.workflowAllowScheduling,
                    openOriginalWhenExtractionIncomplete: coreForm.workflowOpenOriginalWhenExtractionIncomplete,
                    autoExpireDays: autoExpireDays === null || Number.isNaN(autoExpireDays) ? null : autoExpireDays,
                },
                aiSettings: {
                    enabled: coreForm.aiEnabled,
                    language: coreForm.aiLanguage,
                    stylePreset: coreForm.aiStylePreset,
                    apiProviderUrl: coreForm.aiApiProviderUrl,
                    apiKey: coreForm.aiApiKey,
                    strictNoHallucination: coreForm.aiStrictNoHallucination,
                    strictMode: coreForm.aiStrictNoHallucination,
                    duplicateSensitivity: coreForm.aiDuplicateSensitivity,
                    maxLength: Number.isFinite(coreForm.aiMaxLength) ? coreForm.aiMaxLength : 1200,
                    customPrompt: coreForm.aiPromptTemplate.trim(),
                },
                cleanup: {
                    ...(current?.cleanup || {}),
                    newsTrashRetentionDays: Number.isFinite(newsTrashRetentionDays) ? Math.max(1, newsTrashRetentionDays) : 30,
                },
                shareTemplates: {
                    whatsapp: coreForm.shareWhatsapp,
                    facebook: coreForm.shareFacebook,
                    messenger: coreForm.shareMessenger,
                    telegram: coreForm.shareTelegram,
                },
                share: {
                    ...(current?.share || {
                        enabledChannels: ['whatsapp', 'facebook', 'messenger', 'telegram', 'copy_link'],
                        templates: {},
                        utm: { enabled: true, source: 'campusway', medium: 'social', campaign: 'news_share' },
                    }),
                    enabledChannels: normalizedEnabledChannels,
                    shareButtons: {
                        whatsapp: coreForm.btnWhatsapp,
                        facebook: coreForm.btnFacebook,
                        messenger: coreForm.btnMessenger,
                        telegram: coreForm.btnTelegram,
                        copyLink: coreForm.btnCopyLink,
                        copyText: false,
                    },
                },
            };
            return (await adminUpdateNewsSettings(payload)).data;
        },
        onSuccess: () => {
            toast.success('Settings saved');
            queryClient.invalidateQueries({ queryKey: ['adminNewsSettings'] });
            queryClient.invalidateQueries({ queryKey: ['adminNewsList'] });
            queryClient.invalidateQueries({ queryKey: ['newsSettings'] });
            queryClient.invalidateQueries({ queryKey: ['newsList'] });
            queryClient.invalidateQueries({ queryKey: ['newsDetail'] });
            queryClient.invalidateQueries({ queryKey: ['home'] });
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || 'Save failed'),
    });

    function onSave(event: FormEvent) {
        event.preventDefault();
        saveCoreMutation.mutate();
    }

    async function onUploadMedia(field: MediaFieldKey, file?: File | null) {
        if (!file) return;
        setUploadingField(field);
        try {
            const result = await adminNewsV2UploadMedia(file, { altText: field, isDefaultBanner: field === 'defaultBannerUrl' });
            const mediaUrl = extractUploadUrl(result.data);
            if (!mediaUrl) throw new Error('Upload returned empty URL');
            setCoreForm((prev) => ({ ...prev, [field]: mediaUrl }));
            toast.success('Uploaded');
        } catch (error: unknown) {
            toast.error(extractUploadError(error));
        } finally {
            setUploadingField(null);
        }
    }

    const patch = (updates: Partial<CoreFormState>) => setCoreForm((prev) => ({ ...prev, ...updates }));

    return (
        <div className="space-y-5">
            {/* ── Tab Navigation ── */}
            <div className="flex gap-2 overflow-x-auto pb-1">
                <TabButton icon={Paintbrush} label="Appearance" active={panel === 'appearance'} onClick={() => setPanel('appearance')} />
                <TabButton icon={Workflow} label="Workflow & Extraction" active={panel === 'workflow'} onClick={() => setPanel('workflow')} />
                <TabButton icon={Bot} label="AI Engine" active={panel === 'ai'} onClick={() => setPanel('ai')} />
                <TabButton icon={Share2} label="Share & Social" active={panel === 'share'} onClick={() => setPanel('share')} />
            </div>

            <form onSubmit={onSave} className="space-y-5">
                {/* ═══════════════ APPEARANCE ═══════════════ */}
                {panel === 'appearance' && (
                    <SettingsCard title="Page Branding" subtitle="Configure how the news page looks to visitors.">
                        <div className="grid gap-4 md:grid-cols-2">
                            <InputField label="Page Title" value={coreForm.pageTitle} onChange={(v) => patch({ pageTitle: v })} placeholder="CampusWay News" />
                            <InputField label="Page Subtitle" value={coreForm.pageSubtitle} onChange={(v) => patch({ pageSubtitle: v })} placeholder="Latest updates" />
                        </div>
                        <Divider label="Default Images" />
                        <div className="grid gap-4 md:grid-cols-2">
                            <MediaField label="Header Banner" value={coreForm.headerBannerUrl} onChange={(v) => patch({ headerBannerUrl: v })} uploading={uploadingField === 'headerBannerUrl'} onUpload={(f) => onUploadMedia('headerBannerUrl', f)} />
                            <MediaField label="Default Article Banner" value={coreForm.defaultBannerUrl} onChange={(v) => patch({ defaultBannerUrl: v })} uploading={uploadingField === 'defaultBannerUrl'} onUpload={(f) => onUploadMedia('defaultBannerUrl', f)} />
                            <MediaField label="Default Thumbnail" value={coreForm.defaultThumbUrl} onChange={(v) => patch({ defaultThumbUrl: v })} uploading={uploadingField === 'defaultThumbUrl'} onUpload={(f) => onUploadMedia('defaultThumbUrl', f)} />
                            <MediaField label="Default Source Icon" value={coreForm.defaultSourceIconUrl} onChange={(v) => patch({ defaultSourceIconUrl: v })} uploading={uploadingField === 'defaultSourceIconUrl'} onUpload={(f) => onUploadMedia('defaultSourceIconUrl', f)} />
                        </div>
                    </SettingsCard>
                )}

                {/* ═══════════════ WORKFLOW & EXTRACTION ═══════════════ */}
                {panel === 'workflow' && (
                    <>
                        <SettingsCard title="Article Extraction" subtitle="How full article content is fetched from RSS sources." icon={Rss}>
                            <ToggleRow label="Enable Full Article Extraction" hint="When enabled, the system attempts to fetch the complete article body beyond the RSS snippet." checked={coreForm.fetchFullArticleEnabled} onChange={(v) => patch({ fetchFullArticleEnabled: v })} />
                            {coreForm.fetchFullArticleEnabled && (
                                <>
                                    <div className="space-y-1.5">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Extraction Method</span>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <RadioCard value="rss_content" current={coreForm.fullArticleFetchMode} onChange={(v) => patch({ fullArticleFetchMode: v as CoreFormState['fullArticleFetchMode'] })} label="RSS Content Only" desc="Use content:encoded from the feed" />
                                            <RadioCard value="readability_scrape" current={coreForm.fullArticleFetchMode} onChange={(v) => patch({ fullArticleFetchMode: v as CoreFormState['fullArticleFetchMode'] })} label="Readability Scrape" desc="Fetch & parse the original page" />
                                            <RadioCard value="both" current={coreForm.fullArticleFetchMode} onChange={(v) => patch({ fullArticleFetchMode: v as CoreFormState['fullArticleFetchMode'] })} label="Both (RSS → Scrape)" desc="Try RSS first, scrape as fallback" />
                                            <RadioCard value="ai_extract" current={coreForm.fullArticleFetchMode} onChange={(v) => patch({ fullArticleFetchMode: v as CoreFormState['fullArticleFetchMode'] })} label="AI-Powered Extraction" desc="Use AI API to extract & structure the full article" />
                                        </div>
                                    </div>
                                    {coreForm.fullArticleFetchMode !== 'ai_extract' && (
                                        <ToggleRow label="AI Extraction Fallback" hint="If standard extraction fails or returns incomplete content, use AI API to extract the full article." checked={coreForm.aiExtractionFallback} onChange={(v) => patch({ aiExtractionFallback: v })} />
                                    )}
                                    {(coreForm.fullArticleFetchMode === 'ai_extract' || coreForm.aiExtractionFallback) && !coreForm.aiApiProviderUrl && (
                                        <HintBanner tone="warn">AI extraction requires an API provider URL and key. Configure them in the AI Engine tab.</HintBanner>
                                    )}
                                    <ToggleRow label="Open Original When Extraction Incomplete" hint="If the extracted content is too short, the reader will be redirected to the original article." checked={coreForm.workflowOpenOriginalWhenExtractionIncomplete} onChange={(v) => patch({ workflowOpenOriginalWhenExtractionIncomplete: v })} />
                                </>
                            )}
                        </SettingsCard>

                        <SettingsCard title="Workflow Defaults" subtitle="Control how incoming articles are processed." icon={Workflow}>
                            <ToggleRow label="Auto-Draft from RSS" hint="Automatically create draft articles from new RSS items." checked={coreForm.workflowAutoDraftFromRSS} onChange={(v) => patch({ workflowAutoDraftFromRSS: v })} />
                            <ToggleRow label="Allow Scheduling" hint="Enable scheduled publishing for articles." checked={coreForm.workflowAllowScheduling} onChange={(v) => patch({ workflowAllowScheduling: v })} />
                            <div className="grid gap-4 md:grid-cols-2">
                                <InputField label="Auto-Expire Days" type="number" value={coreForm.workflowAutoExpireDays} onChange={(v) => patch({ workflowAutoExpireDays: v })} placeholder="Leave empty to disable" hint="Published articles older than this will be archived." />
                                <InputField label="Trash Retention Days" type="number" value={coreForm.newsTrashRetentionDays} onChange={(v) => patch({ newsTrashRetentionDays: v })} placeholder="30" hint="Deleted articles are permanently purged after this." />
                            </div>
                        </SettingsCard>
                    </>
                )}

                {/* ═══════════════ AI ENGINE ═══════════════ */}
                {panel === 'ai' && (
                    <>
                        <SettingsCard title="AI Draft Engine" subtitle="Configure AI-powered article rewriting, translation, and enrichment." icon={Bot}>
                            <ToggleRow label="Enable AI Drafting" hint="When enabled, incoming RSS articles are automatically rewritten by AI before review." checked={coreForm.aiEnabled} onChange={(v) => patch({ aiEnabled: v })} />
                            {coreForm.aiEnabled && (
                                <>
                                    <Divider label="API Configuration" />
                                    <div className="space-y-3">
                                        <InputField label="API Provider URL" value={coreForm.aiApiProviderUrl} onChange={(v) => patch({ aiApiProviderUrl: v })} placeholder="https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent" hint="Gemini, OpenAI, or any compatible endpoint." />
                                        <div className="space-y-1.5">
                                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">API Key</span>
                                            <div className="relative">
                                                <input
                                                    className="input-field pr-10"
                                                    type={showApiKey ? 'text' : 'password'}
                                                    placeholder="Enter API Key"
                                                    value={coreForm.aiApiKey}
                                                    onChange={(e) => patch({ aiApiKey: e.target.value })}
                                                />
                                                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition">
                                                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <Divider label="Generation Settings" />
                                    <div className="grid gap-4 md:grid-cols-3">
                                        <SelectField label="Language" value={coreForm.aiLanguage} onChange={(v) => patch({ aiLanguage: v as CoreFormState['aiLanguage'] })} options={[{ value: 'bn', label: 'বাংলা (Bengali)' }, { value: 'en', label: 'English' }, { value: 'mixed', label: 'Mixed' }]} />
                                        <SelectField label="Style Preset" value={coreForm.aiStylePreset} onChange={(v) => patch({ aiStylePreset: v as CoreFormState['aiStylePreset'] })} options={[{ value: 'short', label: 'Short & Concise' }, { value: 'standard', label: 'Standard' }, { value: 'detailed', label: 'Detailed & Long' }]} />
                                        <InputField label="Max Length (chars)" type="number" value={String(coreForm.aiMaxLength)} onChange={(v) => patch({ aiMaxLength: Number(v) })} placeholder="1200" />
                                    </div>

                                    <Divider label="AI Automation" />
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <ToggleRow label="Auto-Tagging" hint="AI generates relevant tags." checked={coreForm.aiAutoTagging} onChange={(v) => patch({ aiAutoTagging: v })} compact />
                                        <ToggleRow label="Auto-Category" hint="AI assigns a category." checked={coreForm.aiAutoCategory} onChange={(v) => patch({ aiAutoCategory: v })} compact />
                                        <ToggleRow label="Auto-Summary" hint="AI writes a short summary." checked={coreForm.aiAutoSummary} onChange={(v) => patch({ aiAutoSummary: v })} compact />
                                    </div>

                                    <Divider label="Safety & Quality" />
                                    <ToggleRow label="Strict No-Hallucination Mode" hint="Forces the AI to only use information from the source text. Recommended." checked={coreForm.aiStrictNoHallucination} onChange={(v) => patch({ aiStrictNoHallucination: v })} />
                                    <SelectField label="Duplicate Sensitivity" value={coreForm.aiDuplicateSensitivity} onChange={(v) => patch({ aiDuplicateSensitivity: v as CoreFormState['aiDuplicateSensitivity'] })} options={[{ value: 'strict', label: 'Strict — catches near-duplicates' }, { value: 'medium', label: 'Medium — balanced' }, { value: 'loose', label: 'Loose — only exact matches' }]} />
                                    <HintBanner tone="info">Duplicate articles are always routed to the Duplicate Queue for admin review. They are never auto-removed.</HintBanner>

                                    <Divider label="Custom Prompt" />
                                    <div className="space-y-1.5">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Prompt Template</span>
                                        <textarea
                                            className="input-field min-h-[140px] font-mono text-xs"
                                            placeholder="Use placeholders: {source_text}, {source_url}, {language}, {style}, {max_length}"
                                            value={coreForm.aiPromptTemplate}
                                            onChange={(e) => patch({ aiPromptTemplate: e.target.value })}
                                        />
                                        <p className="text-[11px] text-slate-500 dark:text-slate-500">Leave empty to use the default system prompt. Custom prompts override the built-in instructions.</p>
                                    </div>
                                </>
                            )}
                        </SettingsCard>
                    </>
                )}

                {/* ═══════════════ SHARE & SOCIAL ═══════════════ */}
                {panel === 'share' && (
                    <SettingsCard title="Share & Social" subtitle="Configure share button visibility and message templates." icon={Share2}>
                        <Divider label="Share Buttons" />
                        <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-5">
                            <ToggleChip label="WhatsApp" checked={coreForm.btnWhatsapp} onChange={(v) => patch({ btnWhatsapp: v })} />
                            <ToggleChip label="Facebook" checked={coreForm.btnFacebook} onChange={(v) => patch({ btnFacebook: v })} />
                            <ToggleChip label="Messenger" checked={coreForm.btnMessenger} onChange={(v) => patch({ btnMessenger: v })} />
                            <ToggleChip label="Telegram" checked={coreForm.btnTelegram} onChange={(v) => patch({ btnTelegram: v })} />
                            <ToggleChip label="Copy Link" checked={coreForm.btnCopyLink} onChange={(v) => patch({ btnCopyLink: v })} />
                        </div>

                        <Divider label="Share Templates" />
                        <p className="text-[11px] text-slate-500 dark:text-slate-500">
                            Available placeholders: <code className="text-cyan-400">{'{title}'}</code>, <code className="text-cyan-400">{'{summary}'}</code>, <code className="text-cyan-400">{'{public_url}'}</code>, <code className="text-cyan-400">{'{source_name}'}</code>
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextareaField label="WhatsApp" value={coreForm.shareWhatsapp} onChange={(v) => patch({ shareWhatsapp: v })} rows={2} />
                            <TextareaField label="Facebook" value={coreForm.shareFacebook} onChange={(v) => patch({ shareFacebook: v })} rows={2} />
                            <TextareaField label="Messenger" value={coreForm.shareMessenger} onChange={(v) => patch({ shareMessenger: v })} rows={2} />
                            <TextareaField label="Telegram" value={coreForm.shareTelegram} onChange={(v) => patch({ shareTelegram: v })} rows={2} />
                        </div>
                    </SettingsCard>
                )}

                {/* ── Save Bar ── */}
                <div className="sticky bottom-0 z-10 flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/80 px-5 py-3 shadow-lg backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80">
                    <button type="submit" className="btn-primary" disabled={saveCoreMutation.isPending}>
                        {saveCoreMutation.isPending ? 'Saving…' : 'Save Settings'}
                    </button>
                    <button type="button" className="btn-outline" onClick={() => settingsQuery.refetch()}>
                        Reload
                    </button>
                    {saveCoreMutation.isSuccess && <span className="text-xs text-emerald-500">✓ Saved</span>}
                </div>
            </form>
        </div>
    );
}

// ─── Reusable Sub-Components ─────────────────────────────────────────────────

function TabButton({ icon: Icon, label, active, onClick }: { icon: typeof Paintbrush; label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${active
                ? 'bg-cyan-500/15 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.08)] border border-cyan-500/30'
                : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
        >
            <Icon className="h-4 w-4" />
            {label}
        </button>
    );
}

function SettingsCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon?: typeof Bot; children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-5 space-y-5 dark:border-slate-800/60 dark:bg-slate-950/50">
            <div className="flex items-start gap-3">
                {Icon && (
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-2.5">
                        <Icon className="h-5 w-5 text-cyan-400" />
                    </div>
                )}
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

function Divider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 pt-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">{label}</span>
            <div className="flex-1 border-t border-slate-200/60 dark:border-slate-800/60" />
        </div>
    );
}

function InputField({ label, value, onChange, placeholder, hint, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; type?: string }) {
    return (
        <label className="space-y-1.5 block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
            <input className="input-field" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
            {hint && <p className="text-[11px] text-slate-500 dark:text-slate-500">{hint}</p>}
        </label>
    );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
    return (
        <label className="space-y-1.5 block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
            <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
                {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </label>
    );
}

function TextareaField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
    return (
        <label className="space-y-1.5 block">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
            <textarea className="input-field font-mono text-xs" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
    );
}

function ToggleRow({ label, hint, checked, onChange, compact }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; compact?: boolean }) {
    return (
        <label className={`flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-slate-50/70 px-4 dark:border-slate-800/50 dark:bg-slate-900/40 ${compact ? 'py-2.5' : 'py-3'}`}>
            <div className="min-w-0">
                <span className={`font-medium text-slate-800 dark:text-slate-100 ${compact ? 'text-xs' : 'text-sm'}`}>{label}</span>
                {hint && <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5 leading-tight">{hint}</p>}
            </div>
            <div className="relative shrink-0">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
                <div className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-cyan-500 dark:bg-slate-700 peer-checked:dark:bg-cyan-500 cursor-pointer" onClick={() => onChange(!checked)} />
                <div className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
            </div>
        </label>
    );
}

function ToggleChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${checked
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-200/60 text-slate-500 hover:border-slate-400/40 dark:border-slate-800/60 dark:text-slate-400'
                }`}
        >
            {label}
        </button>
    );
}

function RadioCard({ value, current, onChange, label, desc }: { value: string; current: string; onChange: (v: string) => void; label: string; desc: string }) {
    const active = value === current;
    return (
        <button
            type="button"
            onClick={() => onChange(value)}
            className={`rounded-xl border p-3 text-left transition ${active
                ? 'border-cyan-500/40 bg-cyan-500/10 shadow-[0_0_16px_rgba(6,182,212,0.06)]'
                : 'border-slate-200/60 hover:border-slate-400/40 dark:border-slate-800/60'
                }`}
        >
            <div className="flex items-center gap-2">
                <div className={`h-3.5 w-3.5 rounded-full border-2 transition ${active ? 'border-cyan-400 bg-cyan-400' : 'border-slate-400 dark:border-slate-600'}`} />
                <span className={`text-sm font-medium ${active ? 'text-cyan-300' : 'text-slate-700 dark:text-slate-200'}`}>{label}</span>
            </div>
            <p className="mt-1 pl-5.5 text-[11px] text-slate-500 dark:text-slate-500">{desc}</p>
        </button>
    );
}

function HintBanner({ tone, children }: { tone: 'warn' | 'info'; children: React.ReactNode }) {
    const styles = tone === 'warn'
        ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
        : 'border-cyan-400/20 bg-cyan-500/5 text-cyan-300';
    return (
        <div className={`rounded-xl border px-4 py-2.5 text-xs ${styles}`}>
            {children}
        </div>
    );
}

function MediaField({ label, value, onChange, onUpload, uploading }: { label: string; value: string; onChange: (v: string) => void; onUpload: (f?: File | null) => void; uploading: boolean }) {
    return (
        <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
            <input className="input-field" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Paste URL or upload" />
            <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300/60 px-3 py-1.5 text-xs text-slate-600 transition hover:border-cyan-500/40 dark:border-slate-700/60 dark:text-slate-300">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { onUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                    {uploading ? 'Uploading…' : 'Upload'}
                </label>
                {value && <img src={value} alt={label} className="h-9 w-14 rounded-md border border-slate-300/40 object-cover dark:border-slate-700/40" />}
            </div>
        </div>
    );
}
