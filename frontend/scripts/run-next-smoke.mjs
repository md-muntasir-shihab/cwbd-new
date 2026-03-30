import net from 'net';
import { spawn } from 'child_process';

const isWindows = process.platform === 'win32';
const NPM_BIN = isWindows ? 'npm.cmd' : 'npm';
const NPX_BIN = isWindows ? 'npx.cmd' : 'npx';

const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 5003);
const NEXT_PORT = Number(process.env.E2E_NEXT_PORT || 3000);
const BASE_URL = (process.env.E2E_BASE_URL || `http://127.0.0.1:${NEXT_PORT}`).replace(/\/$/, '');
const BACKEND_ORIGIN = (process.env.E2E_API_BASE_URL || `http://127.0.0.1:${BACKEND_PORT}`).replace(/\/$/, '');
const BACKEND_HEALTH_URL = process.env.E2E_BACKEND_HEALTH_URL || `${BACKEND_ORIGIN}/api/health`;
const REUSE_EXISTING = process.env.E2E_REUSE_EXISTING === 'true';
const BUILD_NEXT = process.env.E2E_NEXT_BUILD !== 'false';

function getSpawnSpec(cmd, args = []) {
    if (isWindows && /\.(cmd|bat)$/i.test(String(cmd || ''))) {
        return {
            cmd: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return { cmd, args };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(cmd, args, options = {}) {
    return new Promise((resolve) => {
        const spec = getSpawnSpec(cmd, args);
        const child = spawn(spec.cmd, spec.args, {
            stdio: 'inherit',
            ...options,
        });
        child.on('close', (code) => resolve(code ?? 1));
        child.on('error', () => resolve(1));
    });
}

async function isPortFree(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => server.close(() => resolve(true)));
        server.listen(port, '127.0.0.1');
    });
}

async function isUrlHealthy(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        return response.ok;
    } catch {
        return false;
    }
}

async function waitForUrl(url, timeoutMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await isUrlHealthy(url)) return true;
        await sleep(1000);
    }
    return false;
}

async function waitForAllRoutes(urls, timeoutMs = 120000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.all(urls.map((url) => isUrlHealthy(url)));
        if (results.every(Boolean)) return true;
        // eslint-disable-next-line no-await-in-loop
        await sleep(1000);
    }
    return false;
}

function startBackend() {
    const spec = getSpawnSpec(NPM_BIN, ['--prefix', '../backend', 'run', 'dev']);
    return spawn(spec.cmd, spec.args, {
        stdio: 'inherit',
        env: {
            ...process.env,
            PORT: String(BACKEND_PORT),
            CORS_ORIGIN: BASE_URL,
            FRONTEND_URL: BASE_URL,
            ADMIN_ORIGIN: BASE_URL,
        },
    });
}

function startNext() {
    const spec = getSpawnSpec(NPM_BIN, ['--prefix', '../frontend-next', 'run', 'start']);
    return spawn(spec.cmd, spec.args, {
        stdio: 'inherit',
        env: {
            ...process.env,
            NEXT_PUBLIC_API_BASE: BACKEND_ORIGIN,
            PORT: String(NEXT_PORT),
        },
    });
}

async function stopChild(child) {
    if (!child || child.killed || !child.pid) return;
    if (isWindows) {
        await new Promise((resolve) => {
            const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
            });
            killer.once('close', () => resolve(undefined));
            killer.once('error', () => resolve(undefined));
        });
        return;
    }

    child.kill('SIGTERM');
    await Promise.race([
        new Promise((resolve) => child.once('close', resolve)),
        sleep(5000).then(() => {
            if (!child.killed) child.kill('SIGKILL');
        }),
    ]);
}

async function main() {
    const extraArgs = process.argv.slice(2);
    let backendProcess = null;
    let nextProcess = null;
    let testCode = 1;

    const reuseBackend = REUSE_EXISTING && await isUrlHealthy(BACKEND_HEALTH_URL);
    const reuseNext = REUSE_EXISTING && await isUrlHealthy(BASE_URL);

    if (!reuseBackend) {
        const backendPortFree = await isPortFree(BACKEND_PORT);
        if (!backendPortFree) {
            console.error(`[next-smoke] Backend port ${BACKEND_PORT} is busy. Free it or run with E2E_REUSE_EXISTING=true.`);
            process.exitCode = 1;
            return;
        }
        backendProcess = startBackend();
        const backendReady = await waitForUrl(BACKEND_HEALTH_URL, 150000);
        if (!backendReady) {
            console.error(`[next-smoke] Backend did not become healthy at ${BACKEND_HEALTH_URL}`);
            await stopChild(backendProcess);
            process.exitCode = 1;
            return;
        }
    }

    if (!reuseNext) {
        const nextPortFree = await isPortFree(NEXT_PORT);
        if (!nextPortFree) {
            console.error(`[next-smoke] Next port ${NEXT_PORT} is busy. Free it or run with E2E_REUSE_EXISTING=true.`);
            await stopChild(backendProcess);
            process.exitCode = 1;
            return;
        }

        if (BUILD_NEXT) {
            const buildCode = await run(
                NPM_BIN,
                ['--prefix', '../frontend-next', 'run', 'build'],
                {
                    env: {
                        ...process.env,
                        NEXT_PUBLIC_API_BASE: BACKEND_ORIGIN,
                    },
                },
            );
            if (buildCode !== 0) {
                await stopChild(backendProcess);
                process.exitCode = buildCode;
                return;
            }
        }

        nextProcess = startNext();
        const nextReady = await waitForAllRoutes([
            BASE_URL,
            `${BASE_URL}/news`,
            `${BASE_URL}/student`,
            `${BASE_URL}/admin-dashboard`,
        ], 150000);
        if (!nextReady) {
            console.error('[next-smoke] Next frontend did not become healthy across the required hybrid routes.');
            await stopChild(nextProcess);
            await stopChild(backendProcess);
            process.exitCode = 1;
            return;
        }
        await sleep(1500);
    }

    const prepareCode = await run(
        NPM_BIN,
        ['--prefix', '../backend', 'run', 'e2e:prepare'],
        {
            env: {
                ...process.env,
                E2E_BASE_URL: BASE_URL,
            },
        },
    );
    if (prepareCode !== 0) {
        await stopChild(nextProcess);
        await stopChild(backendProcess);
        process.exitCode = prepareCode;
        return;
    }

    try {
        testCode = await run(
            NPX_BIN,
            ['playwright', 'test', 'e2e/next-smoke.spec.ts', ...extraArgs],
            {
                env: {
                    ...process.env,
                    E2E_BASE_URL: BASE_URL,
                    E2E_API_BASE_URL: BACKEND_ORIGIN,
                },
            },
        );
    } finally {
        await run(NPM_BIN, ['--prefix', '../backend', 'run', 'e2e:restore']);
        await stopChild(nextProcess);
        await stopChild(backendProcess);
    }

    process.exitCode = testCode;
}

main();
