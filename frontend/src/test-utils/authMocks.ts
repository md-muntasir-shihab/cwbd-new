/**
 * Test utilities for mocking authentication state and operations
 * Used for unit tests and property-based tests
 */

import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { vi } from 'vitest';

type MockFn = ReturnType<typeof vi.fn>;

/**
 * Mock localStorage operations for testing
 */
export const createMockLocalStorage = () => {
    const store: Record<string, string> = {};

    return {
        getItem: (key: string): string | null => {
            return store[key] || null;
        },
        setItem: (key: string, value: string): void => {
            store[key] = value;
        },
        removeItem: (key: string): void => {
            delete store[key];
        },
        clear: (): void => {
            Object.keys(store).forEach(key => delete store[key]);
        },
        get length(): number {
            return Object.keys(store).length;
        },
        key: (index: number): string | null => {
            const keys = Object.keys(store);
            return keys[index] || null;
        },
        // Expose internal store for test assertions
        _getStore: () => ({ ...store }),
    };
};

/**
 * Generate a mock JWT token with configurable expiry
 * @param expiresInSeconds - Number of seconds until token expires (default: 900 = 15 minutes)
 * @param payload - Additional payload fields to include in the token
 * @returns A mock JWT token string
 */
export const generateMockJWT = (
    expiresInSeconds: number = 900,
    payload: Record<string, any> = {}
): string => {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresInSeconds;

    const header = {
        alg: 'HS256',
        typ: 'JWT',
    };

    const tokenPayload = {
        exp,
        iat: now,
        ...payload,
    };

    // Create base64url encoded strings (simplified for testing)
    const base64UrlEncode = (obj: any): string => {
        const json = JSON.stringify(obj);
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    };

    const headerEncoded = base64UrlEncode(header);
    const payloadEncoded = base64UrlEncode(tokenPayload);
    const signature = 'mock-signature';

    return `${headerEncoded}.${payloadEncoded}.${signature}`;
};

/**
 * Generate an expired mock JWT token
 * @param expiredBySeconds - Number of seconds the token has been expired (default: 60)
 * @param payload - Additional payload fields to include in the token
 * @returns An expired mock JWT token string
 */
export const generateExpiredMockJWT = (
    expiredBySeconds: number = 60,
    payload: Record<string, any> = {}
): string => {
    return generateMockJWT(-expiredBySeconds, payload);
};

/**
 * Generate a malformed JWT token for testing error handling
 * @param type - Type of malformation: 'missing-parts', 'invalid-json', 'invalid-base64'
 * @returns A malformed JWT token string
 */
export const generateMalformedJWT = (
    type: 'missing-parts' | 'invalid-json' | 'invalid-base64' = 'missing-parts'
): string => {
    switch (type) {
        case 'missing-parts':
            return 'header.payload'; // Missing signature
        case 'invalid-json':
            return 'aGVhZGVy.aW52YWxpZC1qc29u.signature'; // 'invalid-json' in base64
        case 'invalid-base64':
            return 'not-base64!@#.not-base64!@#.signature';
        default:
            return 'malformed';
    }
};

/**
 * Mock axios instance for testing with configurable interceptors
 */
export interface MockAxiosInstance {
    get: MockFn;
    post: MockFn;
    put: MockFn;
    delete: MockFn;
    patch: MockFn;
    request: MockFn;
    interceptors: {
        request: {
            use: MockFn;
            eject: MockFn;
            handlers: Array<{
                fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
                rejected: (error: unknown) => unknown;
            }>;
        };
        response: {
            use: MockFn;
            eject: MockFn;
            handlers: Array<{
                fulfilled: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
                rejected: (error: unknown) => unknown;
            }>;
        };
    };
}

/**
 * Create a mock axios instance with interceptor support
 * @returns A mock axios instance with jest mocks for all methods
 */
export const createMockAxiosInstance = (): MockAxiosInstance => {
    const requestHandlers: Array<{
        fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>;
        rejected: (error: unknown) => unknown;
    }> = [];

    const responseHandlers: Array<{
        fulfilled: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>;
        rejected: (error: unknown) => unknown;
    }> = [];

    const mockInstance: MockAxiosInstance = {
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        patch: vi.fn(),
        request: vi.fn(),
        interceptors: {
            request: {
                use: vi.fn((
                    fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>,
                    rejected: (error: unknown) => unknown,
                ) => {
                    requestHandlers.push({ fulfilled, rejected });
                    return requestHandlers.length - 1;
                }),
                eject: vi.fn((id: number) => {
                    requestHandlers.splice(id, 1);
                }),
                handlers: requestHandlers,
            },
            response: {
                use: vi.fn((
                    fulfilled: (response: AxiosResponse) => AxiosResponse | Promise<AxiosResponse>,
                    rejected: (error: unknown) => unknown,
                ) => {
                    responseHandlers.push({ fulfilled, rejected });
                    return responseHandlers.length - 1;
                }),
                eject: vi.fn((id: number) => {
                    responseHandlers.splice(id, 1);
                }),
                handlers: responseHandlers,
            },
        },
    };

    return mockInstance;
};

