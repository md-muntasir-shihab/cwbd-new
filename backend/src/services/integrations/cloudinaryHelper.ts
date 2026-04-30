/**
 * Cloudinary helper — feature-gated.
 *
 * Provides image upload and URL generation via the Cloudinary REST API.
 * When the cloudinary integration is disabled or misconfigured, every public
 * function returns a safe no-op value so callers can use this without
 * conditional checks.
 *
 * No SDK dependency: we hit the Cloudinary Upload API directly with fetch.
 */
import { isIntegrationReady, getIntegrationConfig } from './featureGate';
import { getDecryptedSecret } from './integrationsService';
import { logger } from '../../utils/logger';

const KEY = 'cloudinary' as const;
const TIMEOUT_MS = 15000;

export interface CloudinaryUploadResult {
    publicId: string;
    secureUrl: string;
    width: number;
    height: number;
    format: string;
}

/**
 * Upload a buffer to Cloudinary. Returns the upload result or null if the
 * integration is disabled, misconfigured, or the upload fails.
 */
export async function uploadImage(
    data: Buffer,
    options: { folder?: string; publicId?: string } = {},
): Promise<CloudinaryUploadResult | null> {
    const ready = await isIntegrationReady(KEY, ['apiKey', 'apiSecret']);
    if (!ready) return null;

    const cfg = await getIntegrationConfig(KEY);
    if (!cfg) return null;
    const cloudName = String(cfg.cloudName || '');
    const apiKey = (await getDecryptedSecret(KEY, 'apiKey')) ?? '';
    const apiSecret = (await getDecryptedSecret(KEY, 'apiSecret')) ?? '';
    if (!cloudName || !apiKey || !apiSecret) return null;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const params: Record<string, string> = { timestamp };
        if (options.folder) params.folder = options.folder;
        if (options.publicId) params.public_id = options.publicId;

        // Build signature string (sorted params + api_secret)
        const sortedParams = Object.keys(params)
            .sort()
            .map((k) => `${k}=${params[k]}`)
            .join('&');

        const { createHash } = await import('crypto');
        const signature = createHash('sha1')
            .update(sortedParams + apiSecret)
            .digest('hex');

        const formData = new FormData();
        formData.append('file', new Blob([data]));
        formData.append('api_key', apiKey);
        formData.append('signature', signature);
        Object.entries(params).forEach(([k, v]) => formData.append(k, v));

        const res = await fetch(
            `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
            { method: 'POST', body: formData, signal: ctrl.signal },
        );
        if (!res.ok) {
            logger.warn(`[cloudinaryHelper] upload http ${res.status}`);
            return null;
        }
        const json = (await res.json()) as {
            public_id?: string;
            secure_url?: string;
            width?: number;
            height?: number;
            format?: string;
        };
        return {
            publicId: json.public_id ?? '',
            secureUrl: json.secure_url ?? '',
            width: json.width ?? 0,
            height: json.height ?? 0,
            format: json.format ?? '',
        };
    } catch (err) {
        logger.warn(`[cloudinaryHelper] upload failed: ${(err as Error).message}`);
        return null;
    } finally {
        clearTimeout(t);
    }
}

/**
 * Generate a Cloudinary delivery URL for a given public ID.
 * Returns null if the integration is disabled.
 */
export async function getImageUrl(
    publicId: string,
    options: { width?: number; height?: number; format?: string } = {},
): Promise<string | null> {
    const ready = await isIntegrationReady(KEY, ['apiKey', 'apiSecret']);
    if (!ready) return null;

    const cfg = await getIntegrationConfig(KEY);
    if (!cfg) return null;
    const cloudName = String(cfg.cloudName || '');
    if (!cloudName || !publicId) return null;

    try {
        const transforms: string[] = [];
        if (options.width) transforms.push(`w_${options.width}`);
        if (options.height) transforms.push(`h_${options.height}`);
        const transformStr = transforms.length > 0 ? `${transforms.join(',')}/` : '';
        const ext = options.format || 'webp';
        return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${transformStr}${publicId}.${ext}`;
    } catch (err) {
        logger.warn(`[cloudinaryHelper] getImageUrl failed: ${(err as Error).message}`);
        return null;
    }
}
