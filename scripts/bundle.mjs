import { cp, chmod, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { c as create } from 'tar';
import { metadata, upstream, nativeVersion, packageRoot, target, inside } from '../lib/config.mjs';
import { digest } from '../lib/install.mjs';
import { withUpstreamPayload } from './upstream-payload.mjs';

const { values } = parseArgs({ options: { binary: { type: 'string' }, output: { type: 'string', default: 'release-out' }, platform: { type: 'string', default: process.platform }, arch: { type: 'string', default: process.arch } } });
if (!values.binary) throw new Error('Pass --binary with the newly built native Codex executable.');
const selected = target(values.platform, values.arch);
const temporaryRoot = join(packageRoot, '.agent-tmp');
const stage = inside(temporaryRoot, join(temporaryRoot, `bundle-${randomUUID()}`));
await mkdir(stage, { recursive: true });
const output = resolve(values.output);
await mkdir(output, { recursive: true });
try {
  const payload = join(stage, 'payload');
  const { specification, integrity } = await withUpstreamPayload(selected, async source => {
    await cp(source.payload, payload, { recursive: true, verbatimSymlinks: true });
    return source;
  });
  const manifestPath = join(payload, 'codex-package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.target !== selected.triple || manifest.version !== upstream.version) throw new Error('Unexpected upstream package identity.');
  if (selected.triple.includes('-linux-')) {
    const build = JSON.parse(await readFile(`${resolve(values.binary)}.quietline-build.json`, 'utf8'));
    if (build.binarySha256 !== await digest(resolve(values.binary)) || build.bwrapSha256 !== await digest(join(payload, 'codex-resources', 'bwrap'))) {
      throw new Error('Native build does not attest to this binary and bundled bwrap. Run build:native before bundling.');
    }
  }
  await cp(resolve(values.binary), inside(payload, join(payload, manifest.entrypoint)));
  await chmod(join(payload, manifest.entrypoint), 0o755);
  manifest.version = nativeVersion;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(payload, 'quietline-release.json'), JSON.stringify({ version: metadata.version, target: selected.triple, upstreamCommit: upstream.commit, upstreamPayload: specification, upstreamIntegrity: integrity }, null, 2) + '\n');
  await cp(join(packageRoot, 'LICENSE'), join(payload, 'LICENSE'));
  await cp(join(packageRoot, 'NOTICE'), join(payload, 'NOTICE'));
  const filename = `codex-quietline-${metadata.version}-${selected.key}.tar.gz`;
  await create({ gzip: true, file: join(output, filename), cwd: payload, portable: true }, ['.']);
  const checksum = await digest(join(output, filename));
  await writeFile(join(output, `checksums-${selected.key}.json`), JSON.stringify({ [filename]: checksum }, null, 2) + '\n');
  console.log(`${filename}\nsha256:${checksum}`);
} finally { await rm(inside(temporaryRoot, stage), { recursive: true, force: true }); }
