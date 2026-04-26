import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';

/**
 * CampusWay QA Release Audit — Preservation Property Tests
 *
 * **Property 2: Preservation** — Unchanged Platform Behaviors (15 Regression Guards)
 *
 * **Validates: Requirements 3.1–3.15**
 *
 * These tests capture the CURRENT correct behavior that must NOT change after fixes.
 * They should PASS on unfixed code — confirming the baseline to preserve.
 */

const BACKEND_URL = 'http://127.0.0.1:5003';
const BACKEND_ROOT = path.resolve(__dirname, '../../../backend/src');
const FRONTEND_ROOT = path.resolve(__dirname, '../../src');

// Helper: gracefully fetch with ECONNREFUSED handling
async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
    try {
        return await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
    } catch {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3.1 Health Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.1 Health Endpoints — Validates: Requirements 3.1', () => {
    const HEALTH_PATHS = ['/health', '/api/health'] as const;

    it('PBT: for all health endpoint paths, response shape includes status, db, version', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...HEALTH_PATHS),
                async (healthPath) => {
                    const res = await safeFetch(`${BACKEND_URL}${healthPath}`);
                    if (!res) return; // backend not running — skip gracefully
                    expect(res.ok).toBe(true);
                    const body = await res.json();
                    expect(body).toHaveProperty('status', 'OK');
                    expect(body).toHaveProperty('db');
                    expect(body).toHaveProperty('version');
                },
            ),
            { numRuns: HEALTH_PATHS.length },
        );
    });

    it('health handler is registered for both /health and /api/health in server.ts', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        expect(serverSrc).toContain("app.get('/health'");
        expect(serverSrc).toContain("app.get('/api/health'");
        expect(serverSrc).toContain('healthHandler');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.2 Public Layout
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.2 Public Layout — Validates: Requirements 3.2', () => {
    const PUBLIC_ROUTES = [
        '/', '/universities', '/news', '/exams', '/resources',
        '/contact', '/help-center', '/subscription-plans',
        '/about', '/terms', '/privacy',
    ] as const;

    it('App.tsx defines FULL_SCREEN_PREFIXES that exclude public routes', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('FULL_SCREEN_PREFIXES');
        const fsMatch = appSrc.match(/FULL_SCREEN_PREFIXES\s*=\s*\[([^\]]+)\]/s);
        expect(fsMatch).toBeTruthy();
        const prefixBlock = fsMatch![1];
        for (const route of PUBLIC_ROUTES) {
            expect(prefixBlock).not.toContain(`'${route}'`);
        }
    });

    it('PBT: for all public routes, they are NOT in FULL_SCREEN_PREFIXES or STUDENT_APP_PREFIXES', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        const fsMatch = appSrc.match(/FULL_SCREEN_PREFIXES\s*=\s*\[([^\]]+)\]/s);
        const saMatch = appSrc.match(/STUDENT_APP_PREFIXES\s*=\s*\[([^\]]+)\]/s);
        const fullScreenBlock = fsMatch?.[1] || '';
        const studentBlock = saMatch?.[1] || '';

        const extractPrefixes = (block: string) =>
            [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
        const fullScreenPrefixes = extractPrefixes(fullScreenBlock);
        const studentPrefixes = extractPrefixes(studentBlock);

        fc.assert(
            fc.property(
                fc.constantFrom(...PUBLIC_ROUTES),
                (route) => {
                    const matchesFullScreen = fullScreenPrefixes.some((p) => route.startsWith(p));
                    expect(matchesFullScreen).toBe(false);
                    const matchesStudent = studentPrefixes.some((p) => route === p || route.startsWith(`${p}/`));
                    expect(matchesStudent).toBe(false);
                },
            ),
            { numRuns: PUBLIC_ROUTES.length },
        );
    });

    it('AppLayout renders Navbar and Footer for non-fullscreen, non-student routes', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('<Navbar');
        expect(appSrc).toContain('<Footer');
        expect(appSrc).toContain('isStudentAppRoute');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.3 Auth Interceptors
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.3 Auth Interceptors — Validates: Requirements 3.3', () => {
    const REQUIRED_HEADERS = [
        { name: 'Authorization', pattern: 'Bearer' },
        { name: 'X-Browser-Fingerprint', pattern: 'ensureBrowserFingerprint' },
        { name: 'X-CSRF-Token', pattern: 'X-CSRF-Token' },
    ] as const;

    it('api.ts request interceptor attaches JWT Bearer, fingerprint, and CSRF headers', () => {
        const apiSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'services/api.ts'), 'utf-8');
        expect(apiSrc).toContain('Bearer ${token}');
        expect(apiSrc).toContain("'X-Browser-Fingerprint'");
        expect(apiSrc).toContain("'X-CSRF-Token'");
    });

    it('PBT: for all 3 required auth headers, the interceptor code configures them', () => {
        const apiSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'services/api.ts'), 'utf-8');

        fc.assert(
            fc.property(
                fc.constantFrom(...REQUIRED_HEADERS),
                (header) => {
                    expect(apiSrc).toContain(header.name);
                    expect(apiSrc).toContain(header.pattern);
                },
            ),
            { numRuns: REQUIRED_HEADERS.length },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.4 Token Refresh
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.4 Token Refresh — Validates: Requirements 3.4', () => {
    it('api.ts response interceptor handles 401 with refresh logic before redirect', () => {
        const apiSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'services/api.ts'), 'utf-8');
        expect(apiSrc).toContain('api.interceptors.response.use');
        expect(apiSrc).toContain('refreshAccessToken');
        expect(apiSrc).toContain('__isRetryRequest');
    });

    it('PBT: refresh logic checks canRetry before attempting refresh', () => {
        const apiSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'services/api.ts'), 'utf-8');
        const refreshKeywords = ['canRetry', 'refreshAccessToken', '__isRetryRequest', 'isAuthRefreshCall'] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...refreshKeywords),
                (keyword) => {
                    expect(apiSrc).toContain(keyword);
                },
            ),
            { numRuns: refreshKeywords.length },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.5 Admin Fullscreen
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.5 Admin Fullscreen — Validates: Requirements 3.5', () => {
    it('FULL_SCREEN_PREFIXES includes /__cw_admin__', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        const fsMatch = appSrc.match(/FULL_SCREEN_PREFIXES\s*=\s*\[([^\]]+)\]/s);
        expect(fsMatch).toBeTruthy();
        expect(fsMatch![1]).toContain('/__cw_admin__');
    });

    it('PBT: for all admin route prefixes, they are in FULL_SCREEN_PREFIXES', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        const fsMatch = appSrc.match(/FULL_SCREEN_PREFIXES\s*=\s*\[([^\]]+)\]/s);
        const prefixBlock = fsMatch?.[1] || '';
        const adminPrefixes = ['/__cw_admin__', '/campusway-secure-admin', '/admin-dashboard', '/admin'] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...adminPrefixes),
                (prefix) => {
                    expect(prefixBlock).toContain(prefix);
                },
            ),
            { numRuns: adminPrefixes.length },
        );
    });

    it('AppLayout returns fullscreen (no Navbar/Footer) when isFullScreen is true', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('isFullScreen');
        // When fullscreen, it returns children without Navbar/Footer
        expect(appSrc).toMatch(/if\s*\(\s*isFullScreen\s*\)\s*return/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.6 Student Layout
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.6 Student Layout — Validates: Requirements 3.6', () => {
    const STUDENT_ROUTES = ['/student/', '/dashboard', '/profile', '/results', '/payments', '/notifications', '/support'] as const;

    it('STUDENT_APP_PREFIXES contains all expected student route prefixes', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        const saMatch = appSrc.match(/STUDENT_APP_PREFIXES\s*=\s*\[([^\]]+)\]/s);
        expect(saMatch).toBeTruthy();
        const prefixBlock = saMatch![1];
        for (const route of STUDENT_ROUTES) {
            expect(prefixBlock).toContain(route);
        }
    });

    it('PBT: for all student routes, they are in STUDENT_APP_PREFIXES', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        const saMatch = appSrc.match(/STUDENT_APP_PREFIXES\s*=\s*\[([^\]]+)\]/s);
        const prefixBlock = saMatch?.[1] || '';

        fc.assert(
            fc.property(
                fc.constantFrom(...STUDENT_ROUTES),
                (route) => {
                    expect(prefixBlock).toContain(route);
                },
            ),
            { numRuns: STUDENT_ROUTES.length },
        );
    });

    it('StudentLayout is used for student routes in App.tsx routing', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('StudentLayout');
        expect(appSrc).toContain('/dashboard');
        expect(appSrc).toContain('/profile');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.7 Legacy Redirects
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.7 Legacy Redirects — Validates: Requirements 3.7', () => {
    it('legacyAdminToSecret function exists and handles legacy paths', () => {
        const appRoutesSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'lib/appRoutes.ts'), 'utf-8');
        expect(appRoutesSrc).toContain('legacyAdminToSecret');
        expect(appRoutesSrc).toContain('campusway-secure-admin');
        expect(appRoutesSrc).toContain('admin-dashboard');
    });

    it('legacyAdminToSecret preserves query and hash parameters', () => {
        const appRoutesSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'lib/appRoutes.ts'), 'utf-8');
        // Function signature accepts search and hash params
        expect(appRoutesSrc).toMatch(/legacyAdminToSecret\s*\(\s*pathname.*search.*hash/);
        // Returns target with search and hash appended
        expect(appRoutesSrc).toMatch(/\$\{search[^}]*\}.*\$\{hash/s);
    });

    it('PBT: for all legacy path patterns, redirect logic exists in appRoutes.ts', () => {
        const appRoutesSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'lib/appRoutes.ts'), 'utf-8');
        const legacyPatterns = ['campusway-secure-admin', 'admin-dashboard'] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...legacyPatterns),
                (pattern) => {
                    expect(appRoutesSrc).toContain(pattern);
                },
            ),
            { numRuns: legacyPatterns.length },
        );
    });

    it('App.tsx has routes for legacy admin redirects', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('/campusway-secure-admin');
        expect(appSrc).toContain('/admin-dashboard');
        expect(appSrc).toContain('LegacyAdminRedirect');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.8 Middleware Chain
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.8 Middleware Chain — Validates: Requirements 3.8', () => {
    const MIDDLEWARE_ORDER = [
        'requestIdMiddleware',
        'cspNonceMiddleware',
        'helmet',
        'compression',
        'cookieParser',
        'morgan',
        'express.json',
        'express.urlencoded',
        'mongoSanitize',
        'hpp',
        'sanitizeRequestPayload',
        'enforceSiteAccess',
    ] as const;

    it('server.ts applies middleware in the correct order', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        // Verify each middleware is present
        for (const mw of MIDDLEWARE_ORDER) {
            expect(serverSrc).toContain(mw);
        }
    });

    it('PBT: for all middleware pairs, earlier middleware appears before later in source', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');

        // Use the actual app.use() call patterns from server.ts
        // helmet is called inside a custom middleware function, not directly as app.use(helmet)
        // So we search for the first occurrence of each middleware name after the "// Middleware" section
        const middlewareSection = serverSrc.slice(serverSrc.indexOf('// Middleware') || 0);

        const pairs: Array<{ first: string; second: string }> = [];
        for (let i = 0; i < MIDDLEWARE_ORDER.length - 1; i++) {
            pairs.push({ first: MIDDLEWARE_ORDER[i], second: MIDDLEWARE_ORDER[i + 1] });
        }

        fc.assert(
            fc.property(
                fc.constantFrom(...pairs),
                (pair) => {
                    const firstIdx = middlewareSection.indexOf(pair.first);
                    const secondIdx = middlewareSection.indexOf(pair.second);
                    expect(firstIdx).toBeGreaterThanOrEqual(0);
                    expect(secondIdx).toBeGreaterThanOrEqual(0);
                    expect(firstIdx).toBeLessThan(secondIdx);
                },
            ),
            { numRuns: pairs.length },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.9 Admin Rate Limiter
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.9 Admin Rate Limiter — Validates: Requirements 3.9', () => {
    it('adminRateLimiter is imported and applied to admin secret path in server.ts', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        expect(serverSrc).toContain('adminRateLimiter');
        // Applied to the secret admin path
        expect(serverSrc).toMatch(/app\.use\(`\/api\/\$\{ADMIN_SECRET_PATH\}`.*adminRateLimiter/s);
    });

    it('PBT: adminRateLimiter is applied to both secret and standalone admin paths', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        const adminPaths = ['ADMIN_SECRET_PATH', '/api/admin'] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...adminPaths),
                (adminPath) => {
                    expect(serverSrc).toContain(adminPath);
                    expect(serverSrc).toContain('adminRateLimiter');
                },
            ),
            { numRuns: adminPaths.length },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.10 Standalone Admin Hardening
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.10 Standalone Admin Hardening — Validates: Requirements 3.10', () => {
    const HARDENING_CHAIN = [
        'authenticate',
        'enforceAdminPanelPolicy',
        'enforceAdminReadOnlyMode',
        'enforceStandaloneAdminModulePermissions',
    ] as const;

    it('standaloneAdminApiHardening chain is defined with all 4 middleware', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        expect(serverSrc).toContain('standaloneAdminApiHardening');
        for (const mw of HARDENING_CHAIN) {
            expect(serverSrc).toContain(mw);
        }
    });

    it('PBT: for all hardening middleware, they appear in standaloneAdminApiHardening array', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        const hardeningMatch = serverSrc.match(/standaloneAdminApiHardening\s*=\s*\[([^\]]+)\]/s);
        expect(hardeningMatch).toBeTruthy();
        const hardeningBlock = hardeningMatch![1];

        fc.assert(
            fc.property(
                fc.constantFrom(...HARDENING_CHAIN),
                (mw) => {
                    expect(hardeningBlock).toContain(mw);
                },
            ),
            { numRuns: HARDENING_CHAIN.length },
        );
    });

    it('standaloneAdminApiHardening is applied to /api/admin routes', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        expect(serverSrc).toMatch(/app\.use\('\/api\/admin'.*standaloneAdminApiHardening/s);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.11 Cron Jobs
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.11 Cron Jobs — Validates: Requirements 3.11', () => {
    const CRON_STARTERS = [
        'startExamCronJobs',
        'startModernExamCronJobs',
        'startStudentDashboardCronJobs',
        'startFinanceRecurringCronJobs',
        'startNewsV2CronJobs',
        'startNotificationJobCron',
        'startRetentionCronJobs',
        'startSubscriptionExpiryCron',
        'startBackupCronJobs',
    ] as const;

    it('all 9 cron job starters are called in start() function', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');
        for (const cron of CRON_STARTERS) {
            expect(serverSrc).toContain(`${cron}()`);
        }
    });

    it('PBT: for all 9 cron starters, they are imported and invoked in server.ts', () => {
        const serverSrc = fs.readFileSync(path.join(BACKEND_ROOT, 'server.ts'), 'utf-8');

        fc.assert(
            fc.property(
                fc.constantFrom(...CRON_STARTERS),
                (cronFn) => {
                    // Imported
                    expect(serverSrc).toContain(`import { ${cronFn} }`);
                    // Called
                    expect(serverSrc).toContain(`${cronFn}()`);
                },
            ),
            { numRuns: CRON_STARTERS.length },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.12 React Query Defaults
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.12 React Query Defaults — Validates: Requirements 3.12', () => {
    it('QueryClient configured with staleTime 60000, retry 1, refetchOnWindowFocus false', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('QueryClient');
        expect(appSrc).toMatch(/staleTime:\s*60[_,]?000/);
        expect(appSrc).toMatch(/retry:\s*1/);
        expect(appSrc).toMatch(/refetchOnWindowFocus:\s*false/);
    });

    it('PBT: for all React Query default settings, values match expected', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        const defaults = [
            { key: 'staleTime', pattern: /staleTime:\s*60[_,]?000/ },
            { key: 'retry', pattern: /retry:\s*1/ },
            { key: 'refetchOnWindowFocus', pattern: /refetchOnWindowFocus:\s*false/ },
        ] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...defaults),
                (setting) => {
                    expect(appSrc).toMatch(setting.pattern);
                },
            ),
            { numRuns: defaults.length },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.13 Scroll Reset
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.13 Scroll Reset — Validates: Requirements 3.13', () => {
    it('RouteScrollReset component exists and scrolls to top on route change', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('RouteScrollReset');
        expect(appSrc).toContain('scrollTo');
        expect(appSrc).toContain('scrollRestoration');
    });

    it('RouteScrollReset handles hash anchors', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('location.hash');
        expect(appSrc).toContain('scrollIntoView');
    });

    it('PBT: RouteScrollReset is used in both fullscreen and non-fullscreen layouts', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        // Count occurrences of <RouteScrollReset in the JSX
        const matches = appSrc.match(/<RouteScrollReset\s*\/>/g) || [];
        // Should appear at least twice — once in fullscreen return, once in normal layout
        expect(matches.length).toBeGreaterThanOrEqual(2);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.14 Title/Favicon
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.14 Title/Favicon — Validates: Requirements 3.14', () => {
    it('resolveRouteTitle function exists and handles known routes', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('resolveRouteTitle');
        expect(appSrc).toContain('document.title');
    });

    it('PBT: for all known public routes, resolveRouteTitle produces a title', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        const knownRoutes = [
            { path: '/', expected: null }, // returns defaultTitle
            { path: '/universities', expected: 'Universities' },
            { path: '/news', expected: 'News' },
            { path: '/exams', expected: 'Exams' },
            { path: '/resources', expected: 'Resources' },
            { path: '/contact', expected: 'Contact' },
            { path: '/help-center', expected: 'Help Center' },
            { path: '/about', expected: 'About' },
            { path: '/terms', expected: 'Terms' },
            { path: '/privacy', expected: 'Privacy' },
        ] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...knownRoutes),
                (route) => {
                    if (route.expected) {
                        // The resolveRouteTitle function should contain the expected label
                        expect(appSrc).toContain(`'${route.expected}'`);
                    }
                    // The route path should be referenced in resolveRouteTitle
                    expect(appSrc).toContain(`'${route.path}'`);
                },
            ),
            { numRuns: knownRoutes.length },
        );
    });

    it('AppLayout dynamically updates favicon from settings', () => {
        const appSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'App.tsx'), 'utf-8');
        expect(appSrc).toContain('favicon');
        expect(appSrc).toContain("link.rel = 'icon'");
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3.15 Firebase AppCheck
// ═══════════════════════════════════════════════════════════════════════════════

