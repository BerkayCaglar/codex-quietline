import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import stringWidth from 'string-width';
import { Screen } from '../src/ui/screen.js';
import { App } from '../src/ui/app.js';
import { demoEngine } from '../src/demo.js';
import { choicesFor } from '../src/ui/requests.js';

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 40));

test('responsive terminal frame stays bounded at narrow and wide sizes', async (t) => {
  for (const width of [40, 60, 80, 120]) {
    const engine = demoEngine();
    const app = render(
      <Screen store={engine.store} width={width} height={24} focus="composer" cwd="quietline" />,
    );
    t.after(() => app.cleanup());
    await settle();
    const frame = app.lastFrame()!;
    assert.ok(frame.includes('Main'));
    assert.ok(frame.includes('Survey'));
    assert.ok(
      frame.split('\n').every((line) => stringWidth(line) <= width),
      `overflow at ${width}`,
    );
    assert.ok(frame.split('\n').length <= 24, `height overflow at ${width}`);
    app.unmount();
  }
});

test('keyboard navigation keeps per-agent drafts and visible agent strip', async (t) => {
  const engine = demoEngine();
  const app = render(
    <App engine={engine} onQuit={() => {}} dimensions={{ width: 100, height: 30 }} />,
  );
  t.after(() => app.cleanup());
  await settle();
  app.stdin.write('draft');
  await settle();
  app.stdin.write('\t');
  await settle();
  app.stdin.write('\x1b[B');
  await settle();
  assert.equal(engine.store.selectedId, 'demo-survey');
  assert.match(app.lastFrame()!, /parent\/child/);
  assert.match(app.lastFrame()!, /Main/);
  app.stdin.write('\x1b[A');
  await settle();
  assert.equal(engine.store.ensure('demo-main').draft, 'draft');
  assert.match(app.lastFrame()!, /draft/);
});

test('approval choices use the offered decisions and do not default to allow', () => {
  const choices = choicesFor({
    id: 1,
    method: 'item/commandExecution/requestApproval',
    params: { availableDecisions: ['accept', 'cancel'] },
  });
  assert.equal(choices[0]?.response.decision, 'cancel');
  assert.equal(choices.length, 2);
});

test('approval view identifies a background agent and can page through full details', async (t) => {
  const engine = demoEngine();
  const request = {
    id: 42,
    method: 'item/commandExecution/requestApproval',
    params: { threadId: 'demo-survey', command: 'line\n'.repeat(30) + 'FINAL_DETAIL' },
  };
  const app = render(
    <Screen
      store={engine.store}
      width={100}
      height={30}
      focus="composer"
      cwd="quietline"
      request={request}
      overlayScroll={100}
    />,
  );
  t.after(() => app.cleanup());
  await settle();
  assert.match(app.lastFrame()!, /Survey/);
  assert.match(app.lastFrame()!, /FINAL_DETAIL/);
  assert.match(app.lastFrame()!, /Decline/);
});

test('secret answers are masked in terminal output', async (t) => {
  const engine = demoEngine();
  const request = {
    id: 42,
    method: 'item/tool/requestUserInput',
    params: {
      threadId: 'demo-survey',
      questions: [{ id: 'q', question: 'Password?', isSecret: true }],
    },
  };
  const app = render(
    <Screen
      store={engine.store}
      width={100}
      height={30}
      focus="composer"
      cwd="quietline"
      request={request}
      answer="TOP_SECRET"
    />,
  );
  t.after(() => app.cleanup());
  await settle();
  assert.ok(!app.lastFrame()!.includes('TOP_SECRET'));
  assert.match(app.lastFrame()!, /•••/);
});

test('all approval decisions and origin stay visible at the minimum terminal size', async (t) => {
  const engine = demoEngine();
  const request = {
    id: 42,
    method: 'item/commandExecution/requestApproval',
    params: { threadId: 'demo-survey', command: 'do something' },
  };
  const app = render(
    <Screen
      store={engine.store}
      width={40}
      height={16}
      focus="composer"
      cwd="quietline"
      request={request}
    />,
  );
  t.after(() => app.cleanup());
  await settle();
  const frame = app.lastFrame()!;
  for (const expected of [
    'Survey',
    'Decline',
    'Cancel this turn',
    'Allow once',
    'Allow for this session',
  ])
    assert.ok(frame.includes(expected), expected);
  assert.ok(frame.split('\n').length <= 16);
});

