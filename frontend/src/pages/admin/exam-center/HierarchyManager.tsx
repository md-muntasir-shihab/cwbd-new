import { useState, useCallback, useRef, useEffect } from 'react';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import {
    ChevronRight,
    ChevronDown,
    Plus,
    Pencil,
    Trash2,
    GripVertical,
    Languages,
    RefreshCw,
    AlertCircle,
    FolderTree,
    Check,
    X,
    Loader2,
    LayoutGrid,
    List,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useHierarchyTree,
    useCreateGroup,
    useUpdateGroup,
    useUpdateSubGroup,
    useUpdateSubject,
    useUpdateChapter,
    useUpdateTopic,
    useDeleteGroup,
    useDeleteSubGroup,
    useDeleteSubject,
    useDeleteChapter,
    useDeleteTopic,
    useCreateSubGroup,
    useCreateSubject,
    useCreateChapter,
    useCreateTopic,
    useReorderNodes,
} from '../../../hooks/useExamSystemQueries';
import type {
    HierarchyNode,
    HierarchyLevel,
    BilingualText,
} from '../../../types/exam-system';

// ─── Constants ───────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<HierarchyLevel, string> = {
    group: 'Group',
    sub_group: 'Sub-Group',
    subject: 'Subject',
    chapter: 'Chapter',
    topic: 'Topic',
};

const LEVEL_COLORS: Record<HierarchyLevel, string> = {
    group: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    sub_group: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    subject: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    chapter: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    topic: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

const CHILD_LEVEL: Record<HierarchyLevel, HierarchyLevel | null> = {
    group: 'sub_group',
    sub_group: 'subject',
    subject: 'chapter',
    chapter: 'topic',
    topic: null,
};

const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';


// ─── Loading Skeleton ────────────────────────────────────────────────────

function TreeSkeleton() {
    return (
        <div className="space-y-3 animate-pulse" role="status" aria-label="Loading hierarchy tree">
            {[1, 2, 3].map((g) => (
                <div key={g} className="space-y-2">
                    <div className="flex items-center gap-2 px-3 py-2">
                        <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="h-5 w-14 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                    {[1, 2].map((s) => (
                        <div key={s} className="ml-8 flex items-center gap-2 px-3 py-2">
                            <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
                        </div>
                    ))}
                </div>
            ))}
            <span className="sr-only">Loading...</span>
        </div>
    );
}

type ViewMode = 'tree' | 'card';

const VIEW_MODE_KEY = 'hierarchy-view-mode';

function CardSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse" role="status" aria-label="Loading hierarchy cards">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <div className="mb-3 flex items-center gap-2">
                        <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
                        <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" />
                        <div className="h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                </div>
            ))}
            <span className="sr-only">Loading...</span>
        </div>
    );
}

// ─── Delete Confirmation Dialog ──────────────────────────────────────────

interface DeleteDialogProps {
    node: HierarchyNode;
    lang: 'en' | 'bn';
    onConfirm: () => void;
    onCancel: () => void;
    isDeleting: boolean;
}

