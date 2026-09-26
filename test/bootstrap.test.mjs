import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { c as create } from 'tar';
import { inside, metadata, nativeVersion, target } from '../lib/config.mjs';
import { ensureInstalled, digest, validateBundle } from '../lib/install.mjs';
import { activate, deactivate, shellBlock, removeShellBlock, windowsPathScript } from '../lib/activate.mjs';
import { upgrade, upgradeCommands, isNewerRelease } from '../lib/upgrade.mjs';
import { migrationBytes, prepareNative } from '../scripts/prepare-native.mjs';

async function temporary(t) {
  const path = await mkdtemp(join(tmpdir(), 'quietline-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function bundle(root) {
  const payload = join(root, 'payload');
  const ext = process.platform === 'win32' ? '.exe' : '';
  const files = [`bin/codex${ext}`, `bin/codex-code-mode-host${ext}`, `codex-path/rg${ext}`, ...(process.platform === 'win32' ? ['codex-resources/codex-command-runner.exe', 'codex-resources/codex-windows-sandbox-setup.exe'] : ['codex-resources/zsh/bin/zsh']), ...(process.platform === 'linux' ? ['codex-resources/bwrap'] : [])];
  for (const file of files) { await mkdir(join(payload, file, '..'), { recursive: true }); await writeFile(join(payload, file), 'fixture'); }
  await writeFile(join(payload, 'quietline-release.json'), JSON.stringify({ version: metadata.version, target: target().triple }));
  await writeFile(join(payload, 'codex-package.json'), JSON.stringify({ layoutVersion: 1, version: nativeVersion, target: target().triple, entrypoint: `bin/codex${ext}`, pathDir: 'codex-path', resourcesDir: 'codex-resources' }));
  const archive = join(root, 'fixture.tar.gz');
  await create({ file: archive, cwd: payload, gzip: true }, ['.']);
  return { archive, sha256: await digest(archive), payload };
}

test('verified installation publishes the complete package and is reusable offline', async t => {
  const temporaryRoot = await temporary(t);
  const fixture = await bundle(temporaryRoot);
  const root = join(temporaryRoot, 'installed');
  const first = await ensureInstalled({ root, ...fixture });
  const second = await ensureInstalled({ root });
  assert.deepEqual(first, second);
  assert.equal(await readFile(first.executable, 'utf8'), 'fixture');
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.install-')));
});

test('wrong checksums do not publish a package and staging is cleaned', async t => {
  const temporaryRoot = await temporary(t); const fixture = await bundle(temporaryRoot);
  const root = join(temporaryRoot, 'installed');
  await assert.rejects(ensureInstalled({ root, ...fixture, sha256: '0'.repeat(64) }), /checksum mismatch/);
  assert.deepEqual(await readdir(root), []);
});

test('missing native helpers fail package validation', async t => {
  const root = await temporary(t); const { payload } = await bundle(root);
  await rm(join(payload, 'codex-path', process.platform === 'win32' ? 'rg.exe' : 'rg'));
  await assert.rejects(validateBundle(payload));
});

test('managed cleanup rejects paths outside its root', () => {
  assert.throws(() => inside('/managed', '/managed-other/data'), /outside/);
  assert.throws(() => inside('/managed', '/managed/../outside'), /outside/);
});

test('activation preserves shell content and deactivation removes only the owned block', async t => {
  const root = await temporary(t); const home = join(root, 'home'); await mkdir(home);
  await writeFile(join(home, '.bashrc'), '# user settings\nexport EDITOR=vim\n');
  const options = { root: join(root, 'app'), home, platform: 'linux', shell: 'bash' };
  await activate(options); await activate(options);
  const active = await readFile(join(home, '.bashrc'), 'utf8');
  assert.equal(active.split('# >>> codex-quietline >>>').length, 2);
  await deactivate(options);
  assert.equal(await readFile(join(home, '.bashrc'), 'utf8'), '# user settings\nexport EDITOR=vim\n');
});

test('edited launchers are never overwritten or deleted', async t => {
  const root = await temporary(t); const changeWindowsPath = async () => ({ added: true });
  const options = { root, platform: 'win32', changeWindowsPath };
  const shims = await activate(options);
  await writeFile(join(shims, 'codex.cmd'), 'user edit');
  await assert.rejects(activate(options), /edited launcher/);
  await assert.rejects(deactivate(options), /was edited/);
  assert.equal(await readFile(join(shims, 'codex.cmd'), 'utf8'), 'user edit');
});

test('Windows reactivation reapplies PATH without forgetting ownership', async t => {
  const root = await temporary(t); const calls = [];
  const changeWindowsPath = async (_path, add) => { calls.push(add); return { added: calls.length === 1 }; };
  await activate({ root, platform: 'win32', changeWindowsPath });
  await activate({ root, platform: 'win32', changeWindowsPath });
  await deactivate({ root, platform: 'win32', changeWindowsPath });
  assert.deepEqual(calls, [true, true, false]);
});

test('shell and PowerShell paths are quoted as code literals', () => {
  const block = shellBlock("/home/a'b/bin", 'bash');
  assert.match(block, /'\\''/);
  assert.equal(removeShellBlock('before\n' + block + 'after\n'), 'before\nafter\n');
  assert.match(windowsPathScript("C:\\a'b\\bin", true), /a''b/);
});

test('upgrades prepare a pinned native release before replacing the bootstrap', () => {
  const plan = upgradeCommands('v0.3.0');
  assert.equal(plan[0][1].at(-1), '--download-only');
  assert.equal(plan[1][1][0], 'install');
  assert.deepEqual(plan[2], ['codex-quietline', ['setup']]);
  assert.ok(plan[0][1].includes(plan[1][1][2]));
  assert.throws(() => upgradeCommands('v1; shell'), /Unsupported/);
});

test('release precedence never downgrades an installed fork', () => {
  assert.equal(isNewerRelease('v0.2.0', '0.3.0'), false);
  assert.equal(isNewerRelease('v0.3.0', '0.3.0'), false);
  assert.equal(isNewerRelease('v0.10.0', '0.9.0'), true);
});

test('activation in multiple shells cleans every owned profile block', async t => {
  const root = await temporary(t); const home = join(root, 'home'); await mkdir(home);
  const options = { root: join(root, 'app'), home, platform: 'linux' };
  await activate({ ...options, shell: 'bash' });
  await activate({ ...options, shell: 'zsh' });
  await deactivate(options);
  assert.equal(await readFile(join(home, '.bashrc'), 'utf8'), '');
  assert.equal(await readFile(join(home, '.zshrc'), 'utf8'), '');
});

test('activation keeps a symlinked shell profile connected to its real file', { skip: process.platform === 'win32' }, async t => {
  const root = await temporary(t); const home = join(root, 'home'); await mkdir(home);
  const actual = join(root, 'dotfiles-bashrc'); await writeFile(actual, '# managed by user\n');
  await symlink(actual, join(home, '.bashrc'));
  const options = { root: join(root, 'app'), home, platform: 'linux', shell: 'bash' };
  await activate(options); await deactivate(options);
  assert.equal((await lstat(join(home, '.bashrc'))).isSymbolicLink(), true);
  assert.equal(await readFile(actual, 'utf8'), '# managed by user\n');
});

test('migration preparation matches official target bytes without changing SQL', () => {
  const sql = 'CREATE TABLE example (id TEXT);\n';
  assert.equal(migrationBytes(sql, 'x86_64-pc-windows-msvc'), 'CREATE TABLE example (id TEXT);\r\n');
  assert.equal(migrationBytes(sql.replaceAll('\n', '\r\n'), 'aarch64-unknown-linux-musl'), sql);
});

test('migration preparation excludes build outputs', async t => {
  const root = await temporary(t);
  await mkdir(join(root, 'state'));
  await mkdir(join(root, 'target'));
  const sql = 'CREATE TABLE example (id TEXT);\n';
  await writeFile(join(root, 'state', 'migration.sql'), sql);
  await writeFile(join(root, 'target', 'generated.sql'), sql);
  assert.equal(await prepareNative('x86_64-pc-windows-msvc', root), 1);
  assert.equal(await readFile(join(root, 'state', 'migration.sql'), 'utf8'), sql.replaceAll('\n', '\r\n'));
  assert.equal(await readFile(join(root, 'target', 'generated.sql'), 'utf8'), sql);
});

test('upgrades isolate their working directory and clean it on success or failure', async () => {
  for (const failFirst of [false, true]) {
    const calls = [];
    const run = upgrade({
      fetchRelease: async () => ({ ok: true, json: async () => ({ tag_name: 'v9.9.9' }) }),
      spawnCommand: (command, args, options) => {
        assert.notEqual(options.cwd, process.cwd());
        assert.equal(existsSync(options.cwd), true);
        assert.equal(existsSync(join(options.cwd, 'package.json')), true);
        inside(tmpdir(), options.cwd);
        writeFileSync(join(options.cwd, 'owned-marker'), 'temporary');
        calls.push({ command, args, cwd: options.cwd });
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('exit', failFirst ? 1 : 0));
        return child;
      },
    });
    if (failFirst) await assert.rejects(run, /npm failed/);
    else await run;
    assert.equal(calls.length, failFirst ? 1 : 3);
    for (const call of calls) assert.equal(existsSync(call.cwd), false);
  }
});
