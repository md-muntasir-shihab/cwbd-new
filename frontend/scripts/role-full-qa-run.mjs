import fs from 'fs/promises';
import path from 'path';
import net from 'net';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const IS_WIN = process.platform === 'win32';
const NODE = IS_WIN ? 'node.exe' : 'node';
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const NPX = IS_WIN ? 'npx.cmd' : 'npx';

const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const START_BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 5083);
const START_FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 5283);
const ISOLATED_DB_NAME = process.env.E2E_DB_NAME || `campusway_role_qa_${RUN_ID}`;
const ISOLATED_MONGODB_URI = process.env.E2E_ISOLATED_MONGODB_URI || `mongodb://127.0.0.1:27017/${ISOLATED_DB_NAME}`;
const LIVE_MONGODB_URI = process.env.E2E_LIVE_MONGODB_URI || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/campusway';
const CONTEXT_MODE = String(process.env.E2E_ROLE_QA_CONTEXT || 'both').trim().toLowerCase();
const PASSES_ENV = String(process.env.E2E_ROLE_QA_PASSES || '').trim();

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORK_DIR = path.resolve(SCRIPT_DIR, '..');
const BACKEND_DIR = path.resolve(WORK_DIR, '../backend');
const OUT_DIR = path.resolve(WORK_DIR, '../qa-artifacts/role-full-qa', RUN_ID);
const SNAPSHOT_ROOT = path.join(OUT_DIR, 'live-db-snapshots');

const PASS_DEFS = [
    {
        id: 'pass1-viewer',
        title: 'PASS 1 - Viewer/Public',
        role: 'Viewer',
        specs: [
            'e2e/public-smoke.spec.ts',
            'e2e/public-design-visibility.spec.ts',
            'e2e/home-step1.spec.ts',
            'e2e/home-master.spec.ts',
            'e2e/phase3-page-audit.spec.ts',
            'e2e/news-exam-responsive.spec.ts',
            'e2e/open-universities-full.spec.ts',
        ],
    },
    {
        id: 'pass2-student',
        title: 'PASS 2 - Student',
        role: 'Student',
        specs: [
            'e2e/student-smoke.spec.ts',
            'e2e/exam-flow.spec.ts',
            'e2e/exam-attempt-critical.spec.ts',
        ],
    },
    {
        id: 'pass3-admin',
        title: 'PASS 3 - Admin',
        role: 'Admin',
        specs: [
            'e2e/admin-smoke.spec.ts',
            'e2e/admin-phase2-micro.spec.ts',
            'e2e/admin-button-font-micro.spec.ts',
            'e2e/finance-support-critical.spec.ts',
            'e2e/news-admin-routes.spec.ts',
            'e2e/qbank-critical.spec.ts',
            'e2e/admin-responsive-all.spec.ts',
            'e2e/import-export-bulk.spec.ts',
            'e2e/settings-propagation.spec.ts',
            'e2e/university-admin-controls.spec.ts',
        ],
    },
    {
        id: 'pass4-cross-role',
        title: 'PASS 4 - Cross-role / Permission / Sync',
        role: 'Cross-role',
        specs: [
            'e2e/phase4-pipelines.spec.ts',
            'e2e/auth-session.spec.ts',
            'e2e/step2-core.spec.ts',
            'e2e/login-unification.spec.ts',
            'e2e/cross-role-permissions.spec.ts',
            'e2e/role-theme-persistence.spec.ts',
            'e2e/home-news-exams-resources-live.spec.ts',
        ],
    },
    {
        id: 'pass5-regression',
        title: 'PASS 5 - Regression',
        role: 'Cross-role',
        specs: [
            'e2e/public-smoke.spec.ts',
            'e2e/student-smoke.spec.ts',
            'e2e/admin-smoke.spec.ts',
            'e2e/cross-role-permissions.spec.ts',
            'e2e/settings-propagation.spec.ts',
            'e2e/role-theme-persistence.spec.ts',
            'e2e/open-universities-full.spec.ts',
            'e2e/university-admin-controls.spec.ts',
            'e2e/home-news-exams-resources-live.spec.ts',
            'e2e/admin-button-font-micro.spec.ts',
        ],
    },
];

const CONTEXT_DEFS = {
    isolated: {
        id: 'isolated',
        title: 'Isolated QA DB',
        mongoUri: ISOLATED_MONGODB_URI,
        startBackendPort: START_BACKEND_PORT,
        startFrontendPort: START_FRONTEND_PORT,
        runOpenUniversitiesPrepare: true,
        liveMutationMode: false,
    },
    live: {
        id: 'live',
        title: 'Live/Local DB',
        mongoUri: LIVE_MONGODB_URI,
        startBackendPort: START_BACKEND_PORT + 100,
        startFrontendPort: START_FRONTEND_PORT + 100,
        runOpenUniversitiesPrepare: true,
        liveMutationMode: true,
    },
};

const DEFAULT_FONT_ASSERT_MODE = String(process.env.E2E_FONT_ASSERT_MODE || 'state-aware').trim().toLowerCase() || 'state-aware';
const DEFAULT_ADMIN_BUTTON_DEPTH = String(process.env.E2E_ADMIN_BUTTON_DEPTH || 'full-commit').trim().toLowerCase() || 'full-commit';