/**
 * Create a mock axios response
 * @param data - Response data
 * @param status - HTTP status code (default: 200)
 * @param config - Request configuration
 * @returns A mock AxiosResponse object
 */
export const createMockAxiosResponse = <T = any>(
    data: T,
    status: number = 200,
    config: Partial<AxiosRequestConfig> = {}
): AxiosResponse<T> => {
    return {
        data,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers: {},
        config: config as InternalAxiosRequestConfig,
    };
};

/**
 * Create a mock axios error
 * @param message - Error message
 * @param status - HTTP status code
 * @param data - Error response data
 * @returns A mock axios error object
 */
export const createMockAxiosError = (
    message: string,
    status: number,
    data: any = {}
) => {
    const error: any = new Error(message);
    error.isAxiosError = true;
    error.response = {
        data,
        status,
        statusText: 'Error',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
    };
    error.config = {} as InternalAxiosRequestConfig;
    return error;
};

/**
 * Mock user object for testing
 */
export const createMockUser = (overrides: Partial<any> = {}) => {
    return {
        _id: 'mock-user-id',
        username: 'testuser',
        email: 'test@example.com',
        role: 'student',
        fullName: 'Test User',
        status: 'active',
        emailVerified: true,
        phoneVerified: false,
        twoFactorEnabled: false,
        twoFactorMethod: null,
        passwordExpiresAt: null,
        permissions: {},
        permissionsV2: {},
        mustChangePassword: false,
        redirectTo: '/dashboard',
        profile_photo: '',
        profile_completion_percentage: 100,
        user_unique_id: 'TEST-001',
        subscription: {
            status: 'active',
            plan: 'basic',
        },
        student_meta: null,
        ...overrides,
    };
};

// ─── Session Hint Constants and Types ────────────────────────────────

/**
 * localStorage key for the session hint
 */
export const SESSION_HINT_KEY = 'campusway-auth-session-hint';

/**
 * Valid portal values for session hints
 */
export type PortalType = 'student' | 'admin' | 'chairman' | 'unknown';

/**
 * Session hint structure as stored in localStorage
 */
export interface SessionHint {
    active: true;
    portal: PortalType;
    updatedAt: number;
}

/**
 * Create a mock session hint object
 * @param portal - The portal type (default: 'student')
 * @param updatedAt - Timestamp in ms (default: Date.now())
 * @returns A SessionHint object
 */
export const createMockSessionHint = (
    portal: PortalType = 'student',
    updatedAt: number = Date.now()
): SessionHint => ({
    active: true,
    portal,
    updatedAt,
});

/**
 * Write a session hint to the provided localStorage mock
 * @param storage - The mock localStorage instance
 * @param portal - The portal type
 * @param updatedAt - Optional timestamp
 */
export const writeSessionHint = (
    storage: ReturnType<typeof createMockLocalStorage>,
    portal: PortalType,
    updatedAt: number = Date.now()
): void => {
    const hint = createMockSessionHint(portal, updatedAt);
    storage.setItem(SESSION_HINT_KEY, JSON.stringify(hint));
};

/**
 * Read and parse a session hint from the provided localStorage mock
 * @param storage - The mock localStorage instance
 * @returns The parsed SessionHint or null if not present/invalid
 */
export const readSessionHint = (
    storage: ReturnType<typeof createMockLocalStorage>
): SessionHint | null => {
    const raw = storage.getItem(SESSION_HINT_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as SessionHint;
    } catch {
        return null;
    }
};

/**
 * Check if a session hint exists in the provided localStorage mock
 * @param storage - The mock localStorage instance
 * @returns true if a hint exists (even if malformed)
 */
export const hasSessionHint = (
    storage: ReturnType<typeof createMockLocalStorage>
): boolean => {
    const raw = storage.getItem(SESSION_HINT_KEY);
    return raw !== null && raw.length > 0;
};

/**
 * Clear the session hint from the provided localStorage mock
 * @param storage - The mock localStorage instance
 */