function DeleteDialog({ node, lang, onConfirm, onCancel, isDeleting }: DeleteDialogProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm deletion"
        >
            <div
                className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center gap-2 text-red-600 dark:text-red-400">
                    <AlertCircle size={20} />
                    <h3 className="text-base font-semibold">Delete {LEVEL_LABELS[node.level]}?</h3>
                </div>
                <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    Are you sure you want to delete{' '}
                    <span className="font-medium text-slate-900 dark:text-white">
                        {node.title[lang] || node.title.en}
                    </span>
                    ? This action cannot be undone.
                    {node.children && node.children.length > 0 && (
                        <span className="mt-1 block text-red-500">
                            Warning: This node has {node.children.length} child node(s). Deletion will be rejected if children exist.
                        </span>
                    )}
                </p>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isDeleting}
                        className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                        {isDeleting && <Loader2 size={14} className="animate-spin" />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Create Node Modal ───────────────────────────────────────────────────

interface CreateNodeModalProps {
    level: HierarchyLevel;
    parentId: string | null;
    onClose: () => void;
    onCreated: () => void;
}

function CreateNodeModal({ level, parentId, onClose, onCreated }: CreateNodeModalProps) {
    const [titleEn, setTitleEn] = useState('');
    const [titleBn, setTitleBn] = useState('');
    const [code, setCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const createGroup = useCreateGroup();
    const createSubGroup = useCreateSubGroup();
    const createSubject = useCreateSubject();
    const createChapter = useCreateChapter();
    const createTopic = useCreateTopic();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!titleEn.trim()) {
            toast.error('English title is required');
            return;
        }
        if (!code.trim()) {
            toast.error('Code is required');
            return;
        }

        setIsSubmitting(true);
        const title: BilingualText = { en: titleEn.trim(), bn: titleBn.trim() || titleEn.trim() };

        try {
            switch (level) {
                case 'group':
                    await createGroup.mutateAsync({ code: code.trim(), title });
                    break;
                case 'sub_group':
                    if (!parentId) throw new Error('Parent group is required');
                    await createSubGroup.mutateAsync({ group_id: parentId, code: code.trim(), title });
                    break;
                case 'subject':
                    if (!parentId) throw new Error('Parent sub-group is required');
                    await createSubject.mutateAsync({ sub_group_id: parentId, code: code.trim(), title });
                    break;
                case 'chapter':
                    if (!parentId) throw new Error('Parent subject is required');
                    await createChapter.mutateAsync({ subject_id: parentId, code: code.trim(), title });
                    break;
                case 'topic':
                    if (!parentId) throw new Error('Parent chapter is required');
                    await createTopic.mutateAsync({ chapter_id: parentId, code: code.trim(), title });
                    break;
            }
            toast.success(`${LEVEL_LABELS[level]} created`);
            onCreated();
            onClose();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create node';
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={`Create ${LEVEL_LABELS[level]}`}
        >
            <div
                className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                        Create {LEVEL_LABELS[level]}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="create-code" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Code
                        </label>
                        <input
                            id="create-code"
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="e.g. academic, ssc, physics"
                            className={inputCls}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label htmlFor="create-title-en" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Title (English)
                        </label>
                        <input
                            id="create-title-en"
                            type="text"
                            value={titleEn}
                            onChange={(e) => setTitleEn(e.target.value)}
                            placeholder="English title"
                            className={inputCls}
                        />
                    </div>
                    <div>
                        <label htmlFor="create-title-bn" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                            Title (বাংলা)
                        </label>
                        <input
                            id="create-title-bn"
                            type="text"
                            value={titleBn}
                            onChange={(e) => setTitleBn(e.target.value)}
                            placeholder="বাংলা শিরোনাম"
                            className={inputCls}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                            Create
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


// ─── Tree Node Component ─────────────────────────────────────────────────

interface TreeNodeProps {
    node: HierarchyNode;
    lang: 'en' | 'bn';
    depth: number;
    onRequestCreate: (level: HierarchyLevel, parentId: string) => void;
    onRequestDelete: (node: HierarchyNode) => void;
    draggedNodeId: string | null;
    onDragStart: (nodeId: string, level: HierarchyLevel, parentId: string | null) => void;
    onDragOver: (e: React.DragEvent, nodeId: string) => void;
    onDrop: (e: React.DragEvent, targetNodeId: string, level: HierarchyLevel, parentId: string | null) => void;
    onDragEnd: () => void;
    parentId: string | null;
}

function TreeNode({
    node,
    lang,
    depth,
    onRequestCreate,
    onRequestDelete,
    draggedNodeId,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    parentId,
}: TreeNodeProps) {
    const [expanded, setExpanded] = useState(depth < 1);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitleEn, setEditTitleEn] = useState(node.title.en);
    const [editTitleBn, setEditTitleBn] = useState(node.title.bn);
    const [isSaving, setIsSaving] = useState(false);
    const editInputRef = useRef<HTMLInputElement>(null);

    const updateGroup = useUpdateGroup();
    const updateSubGroup = useUpdateSubGroup();
    const updateSubject = useUpdateSubject();
    const updateChapter = useUpdateChapter();
    const updateTopic = useUpdateTopic();
    const hasChildren = node.children && node.children.length > 0;
    const childLevel = CHILD_LEVEL[node.level];
    const isDragged = draggedNodeId === node._id;

    // Pick the right update mutation based on node level
    const updateMutation = {
        group: updateGroup,
        sub_group: updateSubGroup,
        subject: updateSubject,
        chapter: updateChapter,
        topic: updateTopic,
    }[node.level];

    useEffect(() => {
        if (isEditing && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [isEditing]);

    const handleStartEdit = () => {
        setEditTitleEn(node.title.en);
        setEditTitleBn(node.title.bn);
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
    };

    const handleSaveEdit = async () => {
        if (!editTitleEn.trim()) {
            toast.error('English title is required');
            return;
        }
        setIsSaving(true);
        try {
            await updateMutation.mutateAsync({
                id: node._id,
                payload: {
                    title: { en: editTitleEn.trim(), bn: editTitleBn.trim() || editTitleEn.trim() },
                },
            });
            toast.success('Updated successfully');
            setIsEditing(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update';
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    const displayTitle = node.title[lang] || node.title.en;

    return (
        <div
            className={`transition-opacity ${isDragged ? 'opacity-40' : ''}`}
            style={{ marginLeft: depth * 24 }}
        >
            <div
                className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${isDragged ? 'ring-2 ring-indigo-400' : ''
                    }`}
                draggable
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    onDragStart(node._id, node.level, parentId);
                }}
                onDragOver={(e) => onDragOver(e, node._id)}
                onDrop={(e) => onDrop(e, node._id, node.level, parentId)}
                onDragEnd={onDragEnd}
            >
                {/* Drag handle */}
                <span className="cursor-grab text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600" aria-hidden>
                    <GripVertical size={14} />
                </span>

                {/* Expand/collapse toggle */}
                {hasChildren || childLevel ? (
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                        aria-label={expanded ? 'Collapse' : 'Expand'}
                        aria-expanded={expanded}
                    >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                ) : (
                    <span className="w-5" />
                )}

                {/* Node content */}
                {isEditing ? (
                    <div className="flex flex-1 items-center gap-2">
                        <input
                            ref={editInputRef}
                            type="text"
                            value={lang === 'bn' ? editTitleBn : editTitleEn}
                            onChange={(e) =>
                                lang === 'bn' ? setEditTitleBn(e.target.value) : setEditTitleEn(e.target.value)
                            }
                            onKeyDown={handleEditKeyDown}
                            className="flex-1 rounded border border-indigo-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-indigo-600 dark:bg-slate-800 dark:text-white"
                            aria-label={`Edit ${LEVEL_LABELS[node.level]} title`}
                        />
                        <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className="rounded p-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30"
                            aria-label="Save"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                            aria-label="Cancel edit"
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                            {displayTitle}
                        </span>

                        {/* Level badge */}
                        <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEVEL_COLORS[node.level]}`}
                        >
                            {LEVEL_LABELS[node.level]}
                        </span>

                        {/* Order number */}
                        <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                            #{node.order}
                        </span>

                        {/* Action buttons — visible on hover */}
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                                type="button"
                                onClick={handleStartEdit}
                                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                                aria-label={`Edit ${displayTitle}`}
                            >
                                <Pencil size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onRequestDelete(node)}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                                aria-label={`Delete ${displayTitle}`}
                            >
                                <Trash2 size={13} />
                            </button>
                            {childLevel && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setExpanded(true);
                                        onRequestCreate(childLevel, node._id);
                                    }}
                                    className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400"
                                    aria-label={`Add ${LEVEL_LABELS[childLevel]} under ${displayTitle}`}
                                >
                                    <Plus size={13} />
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Children */}
            {expanded && hasChildren && (
                <div role="group" aria-label={`Children of ${displayTitle}`}>
                    {node.children!.map((child) => (
                        <TreeNode
                            key={child._id}
                            node={child}
                            lang={lang}
                            depth={depth + 1}
                            onRequestCreate={onRequestCreate}
                            onRequestDelete={onRequestDelete}
                            draggedNodeId={draggedNodeId}
                            onDragStart={onDragStart}
                            onDragOver={onDragOver}
                            onDrop={onDrop}
                            onDragEnd={onDragEnd}
                            parentId={node._id}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}


// ─── Hierarchy Card Component ────────────────────────────────────────────

interface HierarchyCardProps {
    node: HierarchyNode;
    lang: 'en' | 'bn';
    onRequestCreate: (level: HierarchyLevel, parentId: string) => void;
    onRequestDelete: (node: HierarchyNode) => void;
}

function HierarchyCard({ node, lang, onRequestCreate, onRequestDelete }: HierarchyCardProps) {
    const displayTitle = node.title[lang] || node.title.en;
    const childLevel = CHILD_LEVEL[node.level];
    const childCount = node.children?.length ?? 0;

    const CARD_ACCENT: Record<HierarchyLevel, string> = {
        group: 'border-l-indigo-500',
        sub_group: 'border-l-emerald-500',
        subject: 'border-l-amber-500',
        chapter: 'border-l-sky-500',
        topic: 'border-l-rose-500',
    };

    return (
        <div
            className={`group relative rounded-xl border border-slate-200 border-l-4 ${CARD_ACCENT[node.level]} bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-slate-900`}
        >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${LEVEL_COLORS[node.level]}`}>
                            {LEVEL_LABELS[node.level]}
                        </span>
                        <span className="text-[10px] text-slate-400">#{node.order}</span>
                    </div>
                    <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white" title={displayTitle}>
                        {displayTitle}
                    </h3>
                    {node.title.bn && lang === 'en' && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{node.title.bn}</p>
                    )}
                </div>
                {/* Actions */}
                <div className="ml-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                        type="button"
                        onClick={() => onRequestDelete(node)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
                        aria-label={`Delete ${displayTitle}`}
                    >
                        <Trash2 size={13} />
                    </button>
                    {childLevel && (
                        <button
                            type="button"
                            onClick={() => onRequestCreate(childLevel, node._id)}
                            className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/30"
                            aria-label={`Add ${LEVEL_LABELS[childLevel]}`}
                        >
                            <Plus size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Children summary */}
            {childCount > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {node.children!.slice(0, 6).map((child) => (
                        <span
                            key={child._id}
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${LEVEL_COLORS[child.level]}`}
                            title={child.title[lang] || child.title.en}
                        >
                            {(child.title[lang] || child.title.en).length > 18
                                ? (child.title[lang] || child.title.en).slice(0, 18) + '…'
                                : (child.title[lang] || child.title.en)}
                        </span>
                    ))}
                    {childCount > 6 && (
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            +{childCount - 6} more
                        </span>
                    )}
                </div>
            )}

            {/* Footer stats */}
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {childLevel ? `${childCount} ${LEVEL_LABELS[childLevel].toLowerCase()}${childCount !== 1 ? 's' : ''}` : 'Leaf node'}
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600">{node.code}</span>
            </div>
        </div>
    );
}


// ─── Main HierarchyManager Page ──────────────────────────────────────────


export default function HierarchyManager() {
    const [lang, setLang] = useState<'en' | 'bn'>('en');
    const [createModal, setCreateModal] = useState<{ level: HierarchyLevel; parentId: string | null } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<HierarchyNode | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try { return (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || 'tree'; } catch { return 'tree'; }
    });

    const handleViewModeChange = useCallback((mode: ViewMode) => {
        setViewMode(mode);
        try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch { /* noop */ }
    }, []);

    // Drag-and-drop state
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
    const dragSourceRef = useRef<{ nodeId: string; level: HierarchyLevel; parentId: string | null } | null>(null);

    const { data: treeResponse, isLoading, isError, error, refetch } = useHierarchyTree();
    const deleteGroup = useDeleteGroup();
    const deleteSubGroup = useDeleteSubGroup();
    const deleteSubject = useDeleteSubject();
    const deleteChapter = useDeleteChapter();
    const deleteTopic = useDeleteTopic();
    const reorderNodes = useReorderNodes();

    const tree = treeResponse?.groups ?? [];

    const handleDelete = useCallback(async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        try {
            const deleteMutation = {
                group: deleteGroup,
                sub_group: deleteSubGroup,
                subject: deleteSubject,
                chapter: deleteChapter,
                topic: deleteTopic,
            }[deleteTarget.level];
            await deleteMutation.mutateAsync(deleteTarget._id);
            toast.success(`${LEVEL_LABELS[deleteTarget.level]} deleted`);
            setDeleteTarget(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete';
            toast.error(message);
        } finally {
            setIsDeleting(false);
        }
    }, [deleteTarget, deleteGroup, deleteSubGroup, deleteSubject, deleteChapter, deleteTopic]);

    // Drag-and-drop handlers
    const handleDragStart = useCallback(
        (nodeId: string, level: HierarchyLevel, parentId: string | null) => {
            setDraggedNodeId(nodeId);
            dragSourceRef.current = { nodeId, level, parentId };
        },
        [],
    );

    const handleDragOver = useCallback((e: React.DragEvent, _nodeId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent, targetNodeId: string, targetLevel: HierarchyLevel, targetParentId: string | null) => {
            e.preventDefault();
            const source = dragSourceRef.current;
            if (!source || source.nodeId === targetNodeId) return;

            // Only allow reorder within same level and same parent
            if (source.level !== targetLevel || source.parentId !== targetParentId) {
                toast.error('Can only reorder nodes at the same level under the same parent');
                return;
            }

            // Find siblings to compute new order
            const findSiblings = (nodes: HierarchyNode[], parentId: string | null): HierarchyNode[] => {
                if (!parentId) return nodes;
                for (const node of nodes) {
                    if (node._id === parentId) return node.children ?? [];
                    if (node.children) {
                        const found = findSiblings(node.children, parentId);
                        if (found.length > 0) return found;
                    }
                }
                return [];
            };

            const siblings = findSiblings(tree, source.parentId);
            const orderedIds = siblings.map((s) => s._id);
            const sourceIdx = orderedIds.indexOf(source.nodeId);
            const targetIdx = orderedIds.indexOf(targetNodeId);

            if (sourceIdx === -1 || targetIdx === -1) return;

            // Move source to target position
            orderedIds.splice(sourceIdx, 1);
            orderedIds.splice(targetIdx, 0, source.nodeId);

            const reorderParentId = source.parentId ?? source.nodeId;
            reorderNodes.mutate(
                {
                    level: source.level,
                    id: reorderParentId,
                    payload: { level: source.level, orderedIds },
                },
                {
                    onSuccess: () => toast.success('Reordered successfully'),
                    onError: () => toast.error('Failed to reorder'),
                },
            );
        },
        [tree, reorderNodes],
    );

    const handleDragEnd = useCallback(() => {
        setDraggedNodeId(null);
        dragSourceRef.current = null;
    }, []);

    return (
        <AdminGuardShell title="Question Hierarchy" description="Manage the 5-level question taxonomy" requiredModule="exam_center">
            <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
                {/* Page header */}
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                            <FolderTree size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                                Question Hierarchy
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Manage the 5-level question taxonomy
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Language toggle */}
                        <button
                            type="button"
                            onClick={() => setLang((prev) => (prev === 'en' ? 'bn' : 'en'))}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            aria-label={`Switch to ${lang === 'en' ? 'Bengali' : 'English'}`}
                        >
                            <Languages size={16} />
                            {lang === 'en' ? 'EN' : 'বাং'}
                        </button>

                        {/* View mode toggle */}
                        <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-600">
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('tree')}
                                className={`rounded-l-lg p-2 transition-colors ${viewMode === 'tree' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                                aria-label="Tree view"
                                title="Tree view"
                            >
                                <List size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleViewModeChange('card')}
                                className={`rounded-r-lg p-2 transition-colors ${viewMode === 'card' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                                aria-label="Card view"
                                title="Card view"
                            >
                                <LayoutGrid size={16} />
                            </button>
                        </div>

                        {/* Refresh */}
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isLoading}
                            className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                            aria-label="Refresh tree"
                        >
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </button>

                        {/* Add root group */}
                        <button
                            type="button"
                            onClick={() => setCreateModal({ level: 'group', parentId: null })}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            <Plus size={16} />
                            Add Group
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className={viewMode === 'card' ? '' : 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900'}>
                    {isLoading && (viewMode === 'card' ? <CardSkeleton /> : <TreeSkeleton />)}

                    {isError && (
                        <div className="flex flex-col items-center gap-3 py-12 text-center">
                            <AlertCircle size={32} className="text-red-400" />
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {error instanceof Error ? error.message : 'Failed to load hierarchy tree'}
                            </p>
                            <button
                                type="button"
                                onClick={() => refetch()}
                                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                            >
                                <RefreshCw size={14} />
                                Retry
                            </button>
                        </div>
                    )}

                    {!isLoading && !isError && tree.length === 0 && (
                        <div className="flex flex-col items-center gap-3 py-12 text-center">
                            <FolderTree size={32} className="text-slate-300 dark:text-slate-600" />
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                No hierarchy nodes yet. Create your first group to get started.
                            </p>
                            <button
                                type="button"
                                onClick={() => setCreateModal({ level: 'group', parentId: null })}
                                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                            >
                                <Plus size={14} />
                                Add Group
                            </button>
                        </div>
                    )}

                    {/* Tree View */}
                    {!isLoading && !isError && tree.length > 0 && viewMode === 'tree' && (
                        <div role="tree" aria-label="Question hierarchy tree">
                            {tree.map((group) => (
                                <TreeNode
                                    key={group._id}
                                    node={group}
                                    lang={lang}
                                    depth={0}
                                    onRequestCreate={(level, parentId) => setCreateModal({ level, parentId })}
                                    onRequestDelete={setDeleteTarget}
                                    draggedNodeId={draggedNodeId}
                                    onDragStart={handleDragStart}
                                    onDragOver={handleDragOver}
                                    onDrop={handleDrop}
                                    onDragEnd={handleDragEnd}
                                    parentId={null}
                                />
                            ))}
                        </div>
                    )}

                    {/* Card View */}
                    {!isLoading && !isError && tree.length > 0 && viewMode === 'card' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Question hierarchy cards">
                            {tree.map((group) => (
                                <HierarchyCard
                                    key={group._id}
                                    node={group}
                                    lang={lang}
                                    onRequestCreate={(level, parentId) => setCreateModal({ level, parentId })}
                                    onRequestDelete={setDeleteTarget}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Create modal */}
                {createModal && (
                    <CreateNodeModal
                        level={createModal.level}
                        parentId={createModal.parentId}
                        onClose={() => setCreateModal(null)}
                        onCreated={() => refetch()}
                    />
                )}

                {/* Delete confirmation dialog */}
                {deleteTarget && (
                    <DeleteDialog
                        node={deleteTarget}
                        lang={lang}
                        onConfirm={handleDelete}
                        onCancel={() => setDeleteTarget(null)}
                        isDeleting={isDeleting}
                    />
                )}
            </div>
        </AdminGuardShell>
    );
}
