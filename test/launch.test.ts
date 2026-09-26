import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoEngine } from '../src/demo.js';
import { launchSession } from '../src/session/launch.js';

test('cancelling delayed startup never persists or submits a positional prompt', async () => {
  const engine = demoEngine();
  let complete!: () => void;
  let cancelled = false;
  let sends = 0,
    saves = 0;
  engine.start = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  engine.send = async () => {
    sends++;
  };
  const launch = launchSession(
    engine,
    'must not run',
    () => cancelled,
    async () => {
      saves++;
    },
  );
  cancelled = true;
  complete();
  await launch;
  assert.equal(sends, 0);
  assert.equal(saves, 0);
});

test('local save and prompt errors preserve a healthy connection and effective cwd', async () => {
  const engine = demoEngine();
  engine.start = async () => {
    engine.options.cwd = '/effective';
  };
  engine.send = async () => {
    throw new Error('Model rejected the prompt');
  };
  let savedCwd = '';
  await launchSession(
    engine,
    'prompt',
    () => false,
    async (_id, cwd) => {
      savedCwd = cwd;
      throw new Error('Read-only state directory');
    },
  );
  assert.equal(savedCwd, '/effective');
  assert.equal(engine.store.connection, 'ready');
  assert.match(engine.store.notice, /Model rejected/);
});
