import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edit, graphemes } from '../src/ui/editor.js';
import { fit, meter } from '../src/ui/format.js';
import stringWidth from 'string-width';

test('Unicode editing moves and deletes complete graphemes', () => {
  const value = 'a👨‍👩‍👧‍👦é界';
  assert.equal(graphemes(value).length, 4);
  const moved = edit({ value, cursor: 4 }, '', { leftArrow: true });
  const removed = edit(moved, '', { backspace: true });
  assert.equal(removed.value, 'a👨‍👩‍👧‍👦界');
  assert.equal(removed.cursor, 2);
});
test('pasting multiline text preserves newlines but removes control bytes', () => {
  assert.deepEqual(edit({ value: '', cursor: 0 }, 'one\r\ntwo\x00', {}), {
    value: 'one\ntwo',
    cursor: 7,
  });
});
test('cursor editing and word deletion preserve trailing text', () => {
  const draft = edit({ value: 'hello world tail', cursor: 11 }, 'w', { ctrl: true });
  assert.deepEqual(draft, { value: 'hello  tail', cursor: 6 });
  assert.deepEqual(edit(draft, 'there', {}), { value: 'hello there tail', cursor: 11 });
});
test('fitting is terminal-cell aware and does not split emoji', () => {
  for (let width = 1; width < 30; width++)
    assert.ok(stringWidth(fit('👨‍👩‍👧‍👦 日本語 status', width)) <= width);
  assert.equal(meter(200, 5, true), '#####');
  assert.equal(meter(-1, 5, true), '-----');
});

test('Delete removes the next grapheme without moving the cursor', () => {
  assert.deepEqual(edit({ value: 'a👨‍👩‍👧‍👦c', cursor: 1 }, '', { delete: true }), {
    value: 'ac',
    cursor: 1,
  });
  assert.deepEqual(edit({ value: 'abc', cursor: 3 }, '', { delete: true }), {
    value: 'abc',
    cursor: 3,
  });
});