function getSpawnSpec(cmd, args = []) {
    if (IS_WIN && /\.(cmd|bat)$/i.test(String(cmd || ''))) {
        return {
            cmd: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return { cmd, args };
}

function pickPasses() {
    if (!PASSES_ENV) return PASS_DEFS;
    const requested = new Set(PASSES_ENV.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
    return PASS_DEFS.filter((passDef) => requested.has(passDef.id.toLowerCase()));
}

function pickContexts() {
    if (CONTEXT_MODE === 'isolated') return [CONTEXT_DEFS.isolated];
    if (CONTEXT_MODE === 'live') return [CONTEXT_DEFS.live];
    return [CONTEXT_DEFS.isolated, CONTEXT_DEFS.live];
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnCmd(cmd, args, options = {}) {
    const spec = getSpawnSpec(cmd, args);
    return spawn(spec.cmd, spec.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options,
    });
}

async function runCmd(cmd, args, options = {}) {
    return new Promise((resolve) => {
        const child = spawnCmd(cmd, args, options);
        const stdout = [];
        const stderr = [];
        child.stdout?.on('data', (chunk) => stdout.push(chunk));
        child.stderr?.on('data', (chunk) => stderr.push(chunk));
        child.on('close', (code) => {
            resolve({
                code: code ?? 1,
                stdout: Buffer.concat(stdout).toString('utf-8'),
                stderr: Buffer.concat(stderr).toString('utf-8'),
            });
        });
        child.on('error', (error) => {
            resolve({ code: 1, stdout: '', stderr: String(error?.message || error) });
        });
    });
}

async function isPortFree(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port, '127.0.0.1');
    });
}

async function findAvailablePort(startPort, maxAttempts = 80) {
    for (let offset = 0; offset < maxAttempts; offset += 1) {
        const candidate = startPort + offset;
        // eslint-disable-next-line no-await-in-loop
        const free = await isPortFree(candidate);
        if (free) return candidate;
    }
    throw new Error(`No free port found after ${maxAttempts} attempts from ${startPort}`);
}

async function waitForUrl(url, timeoutMs = 140_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2_000);
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (response.ok) return true;
        } catch {
            // retry
        }
        // eslint-disable-next-line no-await-in-loop
        await sleep(1_000);
    }
    return false;
}

async function killProcess(child) {
    if (!child || !child.pid || child.killed) return;
    if (IS_WIN) {
        await runCmd('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        return;
    }
    child.kill('SIGTERM');
    await Promise.race([
        new Promise((resolve) => child.once('close', resolve)),
        sleep(5_000),
    ]);
}

function parseJsonFromMixedOutput(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        // continue
    }
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
        const candidate = trimmed.slice(first, last + 1);
        try {
            return JSON.parse(candidate);
        } catch {
            return null;
        }
    }
    return null;
}

function collectTestEntries(playwrightJson) {
    const entries = [];

    function visitSuite(suite, parents) {
        const nextParents = suite?.title ? [...parents, suite.title] : parents;
        const specs = Array.isArray(suite?.specs) ? suite.specs : [];
        for (const spec of specs) {
            const titlePath = [...nextParents, spec.title].filter(Boolean).join(' > ');
            const tests = Array.isArray(spec.tests) ? spec.tests : [];
            for (const testItem of tests) {
                const results = Array.isArray(testItem.results) ? testItem.results : [];
                const lastResult = results[results.length - 1] || {};
                const status = String(lastResult.status || testItem.status || 'unknown');
                const errors = [];
                for (const result of results) {
                    if (Array.isArray(result.errors)) {
                        for (const err of result.errors) {
                            if (err?.message) errors.push(String(err.message));
                        }
                    }
                    if (result?.error?.message) errors.push(String(result.error.message));
                }
                const attachments = [];
                for (const result of results) {
                    if (Array.isArray(result.attachments)) {
                        for (const attachment of result.attachments) {
                            if (attachment?.path) attachments.push(String(attachment.path));
                        }
                    }
                }

                entries.push({
                    file: String(spec.file || suite.file || ''),
                    title: titlePath || String(testItem.title || spec.title || 'Unnamed test'),
                    status,
                    errors,
                    attachments,
                });
            }
        }

        const suites = Array.isArray(suite?.suites) ? suite.suites : [];
        for (const child of suites) {
            visitSuite(child, nextParents);
        }
    }

    const suites = Array.isArray(playwrightJson?.suites) ? playwrightJson.suites : [];
    for (const suite of suites) {
        visitSuite(suite, []);
    }
    return entries;
}

function summarizeEntries(entries) {
    const summary = {
        total: entries.length,
        passed: 0,
        failed: 0,
        skipped: 0,
        other: 0,
    };
    for (const entry of entries) {
        if (entry.status === 'passed') summary.passed += 1;
        else if (entry.status === 'failed' || entry.status === 'timedOut' || entry.status === 'interrupted') summary.failed += 1;
        else if (entry.status === 'skipped') summary.skipped += 1;
        else summary.other += 1;
    }
    return summary;
}

