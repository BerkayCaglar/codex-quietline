import { mkdir, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import spawn from 'cross-spawn';
import { x as extract } from 'tar';
import { upstream, packageRoot, inside } from '../lib/config.mjs';

/** Use the same immutable official platform payload for build guards and packaging. */
export async function withUpstreamPayload(selected, consume) {
  const temporaryRoot = join(packageRoot, '.agent-tmp');
  const stage = inside(temporaryRoot, join(temporaryRoot, `payload-${randomUUID()}`));
  await mkdir(stage, { recursive: true });
  try {
    const specification = `@openai/codex@${upstream.version}-${selected.key}`;
    const packed = spawn.sync('npm', ['pack', specification, '--ignore-scripts', '--json', '--pack-destination', stage], { encoding: 'utf8' });
    if (packed.status !== 0) throw new Error(packed.stderr || 'Could not fetch the pinned official platform package.');
    const [info] = JSON.parse(packed.stdout);
    await extract({ file: join(stage, info.filename), cwd: stage, strict: true, preservePaths: false });
    const payload = join(stage, 'package', 'vendor', selected.triple);
    const manifest = JSON.parse(await readFile(join(payload, 'codex-package.json'), 'utf8'));
    if (manifest.target !== selected.triple || manifest.version !== upstream.version) throw new Error('Unexpected upstream package identity.');
    return await consume({ payload, manifest, specification, integrity: info.integrity });
  } finally { await rm(inside(temporaryRoot, stage), { recursive: true, force: true }); }
}
