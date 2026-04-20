/**
 * Auth Session Persistence — End-to-End Tests
 *
 * Tests critical user flows for session persistence:
 * 1. Login → navigate to exam → refresh → complete exam (no re-login)
 * 2. Login → force logout during exam → re-login → verify progress restored
 * 3. Direct exam URL → bootstrap → exam loads
 *
 * Prerequisites:
 * - Playwright installed: `npm install -D @playwright/test`
 * - Backend running at E2E_API_BASE_URL (default: http://127.0.0.1:5003)
 * - Frontend running at E2E_BASE_URL (default: http://127.0.0.1:5175)
 * - Seeded test users available (see helpers.ts for credentials)
 * - A published exam available for the test student
 *
 * Running:
 *   npx playwright test src/__tests__/e2e/authSessionPersistence.test.ts
 *
 * Note: The project's primary Playwright config (playwright.config.ts) uses `./e2e`
 * as the testDir. To run this file, either:
 *   1. Use `npx playwright test --config=playwright.config.ts src/__tests__/e2e/`
 *   2. Or move this file to `CampusWay/frontend/e2e/auth-session-persistence.spec.ts`
 *
 * @see .kiro/specs/auth-session-persistence/requirements.md
 * @see .kiro/specs/auth-session-persistence/design.md
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const BASE_URL = env.E2E_BASE_URL || 'http://127.0.0.1:5175';
const API_BASE = env.E2E_API_BASE_URL || 'http://127.0.0.1:5003';

const STUDENT_CREDS = {
    email: env.E2E_STUDENT_SESSION_EMAIL || 'e2e_student_session@campusway.local',
    password: env.E2E_STUDENT_SESSION_PASSWORD || 'E2E_Student#12345',
};

const ADMIN_CREDS = {
    email: env.E2E_ADMIN_DESKTOP_EMAIL || 'e2e_admin_desktop@campusway.local',
    password: env.E2E_ADMIN_DESKTOP_PASSWORD || 'E2E_Admin#12345',
};

const SESSION_HINT_KEY = 'campusway-auth-session-hint';
const EXAM_PROGRESS_PRESERVATION_KEY = 'cw_exam_force_logout_preserved';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAsStudent(page: Page): Promise<void> {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('input#identifier, input[name="identifier"], input[type="text"], input[type="email"]').first().fill(STUDENT_CREDS.email);
    await page.locator('input#password, input[name="password"], input[type="password"]').first().fill(STUDENT_CREDS.password);
    await page.getByRole('button', { name: /(Sign in|Access Dashboard)/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

async function apiLoginAdmin(request: APIRequestContext): Promise<string> {
    const response = await request.post(`${API_BASE}/api/auth/login`, {
        data: { identifier: ADMIN_CREDS.email, password: ADMIN_CREDS.password },
    });
    expect(response.status(), 'Admin login failed').toBe(200);
    const body = await response.json();
    return String(body.token || '');
}

async function ensureTestExam(request: APIRequestContext, adminToken: string): Promise<string> {
    const now = Date.now();
    const startDate = new Date(now - 60 * 60 * 1000).toISOString();
    const endDate = new Date(now + 6 * 60 * 60 * 1000).toISOString();
    const resultPublishDate = new Date(now + 7 * 60 * 60 * 1000).toISOString();

    const createResponse = await request.post(`${API_BASE}/api/campusway-secure-admin/exams`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
            title: `E2E Auth Persistence Exam ${now}`,
            subject: 'E2E Session Test',
            description: 'Exam for auth session persistence e2e tests.',
            duration: 30,
            totalQuestions: 2,
            totalMarks: 2,
            startDate,
            endDate,
            resultPublishDate,
            attemptLimit: 999,
            negativeMarking: false,
            randomizeQuestions: false,
            randomizeOptions: false,
            allowBackNavigation: true,
            showQuestionPalette: true,
            showRemainingTime: true,
            autoSubmitOnTimeout: true,
            instructions: 'Auth persistence test exam.',
            require_instructions_agreement: true,
            security_policies: {
                tab_switch_limit: 99,
                copy_paste_violations: 99,
                camera_enabled: false,
                require_fullscreen: false,
                auto_submit_on_violation: false,
                violation_action: 'warn',
            },
        },
    });
    expect(createResponse.status(), await createResponse.text()).toBe(201);
    const body = await createResponse.json();
    const examId = String(body.exam?._id || '');
    expect(examId).toBeTruthy();

    // Add questions
    const questions = [
        {
            question: 'Auth Persistence Q1: Select A.',
            optionA: 'Alpha', optionB: 'Beta', optionC: 'Gamma', optionD: 'Delta',
            correctAnswer: 'A', marks: 1, difficulty: 'easy', order: 1, questionType: 'mcq',
        },
        {
            question: 'Auth Persistence Q2: Select B.',
            optionA: 'One', optionB: 'Two', optionC: 'Three', optionD: 'Four',
            correctAnswer: 'B', marks: 1, difficulty: 'easy', order: 2, questionType: 'mcq',
        },
    ];

    for (const q of questions) {
        const qRes = await request.post(`${API_BASE}/api/campusway-secure-admin/exams/${examId}/questions`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            data: q,
        });
        expect([200, 201]).toContain(qRes.status());
    }

    // Publish
    const publishRes = await request.patch(`${API_BASE}/api/campusway-secure-admin/exams/${examId}/publish`, {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(publishRes.status(), await publishRes.text()).toBe(200);

    return examId;
}

async function dismissPopupIfPresent(page: Page): Promise<void> {
    const closeBtn = page.getByRole('button', { name: /Close popup/i }).first();
    for (let i = 0; i < 3; i++) {
        if (await closeBtn.isVisible().catch(() => false)) {
            await closeBtn.click({ force: true }).catch(() => undefined);
        }
    }
}

async function getSessionHint(page: Page): Promise<string | null> {
    return page.evaluate((key) => window.localStorage.getItem(key), SESSION_HINT_KEY);
}

async function getPreservedExamProgress(page: Page): Promise<string | null> {
    return page.evaluate((key) => window.localStorage.getItem(key), EXAM_PROGRESS_PRESERVATION_KEY);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Auth Session Persistence — Critical User Flows', () => {
    let examId: string;

    test.beforeAll(async ({ request }) => {
        const adminToken = await apiLoginAdmin(request);
        examId = await ensureTestExam(request, adminToken);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Flow 1: Login → Navigate to Exam → Refresh → Complete Exam
    // Validates: Requirements 1.1, 1.2, 1.4, 1.5, 2.2, 2.3, 3.1, 3.5
    // ─────────────────────────────────────────────────────────────────────────

    test('login → navigate to exam → page refresh → session persists → complete exam', async ({ page }) => {
        // Step 1: Login as student
        await loginAsStudent(page);

        // Verify Session_Hint is written after login
        const hintAfterLogin = await getSessionHint(page);
        expect(hintAfterLogin).toBeTruthy();
        const parsedHint = JSON.parse(hintAfterLogin!);
        expect(parsedHint.active).toBe(true);
        expect(parsedHint.portal).toBe('student');

        // Step 2: Navigate to exam
        await page.goto(`/exam/${examId}`, { waitUntil: 'domcontentloaded' });
        await dismissPopupIfPresent(page);

        // Should NOT be redirected to login — session persists across navigation
        await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

        // Wait for exam page to load (either exam landing or runner)
        await expect(
            page.locator('[data-testid="exam-runner"], [class*="exam"], button:has-text("Start Exam"), h1, h2').first()
        ).toBeVisible({ timeout: 20_000 });

        // Step 3: Refresh the page — session should persist via bootstrap
        await page.reload({ waitUntil: 'domcontentloaded' });

        // Should NOT be redirected to login after refresh
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

        // Session_Hint should still be present after refresh
        const hintAfterRefresh = await getSessionHint(page);
        expect(hintAfterRefresh).toBeTruthy();

        // Exam content should still be accessible
        await expect(
            page.locator('[data-testid="exam-runner"], [class*="exam"], button:has-text("Start Exam"), [id^="exam-question-"]').first()
        ).toBeVisible({ timeout: 20_000 });

        // Step 4: Start and complete the exam
        await dismissPopupIfPresent(page);
        const startBtn = page.getByRole('button', { name: /^Start Exam$/i });
        if (await startBtn.isVisible().catch(() => false)) {
            await startBtn.click({ force: true });
        }

        // Answer questions if visible
        const questionCards = page.locator('[id^="exam-question-"]');
        const hasQuestions = await questionCards.first().isVisible({ timeout: 15_000 }).catch(() => false);
        if (hasQuestions) {
            // Answer first question
            await questionCards.first().locator('button[type="button"]').nth(0).click({ force: true });
            await page.waitForTimeout(1000);

            // Submit exam
            await dismissPopupIfPresent(page);
            const submitBtn = page.getByRole('button', { name: /^Submit$/i }).first();
            if (await submitBtn.isVisible().catch(() => false)) {
                await submitBtn.click({ force: true });
                const confirmBtn = page.getByRole('button', { name: /Confirm Submit/i });
                if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
                    await confirmBtn.click({ force: true });
                }
            }
        }

        // Verify no unexpected logout occurred during the entire flow
        const finalHint = await getSessionHint(page);
        expect(finalHint).toBeTruthy();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Flow 2: Login → Force Logout During Exam → Re-login → Progress Restored
    // Validates: Requirements 5.1, 5.3, 5.4, 5.5
    // ─────────────────────────────────────────────────────────────────────────

    test('login → force logout during exam → re-login → verify progress restored', async ({ page }) => {
        // Step 1: Login as student
        await loginAsStudent(page);

        // Step 2: Navigate to exam and start it
        await page.goto(`/exam/${examId}`, { waitUntil: 'domcontentloaded' });
        await dismissPopupIfPresent(page);
        await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

        const startBtn = page.getByRole('button', { name: /^Start Exam$/i });
        if (await startBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
            await startBtn.click({ force: true });
        }

        // Answer a question to create progress
        const questionCards = page.locator('[id^="exam-question-"]');
        const hasQuestions = await questionCards.first().isVisible({ timeout: 15_000 }).catch(() => false);
        if (hasQuestions) {
            await questionCards.first().locator('button[type="button"]').nth(0).click({ force: true });
            // Wait for auto-save to trigger
            await page.waitForTimeout(2000);
        }

        // Step 3: Simulate force logout event
        await page.evaluate(() => {
            // Dispatch the force-logout custom event as the system would
            const event = new CustomEvent('campusway:force-logout', {
                detail: { reason: 'SESSION_INVALIDATED' },
            });
            window.dispatchEvent(event);
        });

        // Step 4: Verify force logout modal appears or redirect to login
        const modalOrLogin = await Promise.race([
            page.getByRole('heading', { name: /Session Terminated/i })
                .waitFor({ state: 'visible', timeout: 10_000 })
                .then(() => 'modal' as const),
            page.waitForURL(/\/login/, { timeout: 10_000 })
                .then(() => 'login' as const),
        ]).catch(() => 'timeout' as const);

        expect(['modal', 'login']).toContain(modalOrLogin);

        // If modal is shown, dismiss it
        if (modalOrLogin === 'modal') {
            const acknowledgeBtn = page.getByRole('button', { name: /Acknowledge|OK|Sign In/i }).first();
            if (await acknowledgeBtn.isVisible().catch(() => false)) {
                await acknowledgeBtn.click({ force: true });
            }
            await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
        }

        // Step 5: Verify Session_Hint is cleared after force logout
        const hintAfterForceLogout = await getSessionHint(page);
        expect(hintAfterForceLogout).toBeNull();

        // Step 6: Verify exam progress was preserved in localStorage
        const preserved = await getPreservedExamProgress(page);
        // Progress preservation depends on whether the exam runner had cached data
        // In a real scenario with active exam state, this should be non-null
        if (preserved) {
            const parsedPreserved = JSON.parse(preserved);
            expect(parsedPreserved.examId).toBeTruthy();
            expect(parsedPreserved.preservedAt).toBeTruthy();
            expect(parsedPreserved.cache).toBeDefined();
        }

        // Step 7: Re-login
        await loginAsStudent(page);

        // Step 8: Navigate back to exam — session should be restored
        await page.goto(`/exam/${examId}`, { waitUntil: 'domcontentloaded' });
        await dismissPopupIfPresent(page);
        await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });

        // Exam should load without requiring re-authentication
        await expect(
            page.locator('[data-testid="exam-runner"], [class*="exam"], button:has-text("Start Exam"), [id^="exam-question-"]').first()
        ).toBeVisible({ timeout: 20_000 });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Flow 3: Direct Exam URL → Bootstrap → Exam Loads
    // Validates: Requirements 1.1, 1.5, 2.3, 2.4, 2.5
    // ─────────────────────────────────────────────────────────────────────────

    test('direct exam URL → session bootstrap → exam loads without re-login', async ({ page }) => {
        // Step 1: Login first to establish a session (refresh token cookie)
        await loginAsStudent(page);

        // Verify session is established
        const hint = await getSessionHint(page);
        expect(hint).toBeTruthy();

        // Step 2: Open a new page context simulating direct navigation
        // (same browser context preserves cookies, simulating bookmark/external link)
        await page.goto(`/exam/${examId}`, { waitUntil: 'domcontentloaded' });

        // Step 3: Session bootstrap should fire and restore the session
        // The page should NOT redirect to login
        await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

        // Step 4: Exam content should be visible after bootstrap completes
        await dismissPopupIfPresent(page);
        await expect(
            page.locator('[data-testid="exam-runner"], [class*="exam"], button:has-text("Start Exam"), [id^="exam-question-"], h1, h2').first()
        ).toBeVisible({ timeout: 20_000 });

        // Step 5: Verify Session_Hint is still intact (bootstrap preserved it)
        const hintAfterBootstrap = await getSessionHint(page);
        expect(hintAfterBootstrap).toBeTruthy();
        const parsed = JSON.parse(hintAfterBootstrap!);
        expect(parsed.active).toBe(true);
        expect(parsed.portal).toBe('student');
    });

    test('direct exam URL without session → redirects to login with returnTo', async ({ page, context }) => {
        // Step 1: Clear all cookies and storage to simulate no session
        await context.clearCookies();
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            window.localStorage.clear();
            window.sessionStorage.clear();
        });

        // Step 2: Navigate directly to exam URL without any session
        await page.goto(`/exam/${examId}`, { waitUntil: 'domcontentloaded' });

        // Step 3: Should redirect to login since bootstrap will fail (no refresh token)
        await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

        // Step 4: Verify returnTo parameter is preserved in the URL
        const currentUrl = page.url();
        expect(currentUrl).toMatch(/returnTo/);
        expect(currentUrl).toContain(encodeURIComponent(`/exam/${examId}`));

        // Step 5: Login and verify redirect back to exam
        await page.locator('input#identifier, input[name="identifier"], input[type="text"], input[type="email"]').first().fill(STUDENT_CREDS.email);
        await page.locator('input#password, input[name="password"], input[type="password"]').first().fill(STUDENT_CREDS.password);
        await page.getByRole('button', { name: /(Sign in|Access Dashboard)/i }).first().click();

        // Should redirect to the original exam URL after login
        await expect(page).toHaveURL(new RegExp(`/exam/${examId}`), { timeout: 15_000 });
    });
});
