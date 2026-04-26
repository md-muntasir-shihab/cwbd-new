import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    getStudentDashboardFull,
    getStudentWatchlist,
    toggleStudentWatchlistItem,
    getStudentWatchlistCheck,
    getStudentDashboardStreamUrl,
} from '../services/api';
import type {
    StudentDashboardFullResponse,
    WatchlistResponse,
} from '../services/api';
import { useEffect, useRef } from 'react';

const DASHBOARD_KEYS = {
    full: ['student-dashboard-full'] as const,
    watchlist: (type?: string) => ['student-watchlist', type] as const,
    watchlistCheck: (itemType: string, itemId: string) => ['student-watchlist-check', itemType, itemId] as const,
};

export function useStudentDashboardFull() {
    return useQuery({
        queryKey: DASHBOARD_KEYS.full,
        queryFn: async (): Promise<StudentDashboardFullResponse> => {
            const res = await getStudentDashboardFull();
            return res.data;
        },
        staleTime: 60_000,
    });
}

export function useStudentWatchlist(type?: string) {
    return useQuery({
        queryKey: DASHBOARD_KEYS.watchlist(type),
        queryFn: async (): Promise<WatchlistResponse> => {
            const res = await getStudentWatchlist(type);
            return res.data;
        },
    });
}

export function useToggleWatchlist() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: { itemType: string; itemId: string }) =>
            toggleStudentWatchlistItem(data).then(r => r.data),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['student-watchlist'] });
            void qc.invalidateQueries({ queryKey: ['student-watchlist-check'] });
            void qc.invalidateQueries({ queryKey: DASHBOARD_KEYS.full });
        },
    });
}

export function useWatchlistCheck(itemType: string, itemId: string) {
    return useQuery({
        queryKey: DASHBOARD_KEYS.watchlistCheck(itemType, itemId),
        queryFn: async () => {
            const res = await getStudentWatchlistCheck(itemType, itemId);
            return res.data.saved;
        },
        enabled: Boolean(itemType && itemId),
    });
}

export function useDashboardRealtime(enabled: boolean) {
    const qc = useQueryClient();
    const reconnectRef = useRef(1000);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let es: EventSource | null = null;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const connect = () => {
            if (cancelled) return;
            es = new EventSource(getStudentDashboardStreamUrl(), { withCredentials: true });
            es.onopen = () => { reconnectRef.current = 1000; };
            es.addEventListener('dashboard-update', () => {
                void qc.invalidateQueries({ queryKey: DASHBOARD_KEYS.full });
            });
            es.addEventListener('subscription-updated', () => {
                void qc.invalidateQueries({ queryKey: DASHBOARD_KEYS.full });
                void qc.invalidateQueries({ queryKey: ['subscription'] });
            });
            es.onerror = () => {
                if (cancelled) return;
                es?.close();
                // Exponential backoff with jitter (Bug 1.31)
                const jitter = Math.floor(Math.random() * 1000);
                timer = setTimeout(connect, reconnectRef.current + jitter);
                reconnectRef.current = Math.min(reconnectRef.current * 2, 30000);
            };
        };

        connect();

        return () => {
            cancelled = true;
            es?.close();
            if (timer) clearTimeout(timer);
        };
    }, [enabled, qc]);
}
