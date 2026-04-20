import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api, {
    clearAccessToken,
    clearAuthSessionHint,
    getAuthSessionStreamUrl,
    markAuthSessionHint,
    refreshAccessToken,
    setAccessToken,
    shouldAttemptAuthBootstrap,
} from '../services/api';
import { preserveExamProgress } from '../utils/examProgressPreservation';

interface User {
    _id: string;
    username: string;
    email: string;
    role: 'superadmin' | 'admin' | 'moderator' | 'editor' | 'viewer' | 'support_agent' | 'finance_agent' | 'student' | 'chairman';
    fullName: string;
    status?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    twoFactorEnabled?: boolean;
    twoFactorMethod?: string | null;
    passwordExpiresAt?: string | null;
    mustChangePassword?: boolean;
    permissions?: {
        canEditExams: boolean;
        canManageStudents: boolean;
        canViewReports: boolean;
        canDeleteData: boolean;
        canManageFinance?: boolean;
        canManagePlans?: boolean;
    };
    redirectTo?: string;
    profile_completion_percentage?: number;
    profile_photo?: string;
    user_unique_id?: string;
    subscription?: {
        planCode?: string;
        planName?: string;
        isActive?: boolean;
        startDate?: string | null;
        expiryDate?: string | null;
        daysLeft?: number;
    };
    student_meta?: {
        department?: string;
        ssc_batch?: string;
        hsc_batch?: string;
        admittedAt?: string | null;
        groupIds?: string[];
    } | null;
    permissionsV2?: Record<string, Record<string, boolean>>;
}

interface Pending2FA {
    tempToken: string;
    method: string;
    maskedEmail: string;
    expiresInSeconds?: number;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    pending2FA: Pending2FA | null;
    setPending2FA: (data: Pending2FA | null) => void;
    forceLogoutAlert: boolean;
    forceLogoutReason: string | null;
    setForceLogoutAlert: (val: boolean) => void;
    login: (
        identifier: string,
        password: string,
        options?: { portal?: 'student' | 'admin' | 'chairman' }
    ) => Promise<any>;
    completeLogin: (token: string, user: User) => void;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
    pending2FA: null,
    setPending2FA: () => { },
    forceLogoutAlert: false,
    forceLogoutReason: null,
    setForceLogoutAlert: () => { },
    login: async () => ({}),
    completeLogin: () => { },
    logout: async () => { },
    refreshUser: async () => { },
});

export const useAuth = () => useContext(AuthContext);

const AUTH_SYNC_EVENT_KEY = 'campusway-auth-sync-event';

type AuthSyncEventType = 'logout' | 'force-logout';

function broadcastAuthSyncEvent(type: AuthSyncEventType, reason?: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(
            AUTH_SYNC_EVENT_KEY,
            JSON.stringify({ type, reason: reason || null, ts: Date.now() }),
        );
    } catch {
        // ignore storage failures
    }
}

// Module-level guard to prevent multiple simultaneous bootstrap attempts
// during navigation/remount (e.g., React strict mode or route changes).
let bootstrapInFlight = false;

