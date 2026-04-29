/**
 * imgproxy helper — feature-gated.
 * Returns a signed imgproxy URL when the integration is enabled, otherwise
 * returns the original sourceUrl unchanged.
 *
 * Spec: https://docs.imgproxy.net/generating_the_url
 */
import crypto from 'crypto';
import { isIntegrationReady, getIntegrationConfig } from './featureGate';
import { getDecryptedSecret } from './integrationsService';
import { logger } from '../../utils/logger';

const KEY = 'imgproxy';

export interface ImageOptions {
    width?: number;
    height?: number;
    fit?: 'fit' | 'fill' | 'crop' | 'force';
    quality?: number;
    format?: 'jpg' | 'png' | 'webp' | 'avif';
}

function urlSafeBase64(buf: Buffer | string): string {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hexToBytes(hex: string): Buffer | null {
    if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
    return Buffer.from(hex, 'hex');
}

export async function transformUrl(sourceUrl: string, opts: ImageOptions = {}): Promise<string> {
    if (!sourceUrl) return sourceUrl;
    const ready = await isIntegrationReady(KEY);
    if (!ready) return sourceUrl;

    try {
        const cfg = await getIntegrationConfig(KEY);
        if (!cfg) return sourceUrl;
        const host = String(cfg.host || '').replace(/\/$/, '');
        const keyHex = (await getDecryptedSecret(KEY, 'key')) ?? '';
        const saltHex = (await getDecryptedSecret(KEY, 'salt')) ?? '';
        if (!host || !keyHex || !saltHex) return sourceUrl;

        const keyBuf = hexToBytes(keyHex);
        const saltBuf = hexToBytes(saltHex);
        if (!keyBuf || !saltBuf) return sourceUrl;

        const w = opts.width ?? 0;
        const h = opts.height ?? 0;
        const fit = opts.fit ?? 'fit';
        const q = opts.quality ?? 80;
        const ext = opts.format ?? 'webp';

        const encodedSource = urlSafeBase64(sourceUrl);
        const path = `/rs:${fit}:${w}:${h}:0/q:${q}/${encodedSource}.${ext}`;
        const hmac = crypto.createHmac('sha256', keyBuf);
        hmac.update(saltBuf);
        hmac.update(path);
        const sig = urlSafeBase64(hmac.digest());
        return `${host}/${sig}${path}`;
    } catch (err) {
        logger.warn(`[imageHelper] transformUrl failed: ${(err as Error).message}`);
        return sourceUrl;
    }
}
