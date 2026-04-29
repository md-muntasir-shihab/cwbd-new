/**
 * Public-safe analytics config exposure.
 * The frontend needs the analytics tracker host + site/website ID to load the
 * Umami or Plausible script. Those values are non-secret by design (they're
 * embedded in <script> tags) so we expose them via a sanitized DTO. Auth tokens
 * and any other secrets are NEVER returned here.
 */
import { isIntegrationReady, getIntegrationConfig } from './featureGate';

export interface AnalyticsClientConfig {
    provider: 'umami' | 'plausible' | null;
    scriptUrl: string | null;
    siteId: string | null;
    domain: string | null;
}

export async function getPublicAnalyticsConfig(): Promise<AnalyticsClientConfig> {
    const empty: AnalyticsClientConfig = {
        provider: null,
        scriptUrl: null,
        siteId: null,
        domain: null,
    };

    if (await isIntegrationReady('umami', ['host'])) {
        const cfg = await getIntegrationConfig('umami');
        if (cfg) {
            const host = String(cfg.host || '').replace(/\/$/, '');
            const websiteId = cfg.websiteId ? String(cfg.websiteId) : null;
            if (host && websiteId) {
                return {
                    provider: 'umami',
                    scriptUrl: `${host}/script.js`,
                    siteId: websiteId,
                    domain: cfg.domain ? String(cfg.domain) : null,
                };
            }
        }
    }

    if (await isIntegrationReady('plausible', ['domain'])) {
        const cfg = await getIntegrationConfig('plausible');
        if (cfg) {
            const host = String(cfg.host || 'https://plausible.io').replace(/\/$/, '');
            const domain = cfg.domain ? String(cfg.domain) : null;
            if (domain) {
                return {
                    provider: 'plausible',
                    scriptUrl: `${host}/js/script.js`,
                    siteId: domain,
                    domain,
                };
            }
        }
    }

    return empty;
}
