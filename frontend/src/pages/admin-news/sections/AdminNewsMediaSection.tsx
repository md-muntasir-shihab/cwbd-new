import { ChangeEvent, FormEvent, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import NewsHelpButton from '../../../components/admin/NewsHelpButton';
import CompressedImageInput, { extractUploadError } from '../../../components/common/CompressedImageInput';
import {
    ApiNewsV2Media,
    adminNewsV2DeleteMedia,
    adminNewsV2GetMedia,
    adminNewsV2MediaFromUrl,
    adminNewsV2UploadMedia,
} from '../../../services/api';
import { buildMediaUrl } from '../../../utils/mediaUrl';

export default function AdminNewsMediaSection() {
    const queryClient = useQueryClient();
    const [page, setPage] = useState(1);
    const [q, setQ] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [altText, setAltText] = useState('');
    const [isDefaultBanner, setIsDefaultBanner] = useState(false);
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaUrlAlt, setMediaUrlAlt] = useState('');

    const mediaQuery = useQuery({
        queryKey: ['newsv2.media', page, q],
        queryFn: async () => (await adminNewsV2GetMedia({ page, limit: 24, q })).data,
    });

    const uploadMutation = useMutation({
        mutationFn: async () => {
            if (!selectedFile) throw new Error('Please select a file');
            let fileToUpload = selectedFile;
            try {
                const compressed = await imageCompression(selectedFile, {
                    maxSizeMB: 0.15,
                    maxWidthOrHeight: 1920,
                    useWebWorker: true,
                });
                fileToUpload = new File([compressed], selectedFile.name, {
                    type: compressed.type,
                    lastModified: Date.now(),
                });
            } catch (err) {
                console.warn('Compression failed, using original', err);
            }
            return (await adminNewsV2UploadMedia(fileToUpload, { altText, isDefaultBanner })).data;
        },
        onSuccess: () => {
            toast.success('Media uploaded');
            setSelectedFile(null);
            setAltText('');
            setIsDefaultBanner(false);
            queryClient.invalidateQueries({ queryKey: ['newsv2.media'] });
        },
        onError: (err: unknown) => toast.error(extractUploadError(err)),
    });

    const urlMutation = useMutation({
        mutationFn: async () => (await adminNewsV2MediaFromUrl(mediaUrl, mediaUrlAlt, isDefaultBanner)).data,
        onSuccess: () => {
            toast.success('Media imported');
            setMediaUrl('');
            setMediaUrlAlt('');
            queryClient.invalidateQueries({ queryKey: ['newsv2.media'] });
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || 'URL import failed'),
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => (await adminNewsV2DeleteMedia(id)).data,
        onSuccess: () => {
            toast.success('Media removed');
            queryClient.invalidateQueries({ queryKey: ['newsv2.media'] });
        },
        onError: (err: any) => toast.error(err?.response?.data?.message || 'Delete failed'),
    });

    function onSelectFile(file: File | null) {
        if (!file) return;
        setSelectedFile(file);
    }

    function onUpload(event: FormEvent) {
        event.preventDefault();
        uploadMutation.mutate();
    }

    function onImportUrl(event: FormEvent) {
        event.preventDefault();
        if (!mediaUrl.trim()) {
            toast.error('Image URL is required');
            return;
        }
        urlMutation.mutate();
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
                <form onSubmit={onUpload} className="card-flat border border-cyan-500/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold">Upload Media</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Upload reusable images for stories, banners, and source icons.</p>
                        </div>
                        <NewsHelpButton
                            title="Media Uploads"
                            content="This area stores reusable media assets used by news items and source icons."
                            impact="It keeps editors from re-uploading the same images repeatedly."
                            affected="Editors and admins managing story assets."
                            publishNote="Once an image is attached to a published story, the public view will use the stored media URL."
                            publishSendNote="If a published item is later sent, the same media can be reused in the communication payload."
                            enabledNote="Centralized media makes later edits and deletes easier to audit."
                            disabledNote="Scattered uploads are harder to clean up and can leave stale assets behind."
                            bestPractice="Use descriptive alt text so cards and previews stay accessible."
                            variant="full"
                        />
                    </div>
                    <div className="mt-3 space-y-3">
                        <CompressedImageInput accept="image/*" onChange={onSelectFile} className="input-field" />
                        <input
                            className="input-field"
                            placeholder="Alt text"
                            value={altText}
                            onChange={(e) => setAltText(e.target.value)}
                        />
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={isDefaultBanner}
                                onChange={(e) => setIsDefaultBanner(e.target.checked)}
                            />
                            Mark as default banner
                        </label>
                        <button type="submit" className="btn-primary" disabled={uploadMutation.isPending || !selectedFile}>
                            {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
                        </button>
                    </div>
                </form>

                <form onSubmit={onImportUrl} className="card-flat border border-cyan-500/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                            <h2 className="text-lg font-semibold">Import From URL</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Import a remote image when upload is not available.</p>
                        </div>
                    </div>
                    <div className="mt-3 space-y-3">
                        <input
                            className="input-field"
                            placeholder="https://example.com/image.jpg"
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value)}
                        />
                        <input
                            className="input-field"
                            placeholder="Alt text"
                            value={mediaUrlAlt}
                            onChange={(e) => setMediaUrlAlt(e.target.value)}
                        />
                        <button type="submit" className="btn-primary" disabled={urlMutation.isPending || !mediaUrl.trim()}>
                            {urlMutation.isPending ? 'Importing...' : 'Import URL'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="card-flat border border-cyan-500/20 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold">Media Library</h3>
                    <input
                        className="input-field w-full sm:w-80"
                        placeholder="Search by alt text or URL"
                        value={q}
                        onChange={(e) => {
                            setQ(e.target.value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {(mediaQuery.data?.items || []).map((item) => (
                        <MediaCard key={item._id} item={item} onDelete={() => deleteMutation.mutate(item._id)} deleting={deleteMutation.isPending} />
                    ))}
                </div>
                {!mediaQuery.data?.items?.length && (
                    <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No media assets found.</p>
                )}
                <div className="mt-4 flex items-center justify-end gap-2">
                    <button
                        className="btn-outline"
                        disabled={page <= 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                        Previous
                    </button>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                        Page {mediaQuery.data?.page || page} / {mediaQuery.data?.pages || 1}
                    </span>
                    <button
                        className="btn-outline"
                        disabled={page >= (mediaQuery.data?.pages || 1)}
                        onClick={() => setPage((prev) => prev + 1)}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}

function MediaCard({ item, onDelete, deleting }: { item: ApiNewsV2Media; onDelete: () => void; deleting: boolean }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-slate-300/60 bg-slate-100/70 dark:border-slate-700/60 dark:bg-slate-950/50">
            <div className="aspect-[4/3] overflow-hidden bg-slate-200 dark:bg-slate-900">
                <img src={buildMediaUrl(item.url)} alt={item.altText || 'news media'} className="h-full w-full object-cover" loading="lazy" />
            </div>
            <div className="space-y-2 p-3">
                <p className="line-clamp-2 text-xs text-slate-700 dark:text-slate-200">{item.altText || 'No alt text'}</p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{item.sourceType}</p>
                <div className="flex flex-wrap gap-2">
                    <button
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:text-slate-200"
                        onClick={() => navigator.clipboard.writeText(item.url)}
                        type="button"
                    >
                        Copy URL
                    </button>
                    <button
                        className="rounded border border-rose-600/60 px-2 py-1 text-xs text-rose-300"
                        onClick={onDelete}
                        type="button"
                        disabled={deleting}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
