import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CalendarClock, CircleOff, GitMerge, Sparkles, X, Newspaper, Image as ImageIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import SimpleRichTextEditor from '../components/SimpleRichTextEditor';
import { getStudentGroups } from '../../../api/adminStudentApi';
import { listProviders, listTemplates, type NotificationProvider, type NotificationTemplate } from '../../../api/adminNotificationCampaignApi';
import {
    ApiNews,
    adminNewsV2ApprovePublish,
    adminNewsV2Archive,
    adminNewsV2BulkApprove,
    adminNewsV2BulkReject,
    adminNewsV2ConvertToNotice,
    adminNewsV2CreateItem,
    adminNewsV2DeleteItem,
    adminNewsV2GetItemById,
    adminNewsV2GetItems,
    adminNewsV2MergeDuplicate,
    adminNewsV2MoveToDraft,
    adminNewsV2PublishNow,
    adminNewsV2PublishSend,
    adminNewsV2PublishAnyway,
    adminNewsV2Reject,
    adminNewsV2Schedule,
    adminNewsV2AiCheckItem,
    adminNewsV2SubmitReview,
    adminNewsV2UpdateItem,
    adminNewsV2GetSources,
    adminNewsV2RestoreItem,
    adminNewsV2PurgeItem,
    adminNewsV2UploadMedia,
    SensitiveActionProof,
} from '../../../services/api';
import { buildMediaUrl } from '../../../utils/mediaUrl';
import { extractUploadUrl, extractUploadError } from '../../../components/common/CompressedImageInput';

interface Props {
    status: ApiNews['status'] | 'all';
    title: string;
    autoCreate?: boolean;
    aiSelectedOnly?: boolean;
    initialEditId?: string;
}

type DialogMode =
    | 'approve'
    | 'publish'
    | 'reject'
    | 'schedule'
    | 'publish-send'
    | 'merge'
    | 'convert-notice';

interface ActionDialogState {
    mode: DialogMode;
    item: ApiNews;
}

const EMPTY_ARTICLE: Partial<ApiNews> = {
    title: '',
    shortDescription: '',
    content: '',
    category: 'General',
    tags: [],
    publicTags: [],
    status: 'draft',
    isPublished: false,
    featuredImage: '',
    coverImage: '',
    coverImageSource: 'default',
    sourceType: 'manual',
    originalLink: '',
    displayType: 'news',
    isFeatured: false,
    priority: 'normal',
    aiEnrichment: {
        shortSummary: '',
        detailedExplanation: '',
        studentFriendlyExplanation: '',
        keyPoints: [],
        smsText: '',
        emailSubject: '',
        emailBody: '',
    },
    seoTitle: '',
    seoDescription: '',
    classification: {
        primaryCategory: 'General',
        tags: [],
        groupIds: [],
        universityIds: [],
        clusterIds: [],
    },
};

const LIST_STATUS_OPTIONS: Array<{ status: ApiNews['status'] | 'all'; label: string }> = [
    { status: 'pending_review', label: 'Items to Review' },
    { status: 'duplicate_review', label: 'Possible Duplicates' },
    { status: 'draft', label: 'Saved Drafts' },
    { status: 'published', label: 'Published News' },
    { status: 'scheduled', label: 'Scheduled' },
    { status: 'rejected', label: 'Rejected' },
    { status: 'archived', label: 'Archived' },
    { status: 'trash', label: 'Trash' },
];