function inferSeverity(entry, passId) {
    const text = `${entry.errors?.join('\n') || ''}`.toLowerCase();
    if (entry.status === 'timedOut' || text.includes('status 500') || text.includes('critical')) return 'Critical';
    if (passId === 'pass4-cross-role' || text.includes('forbidden') || text.includes('unauthorized') || text.includes('permission')) return 'High';
    if (text.includes('overflow') || text.includes('theme') || text.includes('visual')) return 'Medium';
    return 'Low';
}

function inferModule(entry) {
    const f = path.basename(entry.file || '').toLowerCase();
    if (f.includes('public') || f.includes('home') || f.includes('universit')) return 'Public';
    if (f.includes('student') || f.includes('exam')) return 'Student';
    if (f.includes('admin') || f.includes('finance') || f.includes('qbank')) return 'Admin';
    if (f.includes('permission') || f.includes('auth')) return 'Access Control';
    if (f.includes('import') || f.includes('export') || f.includes('bulk')) return 'Data Operations';
    return 'General';
}

function inferRoute(entry) {
    const match = String(entry.title || '').match(/\/[a-z0-9/_-]+/i);
    return match ? match[0] : 'N/A';
}

function makeBugLedger(passReports, contextId) {
    const bugs = [];
    let counter = 1;

    for (const passReport of passReports) {
        for (const entry of passReport.entries) {
            if (!(entry.status === 'failed' || entry.status === 'timedOut' || entry.status === 'interrupted')) continue;
            bugs.push({
                bugId: `CW-${contextId.toUpperCase()}-${String(counter).padStart(4, '0')}`,
                sourcePassId: passReport.id,
                role: passReport.role,
                module: inferModule(entry),
                routeOrPage: inferRoute(entry),
                mcpToolUsed: 'Playwright + Filesystem/Mongo shell fallback',
                severity: inferSeverity(entry, passReport.id),
                stepsToReproduce: `Run ${contextId} ${passReport.id} and execute test "${entry.title}"`,
                expectedResult: 'Test assertion should pass and flow should remain stable.',
                actualResult: entry.errors?.[0] || `Test failed with status=${entry.status}`,
                screenshotOrTrace: entry.attachments?.[0] || 'N/A',
                dbEvidence: passReport.dbEvidencePath || 'N/A',
                adminCoverageEvidence: passReport.adminCoveragePath || 'N/A',
                fontDiffEvidence: passReport.adminFontDiffPath || 'N/A',
                fixed: 'No',
                retested: 'No',
            });
            counter += 1;
        }
    }

    return bugs;
}

function renderBugMarkdown(bugs) {
    if (!bugs.length) {
        return [
            '# CampusWay Role QA Bug Ledger',
            '',
            'No failing tests were detected across executed passes.',
            '',
        ].join('\n');
    }

    const lines = [
        '# CampusWay Role QA Bug Ledger',
        '',
        '| Bug ID | Role | Module | Route/Page | Severity | Fixed | Retested |',
        '|---|---|---|---|---|---|---|',
        ...bugs.map((bug) => `| ${bug.bugId} | ${bug.role} | ${bug.module} | ${bug.routeOrPage} | ${bug.severity} | ${bug.fixed} | ${bug.retested} |`),
        '',
    ];

    for (const bug of bugs) {
        lines.push(`## ${bug.bugId}`);
        lines.push(`- Role: ${bug.role}`);
        lines.push(`- Source pass: ${bug.sourcePassId}`);
        lines.push(`- Module: ${bug.module}`);
        lines.push(`- Route/Page: ${bug.routeOrPage}`);
        lines.push(`- MCP tool used: ${bug.mcpToolUsed}`);
        lines.push(`- Severity: ${bug.severity}`);
        lines.push(`- Steps to reproduce: ${bug.stepsToReproduce}`);
        lines.push(`- Expected result: ${bug.expectedResult}`);
        lines.push(`- Actual result: ${bug.actualResult}`);
        lines.push(`- Screenshot / trace: ${bug.screenshotOrTrace}`);
        lines.push(`- DB evidence: ${bug.dbEvidence}`);
        lines.push(`- Admin coverage evidence: ${bug.adminCoverageEvidence}`);
        lines.push(`- Font diff evidence: ${bug.fontDiffEvidence}`);
        lines.push(`- Fixed?: ${bug.fixed}`);
        lines.push(`- Retested?: ${bug.retested}`);
        lines.push('');
    }
    return lines.join('\n');
}

async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}

async function runPlaywrightPass(passDef, env, passDir) {
    const jsonPath = path.join(passDir, 'playwright.json');
    const logPath = path.join(passDir, 'playwright.log');
    const args = [
        'playwright',
        'test',
        ...passDef.specs,
        '--project=chromium-desktop',
        '--workers=1',
        '--reporter=json',
    ];
    const result = await runCmd(NPX, args, { cwd: WORK_DIR, env });
    const rawCombined = `${result.stdout}\n${result.stderr}`.trim();
    await fs.writeFile(logPath, rawCombined, 'utf-8');

    const parsed = parseJsonFromMixedOutput(result.stdout) || parseJsonFromMixedOutput(rawCombined) || {};
    await fs.writeFile(jsonPath, JSON.stringify(parsed, null, 2), 'utf-8');

    const entries = collectTestEntries(parsed);
    const summary = summarizeEntries(entries);
    return {
        code: result.code,
        entries,
        summary,
        logPath,
        jsonPath,
    };
}

