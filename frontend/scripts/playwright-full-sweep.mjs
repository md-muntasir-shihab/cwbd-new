import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { chromium } from '@playwright/test';

const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const BACKEND_PORT = 5063;
const FRONTEND_PORT = 5263;
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const DB_NAME = `campusway_playwright_mcp_${RUN_ID}`;
const MONGODB_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`;

const OUT = path.resolve(process.cwd(), '../qa-artifacts/playwright-mcp', RUN_ID);
const OUT_S = path.join(OUT, 'screenshots');
const OUT_N = path.join(OUT, 'network');
const OUT_C = path.join(OUT, 'console');

const ADMIN_EMAIL = process.env.E2E_ADMIN_DESKTOP_EMAIL || 'e2e_admin_desktop@campusway.local';
const ADMIN_PASS = process.env.E2E_ADMIN_DESKTOP_PASSWORD || 'E2E_Admin#12345';
const STUDENT_EMAIL = process.env.E2E_STUDENT_DESKTOP_EMAIL || 'e2e_student_desktop@campusway.local';
const STUDENT_PASS = process.env.E2E_STUDENT_DESKTOP_PASSWORD || 'E2E_Student#12345';

const checks = [];
const warnings = [];
let idx = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'check';
const ensure = async (p) => fs.mkdir(p, { recursive: true });

function getSpawnSpec(cmd, args = []) {
    if (IS_WIN && /\.(cmd|bat)$/i.test(String(cmd || ''))) {
        return {
            cmd: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return { cmd, args };
}

async function free(port) {
    return new Promise((resolve) => {
        const s = net.createServer();
        s.once('error', () => resolve(false));
        s.once('listening', () => s.close(() => resolve(true)));
        s.listen(port, '127.0.0.1');
    });
}

function spawnCmd(cmd, args, opts = {}) {
    const spec = getSpawnSpec(cmd, args);
    return spawn(spec.cmd, spec.args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

async function run(cmd, args, opts = {}) {
    return new Promise((resolve) => {
        const out = [];
        const p = spawnCmd(cmd, args, opts);
        p.stdout?.on('data', (c) => out.push(c));
        p.stderr?.on('data', (c) => out.push(c));
        p.on('close', (code) => resolve({ code: code ?? 1, out: Buffer.concat(out).toString('utf-8') }));
        p.on('error', (e) => resolve({ code: 1, out: String(e?.message || e) }));
    });
}

async function kill(p) {
    if (!p || !p.pid || p.killed) return;
    if (IS_WIN) {
        await run('taskkill', ['/pid', String(p.pid), '/T', '/F']);
        return;
    }
    p.kill('SIGTERM');
    await Promise.race([new Promise((r) => p.once('close', r)), sleep(5000)]);
}

async function waitUrl(url, ms = 120000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        try {
            const r = await fetch(url);
            if (r.ok) return true;
        } catch {
            // retry
        }
        await sleep(1000);
    }
    return false;
}

function monitor(page) {
    const m = { pe: [], api5: [], ce: [], net: [] };
    page.on('pageerror', (e) => m.pe.push(String(e?.message || e)));
    page.on('console', (msg) => { if (msg.type() === 'error') m.ce.push(msg.text()); });
    page.on('response', (r) => {
        const n = { ts: new Date().toISOString(), status: r.status(), method: r.request().method(), url: r.url() };
        m.net.push(n);
        if (n.url.includes('/api/') && n.status >= 500) m.api5.push(`${n.status} ${n.method} ${n.url}`);
    });
    return m;
}

const snap = (m) => ({ pe: m.pe.length, api5: m.api5.length, ce: m.ce.length, net: m.net.length });
const diff = (m, b) => ({ pe: m.pe.slice(b.pe), api5: m.api5.slice(b.api5), ce: m.ce.slice(b.ce), net: m.net.slice(b.net) });

async function stable(page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
}

async function visual(page) {
    try {
        return await page.evaluate(() => {
            const doc = document.documentElement;
            return {
                darkMismatch: !doc.classList.contains('dark') || localStorage.getItem('campusway-dark-mode') !== 'true',
                overflow: doc.scrollWidth - doc.clientWidth > 1,
                blank: (document.body?.innerText || '').trim().length < 35,
            };
        });
    } catch {
        return { darkMismatch: true, overflow: false, blank: true };
    }
}

function sev(issues, err) {
    if (err || issues.pageErrors.length || issues.api5xx.length || issues.blankScreen) return 'critical';
    if (issues.consoleErrors.length || issues.darkModeMismatch || issues.horizontalOverflow) return 'major';
    return 'minor';
}

function hasIssue(issues, err) {
    return Boolean(
        err || issues.pageErrors.length || issues.api5xx.length || issues.consoleErrors.length ||
        issues.darkModeMismatch || issues.horizontalOverflow || issues.blankScreen
    );
}

async function rec({ phase, viewport, route, action, page, mon, dir, fn }) {
    const id = `check-${String(++idx).padStart(3, '0')}`;
    const b = snap(mon);
    let err = null;
    try { await fn(); await stable(page); } catch (e) { err = String(e?.message || e); }
    const d = diff(mon, b);
    const v = await visual(page);
    const issues = {
        pageErrors: d.pe, api5xx: d.api5, consoleErrors: d.ce,
        darkModeMismatch: v.darkMismatch, horizontalOverflow: v.overflow, blankScreen: v.blank,
    };
    const name = `${id}-${slug(phase)}-${slug(viewport)}-${slug(action)}.png`;
    const abs = path.join(dir, name);
    const rel = path.relative(OUT, abs).replace(/\\/g, '/');
    await page.screenshot({ path: abs, fullPage: true }).catch(() => {});
    checks.push({
        id,
        phase,
        viewport,
        route,
        action,
        status: hasIssue(issues, err) ? 'fail' : 'pass',
        severity: sev(issues, err),
        issues,
        screenshot: rel,
        error: err,
    });
}

async function loginStudent(page) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input#identifier, input[name="identifier"], input[type="text"], input[type="email"]').first().fill(STUDENT_EMAIL);
    await page.locator('input#password, input[name="password"], input[type="password"]').first().fill(STUDENT_PASS);
    await page.getByRole('button', { name: /(Sign in|Access Dashboard)/i }).first().click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
}

async function loginAdmin(page) {
    await page.goto(`${BASE_URL}/__cw_admin__/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input#identifier, input[name="identifier"], input[type="text"], input[type="email"]').first().fill(ADMIN_EMAIL);
    await page.locator('input#password, input[name="password"], input[type="password"]').first().fill(ADMIN_PASS);
    await page.getByRole('button', { name: /Sign In/i }).first().click();
    await page.waitForURL(/\/__cw_admin__\/dashboard/, { timeout: 20000 });
}

