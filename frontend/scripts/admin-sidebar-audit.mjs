import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { chromium } from '@playwright/test';

const IS_WIN = process.platform === 'win32';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const BACKEND_PORT = 5073;
const FRONTEND_PORT = 5273;
const BASE_URL = `http://127.0.0.1:${FRONTEND_PORT}`;
const DB_NAME = `campusway_admin_sidebar_audit_${RUN_ID}`;
const MONGODB_URI = `mongodb://127.0.0.1:27017/${DB_NAME}`;

const ADMIN_EMAIL = process.env.E2E_ADMIN_DESKTOP_EMAIL || 'e2e_admin_desktop@campusway.local';
const ADMIN_PASS = process.env.E2E_ADMIN_DESKTOP_PASSWORD || 'E2E_Admin#12345';
const STUDENT_EMAIL = process.env.E2E_STUDENT_DESKTOP_EMAIL || 'e2e_student_desktop@campusway.local';
const STUDENT_PASS = process.env.E2E_STUDENT_DESKTOP_PASSWORD || 'E2E_Student#12345';

const OUT = path.resolve(process.cwd(), '../qa-artifacts/admin-sidebar-audit', RUN_ID);
const SHOTS = path.join(OUT, 'screenshots');
const warnings = [];
const results = [];

function getSpawnSpec(cmd, args = []) {
    if (IS_WIN && /\.(cmd|bat)$/i.test(String(cmd || ''))) {
        return {
            cmd: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return { cmd, args };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const menuLabels = [
    'Dashboard',
    'Home Control',
    'University Settings',
    'Site Settings',
    'Banner Manager',
    'Universities',
    'News Area',
    'Exams',
    'Question Bank',
    'Students',
    'Student Groups',
    'Subscription Plans',
    'Payments',
    'Resources',
    'Support Center',
    'Reports',
    'Security Center',
    'System Logs',
    'Admin Profile',
];

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
            const res = await fetch(url);
            if (res.ok) return true;
        } catch {
            // retry until timeout
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

async function loginAdmin(page) {
    await page.goto(`${BASE_URL}/__cw_admin__/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input#identifier, input[name="identifier"], input[type="text"], input[type="email"]').first().fill(ADMIN_EMAIL);
    await page.locator('input#password, input[name="password"], input[type="password"]').first().fill(ADMIN_PASS);
    await page.getByRole('button', { name: /Sign In/i }).first().click();
    await page.waitForURL(/\/__cw_admin__\/dashboard/, { timeout: 20000 });
    await stable(page);
}

async function capture(page, menuLabel, status = 'pass', note = '') {
    const id = String(results.length + 1).padStart(2, '0');
    const screenshotName = `${id}-${slug(menuLabel)}.png`;
    const screenshotAbs = path.join(SHOTS, screenshotName);
    await page.screenshot({ path: screenshotAbs, fullPage: true }).catch(() => {});

    const snapshot = await page.evaluate(() => {
        const lines = (document.body?.innerText || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        const ignoredEmptySignals = [
            /^no due$/i,
            /^no plan message$/i,
            /^no image$/i,
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
        }))].slice(0, 10);
        const heading = (
            document.querySelector('main h1, h1, main h2, h2')?.textContent ||
            ''
        ).trim();
        const createLike = Array.from(document.querySelectorAll('button'))
            .map((button) => (button.textContent || '').trim())
            .filter(Boolean)
            .filter((text) => /(create|add|new|save|update|delete|publish|export)/i.test(text))
            .slice(0, 12);
        return {
            currentUrl: location.pathname + location.search,
            heading,
            emptySignals,
            createLike,
            counts: {
                cards: document.querySelectorAll('article,[class*="card"],[class*="Card"]').length,
                forms: document.querySelectorAll('form').length,
                tables: document.querySelectorAll('table').length,
                tableRows: document.querySelectorAll('table tbody tr').length,
                buttons: document.querySelectorAll('button').length,
                inputs: document.querySelectorAll('input,select,textarea').length,
            },
        };
    });

    const finalStatus = status === 'pass' && snapshot.emptySignals.length > 0 ? 'warn' : status;
    const finalNote = note || (snapshot.emptySignals.length > 0 ? 'Empty-state text found' : 'OK');
    results.push({
        menuLabel,
        status: finalStatus,
        note: finalNote,
        ...snapshot,
        screenshot: `screenshots/${screenshotName}`,
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
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        await loginAdmin(page);
        page.on('dialog', async (dialog) => {
            try {
                await dialog.accept();
            } catch {
                // ignore dialog errors
            }
        });

        await capture(page, 'Dashboard (initial)');
        for (const label of menuLabels) {
            await page.goto(`${BASE_URL}/__cw_admin__/dashboard`, { waitUntil: 'domcontentloaded' });
            await stable(page);
            const exact = new RegExp(`^${escapeRegExp(label)}$`, 'i');
            let item = page.locator('aside').getByText(exact).first();
            let count = await item.count();
            if (!count) {
                item = page.getByRole('link', { name: exact }).first();
                count = await item.count();
            }
            if (!count) {
                item = page.getByRole('button', { name: exact }).first();
                count = await item.count();
            }
            if (!count) {
                await capture(page, label, 'fail', 'Sidebar item not found');
                continue;
            }

            try {
                await item.scrollIntoViewIfNeeded();
                await item.click({ timeout: 12000 });
                await stable(page);
                await capture(page, label);
            } catch (error) {
                await capture(page, label, 'fail', `Click failed: ${String(error?.message || error)}`);
            }
        }

        await page.close();
        await context.close();
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
        total: results.length,
        passed: results.filter((item) => item.status === 'pass').length,
        warned: results.filter((item) => item.status === 'warn').length,
        failed: results.filter((item) => item.status === 'fail').length,
    };

    await fs.writeFile(
        path.join(OUT, 'results.json'),
        JSON.stringify({ runId: RUN_ID, startedAt, endedAt, baseUrl: BASE_URL, summary, results, warnings }, null, 2),
        'utf-8'
    );

    const markdown = [
        `# Admin Sidebar Audit (${RUN_ID})`,
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
        '| Menu | Status | URL | Heading | Empty-State Signals | Screenshot |',
        '|---|---|---|---|---|---|',
        ...results.map((item) => {
            const signals = item.emptySignals?.length ? item.emptySignals.join(' ; ').replace(/\|/g, '\\|') : '-';
            const heading = (item.heading || '-').replace(/\|/g, '\\|');
            const url = (item.currentUrl || '-').replace(/\|/g, '\\|');
            return `| ${item.menuLabel} | ${item.status.toUpperCase()} | \`${url}\` | ${heading} | ${signals} | [${item.screenshot}](${item.screenshot}) |`;
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
    process.stderr.write(`[admin-sidebar-audit] fatal: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
});
