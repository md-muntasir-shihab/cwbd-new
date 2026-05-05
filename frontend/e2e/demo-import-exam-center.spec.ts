/**
 * Demo: Question Bank Import + Exam Center Walkthrough
 *
 * This Playwright script logs in as admin, navigates through:
 *   1. Question Bank → Import tab (upload template, preview, column mapping UI)
 *   2. Exam Center → Hierarchy Manager (create group, verify tree)
 *   3. Exam Center → sidebar sub-modules visibility check
 *
 * Run:
 *   npx playwright test e2e/demo-import-exam-center.spec.ts --headed
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:5175';
const ADMIN_EMAIL = 'admin@campusway.com';
const ADMIN_PASS = 'Admin@123456';

test.describe('CampusWay Admin Demo — Import & Exam Center', () => {

    test.beforeEach(async ({ page }) => {
        // ── Login ──
        await page.goto(`${BASE}/__cw_admin__/login`);
        await page.getByPlaceholder('admin@example.com').fill(ADMIN_EMAIL);
        await page.getByPlaceholder('********').fill(ADMIN_PASS);
        await page.getByRole('button', { name: /Sign In/i }).click();
        await page.waitForURL('**/__cw_admin__/dashboard**', { timeout: 20000 });
        // Wait for dashboard to fully load
        await page.waitForTimeout(2000);
    });

    test('Demo 1: Question Bank — Download Template + Import Preview', async ({ page }) => {
        // ── Navigate to Question Bank ──
        await page.click('text=Question Bank');
        await page.waitForTimeout(1500);

        // ── Click Import tab ──
        await page.click('text=Import');
        await page.waitForTimeout(1500);

        // Take screenshot of the Import panel
        await page.screenshot({ path: 'e2e/screenshots/demo-import-panel.png', fullPage: true });

        // ── Download template ──
        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
            page.click('text=Download Template'),
        ]);
        await page.waitForTimeout(1000);

        if (download) {
            console.log(`✅ Template downloaded: ${download.suggestedFilename()}`);
            // Use the downloaded template as the import file
            const templatePath = await download.path();

            if (templatePath) {
                // ── Upload the template file for preview ──
                const fileInput = page.locator('input[type="file"]');
                await fileInput.setInputFiles(templatePath);
                await page.waitForTimeout(1500);

                // Screenshot after file selected
                await page.screenshot({ path: 'e2e/screenshots/demo-file-selected.png', fullPage: true });

                // ── Click Preview Import ──
                const previewBtn = page.getByRole('button', { name: /Preview Import/i });
                if (await previewBtn.isVisible()) {
                    await previewBtn.click();
                    await page.waitForTimeout(3000);
                    // Screenshot of preview result
                    await page.screenshot({ path: 'e2e/screenshots/demo-import-preview.png', fullPage: true });
                    console.log('✅ Preview Import completed');
                }
            }
        } else {
            console.log('⚠️ Template download was not triggered (expected in some configs)');
        }

        // Verify the Import panel is visible
        await expect(page.locator('text=Import Questions')).toBeVisible();
        console.log('✅ Question Bank Import page verified');
    });

    test('Demo 2: Exam Center — Hierarchy Manager', async ({ page }) => {
        // ── Navigate to Exam Center ──
        await page.click('text=Exam Center');
        await page.waitForTimeout(2000);

        // Verify we're on the Exam Center
        await expect(page).toHaveURL(/exam-center/);
        await page.screenshot({ path: 'e2e/screenshots/demo-exam-center-hierarchy.png', fullPage: true });

        // ── Verify the Hierarchy Manager loaded ──
        await expect(page.locator('text=Question Hierarchy')).toBeVisible();
        console.log('✅ Exam Center → Hierarchy Manager loaded');

        // ── Check for Add Group button ──
        const addGroupBtn = page.getByRole('button', { name: /Add Group/i });
        await expect(addGroupBtn).toBeVisible();
        console.log('✅ "Add Group" button visible');

        // ── Click Add Group and fill the form ──
        await addGroupBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'e2e/screenshots/demo-add-group-form.png', fullPage: true });

        // Try to fill in group name (EN)
        const enInput = page.locator('input[placeholder*="English"]').first();
        if (await enInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            await enInput.fill('Physics');
            await page.waitForTimeout(500);

            // Try to fill BN name
            const bnInput = page.locator('input[placeholder*="Bangla"], input[placeholder*="বাংলা"]').first();
            if (await bnInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await bnInput.fill('পদার্থবিদ্যা');
            }

            await page.screenshot({ path: 'e2e/screenshots/demo-group-filled.png', fullPage: true });

            // Submit the group
            const saveBtn = page.getByRole('button', { name: /Save|Create|Submit/i }).first();
            if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
                await saveBtn.click();
                await page.waitForTimeout(2000);
                await page.screenshot({ path: 'e2e/screenshots/demo-group-created.png', fullPage: true });
                console.log('✅ Group "Physics" creation attempted');
            }
        } else {
            // Might be an inline form
            console.log('ℹ️ Group form uses inline editing — checking for text inputs');
            const anyInput = page.locator('input[type="text"]').first();
            if (await anyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
                await anyInput.fill('Physics');
                await page.screenshot({ path: 'e2e/screenshots/demo-group-inline.png', fullPage: true });
            }
        }
    });

    test('Demo 3: Exam Center — All Sub-modules Accessible', async ({ page }) => {
        // ── Check sidebar sub-items under Exam Center ──
        const examCenterItem = page.locator('text=Exam Center').first();
        await examCenterItem.click();
        await page.waitForTimeout(1500);

        // Verify the URL changed to exam-center
        await expect(page).toHaveURL(/exam-center/);
        await page.screenshot({ path: 'e2e/screenshots/demo-exam-center-main.png', fullPage: true });

        // ── Test navigation to each Exam Center sub-route ──
        const subRoutes = [
            { path: '/__cw_admin__/exam-center/hierarchy', label: 'Question Hierarchy' },
            { path: '/__cw_admin__/exam-center/question-bank', label: 'Question Bank V2' },
            { path: '/__cw_admin__/exam-center/exam-builder', label: 'Exam Builder' },
            { path: '/__cw_admin__/exam-center/grading', label: 'Written Grading' },
            { path: '/__cw_admin__/exam-center/anti-cheat', label: 'Anti-Cheat Report' },
            { path: '/__cw_admin__/exam-center/notifications', label: 'Exam Notifications' },
        ];

        for (const route of subRoutes) {
            await page.goto(`${BASE}${route.path}`);
            await page.waitForTimeout(2000);

            // Check page didn't redirect to login or show 404
            const currentUrl = page.url();
            const isAccessible = !currentUrl.includes('/login') && !currentUrl.includes('/404');

            await page.screenshot({
                path: `e2e/screenshots/demo-ec-${route.label.toLowerCase().replace(/\s+/g, '-')}.png`,
                fullPage: true,
            });

            if (isAccessible) {
                console.log(`✅ ${route.label} — accessible at ${route.path}`);
            } else {
                console.log(`❌ ${route.label} — redirected to ${currentUrl}`);
            }
        }
    });

    test('Demo 4: Question Bank V2 — Full Module Check', async ({ page }) => {
        // Navigate directly to Question Bank V2 (under Exam Center)
        await page.goto(`${BASE}/__cw_admin__/exam-center/question-bank`);
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'e2e/screenshots/demo-qbank-v2.png', fullPage: true });

        // Check for tabs: All Questions, Add New, Import, Sets, Analytics, Archive
        const tabs = ['All Questions', 'Add New', 'Import', 'Sets', 'Analytics', 'Archive'];
        for (const tab of tabs) {
            const tabEl = page.locator(`text=${tab}`).first();
            const visible = await tabEl.isVisible({ timeout: 2000 }).catch(() => false);
            console.log(`${visible ? '✅' : '⚠️'} Tab "${tab}" ${visible ? 'visible' : 'not found'}`);
        }

        // Navigate to Import tab
        const importTab = page.locator('text=Import').first();
        if (await importTab.isVisible()) {
            await importTab.click();
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'e2e/screenshots/demo-qbank-v2-import.png', fullPage: true });
            console.log('✅ Question Bank V2 Import tab loaded');
        }
    });
});