async function runPublic(page, mon) {
    const dir = path.join(OUT_S, 'public'); await ensure(dir);
    await rec({ phase: 'public', viewport: 'desktop', route: '/', action: 'open-home', page, mon, dir, fn: async () => page.goto(`${BASE_URL}/`) });
    const nav = [['Universities', '/universities'], ['Exams', '/exam-portal'], ['News', '/news'], ['Resources', '/resources'], ['Contact', '/contact'], ['Plans', '/subscription-plans'], ['Login', '/login']];
    for (const [label, route] of nav) {
        await rec({
            phase: 'public', viewport: 'desktop', route, action: `navbar-${slug(label)}`, page, mon, dir,
            fn: async () => {
                await page.goto(`${BASE_URL}/`);
                const l = page.getByRole('link', { name: new RegExp(`^${label}$`, 'i') });
                if (await l.count()) await l.first().click(); else await page.goto(`${BASE_URL}${route}`);
            },
        });
    }
    const details = [
        ['/universities', 'main a[href*="/university/"], main a[href*="/universities/"]:not([href="/universities"])', 'university-detail'],
        ['/services', 'main a[href^="/services/"]:not([href="/services"])', 'service-detail'],
        ['/news', 'main a[href^="/news/"]:not([href="/news"])', 'news-detail'],
    ];
    for (const [route, sel, action] of details) {
        await rec({
            phase: 'public', viewport: 'desktop', route, action, page, mon, dir,
            fn: async () => { await page.goto(`${BASE_URL}${route}`); const l = page.locator(sel).first(); if (!(await l.count())) throw new Error(`No link for ${route}`); await l.click(); },
        });
    }
    for (const route of ['/resources', '/contact', '/subscription-plans', '/about', '/terms', '/privacy']) {
        await rec({ phase: 'public', viewport: 'desktop', route, action: `open-${slug(route)}`, page, mon, dir, fn: async () => page.goto(`${BASE_URL}${route}`) });
    }
}

