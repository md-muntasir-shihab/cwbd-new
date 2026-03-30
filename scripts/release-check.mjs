import { spawn } from 'child_process';
import path from 'path';
import process from 'process';

const isWindows = process.platform === 'win32';
const NPM_BIN = isWindows ? 'npm.cmd' : 'npm';
const GIT_BIN = isWindows ? 'git.exe' : 'git';
const ROOT_DIR = process.cwd();

function getSpawnSpec(cmd, args = []) {
    if (isWindows && /\.(cmd|bat)$/i.test(String(cmd || ''))) {
        return {
            cmd: process.env.ComSpec || 'cmd.exe',
            args: ['/d', '/s', '/c', cmd, ...args],
        };
    }

    return { cmd, args };
}

const steps = [
    { name: 'backend build', cwd: path.join(ROOT_DIR, 'backend'), cmd: NPM_BIN, args: ['run', 'build'] },
    { name: 'backend test:home', cwd: path.join(ROOT_DIR, 'backend'), cmd: NPM_BIN, args: ['run', 'test:home'] },
    { name: 'frontend lint', cwd: path.join(ROOT_DIR, 'frontend'), cmd: NPM_BIN, args: ['run', 'lint'] },
    { name: 'frontend build', cwd: path.join(ROOT_DIR, 'frontend'), cmd: NPM_BIN, args: ['run', 'build'] },
    { name: 'frontend-next build', cwd: path.join(ROOT_DIR, 'frontend-next'), cmd: NPM_BIN, args: ['run', 'build'] },
];

function run(cmd, args, cwd) {
    return new Promise((resolve) => {
        const spec = getSpawnSpec(cmd, args);
        const child = spawn(spec.cmd, spec.args, {
            cwd,
            stdio: 'inherit',
        });
        child.on('close', (code) => resolve(code ?? 1));
        child.on('error', () => resolve(1));
    });
}

async function getGitStatus() {
    const chunks = [];
    const child = spawn(GIT_BIN, ['status', '--porcelain'], {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'inherit'],
    });

    child.stdout.on('data', (chunk) => chunks.push(chunk));

    const code = await new Promise((resolve) => {
        child.on('close', (closeCode) => resolve(closeCode ?? 1));
        child.on('error', () => resolve(1));
    });

    if (code !== 0) {
        throw new Error('git status --porcelain failed.');
    }

    return Buffer.concat(chunks).toString('utf-8').trim();
}

async function main() {
    const baselineStatus = await getGitStatus();

    for (const step of steps) {
        console.log(`\n[release-check] Running ${step.name}...`);
        const code = await run(step.cmd, step.args, step.cwd);
        if (code !== 0) {
            process.exitCode = code;
            return;
        }
    }

    console.log('\n[release-check] Verifying git tree matches baseline...');
    const finalStatus = await getGitStatus();
    if (finalStatus !== baselineStatus) {
        throw new Error(
            [
                'Workspace changed during release checks.',
                'Baseline:',
                baselineStatus || '(clean)',
                'After:',
                finalStatus || '(clean)',
            ].join('\n'),
        );
    }
    console.log('[release-check] All checks passed.');
}

main().catch((error) => {
    console.error(`[release-check] ${String(error?.message || error)}`);
    process.exitCode = 1;
});
