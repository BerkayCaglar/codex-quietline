import { mkdir, writeFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';
import { SessionEngine } from '../src/session/engine.js';
import { CodexClient } from '../src/protocol/client.js';
import { errorMessage, object, text } from '../src/protocol/json.js';

// Inference is opt-in. This script never grants a permission or writes via Codex.
const live = process.argv.includes('--live');
const interrupt = process.argv.includes('--interrupt');
let interruptedId = '';
const client = new CodexClient({ cwd: process.cwd() });
const engine = new SessionEngine(client, { cwd: process.cwd(), readOnly: true });
const events: Record<string, unknown>[] = [];
const started = Date.now();
await mkdir('.agent-tmp', { recursive: true });
const tracePath = `.agent-tmp/smoke-${started}.jsonl`;
const trace = (value: Record<string, unknown>): void =>
  appendFileSync(tracePath, JSON.stringify({ at: Date.now(), ...value }) + '\n');
let cancelWait: ((error: Error) => void) | undefined;
let signalled = false;
const onSignal = (signal: string): void => {
  trace({ signal });
  if (signalled) return;
  signalled = true;
  process.exitCode = 1;
  cancelWait?.(new Error(`Smoke interrupted by ${signal}.`));
};
const signalHandlers = (
  process.platform === 'win32' ? ['SIGINT', 'SIGTERM', 'SIGBREAK'] : ['SIGINT', 'SIGTERM']
).map((signal) => {
  const handler = (): void => onSignal(signal);
  process.on(signal, handler);
  return { signal, handler };
});
client.on('notification', (event) => {
  const summary = {
    method: event.method,
    threadId: event.params.threadId,
    itemType: object(event.params.item).type,
    turnStatus: object(event.params.turn).status,
  };
  events.push(summary);
  trace(summary);
});
try {
  await engine.start();
  console.log('Handshake, account, model catalog, root thread, limits and discovery: passed.');
  console.log('Available models:', engine.models.map((m) => m.id).join(', '));
  if (live) {
    const small = engine.models.find((m) => /luna|mini/.test(text(m.id)));
    if (small) await engine.setModel(text(small.id));
    await engine.send(
      engine.store.rootId,
      interrupt
        ? 'This is a read-only terminal-client integration test. Do not read or write files or run shell commands. Spawn one subagent and ask it to write the integers 1 through 5000 in its final response. Wait for it. The test client will interrupt that child; if interrupted do not restart or replace it, just reply "interrupt acknowledged".'
        : 'This is a read-only terminal-client integration test. Do not read or write files or run shell commands. Explicitly spawn two subagents concurrently: one should answer only "amber", the other only "jade". Wait for both to finish, then reply "smoke complete".',
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Live smoke timed out.'));
      }, 180_000);
      cancelWait = (error) => {
        clearTimeout(timeout);
        clearInterval(interval);
        reject(error);
      };
      const interval = setInterval(() => {
        const root = engine.store.agents.get(engine.store.rootId)!;
        if (
          interrupt &&
          interruptedId &&
          engine.store.agents.get(interruptedId)?.lastTurnStatus === 'interrupted'
        ) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
          return;
        }
        if (interrupt && !interruptedId) {
          const active = engine.store.tree().find((row) => row.depth > 0 && row.agent.turnId);
          if (active) {
            interruptedId = active.agent.id;
            void engine
              .interrupt(interruptedId)
              .then(() => console.log('Interrupt request accepted for the real child.'))
              .catch((error) => {
                clearInterval(interval);
                clearTimeout(timeout);
                reject(error);
              });
          }
        }
        if (root.error || engine.store.connection === 'disconnected') {
          clearTimeout(timeout);
          clearInterval(interval);
          reject(new Error(root.error || engine.store.notice));
        } else if (root.lastTurnStatus === 'completed' && !root.turnId) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve();
        }
      }, 200);
    });
    await engine.discover();
    const children = engine.store.tree().filter((row) => row.depth > 0);
    if (children.length < (interrupt ? 1 : 2))
      throw new Error(`Expected ${interrupt ? 1 : 2} real child agents; found ${children.length}.`);
    for (const { agent } of children) {
      await engine.select(agent.id);
      if (!interrupt && !agent.entries.some((e) => e.kind === 'agentMessage'))
        throw new Error('A child conversation was not hydrated.');
    }
    console.log(`Live turn and ${children.length} real subagent conversations: passed.`);
    console.log(
      'Child direct-input capabilities:',
      children.map((row) => row.agent.directInput),
    );
    if (interrupt && engine.store.agents.get(interruptedId)?.lastTurnStatus !== 'interrupted')
      throw new Error('The child did not report an interrupted turn.');
  }
} catch (error) {
  process.exitCode = 1;
  console.error(errorMessage(error));
} finally {
  trace({ stage: 'before-stop', passed: !process.exitCode });
  await engine.stop();
  trace({ stage: 'after-stop' });
  for (const { signal, handler } of signalHandlers) process.off(signal, handler);
  await mkdir('.agent-tmp', { recursive: true });
  await writeFile(
    `.agent-tmp/smoke-${started}.json`,
    JSON.stringify(
      {
        live,
        interrupt,
        passed: !process.exitCode,
        elapsedMs: Date.now() - started,
        notice: engine.store.notice,
        threads: engine.store.tree().map(({ agent, depth }) => ({
          id: agent.id,
          parentId: agent.parentId,
          depth,
          status: agent.status,
          directInput: agent.directInput,
          entries: agent.entries.length,
        })),
        events,
      },
      null,
      2,
    ),
  );
}