export default function AdminNewsItemsSection({
    status,
    title,
    autoCreate = false,
    aiSelectedOnly = false,
    initialEditId,
}: Props) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [editing, setEditing] = useState<Partial<ApiNews> | null>(null);
    const editorRef = useRef<HTMLDivElement | null>(null);
    const [tagInput, setTagInput] = useState('');
    const [sourceId, setSourceId] = useState('');
    const [aiOnly, setAiOnly] = useState(false);
    const [duplicateFlagged, setDuplicateFlagged] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [page, setPage] = useState(1);
    const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
    const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
    const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
    const [dialogReason, setDialogReason] = useState('');
    const [dialogScheduleAt, setDialogScheduleAt] = useState(toLocalDateTimeValue(new Date(Date.now() + 3_600_000)));
    const [dialogTarget, setDialogTarget] = useState<'all' | 'groups' | 'students'>('all');
    const [dialogTargetIdsInput, setDialogTargetIdsInput] = useState('');
    const [dialogTargetNewsId, setDialogTargetNewsId] = useState('');
    const [dialogMergeContent, setDialogMergeContent] = useState(true);
    const [dialogChannels, setDialogChannels] = useState<Array<'sms' | 'email'>>(['email']);
    const [dialogAudienceType, setDialogAudienceType] = useState<'all' | 'group' | 'filter' | 'manual'>('all');
    const [dialogAudienceGroupId, setDialogAudienceGroupId] = useState('');
    const [dialogManualStudentIdsInput, setDialogManualStudentIdsInput] = useState('');
    const [dialogFilterPlanCodesInput, setDialogFilterPlanCodesInput] = useState('');
    const [dialogFilterInstitutionNamesInput, setDialogFilterInstitutionNamesInput] = useState('');
    const [dialogFilterGroupIdsInput, setDialogFilterGroupIdsInput] = useState('');
    const [dialogFilterScoreMin, setDialogFilterScoreMin] = useState('');
    const [dialogFilterScoreMax, setDialogFilterScoreMax] = useState('');
    const [dialogTemplateKey, setDialogTemplateKey] = useState('');
    const [dialogCustomSubject, setDialogCustomSubject] = useState('');
    const [dialogCustomBody, setDialogCustomBody] = useState('');
    const [dialogRecipientMode, setDialogRecipientMode] = useState<'student' | 'guardian' | 'both'>('student');
    const [dialogGuardianTargeted, setDialogGuardianTargeted] = useState(false);
    const [dialogConvertToNotice, setDialogConvertToNotice] = useState(false);
    const [dialogCurrentPassword, setDialogCurrentPassword] = useState('');
    const [dialogOtpCode, setDialogOtpCode] = useState('');
    const [dialogOverrideConfirmed, setDialogOverrideConfirmed] = useState(false);

    const listFilters = useMemo(
        () => ({
            q: search,
            sourceId,
            aiOnly,
            aiSelected: aiSelectedOnly,
            duplicateFlagged,
            page,
            limit: 12,
        }),
        [search, sourceId, aiOnly, aiSelectedOnly, duplicateFlagged, page]
    );

    const itemsQuery = useQuery({
        queryKey: ['adminNewsList', status, listFilters],
        queryFn: async () =>
            (
                await adminNewsV2GetItems({
                    ...(status === 'all' ? {} : { status }),
                    ...listFilters,
                })
            ).data,
    });
    const editItemQuery = useQuery({
        queryKey: ['adminNewsItem', initialEditId],
        queryFn: async () => {
            if (!initialEditId) return null;
            const response = await adminNewsV2GetItemById(initialEditId);
            return response.data?.item || null;
        },
        enabled: Boolean(initialEditId),
        staleTime: 30_000,
    });
    const sourcesQuery = useQuery({
        queryKey: ['adminRssSources'],
        queryFn: async () => (await adminNewsV2GetSources()).data,
    });
    const groupsQuery = useQuery({
        queryKey: ['student-groups', 'news-publish-send'],
        queryFn: async () => await getStudentGroups(),
    });
    const templatesQuery = useQuery({
        queryKey: ['campaign-templates', 'news-publish-send'],
        queryFn: async () => await listTemplates({ limit: 100 }),
    });
    const providersQuery = useQuery({
        queryKey: ['notification-providers', 'news-publish-send'],
        queryFn: async () => await listProviders(),
    });

    const saveMutation = useMutation({
        mutationFn: async (payload: Partial<ApiNews>) => {
            if (payload._id) {
                return (await adminNewsV2UpdateItem(payload._id, payload)).data;
            }
            return (await adminNewsV2CreateItem(payload)).data;
        },
        onSuccess: () => {
            toast.success('Saved');
            setEditing(null);
            invalidateAll(queryClient);
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || 'Save failed'),
    });

    const actionMutation = useMutation({
        mutationFn: async (payload: {
            type: string;
            ids?: string[];
            id?: string;
            reason?: string;
            scheduleAt?: string;
            targetNewsId?: string;
            mergeContent?: boolean;
            applyToDraft?: boolean;
            checkOnly?: boolean;
            proof?: SensitiveActionProof;
            channels?: Array<'sms' | 'email'>;
            convertToNotice?: boolean;
            target?: 'all' | 'groups' | 'students';
            targetIds?: string[];
            templateKey?: string;
            customSubject?: string;
            customBody?: string;
            audienceType?: 'all' | 'group' | 'filter' | 'manual';
            audienceGroupId?: string;
            audienceFilters?: Record<string, unknown>;
            manualStudentIds?: string[];
            guardianTargeted?: boolean;
            recipientMode?: 'student' | 'guardian' | 'both';
        }) => {
            if (payload.type === 'approve' && payload.id) return (await adminNewsV2ApprovePublish(payload.id)).data;
            if (payload.type === 'reject' && payload.id) return (await adminNewsV2Reject(payload.id, payload.reason || '')).data;
            if (payload.type === 'publish' && payload.id) return (await adminNewsV2PublishNow(payload.id)).data;
            if (payload.type === 'publish-send' && payload.id) {
                return (await adminNewsV2PublishSend(payload.id, {
                    channels: payload.channels,
                    templateKey: payload.templateKey,
                    customSubject: payload.customSubject,
                    customBody: payload.customBody,
                    audienceType: payload.audienceType,
                    audienceGroupId: payload.audienceGroupId,
                    audienceFilters: payload.audienceFilters,
                    manualStudentIds: payload.manualStudentIds,
                    guardianTargeted: payload.guardianTargeted,
                    recipientMode: payload.recipientMode,
                    convertToNotice: payload.convertToNotice,
                    target: payload.target,
                    targetIds: payload.targetIds,
                    reason: payload.reason,
                }, payload.proof)).data;
            }
            if (payload.type === 'publish-anyway' && payload.id) return (await adminNewsV2PublishAnyway(payload.id)).data;
            if (payload.type === 'move-draft' && payload.id) return (await adminNewsV2MoveToDraft(payload.id)).data;
            if (payload.type === 'archive' && payload.id) return (await adminNewsV2Archive(payload.id)).data;
            if (payload.type === 'trash' && payload.id) return (await adminNewsV2DeleteItem(payload.id)).data;
            if (payload.type === 'restore' && payload.id) return (await adminNewsV2RestoreItem(payload.id)).data;
            if (payload.type === 'purge' && payload.id) return (await adminNewsV2PurgeItem(payload.id)).data;
            if (payload.type === 'convert-notice' && payload.id) {
                return (await adminNewsV2ConvertToNotice(payload.id, {
                    target: payload.target,
                    targetIds: payload.targetIds,
                })).data;
            }
            if (payload.type === 'merge' && payload.id && payload.targetNewsId) {
                return (await adminNewsV2MergeDuplicate(payload.id, { targetNewsId: payload.targetNewsId, mergeContent: payload.mergeContent !== false })).data;
            }
            if (payload.type === 'toggle-ai-selected' && payload.id) {
                const current = items.find((item) => item._id === payload.id);
                const currentAiSelected = Boolean(current?.aiSelected ?? current?.isAiSelected);
                return (await adminNewsV2UpdateItem(payload.id, { ...current, aiSelected: !currentAiSelected })).data;
            }
            if (payload.type === 'ai-check' && payload.id) {
                return (await adminNewsV2AiCheckItem(payload.id, {
                    applyToDraft: payload.applyToDraft !== false,
                    checkOnly: payload.checkOnly === true,
                })).data;
            }
            if (payload.type === 'submit-review' && payload.id) return (await adminNewsV2SubmitReview(payload.id)).data;
            if (payload.type === 'schedule' && payload.id && payload.scheduleAt) return (await adminNewsV2Schedule(payload.id, payload.scheduleAt)).data;
            if (payload.type === 'bulk-approve' && payload.ids) return (await adminNewsV2BulkApprove(payload.ids)).data;
            if (payload.type === 'bulk-reject' && payload.ids) return (await adminNewsV2BulkReject(payload.ids, payload.reason || '')).data;
            throw new Error('Unsupported action');
        },
        onSuccess: (response: any, payload) => {
            toast.success(response?.message || 'Action completed');
            const warning = String(response?.warning || '').trim();
            if (warning) {
                toast(warning);
            }
            if (payload?.type === 'ai-check' && editing?._id && response?.item?._id === editing._id) {
                setEditing(response.item);
                setTagInput((response.item?.publicTags || response.item?.tags || []).join(', '));
            }
            if (response?.item?._id && editing?._id === response.item._id) {
                setEditing(response.item);
                setTagInput((response.item?.publicTags || response.item?.tags || []).join(', '));
            }
            setSelected([]);
            invalidateAll(queryClient);
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || 'Action failed'),
    });

    const items = itemsQuery.data?.items || [];
    const totalItems = itemsQuery.data?.total || 0;
    const totalPages = Math.max(1, itemsQuery.data?.pages || 1);
    const selectedCount = selected.length;
    const allowBulkModeration = status === 'pending_review' || status === 'duplicate_review' || aiSelectedOnly;
    const selectedAll = useMemo(() => items.length > 0 && selected.length === items.length, [items, selected]);
    const groupOptions = useMemo(
        () => {
            const payload = groupsQuery.data as Record<string, unknown> | undefined;
            if (!payload) return [] as Array<{ _id: string; name: string; type?: string }>;
            const raw = Array.isArray(payload.data)
                ? payload.data
                : Array.isArray(payload.groups)
                    ? payload.groups
                    : [];
            return raw
                .map((entry) => ({
                    _id: String((entry as Record<string, unknown>)._id || ''),
                    name: String((entry as Record<string, unknown>).name || ''),
                    type: String((entry as Record<string, unknown>).type || ''),
                }))
                .filter((entry) => entry._id && entry.name);
        },
        [groupsQuery.data],
    );
    const templateOptions = (templatesQuery.data?.items ?? []) as NotificationTemplate[];
    const providerOptions = (providersQuery.data ?? []) as NotificationProvider[];
    const enabledProviders = providerOptions.filter((provider) => provider.isEnabled);

    useEffect(() => {
        if (!autoCreate) return;
        setEditing((prev) => prev || { ...EMPTY_ARTICLE, status: 'draft' });
        setTagInput((prev) => prev || '');
    }, [autoCreate]);

    useEffect(() => {
        setPage(1);
    }, [search, sourceId, aiOnly, aiSelectedOnly, duplicateFlagged, status]);

    useEffect(() => {
        if (!initialEditId || !editItemQuery.data) return;
        setEditing(editItemQuery.data);
        setTagInput((editItemQuery.data.publicTags || editItemQuery.data.tags || []).join(', '));
    }, [initialEditId, editItemQuery.data]);

    useEffect(() => {
        if (!editing) return;
        const timer = window.setTimeout(() => {
            editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
        return () => window.clearTimeout(timer);
    }, [editing?._id]);

    useEffect(() => {
        setSelected((prev) => prev.filter((value) => items.some((item) => item._id === value)));
    }, [items]);

    useEffect(() => {
        setExpandedItemIds((prev) => prev.filter((value) => items.some((item) => item._id === value)));
    }, [items]);

    function toggleSelectAll() {
        if (selectedAll) {
            setSelected([]);
            return;
        }
        setSelected(items.map((item) => item._id));
    }

    async function onEdit(item?: ApiNews) {
        if (!item) {
            setEditing({ ...EMPTY_ARTICLE, status: 'draft' });
            setTagInput('');
            return;
        }

        if (!item._id) {
            setEditing(item);
            setTagInput((item.publicTags || item.tags || []).join(', '));
            return;
        }

        try {
            const response = await adminNewsV2GetItemById(item._id);
            const fullItem = response.data?.item || item;
            setEditing(fullItem);
            setTagInput((fullItem.publicTags || fullItem.tags || []).join(', '));
        } catch {
            setEditing(item);
            setTagInput((item.publicTags || item.tags || []).join(', '));
            toast.error('Unable to load full news details. Editing with available data.');
        }
    }

    function updateAiEnrichmentField<K extends keyof NonNullable<ApiNews['aiEnrichment']>>(key: K, value: NonNullable<ApiNews['aiEnrichment']>[K]) {
        setEditing((prev) => ({
            ...(prev || {}),
            aiEnrichment: {
                ...(prev?.aiEnrichment || {}),
                [key]: value,
            },
        }));
    }

    function parseCommaList(value: string): string[] {
        return value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }

    function buildAudienceFilters(): Record<string, unknown> | undefined {
        if (dialogAudienceType !== 'filter') return undefined;
        const filters: Record<string, unknown> = {};
        const planCodes = parseCommaList(dialogFilterPlanCodesInput);
        const institutionNames = parseCommaList(dialogFilterInstitutionNamesInput);
        const groupIds = parseCommaList(dialogFilterGroupIdsInput);
        const scoreMin = Number(dialogFilterScoreMin);
        const scoreMax = Number(dialogFilterScoreMax);
        if (planCodes.length > 0) filters.planCodes = planCodes;
        if (institutionNames.length > 0) filters.institutionNames = institutionNames;
        if (groupIds.length > 0) filters.groupIds = groupIds;
        if (Number.isFinite(scoreMin) || Number.isFinite(scoreMax)) {
            filters.profileScoreRange = {};
            if (Number.isFinite(scoreMin)) {
                (filters.profileScoreRange as Record<string, unknown>).min = scoreMin;
            }
            if (Number.isFinite(scoreMax)) {
                (filters.profileScoreRange as Record<string, unknown>).max = scoreMax;
            }
        }
        return Object.keys(filters).length > 0 ? filters : undefined;
    }

    function onSave() {
        if (!editing) return;
        let coverImage = String(editing.coverImageUrl || editing.coverImage || editing.featuredImage || '').trim();
        let coverImageSource = (editing.coverImageSource || (coverImage ? 'admin' : 'default')) as 'rss' | 'admin' | 'default';
        if (coverImageSource === 'default') {
            coverImage = '';
        }
        const payload: Partial<ApiNews> = {
            ...editing,
            tags: parseCommaList(tagInput),
            publicTags: parseCommaList(tagInput),
            shortSummary: String(editing.shortSummary || editing.shortDescription || '').trim() || String(editing.shortDescription || '').trim(),
            coverImageUrl: coverImage,
            coverImage,
            featuredImage: coverImage,
            coverImageSource,
            seoTitle: String(editing.seoTitle || '').trim(),
            seoDescription: String(editing.seoDescription || '').trim(),
            ogTitle: String((editing as any).ogTitle || '').trim(),
            ogDescription: String((editing as any).ogDescription || '').trim(),
            ogImage: String((editing as any).ogImage || '').trim(),
            aiEnrichment: {
                ...(editing.aiEnrichment || {}),
                shortSummary: String(editing.aiEnrichment?.shortSummary || editing.shortSummary || editing.shortDescription || '').trim(),
                keyPoints: Array.isArray(editing.aiEnrichment?.keyPoints) ? editing.aiEnrichment?.keyPoints : [],
            },
            classification: {
                ...(editing.classification || {}),
                primaryCategory: String(editing.classification?.primaryCategory || editing.category || '').trim() || String(editing.category || ''),
                tags: parseCommaList(tagInput),
            },
        };
        saveMutation.mutate(payload);
    }

    function closeActionDialog() {
        setActionDialog(null);
        setDialogReason('');
        setDialogScheduleAt(toLocalDateTimeValue(new Date(Date.now() + 3_600_000)));
        setDialogTarget('all');
        setDialogTargetIdsInput('');
        setDialogTargetNewsId('');
        setDialogMergeContent(true);
        setDialogChannels(['email']);
        setDialogAudienceType('all');
        setDialogAudienceGroupId('');
        setDialogManualStudentIdsInput('');
        setDialogFilterPlanCodesInput('');
        setDialogFilterInstitutionNamesInput('');
        setDialogFilterGroupIdsInput('');
        setDialogFilterScoreMin('');
        setDialogFilterScoreMax('');
        setDialogTemplateKey('');
        setDialogCustomSubject('');
        setDialogCustomBody('');
        setDialogRecipientMode('student');
        setDialogGuardianTargeted(false);
        setDialogConvertToNotice(false);
        setDialogCurrentPassword('');
        setDialogOtpCode('');
        setDialogOverrideConfirmed(false);
    }

    function openActionDialog(mode: DialogMode, item: ApiNews) {
        setActionDialog({ mode, item });
        setDialogReason(mode === 'reject' ? 'Rejected by admin' : mode === 'publish-send' ? 'news_publish_send' : '');
        setDialogScheduleAt(toLocalDateTimeValue(new Date(Date.now() + 3_600_000)));
        setDialogTarget('all');
        setDialogTargetIdsInput('');
        setDialogTargetNewsId(mergeTargetId || '');
        setDialogMergeContent(true);
        const lastChannel = item.deliveryMeta?.lastChannel;
        setDialogChannels(lastChannel === 'sms' ? ['sms'] : lastChannel === 'both' ? ['sms', 'email'] : ['email']);
        setDialogAudienceType('all');
        setDialogAudienceGroupId('');
        setDialogManualStudentIdsInput('');
        setDialogFilterPlanCodesInput('');
        setDialogFilterInstitutionNamesInput('');
        setDialogFilterGroupIdsInput('');
        setDialogFilterScoreMin('');
        setDialogFilterScoreMax('');
        setDialogTemplateKey('');
        setDialogCustomSubject(String(item.aiEnrichment?.emailSubject || item.title || '').trim());
        setDialogCustomBody(String(item.aiEnrichment?.emailBody || item.aiEnrichment?.studentFriendlyExplanation || item.shortSummary || item.shortDescription || '').trim());
        setDialogRecipientMode('student');
        setDialogGuardianTargeted(false);
        setDialogConvertToNotice(false);
        setDialogCurrentPassword('');
        setDialogOtpCode('');
        setDialogOverrideConfirmed(getPublishWarnings(item).length === 0);
    }

    function parseTargetIds(): string[] {
        return dialogTarget === 'all'
            ? []
            : dialogTargetIdsInput
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
    }

    function submitActionDialog() {
        if (!actionDialog) return;

        const warnings = getPublishWarnings(actionDialog.item);
        if ((actionDialog.mode === 'approve' || actionDialog.mode === 'publish' || actionDialog.mode === 'schedule')
            && warnings.length > 0
            && !dialogOverrideConfirmed) {
            toast.error('Review the warnings and confirm the override before continuing.');
            return;
        }

        if (actionDialog.mode === 'approve') {
            actionMutation.mutate({ type: 'approve', id: actionDialog.item._id });
            closeActionDialog();
            return;
        }

        if (actionDialog.mode === 'publish') {
            actionMutation.mutate({ type: 'publish', id: actionDialog.item._id });
            closeActionDialog();
            return;
        }

        if (actionDialog.mode === 'reject') {
            actionMutation.mutate({
                type: 'reject',
                id: actionDialog.item._id,
                reason: dialogReason.trim() || 'Rejected by admin',
            });
            closeActionDialog();
            return;
        }

        if (actionDialog.mode === 'schedule') {
            const scheduleAt = fromLocalDateTimeValue(dialogScheduleAt);
            if (!scheduleAt) {
                toast.error('Provide a valid publish date and time.');
                return;
            }
            actionMutation.mutate({ type: 'schedule', id: actionDialog.item._id, scheduleAt });
            closeActionDialog();
            return;
        }

        if (actionDialog.mode === 'merge') {
            const targetNewsId = dialogTargetNewsId.trim();
            if (!targetNewsId) {
                toast.error('Enter the target news ID to merge into.');
                return;
            }
            setMergeTargetId(targetNewsId);
            actionMutation.mutate({
                type: 'merge',
                id: actionDialog.item._id,
                targetNewsId,
                mergeContent: dialogMergeContent,
            });
            closeActionDialog();
            return;
        }

        if (actionDialog.mode === 'convert-notice') {
            actionMutation.mutate({
                type: 'convert-notice',
                id: actionDialog.item._id,
                target: dialogTarget,
                targetIds: parseTargetIds(),
            });
            closeActionDialog();
            return;
        }

        if (!dialogReason.trim() || !dialogCurrentPassword.trim()) {
            toast.error('Reason and current password are required for publish + send.');
            return;
        }
        if (dialogChannels.length === 0) {
            toast.error('Select at least one delivery channel.');
            return;
        }
        const missingChannels = dialogChannels.filter((channel) => !enabledProviders.some((provider) => provider.type === channel));
        if (missingChannels.length > 0) {
            toast.error(`No enabled provider is configured for: ${missingChannels.join(', ')}.`);
            return;
        }
        if (dialogAudienceType === 'group' && !dialogAudienceGroupId) {
            toast.error('Select a saved group for group-based delivery.');
            return;
        }
        if (dialogAudienceType === 'manual' && parseCommaList(dialogManualStudentIdsInput).length === 0) {
            toast.error('Enter at least one student ID for manual delivery.');
            return;
        }
        if (dialogAudienceType === 'filter' && !buildAudienceFilters()) {
            toast.error('Add at least one smart filter before sending.');
            return;
        }
        if (!dialogTemplateKey && !dialogCustomBody.trim() && !actionDialog.item.aiEnrichment?.emailBody && !actionDialog.item.shortSummary && !actionDialog.item.shortDescription) {
            toast.error('Provide a delivery template or custom body before sending.');
            return;
        }

        const proof: SensitiveActionProof = {
            currentPassword: dialogCurrentPassword.trim(),
            reason: dialogReason.trim(),
            ...(dialogOtpCode.trim() ? { otpCode: dialogOtpCode.trim() } : {}),
        };
        actionMutation.mutate({
            type: 'publish-send',
            id: actionDialog.item._id,
            proof,
            channels: dialogChannels,
            templateKey: dialogTemplateKey || undefined,
            customSubject: dialogCustomSubject.trim() || undefined,
            customBody: dialogCustomBody.trim() || undefined,
            audienceType: dialogAudienceType,
            audienceGroupId: dialogAudienceType === 'group' ? dialogAudienceGroupId || undefined : undefined,
            audienceFilters: buildAudienceFilters(),
            manualStudentIds: dialogAudienceType === 'manual' ? parseCommaList(dialogManualStudentIdsInput) : undefined,
            guardianTargeted: dialogGuardianTargeted,
            recipientMode: dialogRecipientMode,
            convertToNotice: dialogConvertToNotice,
            target: dialogConvertToNotice ? dialogTarget : undefined,
            targetIds: dialogConvertToNotice ? parseTargetIds() : undefined,
            reason: dialogReason.trim(),
        });
        closeActionDialog();
    }

    async function onUploadCover(file?: File | null) {
        if (!file) return;
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        if (!allowedTypes.includes(file.type) && !file.type.startsWith('image/')) {
            toast.error('Invalid file type. Please upload an image (JPEG, PNG, GIF, WebP, or SVG).');
            return;
        }
        // Validate file size (max 5MB)
        const maxSizeBytes = 5 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 5MB.`);
            return;
        }
        setUploadingCover(true);
        try {
            const result = await adminNewsV2UploadMedia(file, { altText: editing?.title || 'news-cover' });
            const url = extractUploadUrl(result.data);
            if (!url) throw new Error('Upload returned empty URL');
            setEditing((prev) => ({
                ...(prev || {}),
                coverImageUrl: url,
                coverImage: url,
                featuredImage: url,
                coverImageSource: 'admin',
            }));
            toast.success('Cover image uploaded');
        } catch (error: unknown) {
            toast.error(extractUploadError(error, 'Cover upload failed'));
        } finally {
            setUploadingCover(false);
        }
    }

    function toggleItemDetails(itemId: string) {
        setExpandedItemIds((prev) =>
            prev.includes(itemId)
                ? prev.filter((value) => value !== itemId)
                : [...prev, itemId]
        );
    }

    function renderActionButton(label: string, className: string, onClick: () => void) {
        return (
            <button key={label} type="button" className={className} onClick={onClick}>
                {label}
            </button>
        );
    }

    function renderItemActions(item: ApiNews) {
        const isPendingQueue = item.status === 'pending_review';
        const isDuplicateQueue = item.status === 'duplicate_review';
        const isArchivedQueue = item.status === 'archived';
        const isTrashQueue = item.status === 'trash';
        const isExpanded = expandedItemIds.includes(item._id);

        function handlePublishSend() {
            openActionDialog('publish-send', item);
        }

        function handleConvertNotice() {
            openActionDialog('convert-notice', item);
        }

        const primaryActions: Array<ReturnType<typeof renderActionButton>> = [
            renderActionButton(
                'Edit',
                'rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-cyan-500/50 hover:text-cyan-700 dark:border-slate-600 dark:text-slate-200 dark:hover:text-cyan-200',
                () => onEdit(item),
            ),
        ];
        const secondaryActions: Array<ReturnType<typeof renderActionButton>> = [];

        if (isPendingQueue) {
            primaryActions.push(
                renderActionButton(
                    'Approve & Publish',
                    'rounded-xl border border-emerald-600/60 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10',
                    () => openActionDialog('approve', item),
                ),
                renderActionButton(
                    'Save Draft',
                    'rounded-xl border border-indigo-600/60 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/10',
                    () => actionMutation.mutate({ type: 'move-draft', id: item._id }),
                ),
            );
            secondaryActions.push(
                renderActionButton(
                    'Reject',
                    'rounded-xl border border-rose-600/60 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10',
                    () => openActionDialog('reject', item),
                ),
                renderActionButton(
                    Boolean(item.aiSelected ?? item.isAiSelected) ? 'Remove AI flag' : 'Mark for AI review',
                    'rounded-xl border border-violet-600/60 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/10',
                    () => actionMutation.mutate({ type: 'toggle-ai-selected', id: item._id }),
                ),
            );
        } else if (isDuplicateQueue) {
            primaryActions.push(
                renderActionButton(
                    'Merge',
                    'rounded-xl border border-amber-600/60 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10',
                    () => openActionDialog('merge', item),
                ),
                renderActionButton(
                    'Publish Anyway',
                    'rounded-xl border border-emerald-600/60 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/10',
                    () => actionMutation.mutate({ type: 'publish-anyway', id: item._id }),
                ),
            );
            secondaryActions.push(
                renderActionButton(
                    'Keep Draft',
                    'rounded-xl border border-indigo-600/60 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/10',
                    () => actionMutation.mutate({ type: 'move-draft', id: item._id }),
                ),
            );
        } else if (item.status === 'draft') {
            primaryActions.push(
                renderActionButton(
                    'Submit for Review',
                    'rounded-xl border border-indigo-600/60 px-3 py-1.5 text-xs font-medium text-indigo-200 transition hover:bg-indigo-500/10',
                    () => actionMutation.mutate({ type: 'submit-review', id: item._id }),
                ),
                renderActionButton(
                    'Publish',
                    'rounded-xl border border-cyan-600/60 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/10',
                    () => openActionDialog('publish', item),
                ),
            );
            secondaryActions.push(
                renderActionButton(
                    'Schedule',
                    'rounded-xl border border-amber-600/60 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10',
                    () => openActionDialog('schedule', item),
                ),
            );
        } else if (item.status !== 'published') {
            primaryActions.push(
                renderActionButton(
                    'Publish',
                    'rounded-xl border border-cyan-600/60 px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/10',
                    () => openActionDialog('publish', item),
                ),
                renderActionButton(
                    'Schedule',
                    'rounded-xl border border-amber-600/60 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/10',
                    () => openActionDialog('schedule', item),
                ),
            );
        }

        if (!['published', 'archived', 'trash'].includes(item.status)) {
            secondaryActions.push(
                renderActionButton(
                    'Publish + Send',
                    'rounded-xl border border-teal-500/60 px-3 py-1.5 text-xs font-medium text-teal-200 transition hover:bg-teal-500/10',
                    handlePublishSend,
                ),
                renderActionButton(
                    'AI Check',
                    'rounded-xl border border-fuchsia-600/60 px-3 py-1.5 text-xs font-medium text-fuchsia-200 transition hover:bg-fuchsia-500/10',
                    () => actionMutation.mutate({ type: 'ai-check', id: item._id, applyToDraft: true }),
                ),
            );
        }

        if (!isArchivedQueue && !isTrashQueue) {
            secondaryActions.push(
                renderActionButton(
                    'Convert to Notice',
                    'rounded-xl border border-violet-500/60 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/10',
                    handleConvertNotice,
                ),
            );
        }

        if (!isArchivedQueue && !isTrashQueue) {
            secondaryActions.push(
                renderActionButton(
                    'Archive',
                    'rounded-xl border border-slate-500/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-500/10',
                    () => actionMutation.mutate({ type: 'archive', id: item._id }),
                ),
                renderActionButton(
                    'Delete',
                    'rounded-xl border border-rose-500/60 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/10',
                    () => actionMutation.mutate({ type: 'trash', id: item._id }),
                ),
            );
        }

        if (isArchivedQueue) {
            secondaryActions.push(
                renderActionButton(
                    'Delete',
                    'rounded-xl border border-rose-500/60 px-3 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/10',
                    () => actionMutation.mutate({ type: 'trash', id: item._id }),
                ),
            );
        }

        if (isArchivedQueue || isTrashQueue) {
            secondaryActions.push(
                renderActionButton(
                    'Restore',
                    'rounded-xl border border-emerald-500/60 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:bg-emerald-500/10',
                    () => actionMutation.mutate({ type: 'restore', id: item._id }),
                ),
            );
        }

        if (isTrashQueue) {
            secondaryActions.push(
                renderActionButton(
                    'Purge',
                    'rounded-xl border border-rose-600/70 px-3 py-1.5 text-xs font-medium text-rose-100 transition hover:bg-rose-600/10',
                    () => actionMutation.mutate({ type: 'purge', id: item._id }),
                ),
            );
        }

        return (
            <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                    {primaryActions}
                    {secondaryActions.length > 0 ? (
                        <button
                            type="button"
                            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-cyan-500/50 hover:text-cyan-700 dark:border-slate-600 dark:text-slate-200 dark:hover:text-cyan-200"
                            onClick={() => toggleItemDetails(item._id)}
                        >
                            {isExpanded ? 'Hide details' : 'More actions'}
                        </button>
                    ) : null}
                </div>
                {isExpanded && secondaryActions.length > 0 ? (
                    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800/70 dark:bg-slate-900/40">
                        {secondaryActions}
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="card-flat border border-cyan-500/20 p-4">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-semibold">{title}</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{totalItems} items in this view</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {aiSelectedOnly ? (
                                <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
                                    AI review mode
                                </span>
                            ) : null}
                            <button type="button" className="btn-outline" onClick={() => setMoreFiltersOpen((prev) => !prev)}>
                                {moreFiltersOpen ? 'Hide more filters' : 'More filters'}
                            </button>
                            <button className="btn-primary" onClick={() => onEdit()}>Create Custom News</button>
                        </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        <select
                            className="input-field"
                            value={status}
                            onChange={(e) => navigate(statusToListPath(e.target.value as ApiNews['status'] | 'all'))}
                        >
                            {LIST_STATUS_OPTIONS.map((option) => (
                                <option key={option.status} value={option.status}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <input
                            className="input-field"
                            placeholder="Search title/summary"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <select className="input-field" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                            <option value="">All Sources</option>
                            {(sourcesQuery.data?.items || []).map((source) => (
                                <option key={source._id} value={source._id}>
                                    {source.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {moreFiltersOpen ? (
                        <div className="grid gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 md:grid-cols-2 xl:grid-cols-4 dark:border-slate-800/70 dark:bg-slate-900/40">
                            <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300">
                                <span>AI-only</span>
                                <input type="checkbox" checked={aiOnly} onChange={(e) => setAiOnly(e.target.checked)} />
                            </label>
                            <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300">
                                <span>Flagged duplicates</span>
                                <input type="checkbox" checked={duplicateFlagged} onChange={(e) => setDuplicateFlagged(e.target.checked)} />
                            </label>
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300 md:col-span-2">
                                <span>Advanced filters are optional. Keep them off for normal queue review.</span>
                            </div>
                        </div>
                    ) : null}

                    {selectedCount > 0 && allowBulkModeration ? (
                        <div className="flex flex-wrap gap-2">
                            <button className="btn-outline" onClick={() => actionMutation.mutate({ type: 'bulk-approve', ids: selected })}>Bulk Approve</button>
                            <button className="btn-outline" onClick={() => actionMutation.mutate({ type: 'bulk-reject', ids: selected, reason: 'Bulk rejected from queue' })}>Bulk Reject</button>
                        </div>
                    ) : null}
                </div>
            </div>

            {editing && (
                <div ref={editorRef} className="rounded-2xl border border-cyan-400/20 bg-white/95 shadow-card dark:bg-slate-950/60 overflow-hidden">
                    {/* Editor Header */}
                    <div className="border-b border-slate-200/60 bg-gradient-to-r from-cyan-500/5 to-transparent px-5 py-4 dark:border-slate-800/60">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editing._id ? 'Edit Article' : 'Create Article'}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Fill in the details below. Fields marked with sections are optional.</p>
                        {editing.sourceType === 'rss' && (
                            <div className="mt-2 flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>
                                <span>Imported from RSS — source attribution preserved{editing.sourceName ? ` (${editing.sourceName})` : ''}</span>
                            </div>
                        )}
                    </div>

                    <div className="p-5 space-y-6">
                        {/* ── Basic Info ── */}
                        <fieldset className="space-y-3">
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">Basic Information</legend>
                            <input className="input-field" placeholder="Title" value={editing.title || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), title: e.target.value }))} />
                            <div className="grid gap-3 md:grid-cols-2">
                                <input className="input-field" placeholder="Category" value={editing.category || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), category: e.target.value }))} />
                                <input className="input-field" placeholder="Original Source Link" value={editing.originalLink || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), originalLink: e.target.value }))} />
                            </div>
                            <input className="input-field" placeholder="Short Summary" value={editing.shortDescription || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), shortDescription: e.target.value }))} />
                            <input className="input-field" placeholder="Public Tags (comma separated)" value={tagInput} onChange={(e) => setTagInput(e.target.value)} />
                        </fieldset>

                        {/* ── Cover Image ── */}
                        <fieldset className="space-y-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400 px-1">Cover Image</legend>
                            <input
                                className="input-field"
                                placeholder="https://.../banner.jpg"
                                value={editing.coverImageUrl || editing.coverImage || editing.featuredImage || ''}
                                onChange={(e) =>
                                    setEditing((prev) => ({
                                        ...(prev || {}),
                                        coverImageUrl: e.target.value,
                                        coverImage: e.target.value,
                                        featuredImage: e.target.value,
                                        coverImageSource: e.target.value ? 'admin' : (prev?.coverImageSource || 'default'),
                                    }))
                                }
                            />
                            <div className="flex flex-wrap items-center gap-2">
                                {(['rss', 'admin', 'default'] as const).map((src) => (
                                    <button
                                        key={src}
                                        type="button"
                                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${editing.coverImageSource === src ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-200' : 'border-slate-300/70 text-slate-600 hover:border-cyan-400/40 dark:border-slate-700/70 dark:text-slate-300'}`}
                                        onClick={() =>
                                            setEditing((prev) => ({
                                                ...(prev || {}),
                                                coverImageSource: src,
                                                ...(src === 'default' ? { coverImageUrl: '', coverImage: '', featuredImage: '' } : {}),
                                            }))
                                        }
                                    >
                                        {src === 'rss' ? 'Use extracted' : src === 'admin' ? 'Use uploaded/custom' : 'Use default'}
                                    </button>
                                ))}
                                <label className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300/70 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-cyan-500/40 dark:border-slate-700/70 dark:text-slate-300">
                                    <input type="file" accept="image/*" className="hidden" onChange={(event) => { onUploadCover(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                                    {uploadingCover ? 'Uploading…' : 'Upload Banner'}
                                </label>
                                {(editing.coverImageUrl || editing.coverImage || editing.featuredImage) && (
                                    <img src={buildMediaUrl(String(editing.coverImageUrl || editing.coverImage || editing.featuredImage || ''))} alt="cover" className="h-12 w-20 rounded-lg border border-slate-200/60 object-cover dark:border-slate-700/60" />
                                )}
                            </div>
                        </fieldset>

                        {/* ── Article Options ── */}
                        <fieldset className="space-y-3">
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">Article Options</legend>
                            <div className="grid gap-3 md:grid-cols-3">
                                <label className="space-y-1">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Display Type</span>
                                    <select className="input-field" value={editing.displayType || 'news'} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), displayType: e.target.value as 'news' | 'update' }))}>
                                        <option value="news">News</option>
                                        <option value="update">Update</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Priority</span>
                                    <select className="input-field" value={editing.priority || 'normal'} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), priority: e.target.value as 'normal' | 'priority' | 'breaking' }))}>
                                        <option value="normal">Normal</option>
                                        <option value="priority">Priority</option>
                                        <option value="breaking">Breaking</option>
                                    </select>
                                </label>
                                <label className="flex items-center justify-between rounded-xl border border-slate-200/60 px-3 py-2 text-sm text-slate-700 dark:border-slate-700/60 dark:text-slate-300">
                                    <span>Featured</span>
                                    <input type="checkbox" checked={Boolean(editing.isFeatured)} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), isFeatured: e.target.checked }))} className="h-4 w-4 rounded" />
                                </label>
                            </div>
                        </fieldset>

                        {/* ── SEO ── */}
                        <fieldset className="space-y-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 px-1">SEO (Optional)</legend>
                            <div className="grid gap-3 md:grid-cols-2">
                                <input className="input-field" placeholder="SEO Title" value={editing.seoTitle || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), seoTitle: e.target.value }))} />
                                <input className="input-field" placeholder="Classification Category" value={editing.classification?.primaryCategory || editing.category || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), category: e.target.value, classification: { ...(prev?.classification || {}), primaryCategory: e.target.value } }))} />
                            </div>
                            <textarea className="input-field min-h-[80px]" placeholder="SEO Description" value={editing.seoDescription || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), seoDescription: e.target.value }))} />
                        </fieldset>

                        {/* ── Open Graph / Social Sharing ── */}
                        <fieldset className="space-y-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 px-1">Social Sharing Preview (Optional)</legend>
                            <div className="grid gap-3 md:grid-cols-2">
                                <input className="input-field" placeholder="OG Title (defaults to article title)" value={(editing as any).ogTitle || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), ogTitle: e.target.value }))} />
                                <input className="input-field" placeholder="OG Image URL (defaults to cover image)" value={(editing as any).ogImage || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), ogImage: e.target.value }))} />
                            </div>
                            <textarea className="input-field min-h-[80px]" placeholder="OG Description (defaults to summary)" value={(editing as any).ogDescription || ''} onChange={(e) => setEditing((prev) => ({ ...(prev || {}), ogDescription: e.target.value }))} />
                        </fieldset>

                        {/* ── Communication / AI Enrichment ── */}
                        <fieldset className="space-y-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/50 dark:bg-slate-900/30">
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 px-1">Communication & AI Enrichment (Optional)</legend>
                            <input className="input-field" placeholder="Student-friendly explanation" value={editing.aiEnrichment?.studentFriendlyExplanation || ''} onChange={(e) => updateAiEnrichmentField('studentFriendlyExplanation', e.target.value)} />
                            <textarea className="input-field min-h-[80px]" placeholder="Key points (comma separated)" value={Array.isArray(editing.aiEnrichment?.keyPoints) ? editing.aiEnrichment?.keyPoints.join(', ') : ''} onChange={(e) => updateAiEnrichmentField('keyPoints', parseCommaList(e.target.value))} />
                            <div className="grid gap-3 md:grid-cols-2">
                                <input className="input-field" placeholder="Email subject" value={editing.aiEnrichment?.emailSubject || ''} onChange={(e) => updateAiEnrichmentField('emailSubject', e.target.value)} />
                                <input className="input-field" placeholder="SMS text" value={editing.aiEnrichment?.smsText || ''} onChange={(e) => updateAiEnrichmentField('smsText', e.target.value)} />
                            </div>
                            <textarea className="input-field min-h-[96px]" placeholder="Email body / delivery copy" value={editing.aiEnrichment?.emailBody || ''} onChange={(e) => updateAiEnrichmentField('emailBody', e.target.value)} />
                        </fieldset>

                        {/* ── Content Editor ── */}
                        <fieldset className="space-y-3">
                            <legend className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-600 dark:text-cyan-400">Article Content</legend>
                            <SimpleRichTextEditor
                                value={editing.content || ''}
                                onChange={(value) => setEditing((prev) => ({ ...(prev || {}), content: value }))}
                                placeholder="Write article content..."
                            />
                        </fieldset>
                    </div>

                    {/* Editor Footer */}
                    <div className="sticky bottom-0 border-t border-slate-200/60 bg-white/90 px-5 py-3 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/90">
                        <div className="flex flex-wrap items-center gap-2">
                            <button className="btn-primary" onClick={onSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : 'Save'}</button>
                            {editing._id && editing.status !== 'published' ? (
                                <button
                                    className="rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                                    onClick={() => { onSave(); if (editing._id) setTimeout(() => actionMutation.mutate({ type: 'publish', id: editing._id! }), 300); }}
                                    disabled={saveMutation.isPending || actionMutation.isPending}
                                >
                                    Save & Publish
                                </button>
                            ) : null}
                            {editing._id ? (
                                <button className="btn-outline" onClick={() => actionMutation.mutate({ type: 'ai-check', id: editing._id, applyToDraft: true })} disabled={actionMutation.isPending}>
                                    {actionMutation.isPending ? 'Checking AI…' : 'AI Check + Apply'}
                                </button>
                            ) : null}
                            {(editing.slug || editing._id) ? (
                                <Link to={`/news/${editing.slug || editing._id}`} target="_blank" rel="noreferrer" className="btn-outline">Preview</Link>
                            ) : null}
                            <button className="btn-outline ml-auto" onClick={() => setEditing(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="card-flat border border-cyan-500/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-300/70 bg-slate-100/60 px-3 py-2 text-xs text-slate-700 dark:border-slate-700/70 dark:bg-slate-950/40 dark:text-slate-300">
                    <span>{selectedCount} selected · {totalItems} total</span>
                    <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={selectedAll} onChange={toggleSelectAll} />
                        Select all
                    </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((item) => {
                        const coverImageCandidate = item.coverImageUrl || item.coverImage || item.featuredImage;
                        const coverImg = coverImageCandidate ? buildMediaUrl(coverImageCandidate) : '';
                        return (
                            <article key={item._id} className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/50 shadow-sm transition-all hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-md dark:border-slate-800/80 dark:bg-slate-900/40">
                                {/* Image / Cover */}
                                <div className="relative aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                    {coverImg ? (
                                        <img
                                            src={coverImg}
                                            alt={item.title}
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                                                const icon = document.createElement('div');
                                                icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400/50 dark:text-slate-600/50"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"></path><path d="M18 14h-8"></path><path d="M15 18h-5"></path><path d="M10 6h8v4h-8V6Z"></path></svg>';
                                                e.currentTarget.parentElement?.appendChild(icon);
                                            }}
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-slate-200/50 dark:bg-slate-800/50">
                                            <Newspaper className="h-8 w-8 text-slate-400/50 dark:text-slate-600/50" />
                                        </div>
                                    )}

                                    {/* Selection overlay */}
                                    <div className="absolute left-3 top-3 z-10">
                                        <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-white/90 p-1.5 shadow-sm backdrop-blur-md transition-colors hover:bg-white dark:bg-slate-900/90 dark:hover:bg-slate-900">
                                            <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-slate-300 text-cyan-500 transition-all focus:ring-cyan-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-800"
                                                checked={selected.includes(item._id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelected((prev) => [...prev, item._id]);
                                                    else setSelected((prev) => prev.filter((value) => value !== item._id));
                                                }}
                                            />
                                        </label>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
                                        <span className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur-md ${item.status === 'published' ? 'bg-emerald-500/90 text-white' :
                                            item.status === 'rejected' ? 'bg-rose-500/90 text-white' :
                                                item.status === 'draft' ? 'bg-slate-800/90 text-white dark:bg-slate-200/90 dark:text-slate-900' :
                                                    'bg-amber-500/90 text-white'
                                            }`}>
                                            {statusToListLabel(item.status)}
                                        </span>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex flex-1 flex-col p-4">
                                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        <span className="truncate max-w-[100px]">{item.category || 'General'}</span>
                                        <span>•</span>
                                        <span className="truncate max-w-[100px]">{item.sourceName || item.sourceType || 'Manual'}</span>
                                        <span>•</span>
                                        <span className="shrink-0">{formatQueueTime(item.createdAt)}</span>
                                    </div>
                                    {item.sourceType === 'rss' && (
                                        <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" /></svg>
                                            <span>Imported from RSS — source attribution preserved</span>
                                        </div>
                                    )}

                                    <h3 className="mb-2 line-clamp-2 text-sm font-semibold leading-tight text-slate-900 dark:text-white" title={item.title}>
                                        {item.title}
                                    </h3>

                                    <p className="mb-4 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
                                        {buildListSummary(item)}
                                    </p>

                                    <div className="mt-auto space-y-3">
                                        {/* Actions */}
                                        <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/60">
                                            <div className="flex-1">
                                                {renderItemActions(item)}
                                            </div>
                                        </div>

                                        {/* Expanded details */}
                                        {expandedItemIds.includes(item._id) ? (
                                            <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200/50 bg-slate-50 p-2.5 text-[10px] text-slate-600 dark:border-slate-800/50 dark:bg-slate-900/30 dark:text-slate-400">
                                                <span className={`rounded border px-1.5 py-0.5 ${item.fetchedFullText ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400'}`}>
                                                    {item.fetchedFullText ? 'Full text' : 'Excerpt'}
                                                </span>
                                                {item.publishOutcome?.type ? (
                                                    <span className="rounded border border-cyan-500/30 bg-cyan-500/5 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                                                        {item.publishOutcome.type}
                                                    </span>
                                                ) : null}
                                                {item.deliveryMeta?.lastChannel ? (
                                                    <span className="rounded border border-violet-500/30 bg-violet-500/5 px-1.5 py-0.5 text-violet-600 dark:text-violet-400">
                                                        {item.deliveryMeta.lastChannel}
                                                    </span>
                                                ) : null}
                                                {item.aiUsed ? (
                                                    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${item.aiMeta?.noHallucinationPassed ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400'}`}>
                                                        <Sparkles className="h-2.5 w-2.5" />
                                                        {item.aiMeta?.noHallucinationPassed ? 'AI ver' : 'AI rev'}
                                                    </span>
                                                ) : null}
                                                {buildSecondaryMeta(item).map((meta) => (
                                                    <span key={meta} className="rounded border border-slate-200 px-1.5 py-0.5 dark:border-slate-700">{meta}</span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                    {!items.length ? (
                        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                            No items found.
                        </p>
                    ) : null}
                </div>
                {totalPages > 1 ? (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-300/70 bg-slate-100/60 px-4 py-3 text-sm text-slate-600 dark:border-slate-700/70 dark:bg-slate-950/40 dark:text-slate-300">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full border border-slate-300/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] dark:border-slate-700/70">
                                Page {page} / {totalPages}
                            </span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                Large queues stay readable with paged review cards.
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="btn-outline"
                                disabled={page <= 1}
                                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                disabled={page >= totalPages}
                                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            <AnimatePresence>
                {actionDialog ? (
                    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-[2px] md:items-center md:p-5">
                        <button type="button" className="absolute inset-0 cursor-default" onClick={closeActionDialog} aria-label="Close action dialog" />
                        <motion.div
                            initial={{ opacity: 0, y: 18, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                            className="relative z-[81] my-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white/96 shadow-[0_28px_90px_rgba(2,6,23,0.3)] dark:border-slate-700/80 dark:bg-slate-950/96 md:max-h-[calc(100vh-3rem)]"
                        >
                            <div className="flex items-start justify-between gap-3 px-5 pb-0 pt-5">
                                <div className="space-y-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">
                                        News action flow
                                    </p>
                                    <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                                        {dialogTitle(actionDialog.mode, actionDialog.item)}
                                    </h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400">
                                        {dialogDescription(actionDialog.mode)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeActionDialog}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="mt-4 flex-1 space-y-4 overflow-y-auto px-5 pb-5">
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-100/75 p-4 dark:border-slate-700/80 dark:bg-slate-900/60">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                                        Selected item
                                    </p>
                                    <h4 className="mt-2 text-base font-semibold text-slate-950 dark:text-white">{actionDialog.item.title}</h4>
                                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        <span className="rounded-full border border-slate-300/70 px-2 py-1 dark:border-slate-700/70">{actionDialog.item.category || 'General'}</span>
                                        <span className="rounded-full border border-slate-300/70 px-2 py-1 capitalize dark:border-slate-700/70">{actionDialog.item.status}</span>
                                        <span className="rounded-full border border-slate-300/70 px-2 py-1 dark:border-slate-700/70">{actionDialog.item.sourceName || actionDialog.item.sourceType || 'manual'}</span>
                                    </div>
                                </div>

                                {getPublishWarnings(actionDialog.item).length > 0 ? (
                                    <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-100">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                                            <div className="space-y-2">
                                                <p className="text-sm font-semibold">Publishing safeguards detected</p>
                                                <ul className="space-y-1 text-sm">
                                                    {getPublishWarnings(actionDialog.item).map((warning) => (
                                                        <li key={warning}>{warning}</li>
                                                    ))}
                                                </ul>
                                                {(actionDialog.mode === 'approve' || actionDialog.mode === 'publish' || actionDialog.mode === 'schedule') ? (
                                                    <label className="mt-2 inline-flex items-center gap-2 text-sm">
                                                        <input
                                                            type="checkbox"
                                                            checked={dialogOverrideConfirmed}
                                                            onChange={(event) => setDialogOverrideConfirmed(event.target.checked)}
                                                        />
                                                        I reviewed these warnings and still want to continue.
                                                    </label>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {actionDialog.mode === 'reject' ? (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Reject reason</label>
                                        <textarea
                                            className="input-field min-h-[110px]"
                                            value={dialogReason}
                                            onChange={(event) => setDialogReason(event.target.value)}
                                            placeholder="Explain why this item is being rejected."
                                        />
                                    </div>
                                ) : null}

                                {actionDialog.mode === 'schedule' ? (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Schedule publish time</label>
                                        <div className="relative">
                                            <CalendarClock className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                            <input
                                                type="datetime-local"
                                                className="input-field pl-10"
                                                value={dialogScheduleAt}
                                                onChange={(event) => setDialogScheduleAt(event.target.value)}
                                            />
                                        </div>
                                    </div>
                                ) : null}

                                {actionDialog.mode === 'merge' ? (
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Target news ID</label>
                                            <div className="relative">
                                                <GitMerge className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                                                <input
                                                    className="input-field pl-10"
                                                    value={dialogTargetNewsId}
                                                    onChange={(event) => setDialogTargetNewsId(event.target.value)}
                                                    placeholder="Paste the canonical target article ID"
                                                />
                                            </div>
                                        </div>
                                        <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                            <input
                                                type="checkbox"
                                                checked={dialogMergeContent}
                                                onChange={(event) => setDialogMergeContent(event.target.checked)}
                                            />
                                            Merge duplicate content into the target article.
                                        </label>
                                    </div>
                                ) : null}

                                {(actionDialog.mode === 'convert-notice' || actionDialog.mode === 'publish-send') ? (
                                    <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-slate-700/80 dark:bg-slate-900/40">
                                        {actionDialog.mode === 'publish-send' ? (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Delivery channels</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(['email', 'sms'] as const).map((channel) => {
                                                            const selectedChannel = dialogChannels.includes(channel);
                                                            return (
                                                                <button
                                                                    key={channel}
                                                                    type="button"
                                                                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${selectedChannel
                                                                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-100'
                                                                        : 'border-slate-300/70 text-slate-600 hover:border-cyan-500/50 dark:border-slate-700/70 dark:text-slate-300'
                                                                        }`}
                                                                    onClick={() =>
                                                                        setDialogChannels((prev) =>
                                                                            prev.includes(channel)
                                                                                ? prev.filter((entry) => entry !== channel)
                                                                                : [...prev, channel]
                                                                        )
                                                                    }
                                                                >
                                                                    {channel}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-3 text-xs text-slate-600 dark:border-slate-700/80 dark:bg-slate-950/50 dark:text-slate-300">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100">Provider readiness</span>
                                                        <span>{enabledProviders.length} enabled / {providerOptions.length} configured</span>
                                                    </div>
                                                    <p className="mt-1">
                                                        {enabledProviders.length > 0
                                                            ? enabledProviders.map((provider) => `${provider.displayName} (${provider.type})`).join(' • ')
                                                            : 'No active SMS or email providers are enabled yet.'}
                                                    </p>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Audience</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {([
                                                            { key: 'all', label: 'All Students' },
                                                            { key: 'group', label: 'Saved Group' },
                                                            { key: 'manual', label: 'Manual IDs' },
                                                            { key: 'filter', label: 'Smart Filter' },
                                                        ] as const).map((option) => (
                                                            <button
                                                                key={option.key}
                                                                type="button"
                                                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${dialogAudienceType === option.key
                                                                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-100'
                                                                    : 'border-slate-300/70 text-slate-600 hover:border-emerald-500/50 dark:border-slate-700/70 dark:text-slate-300'
                                                                    }`}
                                                                onClick={() => setDialogAudienceType(option.key)}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {dialogAudienceType === 'group' ? (
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Saved group</label>
                                                        <select
                                                            className="input-field"
                                                            value={dialogAudienceGroupId}
                                                            onChange={(event) => setDialogAudienceGroupId(event.target.value)}
                                                        >
                                                            <option value="">Select a group</option>
                                                            {groupOptions.map((group) => (
                                                                <option key={group._id} value={group._id}>
                                                                    {group.name}{group.type ? ` (${group.type})` : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : null}
                                                {dialogAudienceType === 'manual' ? (
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Manual student IDs</label>
                                                        <textarea
                                                            className="input-field min-h-[96px]"
                                                            value={dialogManualStudentIdsInput}
                                                            onChange={(event) => setDialogManualStudentIdsInput(event.target.value)}
                                                            placeholder="Comma-separated student user IDs"
                                                        />
                                                    </div>
                                                ) : null}
                                                {dialogAudienceType === 'filter' ? (
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Plan codes</label>
                                                            <input
                                                                className="input-field"
                                                                value={dialogFilterPlanCodesInput}
                                                                onChange={(event) => setDialogFilterPlanCodesInput(event.target.value)}
                                                                placeholder="premium,pro"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Institution names</label>
                                                            <input
                                                                className="input-field"
                                                                value={dialogFilterInstitutionNamesInput}
                                                                onChange={(event) => setDialogFilterInstitutionNamesInput(event.target.value)}
                                                                placeholder="Dhaka College, Rajuk College"
                                                            />
                                                        </div>
                                                        <div className="space-y-2 md:col-span-2">
                                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Group IDs</label>
                                                            <input
                                                                className="input-field"
                                                                value={dialogFilterGroupIdsInput}
                                                                onChange={(event) => setDialogFilterGroupIdsInput(event.target.value)}
                                                                placeholder="Comma-separated dynamic or saved group IDs"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Profile score min</label>
                                                            <input
                                                                type="number"
                                                                className="input-field"
                                                                value={dialogFilterScoreMin}
                                                                onChange={(event) => setDialogFilterScoreMin(event.target.value)}
                                                                placeholder="0"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Profile score max</label>
                                                            <input
                                                                type="number"
                                                                className="input-field"
                                                                value={dialogFilterScoreMax}
                                                                onChange={(event) => setDialogFilterScoreMax(event.target.value)}
                                                                placeholder="100"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : null}
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Recipient mode</label>
                                                        <select
                                                            className="input-field"
                                                            value={dialogRecipientMode}
                                                            onChange={(event) => setDialogRecipientMode(event.target.value as 'student' | 'guardian' | 'both')}
                                                        >
                                                            <option value="student">Student only</option>
                                                            <option value="guardian">Guardian only</option>
                                                            <option value="both">Student + guardian</option>
                                                        </select>
                                                    </div>
                                                    <label className="inline-flex items-center justify-between rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
                                                        <span>Guardian targeted flag</span>
                                                        <input
                                                            type="checkbox"
                                                            checked={dialogGuardianTargeted}
                                                            onChange={(event) => setDialogGuardianTargeted(event.target.checked)}
                                                        />
                                                    </label>
                                                </div>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Template</label>
                                                        <select
                                                            className="input-field"
                                                            value={dialogTemplateKey}
                                                            onChange={(event) => setDialogTemplateKey(event.target.value)}
                                                        >
                                                            <option value="">Use custom body</option>
                                                            {templateOptions
                                                                .filter((template) => dialogChannels.length === 0 || dialogChannels.includes(template.channel as 'sms' | 'email'))
                                                                .map((template) => (
                                                                    <option key={template._id} value={template.templateKey}>
                                                                        {template.name} ({template.channel})
                                                                    </option>
                                                                ))}
                                                        </select>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Custom subject</label>
                                                        <input
                                                            className="input-field"
                                                            value={dialogCustomSubject}
                                                            onChange={(event) => setDialogCustomSubject(event.target.value)}
                                                            placeholder="Used for email if no template subject is applied"
                                                        />
                                                    </div>
                                                    <div className="space-y-2 md:col-span-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Custom delivery body</label>
                                                        <textarea
                                                            className="input-field min-h-[110px]"
                                                            value={dialogCustomBody}
                                                            onChange={(event) => setDialogCustomBody(event.target.value)}
                                                            placeholder="Leave blank to fall back to AI email body, short summary, or article summary."
                                                        />
                                                    </div>
                                                </div>
                                                <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={dialogConvertToNotice}
                                                        onChange={(event) => setDialogConvertToNotice(event.target.checked)}
                                                    />
                                                    Also create a linked student notice from this item.
                                                </label>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div className="space-y-2 md:col-span-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Reason</label>
                                                        <input
                                                            className="input-field"
                                                            value={dialogReason}
                                                            onChange={(event) => setDialogReason(event.target.value)}
                                                            placeholder="news_publish_send"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Current password</label>
                                                        <input
                                                            type="password"
                                                            className="input-field"
                                                            value={dialogCurrentPassword}
                                                            onChange={(event) => setDialogCurrentPassword(event.target.value)}
                                                            placeholder="Required for step-up verification"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Authenticator / backup code</label>
                                                        <input
                                                            className="input-field"
                                                            value={dialogOtpCode}
                                                            onChange={(event) => setDialogOtpCode(event.target.value)}
                                                            placeholder="Optional unless 2FA is enforced"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        ) : null}

                                        {(actionDialog.mode === 'convert-notice' || dialogConvertToNotice) ? (
                                            <div className="space-y-3">
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Notice audience</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {(['all', 'groups', 'students'] as const).map((target) => (
                                                            <button
                                                                key={target}
                                                                type="button"
                                                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${dialogTarget === target
                                                                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-100'
                                                                    : 'border-slate-300/70 text-slate-600 hover:border-violet-500/50 dark:border-slate-700/70 dark:text-slate-300'
                                                                    }`}
                                                                onClick={() => setDialogTarget(target)}
                                                            >
                                                                {target}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {dialogTarget !== 'all' ? (
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                                            {dialogTarget === 'groups' ? 'Group IDs' : 'Student IDs'}
                                                        </label>
                                                        <textarea
                                                            className="input-field min-h-[96px]"
                                                            value={dialogTargetIdsInput}
                                                            onChange={(event) => setDialogTargetIdsInput(event.target.value)}
                                                            placeholder="Comma-separated IDs"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-100">
                                                        This notice will target every eligible student.
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-white/90 px-5 py-4 dark:border-slate-800/80 dark:bg-slate-950/90">
                                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                    <CircleOff className="h-4 w-4" />
                                    <span>{dialogFooterNote(actionDialog.mode)}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" className="btn-outline" onClick={closeActionDialog}>
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        onClick={submitActionDialog}
                                        disabled={actionMutation.isPending}
                                    >
                                        {actionMutation.isPending ? 'Processing...' : dialogPrimaryLabel(actionDialog.mode)}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
    queryClient.invalidateQueries({ queryKey: ['adminNewsDashboard'] });
    queryClient.invalidateQueries({ queryKey: ['adminNewsList'] });
    queryClient.invalidateQueries({ queryKey: ['adminNewsItem'] });
    queryClient.invalidateQueries({ queryKey: ['adminRssSources'] });
    queryClient.invalidateQueries({ queryKey: ['adminNewsSettings'] });
    queryClient.invalidateQueries({ queryKey: ['newsSettings'] });
    queryClient.invalidateQueries({ queryKey: ['newsSources'] });
    queryClient.invalidateQueries({ queryKey: ['newsList'] });
    queryClient.invalidateQueries({ queryKey: ['newsDetail'] });
}

function getPublishWarnings(item: ApiNews): string[] {
    const warnings: string[] = [];
    const duplicateSignal = Boolean(
        item.status === 'duplicate_review'
        || item.duplicateOfNewsId
        || item.dedupe?.duplicateFlag
        || (Array.isArray(item.duplicateReasons) && item.duplicateReasons.length > 0)
    );
    if (duplicateSignal) {
        warnings.push('Possible duplicate detected for this item.');
    }
    if (item.aiUsed && item.aiMeta?.noHallucinationPassed === false) {
        warnings.push('AI strict verification is not fully passed.');
    }
    return warnings;
}

function toLocalDateTimeValue(value: Date): string {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeValue(value: string): string | null {
    if (!value.trim()) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function dialogTitle(mode: DialogMode, item: ApiNews): string {
    switch (mode) {
        case 'approve':
            return `Approve & publish "${item.title}"`;
        case 'publish':
            return `Publish "${item.title}"`;
        case 'reject':
            return `Reject "${item.title}"`;
        case 'schedule':
            return `Schedule "${item.title}"`;
        case 'publish-send':
            return `Publish + send "${item.title}"`;
        case 'merge':
            return `Merge duplicate "${item.title}"`;
        case 'convert-notice':
            return `Convert "${item.title}" to notice`;
        default:
            return item.title;
    }
}

function dialogDescription(mode: DialogMode): string {
    switch (mode) {
        case 'approve':
            return 'This moves the item through review and publishes it immediately after your final checks.';
        case 'publish':
            return 'This publishes the item to the public news feed and homepage surfaces right away.';
        case 'reject':
            return 'Add a clear rejection reason so the queue history stays readable.';
        case 'schedule':
            return 'Choose a future publish time without leaving the review workflow.';
        case 'publish-send':
            return 'This will publish the item and send it through the communication pipeline using step-up verification.';
        case 'merge':
            return 'Merge this duplicate into a canonical article instead of leaving extra copies in the queue.';
        case 'convert-notice':
            return 'Create a linked notice so the same content can also appear in student notice flows.';
        default:
            return '';
    }
}

function dialogPrimaryLabel(mode: DialogMode): string {
    switch (mode) {
        case 'approve':
            return 'Approve & Publish';
        case 'publish':
            return 'Publish Now';
        case 'reject':
            return 'Reject Item';
        case 'schedule':
            return 'Schedule Publish';
        case 'publish-send':
            return 'Publish + Send';
        case 'merge':
            return 'Merge Duplicate';
        case 'convert-notice':
            return 'Create Notice';
        default:
            return 'Continue';
    }
}

function dialogFooterNote(mode: DialogMode): string {
    switch (mode) {
        case 'publish-send':
            return 'Delivery logs will link back to this content after dispatch.';
        case 'convert-notice':
            return 'Notice targeting and audit linkage stay connected to the source news item.';
        case 'merge':
            return 'Duplicate cleanup should leave one canonical public article.';
        default:
            return 'This flow stays inside the admin review surface so context is not lost.';
    }
}

function statusToListPath(status: ApiNews['status'] | 'all'): string {
    if (status === 'published') return '/__cw_admin__/news/published';
    if (status === 'scheduled') return '/__cw_admin__/news/scheduled';
    if (status === 'rejected') return '/__cw_admin__/news/rejected';
    if (status === 'duplicate_review') return '/__cw_admin__/news/duplicates';
    if (status === 'draft') return '/__cw_admin__/news/drafts';
    if (status === 'archived') return '/__cw_admin__/news/archived';
    if (status === 'trash') return '/__cw_admin__/news/trash';
    return '/__cw_admin__/news/pending';
}

function statusToListLabel(status: ApiNews['status'] | 'all'): string {
    return LIST_STATUS_OPTIONS.find((option) => option.status === status)?.label || 'Items to Review';
}

function buildListSummary(item: ApiNews): string {
    const summary = String(
        item.aiEnrichment?.shortSummary
        || item.shortSummary
        || item.shortDescription
        || item.aiEnrichment?.studentFriendlyExplanation
        || ''
    ).trim();
    if (summary) return summary;
    const contentPreview = String(item.content || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return contentPreview ? contentPreview.slice(0, 180) : 'No summary added yet.';
}

function buildSecondaryMeta(item: ApiNews): string[] {
    const meta: string[] = [];
    if (item.priority && item.priority !== 'normal') {
        meta.push(`Priority: ${item.priority}`);
    }
    if (item.isFeatured) {
        meta.push('Featured on homepage');
    }
    if (item.displayType && item.displayType !== 'news') {
        meta.push(`Display: ${item.displayType}`);
    }
    return meta;
}

function formatQueueTime(value?: string | Date | null): string {
    if (!value) return 'N/A';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'N/A';
    return parsed.toLocaleString();
}