async function runStudent(page, mon) {
    const dir = path.join(OUT_S, 'student'); await ensure(dir);
    await loginStudent(page);
    for (const route of ['/dashboard', '/exams', '/results', '/payments', '/notifications', '/profile', '/student/resources', '/support']) {
        await rec({ phase: 'student', viewport: 'desktop', route, action: `open-${slug(route)}`, page, mon, dir, fn: async () => page.goto(`${BASE_URL}${route}`) });
    }
    await rec({ phase: 'student', viewport: 'desktop', route: '/exams/:id', action: 'exam-detail', page, mon, dir, fn: async () => { await page.goto(`${BASE_URL}/exams`); const l = page.locator('main a[href^="/exams/"]:not([href="/exams"])').first(); if (!(await l.count())) throw new Error('No exam detail'); await l.click(); } });
    await rec({ phase: 'student', viewport: 'desktop', route: '/results/:id', action: 'result-detail', page, mon, dir, fn: async () => { await page.goto(`${BASE_URL}/results`); const l = page.locator('main a[href^="/results/"]:not([href="/results"])').first(); if (!(await l.count())) throw new Error('No result detail'); await l.click(); } });
}

async function runAdmin(page, mon) {
    const dir = path.join(OUT_S, 'admin'); await ensure(dir);
    await loginAdmin(page);
    page.on('dialog', async (d) => { try { await d.accept(); } catch { /* ignore */ } });
    for (const tab of ['dashboard', 'universities', 'exams', 'question-bank', 'student-management', 'subscription-plans', 'finance', 'resources', 'support-tickets', 'security', 'logs']) {
        await rec({ phase: 'admin', viewport: 'desktop', route: `/__cw_admin__/dashboard?tab=${tab}`, action: `tab-${tab}`, page, mon, dir, fn: async () => page.goto(`${BASE_URL}/__cw_admin__/dashboard?tab=${tab}`) });
    }
    for (const route of ['/__cw_admin__/settings', '/__cw_admin__/settings/home', '/__cw_admin__/settings/reports', '/__cw_admin__/settings/banners', '/__cw_admin__/settings/security', '/__cw_admin__/settings/logs', '/__cw_admin__/settings/site', '/__cw_admin__/settings/profile']) {
        await rec({ phase: 'admin', viewport: 'desktop', route, action: `open-${slug(route)}`, page, mon, dir, fn: async () => page.goto(`${BASE_URL}${route}`) });
    }

    const tag = `MCP-QA-${RUN_ID}`;
    await rec({
        phase: 'admin', viewport: 'desktop', route: '/__cw_admin__/dashboard?tab=universities', action: 'crud-university', page, mon, dir,
        fn: async () => {
            const name = `${tag}-UNI`; const edit = `${name}-EDIT`;
            await page.goto(`${BASE_URL}/__cw_admin__/dashboard?tab=universities`);
            await page.getByRole('button', { name: /Add University/i }).click();
            const m = page.locator('div.fixed.inset-0').last();
            await m.locator('input').nth(0).fill(name); await m.locator('input').nth(1).fill(`MQ${RUN_ID.slice(-4)}`);
            await m.getByRole('button', { name: /Create Permanently|Create/i }).first().click();
            await page.waitForTimeout(1200);
            const row = page.locator('tr,div,article').filter({ hasText: name }).first(); await row.getByRole('button', { name: /Edit/i }).first().click();
            const em = page.locator('div.fixed.inset-0').last(); await em.locator('input').nth(0).fill(edit); await em.getByRole('button', { name: /Update Profile|Save/i }).first().click();
            await page.waitForTimeout(1200);
            await page.locator('tr,div,article').filter({ hasText: edit }).first().getByRole('button', { name: /Delete/i }).first().click();
        },
    });

    await rec({
        phase: 'admin', viewport: 'desktop', route: '/__cw_admin__/dashboard?tab=resources', action: 'crud-resource', page, mon, dir,
        fn: async () => {
            const name = `${tag}-RESOURCE`; const edit = `${name}-EDIT`;
            await page.goto(`${BASE_URL}/__cw_admin__/dashboard?tab=resources`);
            await page.getByRole('button', { name: /^Add$/i }).click();
            await page.locator('input').first().fill(name);
            const sel = page.locator('select').nth(1); if (await sel.count()) await sel.selectOption({ index: 1 }).catch(() => {});
            await page.getByRole('button', { name: /Save Resource/i }).click();
            await page.waitForTimeout(1000);
            await page.locator('tr').filter({ hasText: name }).first().locator('button[title="Edit"]').click();
            await page.locator('input').first().fill(edit);
            await page.getByRole('button', { name: /Save Resource/i }).click();
            await page.waitForTimeout(1000);
            await page.locator('tr').filter({ hasText: edit }).first().locator('button[title="Delete"]').click();
        },
    });

    await rec({
        phase: 'admin', viewport: 'desktop', route: '/__cw_admin__/dashboard?tab=exams', action: 'crud-exam', page, mon, dir,
        fn: async () => {
            const name = `${tag}-EXAM`; const edit = `${name}-EDIT`;
            await page.goto(`${BASE_URL}/__cw_admin__/dashboard?tab=exams`);
            await page.getByRole('button', { name: /Create Exam/i }).first().click();
            const m = page.locator('div.fixed.inset-0').last();
            await m.locator('input').first().fill(name); await m.locator('input').nth(1).fill('General Studies');
            await m.getByRole('button', { name: /Next Step/i }).click(); await m.getByRole('button', { name: /Next Step/i }).click(); await m.getByRole('button', { name: /Next Step/i }).click();
            await m.getByRole('button', { name: /Create Exam/i }).click();
            await page.waitForTimeout(1500);
            await page.locator('article,div').filter({ hasText: name }).first().getByRole('button', { name: /Edit/i }).first().click();
            const em = page.locator('div.fixed.inset-0').last();
            await em.locator('input').first().fill(edit);
            await em.getByRole('button', { name: /Next Step/i }).click(); await em.getByRole('button', { name: /Next Step/i }).click(); await em.getByRole('button', { name: /Next Step/i }).click();
            await em.getByRole('button', { name: /Save Exam/i }).click();
            await page.waitForTimeout(1500);
            await page.locator('article,div').filter({ hasText: edit }).first().getByRole('button', { name: /Delete/i }).first().click();
            await page.getByRole('button', { name: /^Delete$/i }).first().click();
        },
    });

    await rec({
        phase: 'admin', viewport: 'desktop', route: '/__cw_admin__/dashboard?tab=question-bank', action: 'crud-question-bank', page, mon, dir,
        fn: async () => {
            const q = `${tag} question`;
            await page.goto(`${BASE_URL}/__cw_admin__/dashboard?tab=question-bank`);
            const b = page.locator('button').filter({ hasText: 'নতুন প্রশ্ন' }).first();
            if (!(await b.count())) throw new Error('New question button not found');
            await b.click(); await page.waitForTimeout(400);
            await page.locator('textarea').first().fill(q);
            await page.locator('input[placeholder="Option A (EN)"]').fill('Option A');
            await page.locator('input[placeholder="Option B (EN)"]').fill('Option B');
            await page.locator('input[placeholder="Option C (EN)"]').fill('Option C');
            await page.locator('input[placeholder="Option D (EN)"]').fill('Option D');
            await page.locator('label:has-text("বিষয়") + input').first().fill('General');
            await page.getByRole('button', { name: /সংরক্ষণ করুন/i }).first().click();
            await page.waitForTimeout(1200);
            await page.locator('article,tr').filter({ hasText: q }).first().getByRole('button', { name: /আর্কাইভ/i }).first().click();
        },
    });
}