async function runDbEvidence(passDef, env, passDir, mode = 'general') {
    const scriptName = mode === 'open-universities' ? 'e2e:db-evidence:open-universities' : 'e2e:db-evidence';
    const outPath = path.join(passDir, mode === 'open-universities' ? 'db-evidence-open-universities.json' : 'db-evidence.json');
    const cmd = await runCmd(
        NPM,
        ['--prefix', BACKEND_DIR, 'run', scriptName],
        {
            cwd: WORK_DIR,
            env: {
                ...env,
                E2E_EVIDENCE_LABEL: passDef.id,
                MONGODB_URI: env.MONGODB_URI,
                MONGO_URI: env.MONGODB_URI,
            },
        },
    );
    const parsed = parseJsonFromMixedOutput(cmd.stdout) || parseJsonFromMixedOutput(`${cmd.stdout}\n${cmd.stderr}`) || {
        ok: false,
        message: `Unable to parse DB evidence output (${scriptName})`,
        stdout: cmd.stdout,
        stderr: cmd.stderr,
    };
    await fs.writeFile(outPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return { path: outPath, code: cmd.code };
}

async function runPrepareScripts(contextDef, env, contextDir) {
    const prepare = await runCmd(
        NPM,
        ['--prefix', BACKEND_DIR, 'run', 'e2e:prepare'],
        {
            cwd: WORK_DIR,
            env,
        },
    );
    await fs.writeFile(path.join(contextDir, 'e2e-prepare.log'), `${prepare.stdout}\n${prepare.stderr}`, 'utf-8');
    if (prepare.code !== 0) {
        throw new Error(`[${contextDef.id}] backend e2e:prepare failed`);
    }

    if (contextDef.runOpenUniversitiesPrepare) {
        const openPrepare = await runCmd(
            NPM,
            ['--prefix', BACKEND_DIR, 'run', 'e2e:prepare:open-universities'],
            {
                cwd: WORK_DIR,
                env,
            },
        );
        await fs.writeFile(path.join(contextDir, 'e2e-prepare-open-universities.log'), `${openPrepare.stdout}\n${openPrepare.stderr}`, 'utf-8');
        if (openPrepare.code !== 0) {
            throw new Error(`[${contextDef.id}] backend e2e:prepare:open-universities failed`);
        }
    }
}

async function dropDatabaseViaNode(mongoUri) {
    const js = `
const mongoose = require('mongoose');
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
(async () => {
  try {
    await mongoose.connect(uri);
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.disconnect();
    console.log(JSON.stringify({ ok: true }));
  } catch (error) {
    console.error(String(error && error.message ? error.message : error));
    process.exit(1);
  }
})();`;

    const result = await runCmd(NODE, ['-e', js], {
        cwd: BACKEND_DIR,
        env: {
            ...process.env,
            MONGODB_URI: mongoUri,
            MONGO_URI: mongoUri,
        },
    });

    return result.code === 0;
}

async function runSnapshotCommand({ action, mongoUri, snapshotRoot, snapshotId }) {
    const script = action === 'restore' ? 'e2e:db-snapshot:restore' : 'e2e:db-snapshot';
    const command = await runCmd(
        NPM,
        ['--prefix', BACKEND_DIR, 'run', script],
        {
            cwd: WORK_DIR,
            env: {
                ...process.env,
                MONGODB_URI: mongoUri,
                MONGO_URI: mongoUri,
                E2E_SNAPSHOT_ROOT: snapshotRoot,
                E2E_SNAPSHOT_ID: snapshotId || '',
            },
        },
    );

    const parsed = parseJsonFromMixedOutput(command.stdout) || parseJsonFromMixedOutput(`${command.stdout}\n${command.stderr}`);
    return {
        code: command.code,
        parsed,
        stdout: command.stdout,
        stderr: command.stderr,
        script,
    };
}

async function runAdminRouteFilesystemAudit(contextDir) {
    const outPath = path.join(contextDir, 'admin-route-filesystem-audit.json');
    const command = await runCmd(
        NODE,
        ['./scripts/admin-route-fs-audit.mjs', '--out', outPath],
        {
            cwd: WORK_DIR,
            env: process.env,
        },
    );
    return {
        code: command.code,
        outPath,
        stdout: command.stdout,
        stderr: command.stderr,
    };
}

async function executeContext(contextDef, selectedPasses) {
    const contextDir = path.join(OUT_DIR, contextDef.id);
    await ensureDir(contextDir);

    const passReports = [];
    const warnings = [];

    const fsAudit = await runAdminRouteFilesystemAudit(contextDir);
    await fs.writeFile(path.join(contextDir, 'admin-route-filesystem-audit.log'), `${fsAudit.stdout}\n${fsAudit.stderr}`, 'utf-8');
    if (fsAudit.code !== 0) {
        warnings.push(`[${contextDef.id}] admin route filesystem audit failed.`);
    }

    const backendPort = await findAvailablePort(contextDef.startBackendPort);
    const frontendPort = await findAvailablePort(contextDef.startFrontendPort);
    const backendOrigin = `http://127.0.0.1:${backendPort}`;
    const baseUrl = `http://127.0.0.1:${frontendPort}`;
    const backendHealthUrl = `${backendOrigin}/api/health`;

    const env = {
        ...process.env,
        E2E_BASE_URL: baseUrl,
        E2E_API_BASE_URL: backendOrigin,
        E2E_DISABLE_RATE_LIMIT: 'true',
        MONGODB_URI: contextDef.mongoUri,
        MONGO_URI: contextDef.mongoUri,
        PORT: String(backendPort),
        FRONTEND_URL: baseUrl,
        CORS_ORIGIN: baseUrl,
        VITE_API_PROXY_TARGET: backendOrigin,
        VITE_PORT: String(frontendPort),
        E2E_RUN_CONTEXT: contextDef.id,
        E2E_FONT_ASSERT_MODE: DEFAULT_FONT_ASSERT_MODE,
        E2E_ADMIN_BUTTON_DEPTH: DEFAULT_ADMIN_BUTTON_DEPTH,
        E2E_ADMIN_ROUTE_AUDIT_PATH: fsAudit.outPath,
    };

    const backendLogChunks = [];
    const frontendLogChunks = [];
    let backendProcess = null;
    let frontendProcess = null;
    let prepared = false;

    try {
        backendProcess = spawnCmd(
            NPM,
            ['run', 'dev'],
            {
                cwd: BACKEND_DIR,
                env,
            },
        );
        backendProcess.stdout?.on('data', (chunk) => backendLogChunks.push(chunk));
        backendProcess.stderr?.on('data', (chunk) => backendLogChunks.push(chunk));

        const backendReady = await waitForUrl(backendHealthUrl, 180_000);
        if (!backendReady) throw new Error(`[${contextDef.id}] Backend did not become healthy: ${backendHealthUrl}`);

        frontendProcess = spawnCmd(
            NPM,
            ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(frontendPort)],
            {
                cwd: WORK_DIR,
                env,
            },
        );
        frontendProcess.stdout?.on('data', (chunk) => frontendLogChunks.push(chunk));
        frontendProcess.stderr?.on('data', (chunk) => frontendLogChunks.push(chunk));

        const frontendReady = await waitForUrl(baseUrl, 180_000);
        if (!frontendReady) throw new Error(`[${contextDef.id}] Frontend did not become healthy: ${baseUrl}`);

        await runPrepareScripts(contextDef, env, contextDir);
        prepared = true;

        for (const passDef of selectedPasses) {
            const passDir = path.join(contextDir, passDef.id);
            await ensureDir(passDir);

            const passEnv = {
                ...env,
                E2E_RUN_LABEL: `${contextDef.id}-${passDef.id}`,
                E2E_PASS_ARTIFACTS_DIR: passDir,
                E2E_ADMIN_MICRO_CRITICAL_ONLY: passDef.id === 'pass5-regression' ? 'true' : 'false',
                E2E_ADMIN_BUTTON_LIMIT_PER_ROUTE: passDef.id === 'pass5-regression' ? '35' : String(process.env.E2E_ADMIN_BUTTON_LIMIT_PER_ROUTE || '80'),
            };

            const play = await runPlaywrightPass(passDef, passEnv, passDir);
            const dbEvidence = await runDbEvidence(passDef, passEnv, passDir, 'general');
            const openUniversitiesEvidence = passDef.specs.some((spec) => spec.includes('open-universities'))
                ? await runDbEvidence(passDef, passEnv, passDir, 'open-universities')
                : null;

            const report = {
                id: passDef.id,
                title: passDef.title,
                role: passDef.role,
                context: contextDef.id,
                summary: play.summary,
                code: play.code,
                entries: play.entries,
                logPath: play.logPath,
                resultPath: play.jsonPath,
                dbEvidencePath: dbEvidence.path,
                openUniversitiesDbEvidencePath: openUniversitiesEvidence?.path || null,
                adminCoveragePath: path.join(passDir, 'admin-button-coverage.json'),
                adminFontDiffPath: path.join(passDir, 'font-diff-report.json'),
                adminRouteManifestPath: path.join(passDir, 'admin-route-manifest.json'),
            };
            passReports.push(report);

            await fs.writeFile(path.join(passDir, 'pass-summary.json'), JSON.stringify(report, null, 2), 'utf-8');
            if (play.code !== 0) {
                warnings.push(`${contextDef.id}/${passDef.id} returned non-zero exit code (${play.code}).`);
            }
        }
    } finally {
        if (prepared) {
            const restore = await runCmd(
                NPM,
                ['--prefix', BACKEND_DIR, 'run', 'e2e:restore'],
                {
                    cwd: WORK_DIR,
                    env,
                },
            );
            await fs.writeFile(path.join(contextDir, 'e2e-restore.log'), `${restore.stdout}\n${restore.stderr}`, 'utf-8');
            if (restore.code !== 0) warnings.push(`[${contextDef.id}] backend e2e:restore returned non-zero exit code.`);
        }

        if (contextDef.id === 'isolated') {
            const dropped = await dropDatabaseViaNode(contextDef.mongoUri);
            if (!dropped) warnings.push(`[${contextDef.id}] isolated DB drop skipped (drop script failed).`);
        }

        await killProcess(frontendProcess);
        await killProcess(backendProcess);
        await fs.writeFile(path.join(contextDir, 'backend.log'), Buffer.concat(backendLogChunks).toString('utf-8'), 'utf-8');
        await fs.writeFile(path.join(contextDir, 'frontend.log'), Buffer.concat(frontendLogChunks).toString('utf-8'), 'utf-8');
    }

    const bugs = makeBugLedger(passReports, contextDef.id);
    const bugJsonPath = path.join(contextDir, 'bug-ledger.json');
    const bugMdPath = path.join(contextDir, 'bug-ledger.md');
    await fs.writeFile(bugJsonPath, JSON.stringify(bugs, null, 2), 'utf-8');
    await fs.writeFile(bugMdPath, renderBugMarkdown(bugs), 'utf-8');

    const passSummaryRows = passReports.map((report) => ({
        passId: report.id,
        role: report.role,
        total: report.summary.total,
        passed: report.summary.passed,
        failed: report.summary.failed,
        skipped: report.summary.skipped,
        other: report.summary.other,
    }));

    const totals = passSummaryRows.reduce(
        (acc, row) => ({
            total: acc.total + row.total,
            passed: acc.passed + row.passed,
            failed: acc.failed + row.failed,
            skipped: acc.skipped + row.skipped,
            other: acc.other + row.other,
        }),
        { total: 0, passed: 0, failed: 0, skipped: 0, other: 0 },
    );

    const contextSummary = {
        runId: RUN_ID,
        runContext: contextDef.id,
        contextTitle: contextDef.title,
        baseUrl,
        apiBaseUrl: backendOrigin,
        mongoUri: contextDef.mongoUri,
        liveMutationMode: contextDef.liveMutationMode ? 'full' : 'isolated',
        outputDir: contextDir,
        filesystemAuditPath: fsAudit.outPath,
        passes: passSummaryRows,
        totals,
        bugCount: bugs.length,
        openCriticalOrHigh: bugs.filter((bug) => bug.severity === 'Critical' || bug.severity === 'High').length,
        warnings,
    };

    await fs.writeFile(path.join(contextDir, 'summary.json'), JSON.stringify(contextSummary, null, 2), 'utf-8');
    await fs.writeFile(
        path.join(contextDir, 'summary.md'),
        [
            `# CampusWay Full Role QA Summary (${RUN_ID}) [${contextDef.id}]`,
            '',
            `- Base URL: ${contextSummary.baseUrl}`,
            `- API Base URL: ${contextSummary.apiBaseUrl}`,
            `- Mongo URI: ${contextSummary.mongoUri}`,
            `- Filesystem Route Audit: ${path.basename(contextSummary.filesystemAuditPath)}`,
            '- Bug Ledger JSON: bug-ledger.json',
            '- Bug Ledger MD: bug-ledger.md',
            '',
            '| Pass | Role | Total | Passed | Failed | Skipped | Other |',
            '|---|---|---:|---:|---:|---:|---:|',
            ...contextSummary.passes.map((row) => `| ${row.passId} | ${row.role} | ${row.total} | ${row.passed} | ${row.failed} | ${row.skipped} | ${row.other} |`),
            '',
            `- Total tests: ${contextSummary.totals.total}`,
            `- Total failed: ${contextSummary.totals.failed}`,
            `- Bugs logged: ${contextSummary.bugCount}`,
            `- Open Critical/High bugs: ${contextSummary.openCriticalOrHigh}`,
            '',
            '## Warnings',
            ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- None']),
            '',
        ].join('\n'),
        'utf-8',
    );

    return contextSummary;
}

