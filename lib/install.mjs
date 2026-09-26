import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { x as extract } from 'tar';
import { assetName, dataRoot, inside, installedDirectory, metadata, nativeVersion, repository, target } from './config.mjs';

export async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export async function validateBundle(directory) {
  const release = JSON.parse(await readFile(join(directory, 'quietline-release.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(directory, 'codex-package.json'), 'utf8'));
  if (release.version !== metadata.version || release.target !== target().triple || manifest.version !== nativeVersion) {
    throw new Error('The native bundle does not match this Quietline version or platform.');
  }
  if (manifest.layoutVersion !== 1 || manifest.target !== target().triple || manifest.entrypoint !== `bin/${target().executable}` || manifest.pathDir !== 'codex-path' || manifest.resourcesDir !== 'codex-resources') throw new Error('Unsupported native package layout.');
  const extension = process.platform === 'win32' ? '.exe' : '';
  const required = [`bin/codex-code-mode-host${extension}`, `codex-path/rg${extension}`];
  if (process.platform === 'win32') required.push('codex-resources/codex-command-runner.exe', 'codex-resources/codex-windows-sandbox-setup.exe');
  else required.push('codex-resources/zsh/bin/zsh');
  if (process.platform === 'linux') required.push('codex-resources/bwrap');
  for (const resource of required) {
    const path = inside(directory, join(directory, resource));
    inside(await realpath(directory), await realpath(path));
    if (!(await stat(path)).isFile()) throw new Error(`Required native resource is missing: ${resource}`);
  }
  const executable = inside(directory, join(directory, manifest.entrypoint));
  inside(await realpath(directory), await realpath(executable));
  if (!(await stat(executable)).isFile()) throw new Error('The native Codex entrypoint is missing.');
  return { executable, pathDirectory: inside(directory, join(directory, manifest.pathDir)), directory };
}

async function download(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
}

/** Stage and verify before publishing a version directory; never overwrite a running binary. */
export async function ensureInstalled({ root = dataRoot(), archive, sha256, report = console.error } = {}) {
  const destination = installedDirectory(root);
  if (!archive) {
    try { return await validateBundle(destination); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (archive && !/^[a-f\d]{64}$/i.test(sha256 || '')) throw new Error('--archive requires its --sha256 checksum.');
  await mkdir(root, { recursive: true });
  const stage = inside(root, join(root, `.install-${randomUUID()}`));
  await mkdir(stage);
  try {
    let source = archive && resolve(archive);
    let expected = sha256;
    if (!source) {
      const base = `https://github.com/${repository}/releases/download/v${metadata.version}`;
      const response = await fetch(`${base}/checksums.json`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Quietline ${metadata.version} native assets are unavailable (${response.status}).`);
      expected = (await response.json())[assetName()];
      if (!/^[a-f\d]{64}$/i.test(expected || '')) throw new Error('Release checksum is missing or invalid.');
      report(`Downloading native Quietline ${metadata.version} for ${target().key}…`);
      source = join(stage, 'download.tar.gz');
      await download(`${base}/${assetName()}`, source);
    }
    if ((await digest(source)) !== expected.toLowerCase()) throw new Error('Native bundle checksum mismatch. Nothing was installed.');
    const unpacked = join(stage, 'package');
    await mkdir(unpacked);
    await extract({ file: source, cwd: unpacked, preservePaths: false, strict: true });
    await validateBundle(unpacked);
    await mkdir(join(destination, '..'), { recursive: true });
    try { await rename(unpacked, destination); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error;
      await validateBundle(destination);
    }
    return await validateBundle(destination);
  } finally {
    await rm(inside(root, stage), { recursive: true, force: true });
  }
}