test('background requests do not steal input and visible quit confirmation takes precedence', async (t) => {
  const engine = demoEngine();
  let quit = false;
  engine.store.requests.set('number:42', {
    id: 42,
    method: 'item/tool/requestUserInput',
    params: { threadId: 'demo-survey', questions: [{ id: 'q', question: 'Question?' }] },
  });
  const app = render(
    <App
      engine={engine}
      onQuit={() => {
        quit = true;
      }}
      dimensions={{ width: 80, height: 24 }}
    />,
  );
  t.after(() => app.cleanup());
  await settle();
  app.stdin.write('draft');
  await settle();
  assert.equal(engine.store.ensure('demo-main').draft, 'draft');
  app.stdin.write('\x12');
  await settle();
  assert.match(app.lastFrame()!, /Question\?/);
  app.stdin.write('\x03');
  await settle();
  assert.match(app.lastFrame()!, /Press y to quit/);
  assert.ok(!app.lastFrame()!.includes('Question?'));
  app.stdin.write('y');
  await settle();
  assert.equal(quit, true);
});

test('interrupt shortcut and cancellation preserve an unsent draft', async (t) => {
  const engine = demoEngine();
  const app = render(
    <App engine={engine} onQuit={() => {}} dimensions={{ width: 80, height: 24 }} />,
  );
  t.after(() => app.cleanup());
  await settle();
  app.stdin.write('KEEP THIS DRAFT');
  await settle();
  app.stdin.write('\t');
  await settle();
  app.stdin.write('x');
  await settle();
  app.stdin.write('\x1b');
  await settle();
  assert.equal(engine.store.ensure('demo-main').draft, 'KEEP THIS DRAFT');
});

test('question editor supports cursor movement and Esc defers without replying', async (t) => {
  const engine = demoEngine();
  let replied = '';
  engine.store.requests.set('number:42', {
    id: 42,
    method: 'item/tool/requestUserInput',
    params: { threadId: 'demo-survey', questions: [{ id: 'q', question: 'Question?' }] },
  });
  engine.answer = (_request, response) => {
    replied = JSON.stringify(response);
  };
  const app = render(
    <App engine={engine} onQuit={() => {}} dimensions={{ width: 80, height: 24 }} />,
  );
  t.after(() => app.cleanup());
  await settle();
  for (const key of ['\x12', 'abc', '\x1b[D', 'X']) {
    app.stdin.write(key);
    await settle();
  }
  assert.match(app.lastFrame()!, /abX▏c/);
  app.stdin.write('\x1b');
  await settle();
  assert.equal(replied, '');
  assert.match(app.lastFrame()!, /Main/);
  app.stdin.write('\x12');
  await settle();
  assert.match(app.lastFrame()!, /abX▏c/);
});

test('MCP JSON form survives defer and returning to its choices', async (t) => {
  const engine = demoEngine();
  engine.store.requests.set('number:9', {
    id: 9,
    method: 'mcpServer/elicitation/request',
    params: {
      threadId: 'demo-survey',
      mode: 'form',
      serverName: 'fixture',
      requestedSchema: { type: 'object', properties: { name: { type: 'string' } } },
    },
  });
  const app = render(
    <App engine={engine} onQuit={() => {}} dimensions={{ width: 80, height: 24 }} />,
  );
  t.after(() => app.cleanup());
  await settle();
  for (const key of ['\x12', 'f', '{"name":"keep"}', '\x1b', '\x12']) {
    app.stdin.write(key);
    await settle();
  }
  assert.match(app.lastFrame()!, /\{"name":"keep"\}/);
  app.stdin.write('\x02');
  await settle();
  assert.match(app.lastFrame()!, /Decline/);
  app.stdin.write('f');
  await settle();
  assert.match(app.lastFrame()!, /\{"name":"keep"\}/);
});