async function runMobile(ctx) {
    const page = await ctx.newPage(); const mon = monitor(page); const dir = path.join(OUT_S, 'mobile'); await ensure(dir);
    await rec({ phase: 'public', viewport: 'mobile', route: '/', action: 'home-menu', page, mon, dir, fn: async () => { await page.goto(`${BASE_URL}/`); const t = page.getByRole('button', { name: /Toggle menu/i }); if (await t.count()) await t.first().click(); } });
    await rec({ phase: 'public', viewport: 'mobile', route: '/news', action: 'news', page, mon, dir, fn: async () => page.goto(`${BASE_URL}/news`) });
    await rec({ phase: 'public', viewport: 'mobile', route: '/exam-portal', action: 'exam-portal', page, mon, dir, fn: async () => page.goto(`${BASE_URL}/exam-portal`) });
    await loginStudent(page);
    await rec({ phase: 'student', viewport: 'mobile', route: '/dashboard', action: 'student-dashboard', page, mon, dir, fn: async () => page.goto(`${BASE_URL}/dashboard`) });
    await loginAdmin(page);
    await rec({ phase: 'admin', viewport: 'mobile', route: '/__cw_admin__/dashboard', action: 'admin-menu', page, mon, dir, fn: async () => { await page.goto(`${BASE_URL}/__cw_admin__/dashboard`); const b = page.getByRole('button', { name: /Open admin menu|Toggle menu/i }); if (await b.count()) await b.first().click(); } });
    await fs.writeFile(path.join(OUT_N, 'mobile-network.json'), JSON.stringify(mon.net, null, 2), 'utf-8');
    await fs.writeFile(path.join(OUT_C, 'mobile-console-errors.log'), mon.ce.join('\n'), 'utf-8');
    await page.close();
}

