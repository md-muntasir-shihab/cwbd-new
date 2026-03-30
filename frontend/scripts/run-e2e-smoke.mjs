import { spawn } from 'child_process';
import net from 'net';

const isWindows = process.platform === 'win32';
const NPM_BIN = isWindows ? 'npm.cmd' : 'npm';
const NPX_BIN = isWindows ? 'npx.cmd' : 'npx';

const REQUESTED_BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 5003);
const REQUESTED_BACKEND_ORIGIN = (process.env.E2E_BACKEND_ORIGIN || `http://127.0.0.1:${REQUESTED_BACKEND_PORT}`).replace(/\/$/, '');
const REQUESTED_BACKEND_HEALTH_URL = process.env.E2E_BACKEND_HEALTH_URL || `${REQUESTED_BACKEND_ORIGIN}/api/health`;

const REQUESTED_FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 5175);
const REQUESTED_BASE_URL = (process.env.E2E_BASE_URL || `http://127.0.0.1:${REQUESTED_FRONTEND_PORT}`).replace(/\/$/, '');

const START_BACKEND = process.env.E2E_START_BACKEND !== 'false';
const START_FRONTEND = process.env.E2E_START_FRONTEND !== 'false';
const REUSE_EXISTING = process.env.E2E_REUSE_EXISTING === 'true';

function getSpawnSpec(cmd, args = []) {
    if (isWindows && /\.(cmd|bat)$/i.test(String(cmd || ''))) {
        return {
            cmd: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return { cmd, args };
}

async function isPortFree(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close(() => resolve(true));
        });
        server.listen(port);
    });
}

async function findAvailablePort(startPort, maxAttempts = 50) {
    for (let i = 0; i < maxAttempts; i += 1) {
        const candidate = startPort + i;
        // eslint-disable-next-line no-await-in-loop
        const free = await isPortFree(candidate);
        if (free) return candidate;
    }
    throw new Error(`No free port found from ${startPort} within ${maxAttempts} attempts`);
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isUrlHealthy(url) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        return response.ok;
    } catch {
        return false;
    }
}

async function waitForUrl(url, timeoutMs = 90_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await isUrlHealthy(url)) return true;
        await sleep(1000);
    }
    return false;
}

function startBackendDevServer(backendPort, baseUrl) {
    const spec = getSpawnSpec(NPM_BIN, ['run', 'dev']);
    return spawn(spec.cmd, spec.args, {
        cwd: '../backend',
        stdio: 'inherit',
        env: {
            ...process.env,
            PORT: String(backendPort),
            CORS_ORIGIN: baseUrl,
        },
    });
}

function startFrontendDevServer(frontendPort, backendOrigin) {
    const spec = getSpawnSpec(NPM_BIN, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(frontendPort)]);
    return spawn(
        spec.cmd,
        spec.args,
        {
            cwd: process.cwd(),
            stdio: 'inherit',
            env: {
                ...process.env,
                VITE_API_PROXY_TARGET: backendOrigin,
                VITE_PORT: String(frontendPort),
            },
        }
    );
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
    let testCode = 1;
    let backendProcess = null;
    let frontendProcess = null;
    let backendPort = REQUESTED_BACKEND_PORT;
    let backendOrigin = REQUESTED_BACKEND_ORIGIN;
    let backendHealthUrl = REQUESTED_BACKEND_HEALTH_URL;
    let frontendPort = REQUESTED_FRONTEND_PORT;
    let baseUrl = REQUESTED_BASE_URL;

    if (START_BACKEND) {
        const canReuseBackend = REUSE_EXISTING && await isUrlHealthy(REQUESTED_BACKEND_HEALTH_URL);
        if (canReuseBackend) {
            backendPort = REQUESTED_BACKEND_PORT;
            backendOrigin = REQUESTED_BACKEND_ORIGIN;
            backendHealthUrl = REQUESTED_BACKEND_HEALTH_URL;
        } else {
            backendPort = await findAvailablePort(REQUESTED_BACKEND_PORT);
            backendOrigin = `http://127.0.0.1:${backendPort}`;
            backendHealthUrl = `${backendOrigin}/api/health`;
            backendProcess = startBackendDevServer(backendPort, baseUrl);
            const backendHealthy = await waitForUrl(backendHealthUrl, 120_000);
            if (!backendHealthy) {
                console.error(`[e2e-smoke] Backend did not become healthy: ${backendHealthUrl}`);
                await stopChild(backendProcess);
                process.exitCode = 1;
                return;
            }
        }
    } else {
        const backendHealthy = await waitForUrl(backendHealthUrl, 20_000);
        if (!backendHealthy) {
            console.error(`[e2e-smoke] Backend health check failed: ${backendHealthUrl}`);
            process.exitCode = 1;
            return;
        }
    }

    if (START_FRONTEND) {
        const canReuseFrontend = REUSE_EXISTING && await isUrlHealthy(REQUESTED_BASE_URL);
        if (canReuseFrontend) {
            frontendPort = REQUESTED_FRONTEND_PORT;
            baseUrl = REQUESTED_BASE_URL;
        } else {
            frontendPort = await findAvailablePort(REQUESTED_FRONTEND_PORT);
            baseUrl = `http://127.0.0.1:${frontendPort}`;
            frontendProcess = startFrontendDevServer(frontendPort, backendOrigin);
            const frontendHealthy = await waitForUrl(baseUrl, 120_000);
            if (!frontendHealthy) {
                console.error(`[e2e-smoke] Frontend did not become healthy at ${baseUrl}`);
                await stopChild(frontendProcess);
                await stopChild(backendProcess);
                process.exitCode = 1;
                return;
            }
        }
    }

    const prepareCode = await run(
        NPM_BIN,
        ['--prefix', '../backend', 'run', 'e2e:prepare'],
        {
            env: {
                ...process.env,
                E2E_BASE_URL: baseUrl,
            },
        }
    );
    if (prepareCode !== 0) {
        await stopChild(frontendProcess);
        await stopChild(backendProcess);
        process.exitCode = prepareCode;
        return;
    }

    try {
        testCode = await run(
            NPX_BIN,
            ['playwright', 'test', ...extraArgs],
            {
                env: {
                    ...process.env,
                    E2E_BASE_URL: baseUrl,
                    E2E_API_BASE_URL: process.env.E2E_API_BASE_URL || backendOrigin,
                },
            }
        );
    } finally {
        await run(NPM_BIN, ['--prefix', '../backend', 'run', 'e2e:restore']);
        await stopChild(frontendProcess);
        await stopChild(backendProcess);
    }

    process.exitCode = testCode;
}

main();
