import React, { InputHTMLAttributes, forwardRef } from 'react';
import { compressImage } from '../../utils/imageCompressor';

/**
 * Extract the best available URL from an upload response payload.
 * Handles both `adminUploadMedia` (flat `{ url, absoluteUrl }`) and
 * `adminNewsV2UploadMedia` (nested `{ item: { url, absoluteUrl } }`) formats.
 */
export function extractUploadUrl(data: unknown): string {
    if (!data || typeof data !== 'object') return '';
    const d = data as Record<string, unknown>;
    // Flat response: { url, absoluteUrl }
    const flatUrl = typeof d.url === 'string' ? d.url.trim() : '';
    const flatAbsolute = typeof d.absoluteUrl === 'string' ? d.absoluteUrl.trim() : '';
    // Nested response: { item: { url, absoluteUrl } }
    const item = d.item as Record<string, unknown> | undefined;
    const itemUrl = item && typeof item.url === 'string' ? item.url.trim() : '';
    const itemAbsolute = item && typeof item.absoluteUrl === 'string' ? item.absoluteUrl.trim() : '';
    return itemUrl || itemAbsolute || flatUrl || flatAbsolute || '';
}

/**
 * Extract a user-friendly error message from an upload error.
 * Prefers the backend `response.data.message` over generic fallbacks.
 */
export function extractUploadError(error: unknown, fallback = 'Upload failed'): string {
    if (!error || typeof error !== 'object') return fallback;
    const e = error as Record<string, unknown>;
    // Axios error shape: error.response.data.message
    const resp = e.response as Record<string, unknown> | undefined;
    const respData = resp?.data as Record<string, unknown> | undefined;
    if (respData?.message && typeof respData.message === 'string' && respData.message.trim()) {
        return respData.message.trim();
    }
    // Standard Error.message
    if (typeof e.message === 'string' && e.message.trim()) {
        return e.message.trim();
    }
    return fallback;
}

export interface CompressedImageInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
    onChange: (file: File | null) => void;
    maxSizeMB?: number;
    onCompressionStart?: () => void;
    onCompressionEnd?: () => void;
}

/**
 * A drop-in replacement for `<input type="file" accept="image/*">` 
 * that automatically compresses images before passing the File object to the parent.
 */
export const CompressedImageInput = forwardRef<HTMLInputElement, CompressedImageInputProps>(({
    onChange,
    maxSizeMB = 0.15,
    onCompressionStart,
    onCompressionEnd,
    accept = "image/*",
    ...props
}, ref) => {
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            onChange(null);
            return;
        }

        try {
            if (onCompressionStart) onCompressionStart();
            const compressedFile = await compressImage(file, maxSizeMB);
            onChange(compressedFile);
        } catch (error) {
            console.error("Failed to process image:", error);
            onChange(file); // fallback to original
        } finally {
            if (onCompressionEnd) onCompressionEnd();
            // Reset input value so the same file could be selected again if needed
            event.target.value = '';
        }
    };

    return (
        <input
            {...props}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            ref={ref}
        />
    );
});

CompressedImageInput.displayName = 'CompressedImageInput';

export default CompressedImageInput;