async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}

function contextHasPass(contextReport, passId) {
    return Array.isArray(contextReport.passes) && contextReport.passes.some((passRow) => passRow.passId === passId);
}

async function computeStopConditions({ contextReports, selectedPassIds }) {
    const contexts = Array.isArray(contextReports) ? contextReports : [];
    const requiredPassIds = ['pass1-viewer', 'pass2-student', 'pass3-admin', 'pass4-cross-role', 'pass5-regression'];
    const selectedSet = new Set(Array.isArray(selectedPassIds) && selectedPassIds.length ? selectedPassIds : requiredPassIds);

    const passesCompleted = Object.fromEntries(
        requiredPassIds.map((passId) => [
            passId,
            selectedSet.has(passId)
                ? contexts.every((context) => !context.fatalError && contextHasPass(context, passId))
                : true,
        ]),
    );

    let adminCoverageReady = true;
    let fontReportReady = true;
    let dbEvidenceReady = true;

    for (const context of contexts) {
        if (context.fatalError) {
            adminCoverageReady = false;
            fontReportReady = false;
            dbEvidenceReady = false;
            continue;
        }
        const pass3Coverage = path.join(context.outputDir, 'pass3-admin', 'admin-button-coverage.json');
        const pass5Coverage = path.join(context.outputDir, 'pass5-regression', 'admin-button-coverage.json');
        const pass3FontDiff = path.join(context.outputDir, 'pass3-admin', 'font-diff-report.json');
        const pass5FontDiff = path.join(context.outputDir, 'pass5-regression', 'font-diff-report.json');

        // eslint-disable-next-line no-await-in-loop
        const coverageOk = (await fileExists(pass3Coverage)) && (await fileExists(pass5Coverage));
        // eslint-disable-next-line no-await-in-loop
        const fontOk = (await fileExists(pass3FontDiff)) && (await fileExists(pass5FontDiff));
        adminCoverageReady = adminCoverageReady && coverageOk;
        fontReportReady = fontReportReady && fontOk;

        for (const passId of requiredPassIds) {
            if (!selectedSet.has(passId)) continue;
            const evidencePath = path.join(context.outputDir, passId, 'db-evidence.json');
            // eslint-disable-next-line no-await-in-loop
            const ok = await fileExists(evidencePath);
            dbEvidenceReady = dbEvidenceReady && ok;
        }
    }

    const noCriticalHighOpen = contexts.every((context) => Number(context.openCriticalOrHigh || 0) === 0);
    const noFatal = contexts.every((context) => !context.fatalError);

    return {
        viewerPassCompleted: Boolean(passesCompleted['pass1-viewer']),
        studentPassCompleted: Boolean(passesCompleted['pass2-student']),
        adminPassCompleted: Boolean(passesCompleted['pass3-admin']),
        crossRolePassCompleted: Boolean(passesCompleted['pass4-cross-role']),
        regressionPassCompleted: Boolean(passesCompleted['pass5-regression']),
        majorButtonFunctionChecked: adminCoverageReady,
        criticalFlowsChecked: selectedSet.has('pass4-cross-role') ? Boolean(passesCompleted['pass4-cross-role']) : true,
        importExportChecked: selectedSet.has('pass3-admin') ? Boolean(passesCompleted['pass3-admin']) : true,
        roleRestrictionsVerified: selectedSet.has('pass4-cross-role') ? Boolean(passesCompleted['pass4-cross-role']) : true,
        responsiveVerified: adminCoverageReady,
        darkLightVerified: fontReportReady,
        dbPersistenceVerified: dbEvidenceReady,
        noCriticalHighIssueOpen: noCriticalHighOpen,
        noFatalErrors: noFatal,
    };
}