export const clearSessionHint = (
    storage: ReturnType<typeof createMockLocalStorage>
): void => {
    storage.removeItem(SESSION_HINT_KEY);
};

// ─── Exam Progress Preservation Constants ────────────────────────────

/**
 * localStorage key for preserved exam progress on force logout
 */
export const EXAM_PROGRESS_PRESERVATION_KEY = 'cw_exam_force_logout_preserved';

/**
 * Structure for preserved exam progress
 */
export interface PreservedExamProgress {
    examId: string;
    sessionId: string;
    preservedAt: string;
    cache: string;
}

/**
 * Create a mock preserved exam progress object
 * @param examId - The exam ID
 * @param sessionId - The session ID
 * @param cache - The cached exam state (JSON string)
 * @returns A PreservedExamProgress object
 */
export const createMockPreservedExamProgress = (
    examId: string = 'exam-123',
    sessionId: string = 'session-456',
    cache: string = '{}'
): PreservedExamProgress => ({
    examId,
    sessionId,
    preservedAt: new Date().toISOString(),
    cache,
});

// ─── Call Order Tracking ─────────────────────────────────────────────

/**
 * Create a call order tracker for verifying function call sequences
 * Useful for testing that operations happen in the correct order
 * (e.g., exam progress preserved BEFORE clearAuthState)
 */
export const createCallOrderTracker = () => {
    const calls: Array<{ name: string; timestamp: number; args?: any[] }> = [];

    return {
        /**
         * Record a function call
         * @param name - Name of the function being called
         * @param args - Optional arguments passed to the function
         */
        record: (name: string, args?: any[]): void => {
            calls.push({ name, timestamp: Date.now(), args });
        },

        /**
         * Get all recorded calls in order
         */
        getCalls: () => [...calls],

        /**
         * Get the order of function names called
         */
        getCallOrder: () => calls.map(c => c.name),

        /**
         * Check if function A was called before function B
         * @param fnA - Name of the first function
         * @param fnB - Name of the second function
         * @returns true if fnA was called before fnB
         */
        wasCalledBefore: (fnA: string, fnB: string): boolean => {
            const indexA = calls.findIndex(c => c.name === fnA);
            const indexB = calls.findIndex(c => c.name === fnB);
            if (indexA === -1 || indexB === -1) return false;
            return indexA < indexB;
        },

        /**
         * Check if a function was called
         * @param name - Name of the function
         * @returns true if the function was called
         */
        wasCalled: (name: string): boolean => {
            return calls.some(c => c.name === name);
        },

        /**
         * Get the number of times a function was called
         * @param name - Name of the function
         * @returns The call count
         */
        getCallCount: (name: string): number => {
            return calls.filter(c => c.name === name).length;
        },

        /**
         * Clear all recorded calls
         */
        clear: (): void => {
            calls.length = 0;
        },
    };
};

// ─── Protected Paths for Testing ─────────────────────────────────────

/**
 * List of protected path prefixes that should trigger session bootstrap
 * Matches the paths defined in Requirements 1.5
 */
export const PROTECTED_PATH_PREFIXES = [
    '/exam/',
    '/exams',
    '/dashboard',
    '/results',
    '/payments',
    '/notifications',
    '/support',
    '/profile',
    '/student/',
    '/profile-center',
] as const;

/**
 * Check if a pathname matches a protected path
 * @param pathname - The pathname to check
 * @returns true if the pathname is protected
 */
export const isProtectedPath = (pathname: string): boolean => {
    return PROTECTED_PATH_PREFIXES.some(prefix =>
        pathname === prefix || pathname.startsWith(prefix)
    );
};

/**
 * Generate a random protected pathname for property testing
 * @param prefix - Optional specific prefix to use
 * @param suffix - Optional suffix to append
 * @returns A protected pathname
 */
export const generateProtectedPathname = (
    prefix?: typeof PROTECTED_PATH_PREFIXES[number],
    suffix: string = ''
): string => {
    const selectedPrefix = prefix || PROTECTED_PATH_PREFIXES[
        Math.floor(Math.random() * PROTECTED_PATH_PREFIXES.length)
    ];
    return `${selectedPrefix}${suffix}`;
};

/**
 * Generate a random non-protected pathname for property testing
 * @returns A non-protected pathname
 */
export const generateNonProtectedPathname = (): string => {
    const nonProtectedPaths = [
        '/',
        '/login',
        '/register',
        '/forgot-password',
        '/about',
        '/contact',
        '/news',
        '/universities',
        '/services',
    ];
    return nonProtectedPaths[Math.floor(Math.random() * nonProtectedPaths.length)];
};
