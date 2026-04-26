import { useId, useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Image as ImageIcon, ImageUp, Loader2, Trash2 } from 'lucide-react';
import { adminUploadMedia } from '../../services/api';
import { compressImage } from '../../utils/imageCompressor';
import { buildMediaUrl } from '../../utils/mediaUrl';

type UploadCategory = 'profile_photo' | 'admin_upload';

type AdminImageUploadFieldProps = {
    label: string;
    value?: string | null;
    onChange: (nextValue: string) => void;
    helper?: string;
    category?: UploadCategory;
    previewAlt?: string;
    required?: boolean;
    disabled?: boolean;
    accept?: string;
    fit?: 'cover' | 'contain';
    onUpload?: (file: File) => Promise<string>;
    uploadSuccessMessage?: string;
    uploadErrorMessage?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    className?: string;
    panelClassName?: string;
    previewClassName?: string;
};

async function uploadWithDefaultMediaEndpoint(file: File, category: UploadCategory): Promise<string> {
    try {
        const processedFile = await compressImage(file, 0.15); // max 150KB

        const response = await adminUploadMedia(processedFile, {
            visibility: 'public',
            category,
        });
        const payload = response.data as { url?: string; absoluteUrl?: string };
        const nextUrl = String(payload?.url || payload?.absoluteUrl || '').trim();
        if (!nextUrl) {
            throw new Error('No image URL returned');
        }
        return nextUrl;
    } catch (error) {
        console.warn("Upload failed, trying original file...", error);
        // Fallback or re-throw
        const response = await adminUploadMedia(file, {
            visibility: 'public',
            category,
        });
        const payload = response.data as { url?: string; absoluteUrl?: string };
        const nextUrl = String(payload?.url || payload?.absoluteUrl || '').trim();
        if (!nextUrl) {
            throw new Error('No image URL returned');
        }
        return nextUrl;
    }
}

export default function AdminImageUploadField({
    label,
    value,
    onChange,
    helper,
    category = 'admin_upload',
    previewAlt,
    required = false,
    disabled = false,
    accept = 'image/*',
    fit = 'cover',
    onUpload,
    uploadSuccessMessage,
    uploadErrorMessage,
    emptyTitle = 'No file uploaded yet',
    emptyDescription = 'Upload an image file to store the URL automatically.',
    className = '',
    panelClassName = '',
    previewClassName = '',
}: AdminImageUploadFieldProps) {
    const inputId = useId();
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const currentValue = String(value || '').trim();
    const hasValue = currentValue.length > 0;

    const handleUpload = async (file?: File | null) => {
        if (!file || disabled) return;
        // Validate file size (max 5MB)
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            setError(`File too large (${sizeMB}MB). Maximum allowed is 5MB.`);
            toast.error(`File too large (${sizeMB}MB). Maximum is 5MB.`);
            return;
        }
        setUploading(true);
        setError('');
        try {
            const nextUrl = onUpload
                ? await onUpload(file)
                : await uploadWithDefaultMediaEndpoint(file, category);
            onChange(String(nextUrl || '').trim());
            toast.success(uploadSuccessMessage || 'Image uploaded');
        } catch (rawError: unknown) {
            const resolvedMessage = String(
                (rawError as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
                || (rawError as { message?: string })?.message
                || uploadErrorMessage
                || 'Failed to upload image',
            ).trim();
            setError(resolvedMessage);
            toast.error(uploadErrorMessage || resolvedMessage);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className={`space-y-2 ${className}`.trim()}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={inputId} className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {label}
                    {required ? <span className="ml-1 text-rose-400">*</span> : null}
                </label>
                {hasValue ? (
                    <a
                        href={buildMediaUrl(currentValue)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-500 hover:text-indigo-400 dark:text-indigo-300"
                    >
                        Open image
                        <ExternalLink className="h-3 w-3" />
                    </a>
                ) : null}
            </div>

            <div
                className={`rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm dark:border-indigo-500/10 dark:bg-slate-950/45 ${panelClassName}`.trim()}
            >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.9fr)]">
                    <div
                        className={`flex min-h-[180px] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 dark:border-indigo-500/15 dark:bg-slate-950/75 ${previewClassName}`.trim()}
                    >
                        {hasValue ? (
                            <img
                                src={buildMediaUrl(currentValue)}
                                alt={previewAlt || label}
                                className={`h-full w-full ${fit === 'contain' ? 'object-contain p-4' : 'object-cover'}`}
                            />
                        ) : (
                            <div className="flex max-w-xs flex-col items-center justify-center px-6 py-8 text-center">
                                <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 dark:text-indigo-300">
                                    <ImageIcon className="h-5 w-5" />
                                </span>
                                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{emptyTitle}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{emptyDescription}</p>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col justify-between gap-4">
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <label
                                    htmlFor={inputId}
                                    className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${disabled || uploading
                                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500'
                                            : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/15 dark:border-indigo-500/25 dark:bg-indigo-500/10 dark:text-indigo-100'
                                        }`}
                                >
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                                    {hasValue ? 'Replace image' : 'Upload image'}
                                    <input
                                        id={inputId}
                                        type="file"
                                        accept={accept}
                                        disabled={disabled || uploading}
                                        className="hidden"
                                        onChange={(event) => {
                                            void handleUpload(event.target.files?.[0] || null);
                                            event.currentTarget.value = '';
                                        }}
                                    />
                                </label>

                                {hasValue ? (
                                    <button
                                        type="button"
                                        disabled={disabled || uploading}
                                        onClick={() => {
                                            setError('');
                                            onChange('');
                                        }}
                                        className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Remove
                                    </button>
                                ) : null}
                            </div>

                            <div className="space-y-1.5">
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {helper || 'Uploaded file URL will be saved into the existing field automatically.'}
                                </p>
                                {hasValue ? (
                                    <p className="truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                                        {currentValue}
                                    </p>
                                ) : null}
                                {error ? <p className="text-xs text-rose-500 dark:text-rose-300">{error}</p> : null}
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
                            Save the form after upload to persist this image on the page.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
