import spawn from 'cross-spawn';
import { parseArgs } from 'node:util';
import { join, resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { packageRoot, platforms, target } from '../lib/config.mjs';
import { prepareNative } from './prepare-native.mjs';
import { withUpstreamPayload } from './upstream-payload.mjs';
import { digest } from '../lib/install.mjs';

const { values } = parseArgs({ options: { profile: { type: 'string', default: 'release' }, target: { type: 'string', default: target().triple } } });
await prepareNative(values.target);
const env = { ...process.env, CARGO_INCREMENTAL: '0', CARGO_PROFILE_RELEASE_DEBUG: '0', CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2' };
const selected = Object.entries(platforms).map(([key, value]) => ({ key, ...value })).find(value => value.triple === values.target);
if (!selected) throw new Error(`Unsupported build target: ${values.target}`);
if (selected.releaseLto !== undefined) env.CARGO_PROFILE_RELEASE_LTO ??= String(selected.releaseLto);
if (values.target.includes('-windows-')) env.LIBSQLITE3_FLAGS ||= 'SQLITE_DISABLE_INTRINSIC';
if (values.target.includes('-linux-')) {
  env.CODEX_BWRAP_SHA256 = await withUpstreamPayload(selected, ({ payload }) => digest(join(payload, 'codex-resources', 'bwrap')));
}
const revision = spawn.sync('git', ['rev-parse', 'HEAD'], { cwd: packageRoot, encoding: 'utf8' });
if (revision.status === 0) env.STABLE_GIT_COMMIT = revision.stdout.trim();
const child = spawn('cargo', ['build', '--locked', '--profile', values.profile, '--target', values.target, '-p', 'codex-cli', '--bin', 'codex'], { cwd: join(packageRoot, 'codex', 'codex-rs'), stdio: 'inherit', env });
const code = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
process.exitCode = code;
if (code === 0 && env.CODEX_BWRAP_SHA256) {
  const targetRoot = resolve(packageRoot, 'codex', 'codex-rs', env.CARGO_TARGET_DIR || 'target');
  const binary = join(targetRoot, values.target, values.profile === 'dev' ? 'debug' : values.profile, 'codex');
  await writeFile(`${binary}.quietline-build.json`, JSON.stringify({ binarySha256: await digest(binary), bwrapSha256: env.CODEX_BWRAP_SHA256 }) + '\n');
}
