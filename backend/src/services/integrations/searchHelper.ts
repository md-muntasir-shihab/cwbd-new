/**
 * Meilisearch helper — feature-gated.
 * When the meilisearch integration is disabled or misconfigured, every public
 * function becomes a safe no-op so callers can call this from existing service
 * code without conditional checks.
 *
 * No SDK dependency: we hit the Meilisearch HTTP API directly with fetch.
 */
import { isIntegrationReady, getIntegrationConfig } from './featureGate';
import { getDecryptedSecret } from './integrationsService';
import { logger } from '../../utils/logger';

const KEY = 'meilisearch';
const TIMEOUT_MS = 5000;

async function meiliRequest(path: string, init: RequestInit = {}): Promise<Response | null> {
    const ready = await isIntegrationReady(KEY);
    if (!ready) return null;
    const cfg = await getIntegrationConfig(KEY);
    if (!cfg) return null;
    const host = String(cfg.host || '').replace(/\/$/, '');
    const apiKey = await getDecryptedSecret(KEY, 'apiKey');
    if (!host || !apiKey) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${host}${path}`, {
            ...init,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                ...(init.headers || {}),
            },
            signal: ctrl.signal,
        });
        return res;
    } catch (err) {
        logger.warn(`[searchHelper] ${path} failed: ${(err as Error).message}`);
        return null;
    } finally {
        clearTimeout(t);
    }
}

export async function indexDocument(index: string, doc: Record<string, unknown> & { id: string | number }): Promise<void> {
    const res = await meiliRequest(`/indexes/${encodeURIComponent(index)}/documents`, {
        method: 'POST',
        body: JSON.stringify([doc]),
    });
    if (res && !res.ok) {
        logger.warn(`[searchHelper] indexDocument(${index}) http ${res.status}`);
    }
}

export async function deleteDocument(index: string, id: string | number): Promise<void> {
    await meiliRequest(`/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
    });
}

export interface SearchHit {
    id: string | number;
    [k: string]: unknown;
}

export async function search<T = SearchHit>(index: string, query: string, limit = 20): Promise<T[]> {
    const res = await meiliRequest(`/indexes/${encodeURIComponent(index)}/search`, {
        method: 'POST',
        body: JSON.stringify({ q: query, limit }),
    });
    if (!res || !res.ok) return [];
    try {
        const data = (await res.json()) as { hits?: T[] };
        return data.hits ?? [];
    } catch {
        return [];
    }
}
