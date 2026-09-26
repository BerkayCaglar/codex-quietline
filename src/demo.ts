import { SessionEngine } from './session/engine.js';
import { CodexClient } from './protocol/client.js';

export function demoEngine(): SessionEngine {
  const engine = new SessionEngine(new CodexClient(), { cwd: 'quietline' });
  const store = engine.store;
  store.rootId = 'demo-main';
  store.selectedId = store.rootId;
  store.connection = 'ready';
  store.upsertThread({
    id: store.rootId,
    name: 'Main',
    model: 'Codex',
    reasoningEffort: 'high',
    status: { type: 'active' },
  });
  store.upsertThread({
    id: 'demo-survey',
    parentThreadId: store.rootId,
    agentNickname: 'Survey',
    agentRole: 'Explore',
    model: 'Codex',
    reasoningEffort: 'high',
    status: { type: 'active' },
  });
  store.upsertThread({
    id: 'demo-review',
    parentThreadId: store.rootId,
    agentNickname: 'Review',
    agentRole: 'Reviewer',
    model: 'Codex',
    reasoningEffort: 'high',
    status: { type: 'idle' },
  });
  const root = store.ensure(store.rootId);
  root.usage = {
    context: 118_200,
    window: 258_000,
    input: 110_000,
    cached: 108_000,
    total: 480_000,
  };
  store.item(root, {
    id: 'u1',
    type: 'userMessage',
    content: [{ type: 'text', text: 'Polish the agent experience. Keep it quiet, make it clear.' }],
  });
  store.item(root, {
    id: 'a1',
    type: 'agentMessage',
    text: 'The conversation stays in focus. Your agents stay in view.\n\nSurvey is checking the event stream while Review looks at keyboard behavior.\nYou can open either conversation below without interrupting their work.\n\n## What changed\n• Agent rows keep their place as tasks finish.\n• Each conversation remembers its draft and scroll position.\n• Attention comes to you; focus stays where you left it.',
  });
  const survey = store.ensure('demo-survey');
  survey.usage = { context: 42_000, window: 258_000 };
  survey.activity = 'Checking event order';
  store.item(survey, {
    id: 's1',
    type: 'agentMessage',
    text: 'Following the actual parent/child thread relationships.\nA delayed subscription response must not erase a newer streamed message.',
  });
  const review = store.ensure('demo-review');
  review.usage = { context: 28_000, window: 258_000 };
  review.unread = true;
  store.item(review, {
    id: 'r1',
    type: 'agentMessage',
    text: 'Keyboard review complete.\n\nTab moves focus. Arrows select an agent. Enter returns to the composer.\nDrafts survive switching, and approvals identify their originating agent.',
  });
  store.notice = 'Demo · no connection, no model calls · /help for shortcuts';
  engine.send = async () => {
    store.notice = 'This is a preview. Launch without --demo to work with Codex.';
    store.changed();
  };
  engine.interrupt = async (id) => {
    const agent = store.ensure(id);
    agent.status = 'idle';
    agent.activity = 'Interrupted';
    store.changed();
  };
  engine.select = async (id) => store.select(id);
  return engine;
}
