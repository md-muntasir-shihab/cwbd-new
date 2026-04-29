/**
 * Loads the configured privacy-friendly analytics script (Umami or Plausible)
 * once when the app boots, but only if the corresponding integration is enabled
 * server-side. Renders nothing visually.
 */
import { useEffect, useRef } from 'react';
import api from '../services/api';

interface AnalyticsClientConfig {
    provider: 'umami' | 'plausible' | null;
    scriptUrl: string | null;
    siteId: string | null;
    domain: string | null;
}

const SCRIPT_ID = 'cw-analytics-tracker';

export default function AnalyticsTracker() {
    const injectedRef = useRef(false);

    useEffect(() => {
        if (injectedRef.current) return;
        if (typeof window === 'undefined') return;
        if (document.getElementById(SCRIPT_ID)) return;

        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get<AnalyticsClientConfig>('/integrations/analytics-config');
                if (cancelled || !data || !data.provider || !data.scriptUrl) return;
                const script = document.createElement('script');
                script.id = SCRIPT_ID;
                script.async = true;
                script.defer = true;
                script.src = data.scriptUrl;
                if (data.provider === 'umami' && data.siteId) {
                    script.setAttribute('data-website-id', data.siteId);
                }
                if (data.provider === 'plausible' && data.domain) {
                    script.setAttribute('data-domain', data.domain);
                }
                document.head.appendChild(script);
                injectedRef.current = true;
            } catch {
                // Silent: analytics is best-effort.
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
