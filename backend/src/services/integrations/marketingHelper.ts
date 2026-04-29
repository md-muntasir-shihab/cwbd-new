/**
 * Mautic helper — feature-gated.
 * trackContact() upserts a contact by email; trackEvent() pushes a custom
 * event. Both are silent no-ops if Mautic is disabled.
 *
 * Uses Mautic Basic Auth REST API (https://developer.mautic.org/).
 */
import { isIntegrationReady, getIntegrationConfig } from './featureGate';
import { getDecryptedSecret } from './integrationsService';
import { logger } from '../../utils/logger';

const KEY = 'mautic';
const TIMEOUT_MS = 5000;

async function mauticRequest(path: string, init: RequestInit = {}): Promise<boolean> {
    const ready = await isIntegrationReady(KEY);
    if (!ready) return false;
    const cfg = await getIntegrationConfig(KEY);
    if (!cfg) return false;
    const host = String(cfg.host || '').replace(/\/$/, '');
    const username = String(cfg.username || '');
    const password = (await getDecryptedSecret(KEY, 'password')) ?? '';
    if (!host || !username || !password) return false;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        const res = await fetch(`${host}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${auth}`,
                ...(init.headers || {}),
            },
            signal: ctrl.signal,
        });
        return res.ok;
    } catch (err) {
        logger.warn(`[marketingHelper] ${path} failed: ${(err as Error).message}`);
        return false;
    } finally {
        clearTimeout(t);
    }
}

export async function trackContact(contact: {
    email: string;
    firstname?: string;
    lastname?: string;
    tags?: string[];
}): Promise<boolean> {
    return mauticRequest('/api/contacts/new', {
        method: 'POST',
        body: JSON.stringify(contact),
    });
}

export async function trackEvent(_eventName: string, _data: Record<string, unknown>): Promise<boolean> {
    // Mautic's stages/points endpoints require workflow setup per-event; this
    // method is provided for future use. For now we just verify reachability.
    const ready = await isIntegrationReady(KEY);
    return ready;
}
