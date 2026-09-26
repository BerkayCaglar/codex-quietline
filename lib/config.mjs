import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
export const upstream = JSON.parse(readFileSync(join(packageRoot, 'upstream.json'), 'utf8'));
export const platforms = JSON.parse(readFileSync(join(packageRoot, 'platforms.json'), 'utf8'));
export const repository = 'BerkayCaglar/codex-quietline';
export const nativeVersion = `${upstream.version}+quietline.${metadata.version}`;

export function dataRoot(platform = process.platform, env = process.env) {
  if (env.QUIETLINE_HOME) {
    if (!isAbsolute(env.QUIETLINE_HOME)) throw new Error('QUIETLINE_HOME must be an absolute path.');
    return env.QUIETLINE_HOME;
  }
  return platform === 'win32'
    ? join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'codex-quietline')
    : join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'codex-quietline');
}

export function target(platform = process.platform, arch = process.arch) {
  const key = `${platform}-${arch}`;
  if (!platforms[key]) throw new Error(`No native Quietline package for ${key}. See the source-build instructions.`);
  return { key, triple: platforms[key].triple, executable: platform === 'win32' ? 'codex.exe' : 'codex' };
}

export function inside(root, candidate) {
  const base = resolve(root);
  const path = resolve(candidate);
  if (!path.startsWith(base + sep)) throw new Error(`Path is outside the managed directory: ${path}`);
  return path;
}

export function installedDirectory(root = dataRoot()) {
  return join(root, 'versions', metadata.version, target().key);
}

export function assetName() {
  return `codex-quietline-${metadata.version}-${target().key}.tar.gz`;
}
