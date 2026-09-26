import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { nativeVersion, packageRoot } from '../lib/config.mjs';

const cargo = await readFile(join(packageRoot, 'codex', 'codex-rs', 'Cargo.toml'), 'utf8');
const version = cargo.match(/\[workspace.package\]\s*version = "([^"]+)"/)?.[1];
if (version !== nativeVersion) throw new Error(`Native version ${version} does not match ${nativeVersion}.`);
for (const directory of ['bin', 'lib', 'scripts', 'test']) {
  for (const file of await readdir(join(packageRoot, directory))) {
    if (!file.endsWith('.mjs')) continue;
    const checked = spawnSync(process.execPath, ['--check', join(packageRoot, directory, file)], { stdio: 'inherit' });
    if (checked.status !== 0) process.exit(checked.status || 1);
  }
}
console.log('Bootstrap syntax and native release version agree.');