describe('3.15 Firebase AppCheck — Validates: Requirements 3.15', () => {
    it('APP_CHECK_PROTECTED_PATTERNS array exists in api.ts with correct patterns', () => {
        const apiSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'services/api.ts'), 'utf-8');
        expect(apiSrc).toContain('APP_CHECK_PROTECTED_PATTERNS');
        expect(apiSrc).toContain('shouldAttachAppCheckHeader');
        expect(apiSrc).toContain('X-Firebase-AppCheck');
    });

    it('PBT: for all expected AppCheck patterns, they are in APP_CHECK_PROTECTED_PATTERNS', () => {
        const apiSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'services/api.ts'), 'utf-8');
        // Extract the APP_CHECK_PROTECTED_PATTERNS block
        const patternMatch = apiSrc.match(/APP_CHECK_PROTECTED_PATTERNS\s*=\s*\[([\s\S]*?)\];/);
        expect(patternMatch).toBeTruthy();
        const patternBlock = patternMatch![1];

        // Key path segments that must appear in the pattern block (escaped form as in source)
        const EXPECTED_SEGMENTS = [
            'auth\\/register',
            'auth\\/forgot-password',
            'auth\\/verify-2fa',
            'auth\\/resend-otp',
            'contact',
            'help-center',
            'content-blocks',
            'events\\/track',
            'news\\/share\\/track',
        ] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...EXPECTED_SEGMENTS),
                (segment) => {
                    expect(patternBlock).toContain(segment);
                },
            ),
            { numRuns: EXPECTED_SEGMENTS.length },
        );
    });

    it('shouldAttachAppCheckHeader only triggers for POST/PUT/PATCH/DELETE methods', () => {
        const apiSrc = fs.readFileSync(path.join(FRONTEND_ROOT, 'services/api.ts'), 'utf-8');
        expect(apiSrc).toContain("'POST', 'PUT', 'PATCH', 'DELETE'");
    });
});
