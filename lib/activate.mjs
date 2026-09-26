import { mkdir, readFile, writeFile, rename, rm, lstat, realpath, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataRoot, inside, packageRoot } from './config.mjs';

const exec = promisify(execFile);
const hash = text => createHash('sha256').update(text).digest('hex');
const quoteSh = value => `'${value.replaceAll("'", "'\\''")}'`;
const quotePs = value => `'${value.replaceAll("'", "''")}'`;
const markerStart = '# >>> codex-quietline >>>';
const markerEnd = '# <<< codex-quietline <<<';

export function windowsPathScript(directory, add) {
  return `$ErrorActionPreference='Stop'
$quietlineDirectory=${quotePs(directory)}
$quietlinePrior=[Environment]::GetEnvironmentVariable('Path','User')
$quietlineParts=@($quietlinePrior -split ';' | Where-Object { $_ -and -not $_.Equals($quietlineDirectory,[StringComparison]::OrdinalIgnoreCase) })
$quietlinePresent=@($quietlinePrior -split ';' | Where-Object { $_.Equals($quietlineDirectory,[StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
$quietlineNext=${add ? "(@($quietlineDirectory)+$quietlineParts) -join ';'" : "$quietlineParts -join ';'"}
[Environment]::SetEnvironmentVariable('Path',$quietlineNext,'User')
@{added=(${add ? '$true' : '$false'} -and -not $quietlinePresent)} | ConvertTo-Json -Compress`;
}

async function windowsPath(directory, add) {
  const encoded = Buffer.from(windowsPathScript(directory, add), 'utf16le').toString('base64');
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true });
  return JSON.parse(stdout);
}

export function shellBlock(directory, shell) {
  const command = shell === 'fish'
    ? `fish_add_path --path ${quoteSh(directory)}`
    : `export PATH=${quoteSh(directory)}:"$PATH"`;
  return `${markerStart}\n${command}\n${markerEnd}\n`;
}

export function removeShellBlock(content) {
  const start = content.indexOf(markerStart);
  if (start < 0) return content;
  const end = content.indexOf(markerEnd, start);
  if (end < 0) throw new Error('The Quietline shell block was edited; remove it manually.');
  return content.slice(0, start) + content.slice(end + markerEnd.length).replace(/^\r?\n/, '');
}

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return ''; }
}

async function atomicWrite(path, content, mode = 0o600) {
  let destination = path;
  try {
    if ((await lstat(path)).isSymbolicLink()) destination = await realpath(path);
    mode = (await stat(destination)).mode & 0o777;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { mode });
  await rename(temporary, destination);
}

export async function activate({ root = dataRoot(), platform = process.platform, home = homedir(), shell = basename(process.env.SHELL || 'bash'), changeWindowsPath = windowsPath } = {}) {
  const directory = inside(root, join(root, 'shims'));
  await mkdir(directory, { recursive: true });
  const stateFile = join(root, 'activation.json');
  const prior = JSON.parse(await readOptional(stateFile) || '{}');
  const files = {
    'quietline-native.mjs': `import ${JSON.stringify(pathToFileURL(join(packageRoot, 'bin', 'native.mjs')).href)};\n`,
    ...(platform === 'win32' ? {
      'codex.cmd': '@echo off\r\nnode "%~dp0quietline-native.mjs" %*\r\n',
      'codex.ps1': '& node (Join-Path $PSScriptRoot \'quietline-native.mjs\') @args\nexit $LASTEXITCODE\n',
    } : { codex: '#!/bin/sh\nexec node "$(dirname "$0")/quietline-native.mjs" "$@"\n' }),
  };
  for (const [name, content] of Object.entries(files)) {
    const existing = await readOptional(join(directory, name));
    if (existing && existing !== content && hash(existing) !== prior.files?.[name]) throw new Error(`Refusing to overwrite an edited launcher: ${name}`);
  }
  for (const [name, content] of Object.entries(files)) await atomicWrite(join(directory, name), content, 0o755);
  let addedPath = prior.addedPath || false;
  const profiles = prior.profiles || (prior.profile ? [prior.profile] : []);
  if (platform === 'win32') addedPath = (await changeWindowsPath(directory, true)).added || addedPath;
  else {
    const profile = shell === 'fish' ? join(home, '.config', 'fish', 'config.fish') : join(home, shell === 'zsh' ? '.zshrc' : '.bashrc');
    await mkdir(join(profile, '..'), { recursive: true });
    const existing = removeShellBlock(await readOptional(profile));
    await atomicWrite(profile, existing + (existing.endsWith('\n') || !existing ? '' : '\n') + shellBlock(directory, shell));
    if (!profiles.includes(profile)) profiles.push(profile);
    addedPath = true;
  }
  await atomicWrite(stateFile, JSON.stringify({ directory, addedPath, profiles, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, hash(content)])) }, null, 2) + '\n');
  return directory;
}

export async function deactivate({ root = dataRoot(), platform = process.platform, changeWindowsPath = windowsPath } = {}) {
  const stateFile = join(root, 'activation.json');
  const raw = await readOptional(stateFile);
  if (!raw) return;
  const state = JSON.parse(raw);
  const directory = inside(root, state.directory);
  for (const [name, expected] of Object.entries(state.files)) {
    const content = await readOptional(inside(directory, join(directory, name)));
    if (content && hash(content) !== expected) throw new Error(`The launcher ${name} was edited. Restore or remove it manually before deactivating.`);
  }
  if (state.addedPath) {
    if (platform === 'win32') await changeWindowsPath(directory, false);
    else for (const profile of state.profiles || (state.profile ? [state.profile] : [])) await atomicWrite(profile, removeShellBlock(await readOptional(profile)));
  }
  for (const name of Object.keys(state.files)) await rm(inside(directory, join(directory, name)), { force: true });
  await rm(stateFile);
}
