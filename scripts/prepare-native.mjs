import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageRoot, target } from '../lib/config.mjs';

export function migrationBytes(content, triple) {
  const lf = content.replaceAll('\r\n', '\n');
  return triple.includes('-windows-') ? lf.replaceAll('\n', '\r\n') : lf;
}

/** SQLx hashes source bytes. Reproduce the pinned official target's checkout bytes. */
export async function prepareNative(triple = target().triple, root = join(packageRoot, 'codex', 'codex-rs')) {
  let changed = 0;
  const directories = [root];
  while (directories.length) {
    const directory = directories.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !['target', '.git', 'node_modules'].includes(entry.name)) {
        directories.push(path);
      } else if (entry.isFile() && entry.name.endsWith('.sql')) {
        const before = await readFile(path, 'utf8');
        const after = migrationBytes(before, triple);
        if (before !== after) { await writeFile(path, after); changed++; }
      }
    }
  }
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Prepared ${await prepareNative(process.argv[2])} SQL files for the native target.`);
}