export function AuthProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [pending2FA, setPending2FA] = useState<Pending2FA | null>(null);
    const [forceLogoutAlert, setForceLogoutAlert] = useState(false);
    const [forceLogoutReason, setForceLogoutReason] = useState<string | null>(null);

    const clearAuthState = useCallback(() => {
        setUser(null);
        setToken(null);
        setPending2FA(null);
        clearAccessToken();
        clearAuthSessionHint();
        queryClient.invalidateQueries({ queryKey: ['home'] }).catch(() => undefined);
        queryClient.invalidateQueries({ queryKey: ['home-settings'] }).catch(() => undefined);
    }, [queryClient]);

    const triggerForcedLogout = useCallback((_reason?: string) => {
        const reason = String(_reason || 'SESSION_INVALIDATED');
        const shouldShowAlert = Boolean(user);
        broadcastAuthSyncEvent('force-logout', reason);

        // Preserve exam progress if student is currently in the exam runner
        const currentPath = window.location.pathname;
        const examMatch = currentPath.match(/^\/exam\/([^/]+)/);
        if (examMatch) {
            const examId = examMatch[1];
            const sessionId = window.localStorage.getItem(`cw_exam_last_session_${examId}`) || '';
            if (sessionId) {
                preserveExamProgress(examId, sessionId);
            }
        }

        setForceLogoutReason(reason);
        clearAuthState();
        if (shouldShowAlert) {
            setForceLogoutAlert(true);
        }
    }, [clearAuthState, user]);

    const refreshUser = useCallback(async () => {
        try {
            const res = await api.get('/auth/me');
            setUser(res.data.user);
        } catch {
            clearAuthState();
        }
    }, [clearAuthState]);

    // Initial auth bootstrap from refresh cookie
    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!shouldAttemptAuthBootstrap()) {
                clearAuthState();
                setIsLoading(false);
                return;
            }

            // Guard: skip if another bootstrap is already in flight
            if (bootstrapInFlight) {
                return;
            }
            bootstrapInFlight = true;

            try {
                const nextToken = await refreshAccessToken();
                if (cancelled) return;
                if (!nextToken) {
                    clearAuthState();
                    setIsLoading(false);
                    return;
                }

                setToken(nextToken);
                try {
                    const res = await api.get('/auth/me');
                    if (!cancelled) {
                        const fetchedUser = res.data.user;
                        setUser(fetchedUser);

                        // Persist session hint so subsequent reloads detect the active session
                        const portal = fetchedUser.role === 'chairman'
                            ? 'chairman'
                            : ['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent'].includes(fetchedUser.role)
                                ? 'admin'
                                : 'student';
                        markAuthSessionHint(portal);
                    }
                } catch {
                    if (!cancelled) clearAuthState();
                } finally {
                    if (!cancelled) setIsLoading(false);
                }
            } finally {
                bootstrapInFlight = false;
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [clearAuthState]);

    // Force logout signal from API interceptor
    useEffect(() => {
        const onForceLogout = (event: Event) => {
            const detail = (event as CustomEvent<{ reason?: string }>).detail;
            const reason = detail?.reason || 'SESSION_INVALIDATED';
            triggerForcedLogout(reason);
        };

        window.addEventListener('campusway:force-logout', onForceLogout as EventListener);
        return () => {
            window.removeEventListener('campusway:force-logout', onForceLogout as EventListener);
        };
    }, [triggerForcedLogout]);

    // Cross-tab auth sync for sign-out and forced logout events.
    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key !== AUTH_SYNC_EVENT_KEY || !event.newValue) return;

            let payload: { type?: AuthSyncEventType; reason?: string } | null = null;
            try {
                payload = JSON.parse(event.newValue) as { type?: AuthSyncEventType; reason?: string };
            } catch {
                return;
            }

            if (!payload || (payload.type !== 'logout' && payload.type !== 'force-logout')) {
                return;
            }

            const shouldShowAlert = payload.type === 'force-logout' && Boolean(user);
            clearAuthState();
            if (shouldShowAlert) {
                setForceLogoutAlert(true);
            }
        };

        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener('storage', onStorage);
        };
    }, [clearAuthState, user]);

    // Session guard: SSE first, polling fallback with reconnect backoff
    useEffect(() => {
        if (!token || !user) return;

        let stopped = false;
        let source: EventSource | null = null;
        let pollId: number | null = null;
        let reconnectId: number | null = null;
        let reconnectAttempt = 0;

        const isOnline = () => {
            if (typeof navigator === 'undefined') return true;
            return navigator.onLine;
        };

        const stopPolling = () => {
            if (pollId !== null) {
                window.clearInterval(pollId);
                pollId = null;
            }
        };

        const runSessionProbe = async () => {
            try {
                await api.get('/auth/me');
            } catch (err: any) {
                if (err.response?.status === 401) {
                    triggerForcedLogout(err.response?.data?.code || 'SESSION_INVALIDATED');
                }
            }
        };

        const startPolling = () => {
            if (pollId !== null) return;
            runSessionProbe();
            pollId = window.setInterval(runSessionProbe, 30000);
        };

        const scheduleReconnect = () => {
            if (stopped) return;
            if (reconnectId !== null) window.clearTimeout(reconnectId);

            const delayMs = Math.min(30000, 1000 * (2 ** reconnectAttempt));
            reconnectAttempt += 1;
            reconnectId = window.setTimeout(connectSse, delayMs);
        };

        const closeSource = () => {
            if (!source) return;
            source.close();
            source = null;
        };

        const teardownStreams = () => {
            closeSource();
            stopPolling();
            if (reconnectId !== null) {
                window.clearTimeout(reconnectId);
                reconnectId = null;
            }
        };

        const connectSse = () => {
            if (stopped) return;
            closeSource();

            source = new EventSource(getAuthSessionStreamUrl(token || undefined), { withCredentials: true });

            source.addEventListener('session-connected', () => {
                reconnectAttempt = 0;
                stopPolling();
            });

            source.addEventListener('force-logout', (event) => {
                try {
                    const payload = JSON.parse((event as MessageEvent).data || '{}');
                    triggerForcedLogout(String(payload?.reason || 'SESSION_INVALIDATED'));
                } catch {
                    triggerForcedLogout('SESSION_INVALIDATED');
                }
            });

            source.onerror = () => {
                if (stopped) return;
                closeSource();
                startPolling();
                if (document.visibilityState === 'hidden' || !isOnline()) return;
                scheduleReconnect();
            };
        };

        const reconnectNow = () => {
            if (stopped) return;
            if (document.visibilityState === 'hidden' || !isOnline()) return;
            if (reconnectId !== null) {
                window.clearTimeout(reconnectId);
                reconnectId = null;
            }
            reconnectAttempt = 0;
            connectSse();
        };

        connectSse();

        const handlePageHide = () => {
            teardownStreams();
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                reconnectNow();
            }
        };

        const handleOnline = () => {
            reconnectNow();
        };

        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handlePageHide);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleOnline);

        return () => {
            stopped = true;
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handlePageHide);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
            teardownStreams();
        };
    }, [token, user?._id, triggerForcedLogout]);

    const completeLogin = useCallback((newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        setPending2FA(null);
        setAccessToken(newToken);
        markAuthSessionHint(newUser.role === 'chairman'
            ? 'chairman'
            : ['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent'].includes(newUser.role)
                ? 'admin'
                : 'student');
        queryClient.invalidateQueries({ queryKey: ['home'] }).catch(() => undefined);
        queryClient.invalidateQueries({ queryKey: ['home-settings'] }).catch(() => undefined);
    }, [queryClient]);

    const login = useCallback(async (
        identifier: string,
        password: string,
        options?: { portal?: 'student' | 'admin' | 'chairman' }
    ) => {
        const portal = options?.portal;
        const endpoint = portal === 'admin'
            ? '/auth/admin/login'
            : portal === 'chairman'
                ? '/auth/chairman/login'
                : '/auth/login';
        const payload: Record<string, unknown> = { identifier, password };
        if (portal && endpoint === '/auth/login') {
            payload.portal = portal;
        }
        const res = await api.post(endpoint, payload);
        if (res.data.requires2fa) {
            setPending2FA({
                tempToken: res.data.tempToken,
                method: res.data.method,
                maskedEmail: res.data.maskedEmail,
                expiresInSeconds: res.data.expiresInSeconds,
            });
            return res.data;
        }

        completeLogin(res.data.token, res.data.user);
        return res.data;
    }, [completeLogin]);

    const logout = useCallback(async () => {
        if (token) {
            try {
                await api.post('/auth/logout');
            } catch {
                // ignore logout API failure
            }
        }
        broadcastAuthSyncEvent('logout');
        clearAuthState();
    }, [token, clearAuthState]);

    const value = useMemo<AuthContextType>(() => ({
        user,
        token,
        isAuthenticated: Boolean(user),
        isLoading,
        pending2FA,
        setPending2FA,
        forceLogoutAlert,
        forceLogoutReason,
        setForceLogoutAlert,
        login,
        completeLogin,
        logout,
        refreshUser,
    }), [user, token, isLoading, pending2FA, forceLogoutAlert, forceLogoutReason, login, completeLogin, logout, refreshUser]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