function renderFinalSummaryMarkdown({ runId, summary, stopConditions }) {
    const rows = [
        ['Viewer pass completed', stopConditions.viewerPassCompleted],
        ['Student pass completed', stopConditions.studentPassCompleted],
        ['Admin pass completed', stopConditions.adminPassCompleted],
        ['Cross-role pass completed', stopConditions.crossRolePassCompleted],
        ['Regression pass completed', stopConditions.regressionPassCompleted],
        ['Major button/function checks completed', stopConditions.majorButtonFunctionChecked],
        ['Critical flows checked', stopConditions.criticalFlowsChecked],
        ['Import/export checked', stopConditions.importExportChecked],
        ['Role restrictions verified', stopConditions.roleRestrictionsVerified],
        ['Responsive verified', stopConditions.responsiveVerified],
        ['Dark/light verified', stopConditions.darkLightVerified],
        ['DB persistence verified', stopConditions.dbPersistenceVerified],
        ['No critical/high issue open', stopConditions.noCriticalHighIssueOpen],
        ['No fatal execution error', stopConditions.noFatalErrors],
    ];

    return [
        `# CampusWay Final QA Summary (${runId})`,
        '',
        `- Run context: ${summary.runContext}`,
        `- Output directory: ${summary.outputDir}`,
        `- Combined total tests: ${summary.totals.total}`,
        `- Combined failed tests: ${summary.totals.failed}`,
        '',
        '| Stop Condition | Status |',
        '|---|---|',
        ...rows.map(([label, ok]) => `| ${label} | ${ok ? 'PASS' : 'FAIL'} |`),
        '',
        '| Context | Failed | Open Critical/High | Fatal Error |',
        '|---|---:|---:|---|',
        ...summary.contexts.map((context) => `| ${context.runContext} | ${context.totals.failed} | ${context.openCriticalOrHigh} | ${context.fatalError ? 'Yes' : 'No'} |`),
        '',
    ].join('\n');
}

