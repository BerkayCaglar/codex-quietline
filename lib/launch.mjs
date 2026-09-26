import spawn from 'cross-spawn';
import { delimiter } from 'node:path';
import { ensureInstalled } from './install.mjs';
import { packageRoot } from './config.mjs';

/** Native Codex owns stdin, rendering, slash commands, sessions and approvals. */
export async function launch(args) {
  const bundle = await ensureInstalled();
  const env = { ...process.env, PATH: [bundle.pathDirectory, process.env.PATH || ''].join(delimiter), CODEX_MANAGED_BY_NPM: '1', CODEX_MANAGED_PACKAGE_ROOT: packageRoot };
  for (const key of ['CODEX_MANAGED_BY_BUN', 'CODEX_MANAGED_BY_PNPM', 'CODEX_MANAGED_BY_VITE_PLUS']) delete env[key];
  const child = spawn(bundle.executable, args, { stdio: 'inherit', env });
  const forward = signal => { if (!child.killed) child.kill(signal); };
  const handlers = ['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => {
    const handler = () => forward(signal);
    process.on(signal, handler);
    return [signal, handler];
  });
  let termination;
  try {
    termination = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
  } finally { for (const [signal, handler] of handlers) process.off(signal, handler); }
  if (termination.signal) process.kill(process.pid, termination.signal);
  else process.exitCode = termination.code ?? 1;
}
