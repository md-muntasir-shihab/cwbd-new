/**
 * Novu helper — feature-gated.
 * triggerWorkflow() fires a Novu workflow (formerly "template"); silent no-op
 * when Novu is disabled. Uses the Novu REST API directly.
 *
 * Spec: https://docs.novu.co/api-reference/events/trigger-event
 */
import { isIntegrationReady, getIntegrationConfig } from './featureGate';
import { getDecryptedSecret } from './integrationsService';
import { logger } from '../../utils/logger';

const KEY = 'novu';
const TIMEOUT_MS = 5000;

export interface NovuSubscriber {
    subscriberId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
}

export async function triggerWorkflow(
    workflowId: string,
    subscriber: NovuSubscriber,
    payload: Record<string, unknown> = {},
): Promise<boolean> {
    const ready = await isIntegrationReady(KEY);
    if (!ready) return false;
    const cfg = await getIntegrationConfig(KEY);
    if (!cfg) return false;
    const apiUrl = String(cfg.apiUrl || 'https://api.novu.co').replace(/\/$/, '');
    const apiKey = (await getDecryptedSecret(KEY, 'apiKey')) ?? '';
    if (!apiKey) return false;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(`${apiUrl}/v1/events/trigger`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `ApiKey ${apiKey}`,
            },
            body: JSON.stringify({
                name: workflowId,
                to: subscriber,
                payload,
            }),
            signal: ctrl.signal,
        });
        return res.ok;
    } catch (err) {
        logger.warn(`[notificationHelper] Novu trigger failed: ${(err as Error).message}`);
        return false;
    } finally {
        clearTimeout(t);
    }
}