function summary() {
    return {
        total: checks.length,
        passed: checks.filter((c) => c.status === 'pass').length,
        failed: checks.filter((c) => c.status === 'fail').length,
        critical: checks.filter((c) => c.severity === 'critical').length,
        major: checks.filter((c) => c.severity === 'major').length,
        minor: checks.filter((c) => c.severity === 'minor').length,
    };
}

async function write(startedAt, endedAt) {
    const s = summary();
    await fs.writeFile(path.join(OUT, 'results.json'), JSON.stringify({ runId: RUN_ID, baseUrl: BASE_URL, startedAt, endedAt, summary: s, checks, warnings }, null, 2), 'utf-8');
    const md = [
        `# Playwright MCP Full Sweep (${RUN_ID})`, '',
        `- Base URL: ${BASE_URL}`, `- Backend Port: ${BACKEND_PORT}`, `- Frontend Port: ${FRONTEND_PORT}`, `- Mongo DB: ${DB_NAME}`,
        `- Started: ${startedAt}`, `- Ended: ${endedAt}`, '',
        '## Summary', '', `- Total: ${s.total}`, `- Passed: ${s.passed}`, `- Failed: ${s.failed}`, `- Critical: ${s.critical}`, `- Major: ${s.major}`, `- Minor: ${s.minor}`, '',
        '## Pass/Fail Table', '', '| ID | Phase | Viewport | Route | Action | Status | Severity | Screenshot |', '|---|---|---|---|---|---|---|---|',
        ...checks.map((c) => `| ${c.id} | ${c.phase} | ${c.viewport} | \`${c.route}\` | ${c.action} | ${c.status.toUpperCase()} | ${c.severity} | [${c.screenshot}](${c.screenshot}) |`),
        '', '## Visually Suspicious', '',
        ...(checks.filter((c) => c.issues.darkModeMismatch || c.issues.horizontalOverflow || c.issues.blankScreen).map((c) => `- ${c.id} ${c.route} dark=${c.issues.darkModeMismatch} overflow=${c.issues.horizontalOverflow} blank=${c.issues.blankScreen}`) || ['- None']),
        '', '## Warnings', '', ...(warnings.length ? warnings.map((w) => `- ${w}`) : ['- None']), '',
    ].join('\n');
    await fs.writeFile(path.join(OUT, 'results.md'), md, 'utf-8');
}

