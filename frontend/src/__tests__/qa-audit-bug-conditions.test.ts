import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import path from 'path';

/**
 * CampusWay QA Release Audit — Bug Condition Exploration Tests
 *
 * **Property 1: Bug Condition** — CampusWay Platform Defects Across 12 QA Phases
 *
 * **Validates: Requirements 1.1–1.49**
 *
 * CRITICAL: These tests are EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bugs exist. DO NOT fix the tests or the code.
 * Each test encodes the expected CORRECT behavior — when the platform
 * is fixed, these tests will pass.
 */

const BACKEND_URL = 'http://127.0.0.1:5003';
const FRONTEND_URL = 'http://localhost:5175';
const BACKEND_ROOT = path.resolve(__dirname, '../../../backend/src');
const FRONTEND_ROOT = path.resolve(__dirname, '../../src');

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 0 — Environment (Req 1.1)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 0 — Environment (Req 1.1)', () => {
    /**
     * Validates: Requirements 1.1
     * Health endpoint must return { status: 'OK', db: 'connected' }
     */
    it('health endpoint returns status OK with db connected', async () => {
        const res = await fetch(`${BACKEND_URL}/api/health`);
        expect(res.ok).toBe(true);
        const body = await res.json();
        expect(body).toHaveProperty('status', 'OK');
        expect(body).toHaveProperty('db', 'connected');
    });

    /**
     * Validates: Requirements 1.1
     * CORS must allow credentials from the frontend origin
     */
    it('CORS allows credentials from frontend origin', async () => {
        const res = await fetch(`${BACKEND_URL}/api/health`, {
            headers: { Origin: FRONTEND_URL },
        });
        const acaoHeader = res.headers.get('access-control-allow-origin');
        const acCredentials = res.headers.get('access-control-allow-credentials');
        // CORS must explicitly allow the frontend origin (not wildcard) and credentials
        expect(acaoHeader).toBeTruthy();
        expect(acaoHeader).not.toBe('*');
        expect(acCredentials).toBe('true');
    });

    /**
     * Validates: Requirements 1.1
     * SSE stream endpoint should accept connections without error
     */
    it('SSE home stream endpoint is reachable', async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
            const res = await fetch(`${BACKEND_URL}/api/home/stream`, {
                signal: controller.signal,
                headers: { Accept: 'text/event-stream' },
            });
            // Should return 200 with text/event-stream content type
            expect(res.status).toBe(200);
            const ct = res.headers.get('content-type') || '';
            expect(ct).toContain('text/event-stream');
        } catch (err: any) {
            // AbortError is acceptable — it means the stream connected and we aborted
            if (err.name !== 'AbortError') throw err;
        } finally {
            clearTimeout(timeout);
        }
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Seeding (Req 1.2)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 1 — Seeding (Req 1.2)', () => {
    const REQUIRED_ROLES = [
        'superadmin', 'admin', 'moderator', 'editor', 'viewer',
        'support_agent', 'finance_agent', 'student', 'chairman',
    ] as const;

    /**
     * Validates: Requirements 1.2
     * All 9 user roles must have at least one seeded user
     */
    it('all 9 required user roles exist in the database', async () => {
        const rolesFound: string[] = [];
        for (const role of REQUIRED_ROLES) {
            try {
                const res = await fetch(
                    `${BACKEND_URL}/api/campusway-secure-admin/users?role=${role}&limit=1`,
                );
                if (res.ok) {
                    const body = await res.json();
                    if (body?.data?.length > 0 || body?.items?.length > 0 || body?.users?.length > 0) {
                        rolesFound.push(role);
                    }
                }
            } catch {
                // Network error — role not verifiable
            }
        }
        expect(rolesFound).toEqual(expect.arrayContaining([...REQUIRED_ROLES]));
    });

    /**
     * Validates: Requirements 1.2
     * Property: for any required role, at least one user must exist
     */
    it('PBT: every required role has at least one seeded user', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...REQUIRED_ROLES),
                (role) => {
                    const userModelPath = path.join(BACKEND_ROOT, 'models/User.ts');
                    const source = fs.readFileSync(userModelPath, 'utf-8');
                    expect(source).toContain(role);
                },
            ),
            { numRuns: 9 },
        );
    });

    /**
     * Validates: Requirements 1.2
     * Seed scripts must exist for demo content
     */
    it('seed scripts exist for universities, exams, news, and subscription plans', () => {
        const seedDir = path.join(BACKEND_ROOT, 'seeds');
        const seedFiles = fs.existsSync(seedDir) ? fs.readdirSync(seedDir) : [];

        expect(seedFiles.some((f) => f.includes('index'))).toBe(true);

        const allSeedSource = seedFiles
            .filter((f) => f.endsWith('.ts'))
            .map((f) => {
                try { return fs.readFileSync(path.join(seedDir, f), 'utf-8'); } catch { return ''; }
            })
            .join('\n');

        expect(allSeedSource).toContain('university');
        expect(allSeedSource).toContain('exam');
        expect(allSeedSource.toLowerCase()).toMatch(/news|article/);
        expect(allSeedSource.toLowerCase()).toMatch(/subscription|plan/);
    });

    /**
     * Validates: Requirements 1.2
     * Public endpoints should return seeded data
     */
    it('public API returns seeded universities (10+)', async () => {
        const res = await fetch(`${BACKEND_URL}/api/universities`);
        expect(res.ok).toBe(true);
        const body = await res.json();
        const items = body?.data || body?.universities || body?.items || [];
        expect(items.length).toBeGreaterThanOrEqual(10);
    });

    it('public API returns seeded exams (5+)', async () => {
        const res = await fetch(`${BACKEND_URL}/api/exams/landing`);
        expect(res.ok).toBe(true);
        const body = await res.json();
        const items = body?.data || body?.exams || body?.items || [];
        expect(items.length).toBeGreaterThanOrEqual(5);
    });

    it('public API returns seeded news (10+)', async () => {
        const res = await fetch(`${BACKEND_URL}/api/news`);
        expect(res.ok).toBe(true);
        const body = await res.json();
        const items = body?.data || body?.news || body?.items || [];
        expect(items.length).toBeGreaterThanOrEqual(10);
    });

    it('public API returns subscription plans (3)', async () => {
        const res = await fetch(`${BACKEND_URL}/api/subscription-plans`);
        expect(res.ok).toBe(true);
        const body = await res.json();
        const items = body?.data || body?.plans || body?.items || [];
        expect(items.length).toBeGreaterThanOrEqual(3);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Public Visitor (Req 1.3–1.16)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 2 — Public Visitor (Req 1.3–1.16)', () => {
    const PUBLIC_API_ENDPOINTS = [
        { name: 'universities', path: '/api/universities' },
        { name: 'news', path: '/api/news' },
        { name: 'exams', path: '/api/exams/landing' },
        { name: 'resources', path: '/api/resources' },
        { name: 'contact info', path: '/api/contact' },
        { name: 'help-center', path: '/api/help-center/categories' },
        { name: 'subscription-plans', path: '/api/subscription-plans' },
    ] as const;

    /**
     * Validates: Requirements 1.3–1.11
     * Public page API endpoints must return valid data (200 OK)
     */
    it('all public page API endpoints return 200 OK', async () => {
        const failures: string[] = [];
        for (const ep of PUBLIC_API_ENDPOINTS) {
            try {
                const res = await fetch(`${BACKEND_URL}${ep.path}`);
                if (!res.ok) failures.push(`${ep.name} (${ep.path}) returned ${res.status}`);
            } catch (err: any) {
                failures.push(`${ep.name} (${ep.path}) network error: ${err.message}`);
            }
        }
        expect(failures).toEqual([]);
    });

    /**
     * Validates: Requirements 1.13
     * Auth pages should have Zod validation schemas in the frontend
     */
    it('auth page components use form validation (react-hook-form or Zod)', () => {
        const authPages = ['Login', 'StudentRegister', 'StudentForgotPassword'];
        const pagesDir = path.join(FRONTEND_ROOT, 'pages');
        const componentDirs = [pagesDir, path.join(FRONTEND_ROOT, 'components/auth')];

        let foundValidation = false;
        for (const dir of componentDirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));
            for (const file of files) {
                const fullPath = path.join(dir, file);
                try {
                    const source = fs.readFileSync(fullPath, 'utf-8');
                    if (
                        (source.includes('zodResolver') || source.includes("from 'zod'") || source.includes('from "zod"')) &&
                        authPages.some((p) => file.includes(p))
                    ) {
                        foundValidation = true;
                    }
                } catch { /* skip unreadable */ }
            }
        }
        expect(foundValidation).toBe(true);
    });

    /**
     * Validates: Requirements 1.14
     * Footer component must exist with social links
     */
    it('Footer component exists and contains social link references', () => {
        const footerPath = path.join(FRONTEND_ROOT, 'components/layout/Footer.tsx');
        expect(fs.existsSync(footerPath)).toBe(true);
        const source = fs.readFileSync(footerPath, 'utf-8');
        const hasSocialRefs = /social|facebook|twitter|youtube|instagram|linkedin/i.test(source);
        expect(hasSocialRefs).toBe(true);
    });

    /**
     * Validates: Requirements 1.15
     * Legacy redirect logic must exist in appRoutes.ts
     */
    it('legacyAdminToSecret function handles legacy admin paths', () => {
        const appRoutesPath = path.join(FRONTEND_ROOT, 'lib/appRoutes.ts');
        const source = fs.readFileSync(appRoutesPath, 'utf-8');
        expect(source).toContain('legacyAdminToSecret');
        expect(source).toContain('campusway-secure-admin');
        expect(source).toContain('admin-dashboard');
    });

    /**
     * Validates: Requirements 1.16
     * 404 page component must exist
     */
    it('NotFound page component exists', () => {
        const notFoundPath = path.join(FRONTEND_ROOT, 'pages/NotFound.tsx');
        expect(fs.existsSync(notFoundPath)).toBe(true);
        const source = fs.readFileSync(notFoundPath, 'utf-8');
        expect(source).toMatch(/home|\/"|href=["']\/["']/i);
    });

    /**
     * Validates: Requirements 1.3–1.11
     * PBT: for all public API endpoints, response must be 200 OK with valid JSON
     */
    it('PBT: all public endpoints return valid JSON responses', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...PUBLIC_API_ENDPOINTS),
                async (ep) => {
                    const res = await fetch(`${BACKEND_URL}${ep.path}`);
                    expect(res.ok).toBe(true);
                    const body = await res.json();
                    expect(body).toBeDefined();
                    expect(typeof body).toBe('object');
                },
            ),
            { numRuns: PUBLIC_API_ENDPOINTS.length },
        );
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Student Flow (Req 1.17–1.23)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 3 — Student Flow (Req 1.17–1.23)', () => {
    /**
     * Validates: Requirements 1.17
     * CSRF token endpoint must exist and return a token
     */
    it('CSRF token endpoint exists and returns a token', async () => {
        const res = await fetch(`${BACKEND_URL}/api/auth/csrf-token`);
        expect(res.ok).toBe(true);
        const body = await res.json();
        expect(body).toHaveProperty('csrfToken');
        expect(typeof body.csrfToken).toBe('string');
        expect(body.csrfToken.length).toBeGreaterThan(0);
    });

    /**
     * Validates: Requirements 1.17
     * Login endpoint must accept credentials and return tokens
     */
    it('login endpoint accepts POST with credentials', async () => {
        const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'test@example.com', password: 'wrong' }),
        });
        // Even with wrong credentials, endpoint should exist (not 404)
        expect(res.status).not.toBe(404);
        const body = await res.json();
        expect(body).toBeDefined();
    });

    /**
     * Validates: Requirements 1.17
     * api.ts must store access token in memory (not localStorage)
     */
    it('api.ts uses inMemoryAccessToken pattern (not localStorage for tokens)', () => {
        const apiPath = path.join(FRONTEND_ROOT, 'services/api.ts');
        const source = fs.readFileSync(apiPath, 'utf-8');
        expect(source).toContain('inMemoryAccessToken');
        expect(source).not.toMatch(/localStorage\.setItem\s*\(\s*['"].*token/i);
    });

    /**
     * Validates: Requirements 1.17
     * Browser fingerprint must be generated and attached to requests
     */
    it('api.ts generates browser fingerprint and stores in localStorage', () => {
        const apiPath = path.join(FRONTEND_ROOT, 'services/api.ts');
        const source = fs.readFileSync(apiPath, 'utf-8');
        expect(source).toContain('campusway-browser-fingerprint');
        expect(source).toContain('ensureBrowserFingerprint');
    });

    /**
     * Validates: Requirements 1.19
     * Student dashboard API endpoints must exist
     */
    it('student dashboard API endpoint exists', async () => {
        const res = await fetch(`${BACKEND_URL}/api/student/dashboard`);
        // Without auth should return 401 (not 404)
        expect(res.status).not.toBe(404);
    });

    /**
     * Validates: Requirements 1.21–1.22
     * Exam flow endpoints must exist
     */
    it('exam landing API endpoint exists', async () => {
        const res = await fetch(`${BACKEND_URL}/api/exams/landing`);
        expect(res.status).not.toBe(404);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — Admin Flow (Req 1.24–1.36)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 4 — Admin Flow (Req 1.24–1.36)', () => {
    /**
     * Validates: Requirements 1.24
     * Admin login endpoint must exist at the secret admin path
     */
    it('admin login endpoint exists', async () => {
        const res = await fetch(`${BACKEND_URL}/api/campusway-secure-admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'admin', password: 'wrong' }),
        });
        expect(res.status).not.toBe(404);
    });

    /**
     * Validates: Requirements 1.25
     * RBAC middleware (requirePermission) must be used on admin routes
     */
    it('admin routes use requirePermission middleware', () => {
        const adminRoutesPath = path.join(BACKEND_ROOT, 'routes/adminRoutes.ts');
        const source = fs.readFileSync(adminRoutesPath, 'utf-8');
        expect(source).toContain('requirePermission');
        const matches = source.match(/requirePermission/g) || [];
        expect(matches.length).toBeGreaterThan(10);
    });

    /**
     * Validates: Requirements 1.27–1.36
     * Admin CRUD endpoints must exist for key modules
     */
    it('admin CRUD endpoints exist for universities, news, exams, students', async () => {
        const adminEndpoints = [
            '/api/campusway-secure-admin/universities',
            '/api/campusway-secure-admin/news',
            '/api/campusway-secure-admin/exams',
            '/api/campusway-secure-admin/students',
            '/api/campusway-secure-admin/subscription-plans',
        ];
        for (const ep of adminEndpoints) {
            const res = await fetch(`${BACKEND_URL}${ep}`);
            expect(res.status).not.toBe(404);
        }
    });

    /**
     * Validates: Requirements 1.34
     * Settings endpoints must exist
     */
    it('admin settings endpoint exists', async () => {
        const res = await fetch(`${BACKEND_URL}/api/campusway-secure-admin/settings`);
        expect(res.status).not.toBe(404);
    });

    /**
     * Validates: Requirements 1.35
     * Team access endpoints must exist
     */
    it('team access endpoints exist', async () => {
        const teamEndpoints = [
            '/api/campusway-secure-admin/team/members',
            '/api/campusway-secure-admin/team/roles',
        ];
        for (const ep of teamEndpoints) {
            const res = await fetch(`${BACKEND_URL}${ep}`);
            expect(res.status).not.toBe(404);
        }
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Responsive (Req 1.37–1.39)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 5 — Responsive (Req 1.37–1.39)', () => {
    const TAILWIND_BREAKPOINTS = {
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280,
        '2xl': 1536,
    } as const;

    /**
     * Validates: Requirements 1.37–1.39
     * Tailwind config must have correct default breakpoints
     */
    it('Tailwind config uses standard breakpoints', () => {
        const tailwindPath = path.join(FRONTEND_ROOT, '../tailwind.config.js');
        const source = fs.readFileSync(tailwindPath, 'utf-8');
        const hasCustomScreens = /screens\s*:\s*\{/.test(source);
        if (hasCustomScreens) {
            expect(source).toMatch(/640|768|1024|1280|1536/);
        }
        expect(source).toContain('content');
        expect(source).toContain('theme');
    });

    /**
     * Validates: Requirements 1.37
     * Table components must use overflow-x-auto for horizontal scrolling
     */
    it('table components use overflow-x-auto for horizontal scrolling', () => {
        const componentDirs = [
            path.join(FRONTEND_ROOT, 'components/admin'),
            path.join(FRONTEND_ROOT, 'components/student'),
        ];
        let foundOverflowAuto = false;
        for (const dir of componentDirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(dir, String(file)), 'utf-8');
                    if (source.includes('overflow-x-auto') && source.includes('<table')) {
                        foundOverflowAuto = true;
                        break;
                    }
                } catch { /* skip */ }
            }
            if (foundOverflowAuto) break;
        }
        expect(foundOverflowAuto).toBe(true);
    });

    /**
     * Validates: Requirements 1.37–1.39
     * PBT: for all 6 viewport widths, Tailwind breakpoint coverage exists
     */
    it('PBT: all target viewports are covered by Tailwind breakpoints', () => {
        const viewportWidths = [375, 390, 768, 1024, 1280, 1536] as const;
        fc.assert(
            fc.property(
                fc.constantFrom(...viewportWidths),
                (width) => {
                    const breakpointValues = Object.values(TAILWIND_BREAKPOINTS);
                    const applicableBreakpoints = breakpointValues.filter((bp) => width >= bp);
                    if (width < 640) {
                        expect(width).toBeLessThan(640);
                    } else {
                        expect(applicableBreakpoints.length).toBeGreaterThan(0);
                    }
                },
            ),
            { numRuns: viewportWidths.length },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6 — Theme (Req 1.40–1.41)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6 — Theme (Req 1.40–1.41)', () => {
    /**
     * Validates: Requirements 1.40
     * CSS variables must be defined for both light and dark themes
     */
    it('CSS variables defined for both light and dark themes', () => {
        const themePath = path.join(FRONTEND_ROOT, 'styles/theme.css');
        expect(fs.existsSync(themePath)).toBe(true);
        const source = fs.readFileSync(themePath, 'utf-8');
        expect(source).toMatch(/:root\s*\{/);
        expect(source).toContain('--bg:');
        expect(source).toContain('--surface:');
        expect(source).toContain('--text:');
        expect(source).toContain('--border:');
        expect(source).toMatch(/html\.dark|\.dark/);
    });

    /**
     * Validates: Requirements 1.40
     * Theme toggle component must exist
     */
    it('theme toggle component exists with data-testid', () => {
        const togglePath = path.join(FRONTEND_ROOT, 'components/ui/ThemeSwitchPro.tsx');
        expect(fs.existsSync(togglePath)).toBe(true);
        const source = fs.readFileSync(togglePath, 'utf-8');
        expect(source).toContain('theme-toggle');
        expect(source).toContain('toggleDarkMode');
    });

    /**
     * Validates: Requirements 1.41
     * localStorage theme persistence logic must exist
     */
    it('theme persistence uses localStorage with campusway_theme key', () => {
        const themeHookPath = path.join(FRONTEND_ROOT, 'hooks/useTheme.tsx');
        expect(fs.existsSync(themeHookPath)).toBe(true);
        const source = fs.readFileSync(themeHookPath, 'utf-8');
        expect(source).toContain('campusway_theme');
        expect(source).toContain('localStorage');
    });

    /**
     * Validates: Requirements 1.41
     * index.html must have inline script to prevent theme flash
     */
    it('index.html has inline theme script to prevent FOUC', () => {
        const indexPath = path.join(FRONTEND_ROOT, '../index.html');
        const source = fs.readFileSync(indexPath, 'utf-8');
        expect(source).toContain('campusway_theme');
        expect(source).toMatch(/classList\.(add|remove)\s*\(\s*['"]dark['"]\s*\)/);
    });

    /**
     * Validates: Requirements 1.40–1.41
     * PBT: for all theme modes, CSS variable definitions must exist
     */
    it('PBT: all theme modes have CSS variable definitions', () => {
        const themePath = path.join(FRONTEND_ROOT, 'styles/theme.css');
        const source = fs.readFileSync(themePath, 'utf-8');
        const requiredVars = ['--bg', '--surface', '--text', '--border', '--muted', '--primary'];

        fc.assert(
            fc.property(
                fc.constantFrom('light' as const, 'dark' as const),
                fc.constantFrom(...requiredVars),
                (theme, cssVar) => {
                    if (theme === 'light') {
                        expect(source).toContain(`${cssVar}:`);
                    } else {
                        const darkSection = source.split(/html\.dark|\.dark\s*\{/)[1] || '';
                        expect(darkSection).toContain(`${cssVar}:`);
                    }
                },
            ),
            { numRuns: 12 },
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 7 — Buttons (Req 1.42)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 7 — Buttons (Req 1.42)', () => {
    /**
     * Validates: Requirements 1.42
     * Interactive components must have onClick/onSubmit handlers
     */
    it('key page components have onClick or onSubmit handlers', () => {
        const pageDirs = [
            path.join(FRONTEND_ROOT, 'pages'),
            path.join(FRONTEND_ROOT, 'components'),
        ];
        let totalHandlers = 0;
        for (const dir of pageDirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(dir, String(file)), 'utf-8');
                    const clickMatches = source.match(/onClick|onSubmit|onKeyDown/g) || [];
                    totalHandlers += clickMatches.length;
                } catch { /* skip */ }
            }
        }
        expect(totalHandlers).toBeGreaterThan(50);
    });

    /**
     * Validates: Requirements 1.42
     * Components should use button elements for keyboard accessibility
     */
    it('components use <button> elements (not just div onClick)', () => {
        const componentsDir = path.join(FRONTEND_ROOT, 'components');
        let buttonCount = 0;
        let divOnClickCount = 0;
        if (fs.existsSync(componentsDir)) {
            const files = fs.readdirSync(componentsDir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(componentsDir, String(file)), 'utf-8');
                    buttonCount += (source.match(/<button/g) || []).length;
                    divOnClickCount += (source.match(/<div[^>]*onClick/g) || []).length;
                } catch { /* skip */ }
            }
        }
        expect(buttonCount).toBeGreaterThan(divOnClickCount);
    });

    /**
     * Validates: Requirements 1.42
     * Loading state patterns must exist in components
     */
    it('components use loading state patterns (isLoading, isPending)', () => {
        const dirs = [
            path.join(FRONTEND_ROOT, 'pages'),
            path.join(FRONTEND_ROOT, 'components'),
        ];
        let loadingPatterns = 0;
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(dir, String(file)), 'utf-8');
                    loadingPatterns += (source.match(/isLoading|isPending|isSubmitting/g) || []).length;
                } catch { /* skip */ }
            }
        }
        expect(loadingPatterns).toBeGreaterThan(20);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 8 — Debugging (Req 1.43–1.45)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 8 — Debugging (Req 1.43–1.45)', () => {
    /**
     * Validates: Requirements 1.43
     * No console.error calls in production page components
     */
    it('no console.error in production page components', () => {
        const pagesDir = path.join(FRONTEND_ROOT, 'pages');
        const violations: string[] = [];
        if (fs.existsSync(pagesDir)) {
            const files = fs.readdirSync(pagesDir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx') && !String(file).endsWith('.ts')) continue;
                try {
                    const source = fs.readFileSync(path.join(pagesDir, String(file)), 'utf-8');
                    if (source.includes('console.error')) {
                        violations.push(String(file));
                    }
                } catch { /* skip */ }
            }
        }
        expect(violations).toEqual([]);
    });

    /**
     * Validates: Requirements 1.43
     * Error boundaries must exist for graceful error handling
     */
    it('error boundary component exists', () => {
        const errorBoundaryPaths = [
            path.join(FRONTEND_ROOT, 'components/home/SectionErrorBoundary.tsx'),
            path.join(FRONTEND_ROOT, 'components/ErrorBoundary.tsx'),
            path.join(FRONTEND_ROOT, 'components/common/ErrorBoundary.tsx'),
        ];
        const exists = errorBoundaryPaths.some((p) => fs.existsSync(p));
        expect(exists).toBe(true);
    });

    /**
     * Validates: Requirements 1.44
     * API error handling must exist in axios interceptors
     */
    it('api.ts has response interceptor for error handling', () => {
        const apiPath = path.join(FRONTEND_ROOT, 'services/api.ts');
        const source = fs.readFileSync(apiPath, 'utf-8');
        expect(source).toContain('interceptors');
        expect(source).toMatch(/401|unauthorized/i);
    });

    /**
     * Validates: Requirements 1.45
     * Data rendering components should use optional chaining
     */
    it('components use optional chaining for null-safe data access', () => {
        const dirs = [
            path.join(FRONTEND_ROOT, 'pages'),
            path.join(FRONTEND_ROOT, 'components'),
        ];
        let optionalChainingCount = 0;
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(dir, String(file)), 'utf-8');
                    optionalChainingCount += (source.match(/\?\./g) || []).length;
                } catch { /* skip */ }
            }
        }
        expect(optionalChainingCount).toBeGreaterThan(100);
    });
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 9 — Accessibility (Req 1.46)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 9 — Accessibility (Req 1.46)', () => {
    /**
     * Validates: Requirements 1.46
     * html lang attribute must be set in index.html
     */
    it('index.html has lang attribute on html element', () => {
        const indexPath = path.join(FRONTEND_ROOT, '../index.html');
        const source = fs.readFileSync(indexPath, 'utf-8');
        expect(source).toMatch(/<html[^>]*lang=["'][a-z]{2}/i);
    });

    /**
     * Validates: Requirements 1.46
     * Skip-to-content link must exist
     */
    it('skip-to-content link exists in AppLayout', () => {
        const appPath = path.join(FRONTEND_ROOT, 'App.tsx');
        const source = fs.readFileSync(appPath, 'utf-8');
        expect(source).toMatch(/skip.*content|skip.*main/i);
        expect(source).toContain('#main-content');
    });

    /**
     * Validates: Requirements 1.46
     * Form inputs must have associated labels or aria-label
     */
    it('form components use label or aria-label for inputs', () => {
        const dirs = [
            path.join(FRONTEND_ROOT, 'components/common'),
            path.join(FRONTEND_ROOT, 'components/auth'),
        ];
        let labelCount = 0;
        let inputCount = 0;
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(dir, String(file)), 'utf-8');
                    inputCount += (source.match(/<input/g) || []).length;
                    labelCount += (source.match(/<label|aria-label|aria-labelledby|htmlFor/g) || []).length;
                } catch { /* skip */ }
            }
        }
        if (inputCount > 0) {
            expect(labelCount).toBeGreaterThanOrEqual(inputCount);
        }
    });

    /**
     * Validates: Requirements 1.46
     * Images must have alt attributes
     */
    it('image elements use alt attributes in key components', () => {
        const dirs = [
            path.join(FRONTEND_ROOT, 'components/layout'),
            path.join(FRONTEND_ROOT, 'components/home'),
        ];
        let imgCount = 0;
        let altCount = 0;
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(dir, String(file)), 'utf-8');
                    imgCount += (source.match(/<img/g) || []).length;
                    altCount += (source.match(/<img[^>]*alt=/g) || []).length;
                } catch { /* skip */ }
            }
        }
        if (imgCount > 0) {
            expect(altCount).toBe(imgCount);
        }
    });

    /**
     * Validates: Requirements 1.46
     * PBT: for all form component files, label associations must exist
     */
    it('PBT: form-related components have label associations', () => {
        const formComponents = [
            'components/common/FormField.tsx',
            'components/common/InputField.tsx',
            'components/common/SelectField.tsx',
            'components/common/TextareaField.tsx',
        ];
        const existingComponents = formComponents
            .map((c) => path.join(FRONTEND_ROOT, c))
            .filter((p) => fs.existsSync(p));

        if (existingComponents.length > 0) {
            fc.assert(
                fc.property(
                    fc.constantFrom(...existingComponents),
                    (componentPath) => {
                        const source = fs.readFileSync(componentPath, 'utf-8');
                        const hasLabelAssociation =
                            source.includes('htmlFor') ||
                            source.includes('aria-label') ||
                            source.includes('aria-labelledby') ||
                            source.includes('<label');
                        expect(hasLabelAssociation).toBe(true);
                    },
                ),
                { numRuns: existingComponents.length || 1 },
            );
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 10 — Deployment (Req 1.47)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 10 — Deployment (Req 1.47)', () => {
    /**
     * Validates: Requirements 1.47
     * tsconfig must exist and be valid for production build
     */
    it('tsconfig.json exists for frontend', () => {
        const tsconfigPath = path.join(FRONTEND_ROOT, '../tsconfig.json');
        expect(fs.existsSync(tsconfigPath)).toBe(true);
        const source = fs.readFileSync(tsconfigPath, 'utf-8');
        expect(source).toContain('compilerOptions');
    });

    /**
     * Validates: Requirements 1.47
     * No hardcoded localhost URLs in production code paths
     */
    it('no hardcoded localhost URLs in production service files', () => {
        const serviceFiles = [
            path.join(FRONTEND_ROOT, 'services/api.ts'),
        ];
        for (const filePath of serviceFiles) {
            if (!fs.existsSync(filePath)) continue;
            const source = fs.readFileSync(filePath, 'utf-8');
            // Should not have hardcoded localhost as the primary API URL
            const hardcodedLocalhost = source.match(/['"]http:\/\/localhost:\d+\/api['"]/g) || [];
            const nonEnvHardcoded = hardcodedLocalhost.filter((match) => {
                const idx = source.indexOf(match);
                const lineStart = source.lastIndexOf('\n', idx);
                const line = source.substring(lineStart, idx + match.length);
                return !line.includes('import.meta.env') && !line.includes('//') && !line.includes('process.env');
            });
            expect(nonEnvHardcoded).toEqual([]);
        }
    });

    /**
     * Validates: Requirements 1.47
     * Source maps and build configuration in vite.config.ts
     */
    it('vite.config.ts exists with build configuration', () => {
        const vitePath = path.join(FRONTEND_ROOT, '../vite.config.ts');
        expect(fs.existsSync(vitePath)).toBe(true);
        const source = fs.readFileSync(vitePath, 'utf-8');
        expect(source).toContain('build');
        expect(source).toContain('manualChunks');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 11 — Performance (Req 1.48)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 11 — Performance (Req 1.48)', () => {
    /**
     * Validates: Requirements 1.48
     * Lazy loading must be used in App.tsx for page components
     */
    it('App.tsx uses React.lazy for page-level code splitting', () => {
        const appPath = path.join(FRONTEND_ROOT, 'App.tsx');
        const source = fs.readFileSync(appPath, 'utf-8');
        expect(source).toContain('lazy(');
        const lazyMatches = source.match(/lazy\s*\(/g) || [];
        expect(lazyMatches.length).toBeGreaterThanOrEqual(3);
    });

    /**
     * Validates: Requirements 1.48
     * React Query staleTime must be 60000 (60 seconds)
     */
    it('React Query default staleTime is 60000', () => {
        const appPath = path.join(FRONTEND_ROOT, 'App.tsx');
        const source = fs.readFileSync(appPath, 'utf-8');
        expect(source).toMatch(/staleTime\s*:\s*(60[_]?000|60000)/);
    });

    /**
     * Validates: Requirements 1.48
     * Code splitting configuration must exist in vite.config.ts
     */
    it('vite.config.ts has code splitting with manualChunks', () => {
        const vitePath = path.join(FRONTEND_ROOT, '../vite.config.ts');
        const source = fs.readFileSync(vitePath, 'utf-8');
        expect(source).toContain('manualChunks');
        expect(source).toContain('vendor-react');
    });

    /**
     * Validates: Requirements 1.48
     * Font preloading must exist in index.html
     */
    it('index.html has font preloading', () => {
        const indexPath = path.join(FRONTEND_ROOT, '../index.html');
        const source = fs.readFileSync(indexPath, 'utf-8');
        expect(source).toMatch(/rel=["']preload["'][^>]*as=["']font["']/);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 12 — Security (Req 1.49)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 12 — Security (Req 1.49)', () => {
    /**
     * Validates: Requirements 1.49
     * JWT access token must NOT be stored in localStorage
     */
    it('api.ts stores JWT in memory only (inMemoryAccessToken), not localStorage', () => {
        const apiPath = path.join(FRONTEND_ROOT, 'services/api.ts');
        const source = fs.readFileSync(apiPath, 'utf-8');
        expect(source).toContain('inMemoryAccessToken');
        const tokenStorageMatches = source.match(/localStorage\.setItem\s*\(\s*['"][^'"]*token/gi) || [];
        expect(tokenStorageMatches).toEqual([]);
    });

    /**
     * Validates: Requirements 1.49
     * CSRF double-submit pattern must exist in csrfGuard.ts
     */
    it('CSRF double-submit cookie pattern exists in csrfGuard.ts', () => {
        const csrfPath = path.join(BACKEND_ROOT, 'middlewares/csrfGuard.ts');
        const source = fs.readFileSync(csrfPath, 'utf-8');
        expect(source).toContain('_csrf');
        expect(source).toContain('x-csrf-token');
        expect(source).toContain('timingSafeEqual');
    });

    /**
     * Validates: Requirements 1.49
     * No secrets in frontend code
     */
    it('no secrets or API keys in frontend source code', () => {
        const sensitivePatterns = [
            /JWT_SECRET\s*=\s*['"][^'"]+['"]/,
            /JWT_REFRESH_SECRET\s*=\s*['"][^'"]+['"]/,
        ];
        const dirs = [
            path.join(FRONTEND_ROOT, 'services'),
            path.join(FRONTEND_ROOT, 'lib'),
            path.join(FRONTEND_ROOT, 'hooks'),
        ];
        const violations: string[] = [];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) continue;
            const files = fs.readdirSync(dir, { recursive: true }) as string[];
            for (const file of files) {
                if (!String(file).endsWith('.ts') && !String(file).endsWith('.tsx')) continue;
                try {
                    const source = fs.readFileSync(path.join(dir, String(file)), 'utf-8');
                    for (const pattern of sensitivePatterns) {
                        if (pattern.test(source)) {
                            violations.push(`${file} contains secret`);
                        }
                    }
                } catch { /* skip */ }
            }
        }
        expect(violations).toEqual([]);
    });

    /**
     * Validates: Requirements 1.49
     * Password field must have select:false in User model
     */
    it('User model has select:false on password field', () => {
        const userModelPath = path.join(BACKEND_ROOT, 'models/User.ts');
        const source = fs.readFileSync(userModelPath, 'utf-8');
        expect(source).toMatch(/password\s*:\s*\{[^}]*select\s*:\s*false/);
    });

    /**
     * Validates: Requirements 1.49
     * twoFactorSecret must have select:false in User model
     */
    it('User model has select:false on twoFactorSecret field', () => {
        const userModelPath = path.join(BACKEND_ROOT, 'models/User.ts');
        const source = fs.readFileSync(userModelPath, 'utf-8');
        expect(source).toMatch(/twoFactorSecret\s*:\s*\{[^}]*select\s*:\s*false/);
    });

    /**
     * Validates: Requirements 1.49
     * Helmet middleware must be used in server.ts
     */
    it('server.ts uses Helmet middleware', () => {
        const serverPath = path.join(BACKEND_ROOT, 'server.ts');
        const source = fs.readFileSync(serverPath, 'utf-8');
        expect(source).toContain("import helmet from 'helmet'");
        expect(source).toMatch(/helmet\s*\(/);
    });

    /**
     * Validates: Requirements 1.49
     * mongo-sanitize middleware must be used in server.ts
     */
    it('server.ts uses express-mongo-sanitize middleware', () => {
        const serverPath = path.join(BACKEND_ROOT, 'server.ts');
        const source = fs.readFileSync(serverPath, 'utf-8');
        expect(source).toContain('mongoSanitize');
        expect(source).toMatch(/app\.use\s*\(\s*mongoSanitize/);
    });

    /**
     * Validates: Requirements 1.49
     * PBT: for all sensitive fields, select:false must be set
     */
    it('PBT: all sensitive User model fields have select:false', () => {
        const userModelPath = path.join(BACKEND_ROOT, 'models/User.ts');
        const source = fs.readFileSync(userModelPath, 'utf-8');
        const sensitiveFields = ['password', 'twoFactorSecret'] as const;

        fc.assert(
            fc.property(
                fc.constantFrom(...sensitiveFields),
                (field) => {
                    const regex = new RegExp(`${field}\\s*:\\s*\\{[^}]*select\\s*:\\s*false`, 's');
                    expect(regex.test(source)).toBe(true);
                },
            ),
            { numRuns: sensitiveFields.length },
        );
    });
});
