import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getHomeStreamUrl } from '../services/api';
import { queryKeys } from '../lib/queryKeys';

const HOME_REFRESH_POLL_MS = 10000;
const IS_MOCK_MODE = String(import.meta.env.VITE_USE_MOCK_API || '').toLowerCase() === 'true';

export default function useHomeLiveUpdates(enabled = true): void {
    const queryClient = useQueryClient();
    const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (IS_MOCK_MODE) return;

        if (!enabled) {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            return;
        }

        let source: EventSource | null = null;
        let disposed = false;

        const invalidate = () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.home }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.homeSettings }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.homeSettingsLegacy }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.websiteSettings }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.siteSettings }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.publicSettings }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.universities }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.universityCategories }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: queryKeys.universityCategoriesLegacy }).catch(() => undefined);
            queryClient.invalidateQueries({ queryKey: ['home-clusters-featured'] }).catch(() => undefined);
        };

        const startRefreshPoll = () => {
            if (refreshTimerRef.current) return;
            refreshTimerRef.current = setInterval(() => invalidate(), HOME_REFRESH_POLL_MS);
        };

        const stopRefreshPoll = () => {
            if (!refreshTimerRef.current) return;
            clearInterval(refreshTimerRef.current);
            refreshTimerRef.current = null;
        };

        const clearReconnect = () => {
            if (!reconnectTimerRef.current) return;
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        };

        const closeSource = () => {
            if (!source) return;
            source.close();
            source = null;
        };

        const teardown = () => {
            closeSource();
            stopRefreshPoll();
            clearReconnect();
        };

        const connect = () => {
            if (disposed) return;
            closeSource();
            source = new EventSource(getHomeStreamUrl(), { withCredentials: true });

            source.addEventListener('home-updated', invalidate);
            source.addEventListener('category-updated', invalidate);
            source.addEventListener('cluster-updated', invalidate);
            source.addEventListener('banner-updated', invalidate);
            source.addEventListener('news-updated', invalidate);
            source.addEventListener('ping', invalidate);
            source.onopen = () => {
                clearReconnect();
            };

            source.onerror = () => {
                if (disposed) return;
                if (!reconnectTimerRef.current) {
                    reconnectTimerRef.current = setTimeout(() => {
                        reconnectTimerRef.current = null;
                        connect();
                    }, 2000);
                }
            };
        };

        startRefreshPoll();
        connect();

        const handlePageHide = () => {
            teardown();
        };

        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handlePageHide);

        return () => {
            disposed = true;
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handlePageHide);
            teardown();
        };
    }, [enabled, queryClient]);
}
