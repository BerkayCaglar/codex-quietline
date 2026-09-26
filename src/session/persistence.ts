import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { object, text } from '../protocol/json.js';

export function statePath(): string {
  const base =
    process.platform === 'win32'
      ? (process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'))
      : (process.env.XDG_STATE_HOME ?? join(homedir(), '.local', 'state'));
  return join(base, 'codex-quietline', 'last-session.json');
}
export async function saveSession(id: string, cwd: string, path = statePath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify({ version: 1, threadId: id, cwd }, null, 2) + '\n', {
    mode: 0o600,
  });
  await rename(temporary, path);
}
export async function lastSession(path = statePath()): Promise<{ id: string; cwd: string }> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error(
      'No readable saved Quietline session. Use --resume THREAD_ID or start a new session.',
    );
  }
  const saved = object(value);
  if (!text(saved.threadId) || !text(saved.cwd))
    throw new Error('The saved session record is incomplete. Use --resume THREAD_ID.');
  return { id: text(saved.threadId), cwd: text(saved.cwd) };
}