async function main() {
    const startedAt = new Date().toISOString();
    let be = null; let fe = null; const beLog = []; const feLog = [];
    try {
        await ensure(OUT); await ensure(OUT_S); await ensure(OUT_N); await ensure(OUT_C);
        if (!(await free(BACKEND_PORT))) throw new Error(`Port ${BACKEND_PORT} is in use`);
        if (!(await free(FRONTEND_PORT))) throw new Error(`Port ${FRONTEND_PORT} is in use`);

        be = spawnCmd(NPM, ['run', 'dev'], { cwd: path.resolve(process.cwd(), '../backend'), env: { ...process.env, PORT: String(BACKEND_PORT), MONGODB_URI, MONGO_URI: MONGODB_URI, CORS_ORIGIN: BASE_URL, FRONTEND_URL: BASE_URL } });
        be.stdout?.on('data', (c) => beLog.push(c)); be.stderr?.on('data', (c) => beLog.push(c));
        if (!(await waitUrl(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 140000))) throw new Error('Backend readiness failed');

        fe = spawnCmd(NPM, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT)], { cwd: process.cwd(), env: { ...process.env, VITE_PORT: String(FRONTEND_PORT), VITE_API_PROXY_TARGET: `http://127.0.0.1:${BACKEND_PORT}` } });
        fe.stdout?.on('data', (c) => feLog.push(c)); fe.stderr?.on('data', (c) => feLog.push(c));
        if (!(await waitUrl(BASE_URL, 140000))) throw new Error('Frontend readiness failed');

        const prep = await run(
            NPM,
            ['--prefix', '../backend', 'run', 'e2e:prepare'],
            { cwd: process.cwd(), env: { ...process.env, E2E_BASE_URL: BASE_URL, MONGODB_URI, MONGO_URI: MONGODB_URI } }
        );
        if (prep.code !== 0) {
            warnings.push('e2e:prepare failed, using seed:default-users fallback');
            warnings.push(prep.out);
            const fallback = await run(
                NPM,
                ['--prefix', '../backend', 'run', 'seed:default-users'],
                {
                    cwd: process.cwd(),
                    env: {
                        ...process.env,
                        MONGODB_URI,
                        MONGO_URI: MONGODB_URI,
                        DEFAULT_ADMIN_USERNAME: `mcp_admin_${RUN_ID}`,
                        DEFAULT_ADMIN_EMAIL: ADMIN_EMAIL,
                        DEFAULT_ADMIN_FULL_NAME: 'MCP Admin',
                        DEFAULT_ADMIN_PASSWORD: ADMIN_PASS,
                        DEFAULT_STUDENT_USERNAME: `mcp_student_${RUN_ID}`,
                        DEFAULT_STUDENT_EMAIL: STUDENT_EMAIL,
                        DEFAULT_STUDENT_FULL_NAME: 'MCP Student',
                        DEFAULT_STUDENT_PASSWORD: STUDENT_PASS,
                    },
                }
            );
            if (fallback.code !== 0) throw new Error(`Fallback seed failed\n${fallback.out}`);
        }

        const browser = await chromium.launch({ headless: true });
        const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const mobile = await browser.newContext({ viewport: { width: 393, height: 852 } });

        const p1 = await desktop.newPage(); const m1 = monitor(p1); await runPublic(p1, m1); await fs.writeFile(path.join(OUT_N, 'public-network.json'), JSON.stringify(m1.net, null, 2), 'utf-8'); await fs.writeFile(path.join(OUT_C, 'public-console-errors.log'), m1.ce.join('\n'), 'utf-8'); await p1.close();
        const p2 = await desktop.newPage(); const m2 = monitor(p2); await runStudent(p2, m2); await fs.writeFile(path.join(OUT_N, 'student-network.json'), JSON.stringify(m2.net, null, 2), 'utf-8'); await fs.writeFile(path.join(OUT_C, 'student-console-errors.log'), m2.ce.join('\n'), 'utf-8'); await p2.close();
        const p3 = await desktop.newPage(); const m3 = monitor(p3); await runAdmin(p3, m3); await fs.writeFile(path.join(OUT_N, 'admin-network.json'), JSON.stringify(m3.net, null, 2), 'utf-8'); await fs.writeFile(path.join(OUT_C, 'admin-console-errors.log'), m3.ce.join('\n'), 'utf-8'); await p3.close();
        await runMobile(mobile);

        await desktop.close(); await mobile.close(); await browser.close();
    } catch (e) {
        warnings.push(`Runner error: ${String(e?.message || e)}`);
    } finally {
        const restore = await run(NPM, ['--prefix', '../backend', 'run', 'e2e:restore'], { cwd: process.cwd(), env: { ...process.env, MONGODB_URI, MONGO_URI: MONGODB_URI } });
        if (restore.code !== 0) warnings.push('e2e:restore failed');
        await kill(fe); await kill(be);
        const drop = await run('mongosh', [MONGODB_URI, '--quiet', '--eval', 'db.dropDatabase()']);
        if (drop.code !== 0) warnings.push('Database drop skipped (mongosh unavailable or failed)');
        await fs.writeFile(path.join(OUT, 'backend.log'), Buffer.concat(beLog).toString('utf-8'), 'utf-8');
        await fs.writeFile(path.join(OUT, 'frontend.log'), Buffer.concat(feLog).toString('utf-8'), 'utf-8');
    }
    const endedAt = new Date().toISOString(); await write(startedAt, endedAt);
    const s = summary(); const critical = s.critical > 0 || warnings.some((w) => w.startsWith('Runner error:'));
    process.stdout.write(JSON.stringify({ runId: RUN_ID, outputDir: OUT, summary: s, warnings }, null, 2));
    process.exitCode = critical ? 1 : 0;
}

main().catch((e) => { process.stderr.write(`[playwright-full-sweep] fatal: ${String(e?.message || e)}\n`); process.exitCode = 1; });
