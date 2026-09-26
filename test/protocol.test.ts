import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { CodexClient } from '../src/protocol/client.js';
import { SessionEngine } from '../src/session/engine.js';

function client(mode = '', timeoutMs = 1000): CodexClient {
  return new CodexClient({
    command: process.execPath,
    args: [fileURLToPath(new URL('./fixtures/server.mjs', import.meta.url)), mode],
    timeoutMs,
  });
}

test('RPC correlates out-of-order replies and shuts down its owned process', async (t) => {
  const rpc = client();
  t.after(() => rpc.stop());
  await rpc.start();
  const [a, b] = await Promise.all([
    rpc.request('test/echo', { value: 'a', delay: 40 }),
    rpc.request('test/echo', { value: 'b' }),
  ]);
  assert.equal(a.value, 'a');
  assert.equal(b.value, 'b');
});
test('timeouts fail without automatic retries', async (t) => {
  const rpc = client('timeout', 100);
  t.after(() => rpc.stop());
  await rpc.start();
  await assert.rejects(rpc.request('test/echo'), /outcome may be unknown/);
});
test('malformed protocol closes the connection and rejects pending requests', async (t) => {
  const rpc = client();
  t.after(() => rpc.stop());
  await rpc.start();
  const disconnected = once(rpc, 'disconnect');
  await assert.rejects(rpc.request('test/malformed'), /invalid JSON/);
  assert.match((await disconnected)[0].message, /invalid JSON/);
});
test('real process integration discovers and subscribes children, preserves UTF-8, and interrupts exact turn', async (t) => {
  const rpc = client();
  const engine = new SessionEngine(rpc, { cwd: process.cwd() });
  t.after(() => engine.stop());
  await engine.start();
  await engine.send('root', 'go');
  // Wait for the event-triggered reconciliation rather than assuming response order.
  for (let i = 0; i < 50 && !engine.store.agents.get('child')?.turnId; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(engine.store.ensure('root').entries[0]?.body, 'hello 界');
  assert.equal(engine.store.tree().length, 2);
  await engine.select('child');
  assert.equal(engine.store.selectedId, 'child');
  await engine.interrupt('child');
  assert.equal(engine.store.ensure('child').activity, 'Interrupted');
  assert.equal(engine.store.ensure('root').turnId, 't');
});
test('server requests keep their exact ID and unsupported requests fail visibly', async (t) => {
  const rpc = client();
  const engine = new SessionEngine(rpc, { cwd: process.cwd() });
  t.after(() => engine.stop());
  await engine.start();
  await rpc.request('test/request', {
    id: 'approval-42',
    method: 'item/commandExecution/requestApproval',
  });
  const request = engine.store.requests.get('string:approval-42')!;
  assert.equal(request.params.threadId, 'child');
  const response = once(rpc, 'notification');
  engine.answer(request, { decision: 'decline' });
  const [event] = await response;
  assert.equal(event.params.id, 'approval-42');
  assert.deepEqual(event.params.result, { decision: 'decline' });
  await rpc.request('test/request', { id: 'unknown', method: 'unsupported/action' });
  assert.match(engine.store.notice, /No action was approved/);
});
test('a late start response cannot resurrect a turn already completed by notifications', async (t) => {
  const rpc = client('late');
  const engine = new SessionEngine(rpc, { cwd: process.cwd() });
  t.after(() => engine.stop());
  await engine.start();
  await engine.send('root', 'go');
  assert.equal(engine.store.ensure('root').turnId, undefined);
  assert.equal(engine.store.ensure('root').status, 'idle');
});

test('concurrent shutdown callers share bounded cleanup of a stubborn server', async (t) => {
  const rpc = client('stubborn');
  t.after(() => rpc.stop());
  await rpc.start();
  const started = Date.now();
  const a = rpc.stop(),
    b = rpc.stop();
  assert.equal(a, b);
  await Promise.all([a, b]);
  assert.ok(Date.now() - started < 6000);
  await assert.rejects(rpc.request('test/echo'), /disconnected/);
});
