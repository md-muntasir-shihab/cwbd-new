/**
 * Unit tests for auth mock utilities
 * Validates that all mock utilities work correctly for property-based tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    createMockLocalStorage,
    generateMockJWT,
    generateExpiredMockJWT,
    generateMalformedJWT,
    createMockAxiosInstance,
    createMockAxiosResponse,
    createMockAxiosError,
    createMockUser,
    SESSION_HINT_KEY,
    createMockSessionHint,
    writeSessionHint,
    readSessionHint,
    hasSessionHint,
    clearSessionHint,
    createCallOrderTracker,
    PROTECTED_PATH_PREFIXES,
    isProtectedPath,
    generateProtectedPathname,
    generateNonProtectedPathname,
    EXAM_PROGRESS_PRESERVATION_KEY,
    createMockPreservedExamProgress,
} from '../../test-utils/authMocks';

describe('Auth Mock Utilities', () => {
    describe('createMockLocalStorage', () => {
        it('should store and retrieve values', () => {
            const storage = createMockLocalStorage();
            storage.setItem('key', 'value');
            expect(storage.getItem('key')).toBe('value');
        });

        it('should return null for missing keys', () => {
            const storage = createMockLocalStorage();
            expect(storage.getItem('missing')).toBeNull();
        });

        it('should remove items', () => {
            const storage = createMockLocalStorage();
            storage.setItem('key', 'value');
            storage.removeItem('key');
            expect(storage.getItem('key')).toBeNull();
        });

        it('should clear all items', () => {
            const storage = createMockLocalStorage();
            storage.setItem('key1', 'value1');
            storage.setItem('key2', 'value2');
            storage.clear();
            expect(storage.length).toBe(0);
        });

        it('should expose internal store for assertions', () => {
            const storage = createMockLocalStorage();
            storage.setItem('key', 'value');
            expect(storage._getStore()).toEqual({ key: 'value' });
        });
    });

    describe('generateMockJWT', () => {
        it('should generate a valid JWT structure', () => {
            const token = generateMockJWT();
            const parts = token.split('.');
            expect(parts).toHaveLength(3);
        });

        it('should include configurable expiry', () => {
            const token = generateMockJWT(3600); // 1 hour
            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            const now = Math.floor(Date.now() / 1000);
            expect(payload.exp).toBeGreaterThan(now);
            expect(payload.exp).toBeLessThanOrEqual(now + 3600 + 1);
        });

        it('should include custom payload fields', () => {
            const token = generateMockJWT(900, { userId: 'test-123', role: 'admin' });
            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            expect(payload.userId).toBe('test-123');
            expect(payload.role).toBe('admin');
        });
    });

    describe('generateExpiredMockJWT', () => {
        it('should generate an expired token', () => {
            const token = generateExpiredMockJWT(60);
            const parts = token.split('.');
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            const now = Math.floor(Date.now() / 1000);
            expect(payload.exp).toBeLessThan(now);
        });
    });

    describe('generateMalformedJWT', () => {
        it('should generate token with missing parts', () => {
            const token = generateMalformedJWT('missing-parts');
            expect(token.split('.')).toHaveLength(2);
        });

        it('should generate token with invalid base64', () => {
            const token = generateMalformedJWT('invalid-base64');
            expect(token).toContain('!@#');
        });
    });

    describe('createMockAxiosInstance', () => {
        it('should have all HTTP method mocks', () => {
            const axios = createMockAxiosInstance();
            expect(axios.get).toBeDefined();
            expect(axios.post).toBeDefined();
            expect(axios.put).toBeDefined();
            expect(axios.delete).toBeDefined();
            expect(axios.patch).toBeDefined();
        });

        it('should support request interceptors', () => {
            const axios = createMockAxiosInstance();
            const fulfilled = (config: any) => config;
            const rejected = (error: any) => error;

            const id = axios.interceptors.request.use(fulfilled, rejected);
            expect(id).toBe(0);
            expect(axios.interceptors.request.handlers).toHaveLength(1);
        });

        it('should support response interceptors', () => {
            const axios = createMockAxiosInstance();
            const fulfilled = (response: any) => response;
            const rejected = (error: any) => error;

            const id = axios.interceptors.response.use(fulfilled, rejected);
            expect(id).toBe(0);
            expect(axios.interceptors.response.handlers).toHaveLength(1);
        });
    });

    describe('createMockAxiosResponse', () => {
        it('should create a response with default status 200', () => {
            const response = createMockAxiosResponse({ data: 'test' });
            expect(response.status).toBe(200);
            expect(response.data).toEqual({ data: 'test' });
        });

        it('should support custom status codes', () => {
            const response = createMockAxiosResponse({ error: 'not found' }, 404);
            expect(response.status).toBe(404);
        });
    });

    describe('createMockAxiosError', () => {
        it('should create an axios error with response', () => {
            const error = createMockAxiosError('Unauthorized', 401, { code: 'SESSION_INVALIDATED' });
            expect(error.isAxiosError).toBe(true);
            expect(error.response.status).toBe(401);
            expect(error.response.data.code).toBe('SESSION_INVALIDATED');
        });
    });

    describe('createMockUser', () => {
        it('should create a default student user', () => {
            const user = createMockUser();
            expect(user.role).toBe('student');
            expect(user.email).toBe('test@example.com');
        });

        it('should support overrides', () => {
            const user = createMockUser({ role: 'admin', email: 'admin@test.com' });
            expect(user.role).toBe('admin');
            expect(user.email).toBe('admin@test.com');
        });
    });

    describe('Session Hint Utilities', () => {
        let storage: ReturnType<typeof createMockLocalStorage>;

        beforeEach(() => {
            storage = createMockLocalStorage();
        });

        it('should create a valid session hint', () => {
            const hint = createMockSessionHint('student');
            expect(hint.active).toBe(true);
            expect(hint.portal).toBe('student');
            expect(hint.updatedAt).toBeDefined();
        });

        it('should write session hint to storage', () => {
            writeSessionHint(storage, 'admin');
            const raw = storage.getItem(SESSION_HINT_KEY);
            expect(raw).not.toBeNull();
            const parsed = JSON.parse(raw!);
            expect(parsed.portal).toBe('admin');
        });

        it('should read session hint from storage', () => {
            writeSessionHint(storage, 'chairman');
            const hint = readSessionHint(storage);
            expect(hint?.portal).toBe('chairman');
        });

        it('should return null for missing hint', () => {
            const hint = readSessionHint(storage);
            expect(hint).toBeNull();
        });

        it('should check if hint exists', () => {
            expect(hasSessionHint(storage)).toBe(false);
            writeSessionHint(storage, 'student');
            expect(hasSessionHint(storage)).toBe(true);
        });

        it('should clear session hint', () => {
            writeSessionHint(storage, 'student');
            clearSessionHint(storage);
            expect(hasSessionHint(storage)).toBe(false);
        });
    });

    describe('Call Order Tracker', () => {
        it('should record function calls in order', () => {
            const tracker = createCallOrderTracker();
            tracker.record('functionA');
            tracker.record('functionB');
            tracker.record('functionC');

            expect(tracker.getCallOrder()).toEqual(['functionA', 'functionB', 'functionC']);
        });

        it('should check if function was called before another', () => {
            const tracker = createCallOrderTracker();
            tracker.record('preserveProgress');
            tracker.record('clearAuthState');

            expect(tracker.wasCalledBefore('preserveProgress', 'clearAuthState')).toBe(true);
            expect(tracker.wasCalledBefore('clearAuthState', 'preserveProgress')).toBe(false);
        });

        it('should count function calls', () => {
            const tracker = createCallOrderTracker();
            tracker.record('refresh');
            tracker.record('refresh');
            tracker.record('refresh');

            expect(tracker.getCallCount('refresh')).toBe(3);
        });

        it('should clear recorded calls', () => {
            const tracker = createCallOrderTracker();
            tracker.record('test');
            tracker.clear();

            expect(tracker.getCalls()).toHaveLength(0);
        });
    });

    describe('Protected Path Utilities', () => {
        it('should identify protected paths', () => {
            expect(isProtectedPath('/dashboard')).toBe(true);
            expect(isProtectedPath('/exam/123')).toBe(true);
            expect(isProtectedPath('/exams')).toBe(true);
            expect(isProtectedPath('/results')).toBe(true);
            expect(isProtectedPath('/student/profile')).toBe(true);
        });

        it('should identify non-protected paths', () => {
            expect(isProtectedPath('/')).toBe(false);
            expect(isProtectedPath('/login')).toBe(false);
            expect(isProtectedPath('/register')).toBe(false);
            expect(isProtectedPath('/about')).toBe(false);
        });

        it('should generate protected pathnames', () => {
            const path = generateProtectedPathname('/exam/', '123');
            expect(path).toBe('/exam/123');
            expect(isProtectedPath(path)).toBe(true);
        });

        it('should generate non-protected pathnames', () => {
            const path = generateNonProtectedPathname();
            expect(isProtectedPath(path)).toBe(false);
        });

        it('should have all required protected prefixes', () => {
            expect(PROTECTED_PATH_PREFIXES).toContain('/exam/');
            expect(PROTECTED_PATH_PREFIXES).toContain('/exams');
            expect(PROTECTED_PATH_PREFIXES).toContain('/dashboard');
            expect(PROTECTED_PATH_PREFIXES).toContain('/results');
            expect(PROTECTED_PATH_PREFIXES).toContain('/payments');
            expect(PROTECTED_PATH_PREFIXES).toContain('/notifications');
            expect(PROTECTED_PATH_PREFIXES).toContain('/support');
            expect(PROTECTED_PATH_PREFIXES).toContain('/profile');
            expect(PROTECTED_PATH_PREFIXES).toContain('/student/');
            expect(PROTECTED_PATH_PREFIXES).toContain('/profile-center');
        });
    });

    describe('Exam Progress Preservation', () => {
        it('should have correct preservation key', () => {
            expect(EXAM_PROGRESS_PRESERVATION_KEY).toBe('cw_exam_force_logout_preserved');
        });

        it('should create mock preserved exam progress', () => {
            const progress = createMockPreservedExamProgress('exam-1', 'session-1', '{"answers":{}}');
            expect(progress.examId).toBe('exam-1');
            expect(progress.sessionId).toBe('session-1');
            expect(progress.cache).toBe('{"answers":{}}');
            expect(progress.preservedAt).toBeDefined();
        });
    });
});