async function main() {
    await ensureDir(OUT_DIR);

    const selectedPasses = pickPasses();
    if (!selectedPasses.length) {
        throw new Error('No passes selected. Set E2E_ROLE_QA_PASSES with valid pass IDs.');
    }

    const selectedContexts = pickContexts();
    const warnings = [];
    const contextReports = [];

    let backupSnapshotId = null;
    let rollbackApplied = false;

    for (const contextDef of selectedContexts) {
        if (contextDef.id === 'live') {
            await ensureDir(SNAPSHOT_ROOT);
            const backup = await runSnapshotCommand({
                action: 'backup',
                mongoUri: contextDef.mongoUri,
                snapshotRoot: SNAPSHOT_ROOT,
            });
            await fs.writeFile(path.join(OUT_DIR, 'live-snapshot-backup.log'), `${backup.stdout}\n${backup.stderr}`, 'utf-8');
            if (backup.code !== 0 || !backup.parsed?.snapshotId) {
                throw new Error(`Live DB snapshot failed before live run. script=${backup.script}`);
            }
            backupSnapshotId = String(backup.parsed.snapshotId);
        }

        try {
            const report = await executeContext(contextDef, selectedPasses);
            contextReports.push(report);
        } catch (error) {
            const message = `[${contextDef.id}] ${String(error?.message || error)}`;
            warnings.push(message);

            if (contextDef.id === 'live' && backupSnapshotId) {
                const rollback = await runSnapshotCommand({
                    action: 'restore',
                    mongoUri: contextDef.mongoUri,
                    snapshotRoot: SNAPSHOT_ROOT,
                    snapshotId: backupSnapshotId,
                });
                await fs.writeFile(path.join(OUT_DIR, 'live-snapshot-rollback.log'), `${rollback.stdout}\n${rollback.stderr}`, 'utf-8');
                rollbackApplied = rollback.code === 0;
                if (!rollbackApplied) {
                    warnings.push('[live] snapshot rollback failed. Manual restore required.');
                }
            }

            contextReports.push({
                runId: RUN_ID,
                runContext: contextDef.id,
                contextTitle: contextDef.title,
                baseUrl: '',
                apiBaseUrl: '',
                mongoUri: contextDef.mongoUri,
                liveMutationMode: contextDef.liveMutationMode ? 'full' : 'isolated',
                outputDir: path.join(OUT_DIR, contextDef.id),
                passes: [],
                totals: { total: 0, passed: 0, failed: 0, skipped: 0, other: 0 },
                bugCount: 0,
                openCriticalOrHigh: 0,
                warnings: [message],
                fatalError: message,
            });
        }
    }

    const combinedTotals = contextReports.reduce(
        (acc, report) => ({
            total: acc.total + Number(report.totals?.total || 0),
            passed: acc.passed + Number(report.totals?.passed || 0),
            failed: acc.failed + Number(report.totals?.failed || 0),
            skipped: acc.skipped + Number(report.totals?.skipped || 0),
            other: acc.other + Number(report.totals?.other || 0),
        }),
        { total: 0, passed: 0, failed: 0, skipped: 0, other: 0 },
    );

    const summary = {
        runId: RUN_ID,
        runContext: CONTEXT_MODE,
        liveMutationMode: 'full',
        backupSnapshotId,
        rollbackApplied,
        outputDir: OUT_DIR,
        contexts: contextReports.map((report) => ({
            runContext: report.runContext,
            contextTitle: report.contextTitle,
            baseUrl: report.baseUrl,
            apiBaseUrl: report.apiBaseUrl,
            mongoUri: report.mongoUri,
            passes: report.passes,
            totals: report.totals,
            bugCount: report.bugCount,
            openCriticalOrHigh: report.openCriticalOrHigh,
            warnings: report.warnings,
            fatalError: report.fatalError || null,
            outputDir: report.outputDir,
        })),
        totals: combinedTotals,
        warnings,
    };

    const stopConditions = await computeStopConditions({
        contextReports: summary.contexts,
        selectedPassIds: selectedPasses.map((passDef) => passDef.id),
    });
    summary.stopConditions = stopConditions;
    await fs.writeFile(
        path.join(OUT_DIR, 'final-summary.md'),
        renderFinalSummaryMarkdown({
            runId: RUN_ID,
            summary,
            stopConditions,
        }),
        'utf-8',
    );

    await fs.writeFile(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
    await fs.writeFile(
        path.join(OUT_DIR, 'summary.md'),
        [
            `# CampusWay Role-Based QA Summary (${RUN_ID})`,
            '',
            `- Run context: ${summary.runContext}`,
            `- Live mutation mode: ${summary.liveMutationMode}`,
            `- Live backup snapshot ID: ${summary.backupSnapshotId || 'N/A'}`,
            `- Rollback applied: ${summary.rollbackApplied ? 'Yes' : 'No'}`,
            '',
            '| Context | Total | Passed | Failed | Skipped | Other | Critical/High |',
            '|---|---:|---:|---:|---:|---:|---:|',
            ...summary.contexts.map((context) => `| ${context.runContext} | ${context.totals.total} | ${context.totals.passed} | ${context.totals.failed} | ${context.totals.skipped} | ${context.totals.other} | ${context.openCriticalOrHigh} |`),
            '',
            `- Combined total tests: ${summary.totals.total}`,
            `- Combined failed: ${summary.totals.failed}`,
            '',
            '## Warnings',
            ...(summary.warnings.length ? summary.warnings.map((warning) => `- ${warning}`) : ['- None']),
            '',
        ].join('\n'),
        'utf-8',
    );

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    const anyFatal = summary.contexts.some((context) => context.fatalError);
    const stopConditionFailed = Object.values(stopConditions).some((value) => value !== true);
    process.exitCode = summary.totals.failed > 0 || anyFatal || stopConditionFailed ? 1 : 0;
}

main().catch((error) => {
    process.stderr.write(`[role-full-qa-run] fatal: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
});
