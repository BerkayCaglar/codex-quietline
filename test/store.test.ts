import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../src/session/store.js';
import { safeText } from '../src/protocol/json.js';

test('ancestry handles out-of-order descendants and never treats a fork as a child', () => {
  const store = new SessionStore();
  store.rootId = 'root';
  store.upsertThread({ id: 'grandchild', parentThreadId: 'child' });
  store.upsertThread({ id: 'fork', forkedFromId: 'root' });
  store.upsertThread({
    id: 'child',
    source: { subAgent: { thread_spawn: { parent_thread_id: 'root' } } },
  });
  store.upsertThread({ id: 'root' });
  assert.deepEqual(
    store.tree().map((row) => [row.agent.id, row.depth]),
    [
      ['root', 0],
      ['child', 1],
      ['grandchild', 2],
    ],
  );
});

test('late history does not erase streamed text or resurrect a completed turn', () => {
  const store = new SessionStore();
  store.upsertThread({ id: 'child' });
  const snapshot = store.version;
  store.handle({
    method: 'item/agentMessage/delta',
    params: { threadId: 'child', itemId: 'a', delta: 'new streamed text' },
  });
  store.handle({
    method: 'turn/completed',
    params: { threadId: 'child', turn: { id: 't', status: 'completed' } },
  });
  store.upsertThread(
    {
      id: 'child',
      status: { type: 'active' },
      turns: [
        { id: 't', status: 'inProgress', items: [{ id: 'a', type: 'agentMessage', text: 'old' }] },
      ],
    },
    snapshot,
  );
  assert.equal(store.ensure('child').entries[0]?.body, 'new streamed text');
  assert.equal(store.ensure('child').turnId, undefined);
  assert.equal(store.ensure('child').status, 'idle');
});

test('completed canonical items replace deltas once; drafts and scroll survive switching', () => {
  const store = new SessionStore();
  const root = store.ensure('root');
  store.ensure('child');
  store.rootId = 'root';
  store.selectedId = 'root';
  root.draft = 'unfinished';
  root.cursor = 4;
  root.scroll = 8;
  store.handle({
    method: 'item/agentMessage/delta',
    params: { threadId: 'child', itemId: 'a', delta: 'hel' },
  });
  store.handle({
    method: 'item/completed',
    params: { threadId: 'child', item: { id: 'a', type: 'agentMessage', text: 'hello' } },
  });
  store.handle({
    method: 'turn/completed',
    params: { threadId: 'child', turn: { id: 't', status: 'completed' } },
  });
  assert.equal(store.ensure('child').unread, true);
  store.select('child');
  store.select('root');
  assert.equal(store.ensure('child').entries.length, 1);
  assert.equal(store.ensure('child').entries[0]?.body, 'hello');
  assert.equal(store.ensure('child').unread, false);
  assert.deepEqual([root.draft, root.cursor, root.scroll], ['unfinished', 4, 8]);
});

test('resolving one request preserves requests from other threads', () => {
  const store = new SessionStore();
  store.requests.set('number:7', { id: 7, method: 'approval', params: { threadId: 'a' } });
  store.requests.set('number:8', { id: 8, method: 'approval', params: { threadId: 'b' } });
  store.handle({ method: 'serverRequest/resolved', params: { threadId: 'a', requestId: 7 } });
  assert.deepEqual([...store.requests.keys()], ['number:8']);
});

test('untrusted output cannot set titles, inject colors or spoof bidi direction', () => {
  assert.equal(safeText('a\x1b]0;owned\x07b\x1b[31mc\x1b[0m\u202ed'), 'abcd');
});

test('snapshot chronology precedes newer live items without erasing streamed content', () => {
  const store = new SessionStore();
  const before = store.version;
  store.handle({
    method: 'item/agentMessage/delta',
    params: { threadId: 'child', itemId: 'b', delta: 'new B' },
  });
  store.handle({
    method: 'item/agentMessage/delta',
    params: { threadId: 'child', itemId: 'c', delta: 'new C' },
  });
  store.upsertThread(
    {
      id: 'child',
      turns: [
        {
          id: 'old',
          items: [{ id: 'a', type: 'userMessage', content: [{ type: 'text', text: 'A' }] }],
        },
        { id: 'new', items: [{ id: 'b', type: 'agentMessage', text: 'old B' }] },
      ],
    },
    before,
  );
  assert.deepEqual(
    store.ensure('child').entries.map((entry) => [entry.id, entry.body]),
    [
      ['a', 'A'],
      ['b', 'new B'],
      ['c', 'new C'],
    ],
  );
});

test('completion with canonical turn items remains completed', () => {
  const store = new SessionStore();
  store.handle({
    method: 'turn/completed',
    params: {
      threadId: 'root',
      turn: {
        id: 't',
        status: 'completed',
        items: [{ id: 'a', type: 'agentMessage', text: 'done' }],
      },
    },
  });
  assert.equal(store.ensure('root').lastTurnStatus, 'completed');
  assert.equal(store.ensure('root').activity, 'Complete');
});
