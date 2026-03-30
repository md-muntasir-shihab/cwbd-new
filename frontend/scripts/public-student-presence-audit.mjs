import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { chromium } from '@playwright/test';

const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const BACKEND_PORT = 5074;
const FRONTEND_PORT = 5274;
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const DB_NAME = `campusway_public_student_audit_${RUN_ID}`;
const MONGODB_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`;

const ADMIN_EMAIL = process.env.E2E_ADMIN_DESKTOP_EMAIL || 'e2e_admin_desktop@campusway.local';
const ADMIN_PASS = process.env.E2E_ADMIN_DESKTOP_PASSWORD || 'E2E_Admin#12345';
const STUDENT_EMAIL = process.env.E2E_STUDENT_DESKTOP_EMAIL || 'e2e_student_desktop@campusway.local';
const STUDENT_PASS = process.env.E2E_STUDENT_DESKTOP_PASSWORD || 'E2E_Student#12345';

const OUT = path.resolve(process.cwd(), '../qa-artifacts/public-student-presence-audit', RUN_ID);
const SHOTS = path.join(OUT, 'screenshots');
const warnings = [];
const findings = [];

function getSpawnSpec(cmd, args = []) {
    if (IS_WIN && /\.(cmd|bat)$/i.test(String(cmd || ''))) {
        return {
            cmd: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return { cmd, args };
}

const routePlan = [
    {
        kind: 'public',
        route: '/',
        label: 'Home',
        checks: [
            { label: 'Featured university links', selector: 'main a[href*="/university/"], main a[href*="/universities/"]:not([href="/universities"])', min: 1 },
            { label: 'News detail links', selector: 'main a[href^="/news/"]:not([href="/news"])', min: 1 },
            { label: 'Resource links/entry point', selector: 'main a[href^="/resources"]', min: 1 },
        ],
    },
    {
        kind: 'public',
        route: '/universities',
        label: 'Universities',
        checks: [
            { label: 'University detail links', selector: 'main a[href*="/university/"], main a[href*="/universities/"]:not([href="/universities"])', min: 1 },
        ],
    },
    {
        kind: 'public',
        route: '/exam-portal',
        label: 'Exam Portal',
        checks: [
            { label: 'Exam listing actions', selector: 'main a[href^="/exam/"], main a[href^="/exams/"], main button', min: 1 },
        ],
    },
    {
        kind: 'public',
        route: '/news',
        label: 'News',
        checks: [
            { label: 'News cards/links', selector: 'main a[href^="/news/"]:not([href="/news"])', min: 1 },
        ],
    },
    {
        kind: 'public',
        route: '/resources',
        label: 'Resources',
        checks: [
            { label: 'Resource rows/cards', selector: 'main article, main [class*="resource"], main a[href*="/resources/"]:not([href="/resources"])', min: 1 },
        ],
    },
    { kind: 'public', route: '/contact', label: 'Contact', checks: [{ label: 'Contact form fields', selector: 'form input, form textarea', min: 2 }] },
    {
        kind: 'public',
        route: '/subscription-plans',
        label: 'Subscription Plans',
        checks: [
            { label: 'Plan cards/links', selector: 'main article, main [class*="plan"], main a[href^="/subscription-plans/"]:not([href="/subscription-plans"])', min: 1 },
        ],
    },
    { kind: 'public', route: '/about', label: 'About', checks: [] },
    { kind: 'public', route: '/terms', label: 'Terms', checks: [] },
    { kind: 'public', route: '/privacy', label: 'Privacy', checks: [] },
    { kind: 'public', route: '/login', label: 'Login', checks: [{ label: 'Login fields', selector: 'input[type="email"], input[type="text"], input[type="password"]', min: 2 }] },
    { kind: 'student', route: '/dashboard', label: 'Student Dashboard', checks: [] },
    {
        kind: 'student',
        route: '/exams',
        label: 'Student Exams',
        checks: [
            { label: 'Exam detail links', selector: 'main a[href^="/exam/"], main a[href^="/exams/"]:not([href="/exams"])', min: 1 },
        ],
    },
    {
        kind: 'student',
        route: '/results',
        label: 'Student Results',
        checks: [
            { label: 'Result detail links/rows', selector: 'main a[href^="/results/"]:not([href="/results"]), main button, main .rounded-xl.border', min: 1 },
        ],
    },
    { kind: 'student', route: '/payments', label: 'Student Payments', checks: [] },
    { kind: 'student', route: '/notifications', label: 'Student Notifications', checks: [] },
    { kind: 'student', route: '/profile', label: 'Student Profile', checks: [{ label: 'Profile form fields', selector: 'main input, main select, main textarea', min: 1 }] },
    { kind: 'student', route: '/student/resources', label: 'Student Resources', checks: [{ label: 'Resource cards/rows', selector: 'main article, main [class*="resource"], main a[href*="/resources/"]', min: 1 }] },
    {
        kind: 'student',
        route: '/support',
        label: 'Student Support',
        checks: [
            { label: 'Support form', selector: 'main form input, main form textarea, main form button[type="submit"]', min: 2 },
            { label: 'Notice/ticket cards', selector: 'main .rounded-lg.border, main .rounded-xl.border', min: 2 },
        ],
    },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slug(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'page';
}

async function ensure(dir) {
    await fs.mkdir(dir, { recursive: true });
}

async function free(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, '127.0.0.1');
    });
}

function spawnCmd(cmd, args, opts = {}) {
    const spec = getSpawnSpec(cmd, args);
    return spawn(spec.cmd, spec.args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

async function run(cmd, args, opts = {}) {
    return new Promise((resolve) => {
        const out = [];
        const child = spawnCmd(cmd, args, opts);
        child.stdout?.on('data', (chunk) => out.push(chunk));
        child.stderr?.on('data', (chunk) => out.push(chunk));
        child.on('close', (code) => resolve({ code: code ?? 1, out: Buffer.concat(out).toString('utf-8') }));
        child.on('error', (err) => resolve({ code: 1, out: String(err?.message || err) }));
    });
}

async function waitUrl(url, timeoutMs = 120000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        try {
            const response = await fetch(url);
            if (response.ok) return true;
        } catch {
            // retry
        }
        await sleep(1000);
    }
    return false;
}

async function kill(child) {
    if (!child || !child.pid || child.killed) return;
    if (IS_WIN) {
        await run('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        return;
    }
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('close', resolve)), sleep(5000)]);
}

async function stable(page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForTimeout(600);
}

async function loginStudent(page) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input#identifier, input[name="identifier"], input[type="text"], input[type="email"]').first().fill(STUDENT_EMAIL);
    await page.locator('input#password, input[name="password"], input[type="password"]').first().fill(STUDENT_PASS);
    await page.getByRole('button', { name: /(Sign in|Access Dashboard)/i }).first().click();
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    await stable(page);
}

async function evaluatePage(page, checks = []) {
    return page.evaluate((browserChecks) => {
        const lines = (document.body?.innerText || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const ignoredEmptySignals = [
            /^no image$/i,
            /^no due$/i,
            /^no plan message$/i,
        ];
        const emptySignals = [...new Set(lines.filter((line) => {
            const normalized = line.toLowerCase();
            if (ignoredEmptySignals.some((pattern) => pattern.test(normalized))) return false;
            return (
                normalized.startsWith('no ') ||
                normalized.includes(' not found') ||
                normalized.includes('not available') ||
                normalized.includes('no ') && normalized.includes(' available') ||
                normalized.includes('no ') && normalized.includes(' found')
            );
        }))].slice(0, 12);
        const checkResults = browserChecks.map((check) => {
            const count = document.querySelectorAll(check.selector).length;
            return { ...check, count, ok: count >= check.min };
        });
        return {
            currentUrl: location.pathname + location.search,
            heading: (
                document.querySelector('main h1, h1, main h2, h2')?.textContent ||
                ''
            ).trim(),
            emptySignals,
            checkResults,
            counts: {
                forms: document.querySelectorAll('form').length,
                tables: document.querySelectorAll('table').length,
                tableRows: document.querySelectorAll('table tbody tr').length,
                buttons: document.querySelectorAll('button').length,
                links: document.querySelectorAll('a').length,
                inputs: document.querySelectorAll('input,select,textarea').length,
            },
        };
    }, checks);
}

async function record(page, item, index) {
    const id = String(index + 1).padStart(2, '0');
    const fileName = `${id}-${item.kind}-${slug(item.label)}.png`;
    const screenshotAbs = path.join(SHOTS, fileName);
    await page.screenshot({ path: screenshotAbs, fullPage: true }).catch(() => {});
    const data = await evaluatePage(page, item.checks || []);
    const missingChecks = (data.checkResults || []).filter((check) => !check.ok);

    let status = 'pass';
    let note = 'OK';
    if (missingChecks.length > 0) {
        status = 'warn';
        note = `Missing expected content: ${missingChecks.map((check) => check.label).join(', ')}`;
    } else if ((data.emptySignals || []).length > 0) {
        status = 'warn';
        note = 'Empty-state text found';
    }

    findings.push({
        id,
        kind: item.kind,
        label: item.label,
        route: item.route,
        status,
        note,
        ...data,
        missingChecks: missingChecks.map((check) => ({ label: check.label, expectedMin: check.min, actual: check.count })),
        screenshot: `screenshots/${fileName}`,
    });
}

async function main() {
    const startedAt = new Date().toISOString();
    let backend = null;
    let frontend = null;
    const backendLog = [];
    const frontendLog = [];
    try {
        await ensure(OUT);
        await ensure(SHOTS);

        if (!(await free(BACKEND_PORT))) throw new Error(`Port ${BACKEND_PORT} is already in use`);
        if (!(await free(FRONTEND_PORT))) throw new Error(`Port ${FRONTEND_PORT} is already in use`);

        backend = spawnCmd(NPM, ['run', 'dev'], {
            cwd: path.resolve(process.cwd(), '../backend'),
            env: {
                ...process.env,
                PORT: String(BACKEND_PORT),
                MONGODB_URI,
                MONGO_URI: MONGODB_URI,
                CORS_ORIGIN: BASE_URL,
                FRONTEND_URL: BASE_URL,
            },
        });
        backend.stdout?.on('data', (chunk) => backendLog.push(chunk));
        backend.stderr?.on('data', (chunk) => backendLog.push(chunk));
        if (!(await waitUrl(`http://127.0.0.1:${BACKEND_PORT}/api/health`, 150000))) {
            throw new Error('Backend readiness failed');
        }

        frontend = spawnCmd(NPM, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(FRONTEND_PORT)], {
            cwd: process.cwd(),
            env: {
                ...process.env,
                VITE_PORT: String(FRONTEND_PORT),
                VITE_API_PROXY_TARGET: `http://127.0.0.1:${BACKEND_PORT}`,
            },
        });
        frontend.stdout?.on('data', (chunk) => frontendLog.push(chunk));
        frontend.stderr?.on('data', (chunk) => frontendLog.push(chunk));
        if (!(await waitUrl(BASE_URL, 150000))) throw new Error('Frontend readiness failed');

        const prep = await run(
            NPM,
            ['--prefix', '../backend', 'run', 'e2e:prepare'],
            { cwd: process.cwd(), env: { ...process.env, MONGODB_URI, MONGO_URI: MONGODB_URI, E2E_BASE_URL: BASE_URL } }
        );
        if (prep.code !== 0) {
            warnings.push('e2e:prepare failed, fallback to seed:default-users');
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
                        DEFAULT_ADMIN_EMAIL: ADMIN_EMAIL,
                        DEFAULT_ADMIN_PASSWORD: ADMIN_PASS,
                        DEFAULT_ADMIN_FULL_NAME: 'E2E Admin Desktop',
                        DEFAULT_ADMIN_USERNAME: `audit_admin_${RUN_ID}`,
                        DEFAULT_STUDENT_EMAIL: STUDENT_EMAIL,
                        DEFAULT_STUDENT_PASSWORD: STUDENT_PASS,
                        DEFAULT_STUDENT_FULL_NAME: 'E2E Student Desktop',
                        DEFAULT_STUDENT_USERNAME: `audit_student_${RUN_ID}`,
                    },
                }
            );
            if (fallback.code !== 0) throw new Error(`Fallback seed failed\n${fallback.out}`);
        }

        const browser = await chromium.launch({ headless: true });
        const publicContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const publicPage = await publicContext.newPage();
        const studentPage = await studentContext.newPage();
        await loginStudent(studentPage);

        for (let index = 0; index < routePlan.length; index += 1) {
            const item = routePlan[index];
            const page = item.kind === 'student' ? studentPage : publicPage;
            try {
                await page.goto(`${BASE_URL}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
                await stable(page);
                await record(page, item, index);
            } catch (error) {
                const id = String(index + 1).padStart(2, '0');
                const fileName = `${id}-${item.kind}-${slug(item.label)}.png`;
                const screenshotAbs = path.join(SHOTS, fileName);
                await page.screenshot({ path: screenshotAbs, fullPage: true }).catch(() => {});
                findings.push({
                    id,
                    kind: item.kind,
                    label: item.label,
                    route: item.route,
                    status: 'fail',
                    note: String(error?.message || error),
                    currentUrl: '',
                    heading: '',
                    emptySignals: [],
                    checkResults: [],
                    missingChecks: [],
                    counts: { forms: 0, tables: 0, tableRows: 0, buttons: 0, links: 0, inputs: 0 },
                    screenshot: `screenshots/${fileName}`,
                });
            }
        }

        await studentPage.close();
        await publicPage.close();
        await studentContext.close();
        await publicContext.close();
        await browser.close();
    } catch (error) {
        warnings.push(`Runner error: ${String(error?.message || error)}`);
    } finally {
        const restore = await run(
            NPM,
            ['--prefix', '../backend', 'run', 'e2e:restore'],
            { cwd: process.cwd(), env: { ...process.env, MONGODB_URI, MONGO_URI: MONGODB_URI } }
        );
        if (restore.code !== 0) warnings.push('e2e:restore failed');

        await kill(frontend);
        await kill(backend);

        const dropped = await run('mongosh', [MONGODB_URI, '--quiet', '--eval', 'db.dropDatabase()']);
        if (dropped.code !== 0) warnings.push('Database drop skipped (mongosh unavailable or failed)');

        await fs.writeFile(path.join(OUT, 'backend.log'), Buffer.concat(backendLog).toString('utf-8'), 'utf-8');
        await fs.writeFile(path.join(OUT, 'frontend.log'), Buffer.concat(frontendLog).toString('utf-8'), 'utf-8');
    }

    const endedAt = new Date().toISOString();
    const summary = {
        total: findings.length,
        passed: findings.filter((item) => item.status === 'pass').length,
        warned: findings.filter((item) => item.status === 'warn').length,
        failed: findings.filter((item) => item.status === 'fail').length,
    };

    await fs.writeFile(
        path.join(OUT, 'results.json'),
        JSON.stringify({ runId: RUN_ID, startedAt, endedAt, baseUrl: BASE_URL, summary, findings, warnings }, null, 2),
        'utf-8'
    );

    const markdown = [
        `# Public + Student Presence Audit (${RUN_ID})`,
        '',
        `- Base URL: ${BASE_URL}`,
        `- Started: ${startedAt}`,
        `- Ended: ${endedAt}`,
        '',
        '## Summary',
        '',
        `- Total: ${summary.total}`,
        `- Passed: ${summary.passed}`,
        `- Warned: ${summary.warned}`,
        `- Failed: ${summary.failed}`,
        '',
        '## Findings',
        '',
        '| ID | Type | Route | Page | Status | Missing Checks | Empty-State Signals | Screenshot |',
        '|---|---|---|---|---|---|---|---|',
        ...findings.map((item) => {
            const missing = item.missingChecks?.length
                ? item.missingChecks.map((check) => `${check.label} (${check.actual}/${check.expectedMin})`).join(' ; ')
                : '-';
            const empty = item.emptySignals?.length ? item.emptySignals.join(' ; ') : '-';
            return `| ${item.id} | ${item.kind} | \`${item.route}\` | ${item.label} | ${item.status.toUpperCase()} | ${missing.replace(/\|/g, '\\|')} | ${empty.replace(/\|/g, '\\|')} | [${item.screenshot}](${item.screenshot}) |`;
        }),
        '',
        '## Warnings',
        '',
        ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- None']),
        '',
    ].join('\n');

    await fs.writeFile(path.join(OUT, 'results.md'), markdown, 'utf-8');
    process.stdout.write(JSON.stringify({ runId: RUN_ID, outputDir: OUT, summary, warnings }, null, 2));
    process.exitCode = summary.failed > 0 ? 1 : 0;
}

main().catch((error) => {
    process.stderr.write(`[public-student-presence-audit] fatal: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
});
