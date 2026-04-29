/**
 * Backblaze B2 backup helper — feature-gated.
 *
 * uploadBuffer(remotePath, data, contentType) uploads a Buffer to the
 * configured B2 bucket using the native B2 API:
 *   1. b2_authorize_account
 *   2. b2_get_upload_url
 *   3. POST upload (X-Bz-File-Name + sha1 headers)
 *
 * Returns true on success, false on any failure (including disabled).
 * Streaming/large-file (>5GB) upload is a follow-up; the existing backup
 * cron only generates small DB dumps that fit comfortably in memory.
 */
import crypto from 'crypto';
import { isIntegrationReady, getIntegrationConfig } from './featureGate';
import { getDecryptedSecret } from './integrationsService';
import { logger } from '../../utils/logger';

const KEY = 'b2_backup';
const TIMEOUT_MS = 30000;

interface AuthResponse {
    apiUrl: string;
    authorizationToken: string;
}

interface UploadUrlResponse {
    uploadUrl: string;
    authorizationToken: string;
}

async function authorize(keyId: string, appKey: string): Promise<AuthResponse | null> {
    const credentials = Buffer.from(`${keyId}:${appKey}`).toString('base64');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch('https://api.backblazeb2.com/b2api/v3/b2_authorize_account', {
            headers: { Authorization: `Basic ${credentials}` },
            signal: ctrl.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { apiInfo?: { storageApi?: AuthResponse }; authorizationToken?: string };
        const storage = data.apiInfo?.storageApi;
        if (!storage || !data.authorizationToken) return null;
        return {
            apiUrl: storage.apiUrl,
            authorizationToken: data.authorizationToken,
        };
    } catch (err) {
        logger.warn(`[backupHelper] authorize failed: ${(err as Error).message}`);
        return null;
    } finally {
        clearTimeout(t);
    }
}

async function getUploadUrl(apiUrl: string, token: string, bucketId: string): Promise<UploadUrlResponse | null> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${apiUrl}/b2api/v3/b2_get_upload_url`, {
            method: 'POST',
            headers: {
                Authorization: token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ bucketId }),
            signal: ctrl.signal,
        });
        if (!res.ok) return null;
        return (await res.json()) as UploadUrlResponse;
    } catch (err) {
        logger.warn(`[backupHelper] getUploadUrl failed: ${(err as Error).message}`);
        return null;
    } finally {
        clearTimeout(t);
    }
}

export async function uploadBuffer(
    remotePath: string,
    data: Buffer,
    contentType: string = 'application/octet-stream',
): Promise<boolean> {
    const ready = await isIntegrationReady(KEY);
    if (!ready) return false;
    const cfg = await getIntegrationConfig(KEY);
    if (!cfg) return false;
    const bucketId = String(cfg.bucketId || '');
    const keyId = (await getDecryptedSecret(KEY, 'keyId')) ?? '';
    const appKey = (await getDecryptedSecret(KEY, 'applicationKey')) ?? '';
    if (!bucketId || !keyId || !appKey) return false;

    const auth = await authorize(keyId, appKey);
    if (!auth) return false;
    const upload = await getUploadUrl(auth.apiUrl, auth.authorizationToken, bucketId);
    if (!upload) return false;

    const sha1 = crypto.createHash('sha1').update(data).digest('hex');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(upload.uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: upload.authorizationToken,
                'X-Bz-File-Name': encodeURIComponent(remotePath),
                'Content-Type': contentType,
                'Content-Length': String(data.length),
                'X-Bz-Content-Sha1': sha1,
            },
            body: data,
            signal: ctrl.signal,
        });
        if (!res.ok) {
            logger.warn(`[backupHelper] upload http ${res.status}`);
            return false;
        }
        return true;
    } catch (err) {
        logger.warn(`[backupHelper] upload failed: ${(err as Error).message}`);
        return false;
    } finally {
        clearTimeout(t);
    }
}
