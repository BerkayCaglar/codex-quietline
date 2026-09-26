import spawn from 'cross-spawn';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repository, metadata, inside } from './config.mjs';

export function isNewerRelease(tag, current) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || !/^\d+\.\d+\.\d+$/.test(current)) throw new Error('Unsupported release version.');
  const latest = tag.slice(1).split('.').map(Number);
  const installed = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (latest[i] !== installed[i]) return latest[i] > installed[i];
  return false;
}

export function upgradeCommands(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Unsupported release tag.');
  const url = `https://github.com/${repository}/releases/download/${tag}/codex-quietline.tgz`;
  return [
    ['npm', ['exec', '--yes', '--package', url, '--', 'codex-quietline', 'setup', '--download-only']],
    ['npm', ['install', '--global', url]],
    ['codex-quietline', ['setup']],
  ];
}

export async function upgrade({ fetchRelease = fetch, spawnCommand = spawn } = {}) {
  const response = await fetchRelease(`https://api.github.com/repos/${repository}/releases/latest`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Release lookup failed (${response.status}).`);
  const release = await response.json();
  if (!isNewerRelease(release.tag_name, metadata.version)) { console.log('Quietline is up to date.'); return; }
  // Project-local executables and npm configuration must not influence a global upgrade.
  const temporaryRoot = tmpdir();
  const cwd = await mkdtemp(join(temporaryRoot, 'quietline-upgrade-'));
  try {
    // Anchor npm's project lookup here, even if a parent temporary directory has a package.json.
    await writeFile(join(cwd, 'package.json'), '{"private":true}\n');
    // Prepare the new native payload before changing the globally installed bootstrap.
    for (const [command, args] of upgradeCommands(release.tag_name)) {
      await new Promise((resolve, reject) => {
        const child = spawnCommand(command, args, { stdio: 'inherit', cwd });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}).`)));
      });
    }
  } finally { await rm(inside(temporaryRoot, cwd), { recursive: true, force: true }); }
}
