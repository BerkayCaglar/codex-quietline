import { readdir, readFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { metadata, platforms } from '../lib/config.mjs';
import { digest } from '../lib/install.mjs';

const source = resolve(process.argv[2] || '.agent-tmp/artifacts');
const output = resolve(process.argv[3] || 'release-out');
await mkdir(output, { recursive: true });
const entries = await readdir(source, { recursive: true, withFileTypes: true });
const checksums = {};
for (const key of Object.keys(platforms)) {
  const filename = `codex-quietline-${metadata.version}-${key}.tar.gz`;
  const matches = entries.filter(entry => entry.isFile() && entry.name === filename);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${filename}, found ${matches.length}.`);
  const entry = matches[0];
  const checksum = JSON.parse(await readFile(join(entry.parentPath, `checksums-${key}.json`), 'utf8'))[filename];
  const path = join(entry.parentPath, filename);
  if (checksum !== await digest(path)) throw new Error(`Artifact checksum mismatch: ${filename}`);
  await cp(path, join(output, filename));
  checksums[filename] = checksum;
}
checksums['codex-quietline.tgz'] = await digest(join(output, 'codex-quietline.tgz'));
await writeFile(join(output, 'checksums.json'), JSON.stringify(checksums, null, 2) + '\n');
console.log(`Verified ${Object.keys(platforms).length} native archives and the bootstrap.`);
