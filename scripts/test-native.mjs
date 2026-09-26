import spawn from 'cross-spawn';
import { join } from 'node:path';
import { packageRoot } from '../lib/config.mjs';
import { prepareNative } from './prepare-native.mjs';

await prepareNative();
// Native snapshots assume a generic ANSI terminal, independent of the developer's host UI.
const env = { ...process.env, TERM: 'xterm-256color', TERM_PROGRAM: 'quietline-tests' };
for (const key of ['NO_COLOR', 'TERM_PROGRAM_VERSION', 'TMUX', 'TMUX_PANE']) delete env[key];
// Unoptimized native async test futures exceed the upstream 8 MiB Windows thread stack.
const stack = process.platform === 'win32' ? ['--set', 'rust_min_stack', '16777216'] : [];
const args = process.argv.slice(2);
const concurrency = args.some(arg => arg === '--test-threads' || arg.startsWith('--test-threads=') || /^-j\d*$/.test(arg))
  ? [] : ['--test-threads', '2'];
const child = spawn('just', [...stack, 'test', ...concurrency, ...args], {
  cwd: join(packageRoot, 'codex', 'codex-rs'), stdio: 'inherit', env,
});
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
