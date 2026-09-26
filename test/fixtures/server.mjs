import { createInterface } from 'node:readline';
const mode = process.argv[2];
if (mode === 'stubborn') {
  process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
}
const root = {
  id: 'root',
  name: 'Main',
  model: 'fixture',
  reasoningEffort: 'high',
  status: { type: 'idle' },
  canAcceptDirectInput: true,
};
const child = {
  id: 'child',
  parentThreadId: 'root',
  agentNickname: 'Scout',
  model: 'fixture',
  status: { type: 'active' },
  canAcceptDirectInput: true,
  turns: [{ id: 'child-turn', status: 'inProgress', items: [] }],
};
let spawned = false;
const send = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const event = (method, params) => send({ method, params });
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  const message = JSON.parse(line);
  if (!message.method) {
    send({ method: 'test/response', params: message });
    return;
  }
  const reply = (result) => send({ id: message.id, result });
  if (mode === 'timeout' && message.method !== 'initialize') return;
  switch (message.method) {
    case 'initialize':
      reply({ userAgent: 'fixture/1' });
      break;
    case 'initialized':
      break;
    case 'account/read':
      reply({ account: { type: 'chatgpt' } });
      break;
    case 'model/list':
      reply({
        data: [{ id: 'fixture', supportedReasoningEfforts: [{ reasoningEffort: 'high' }] }],
      });
      break;
    case 'account/rateLimits/read':
      reply({ rateLimits: { primary: { usedPercent: 75, windowDurationMins: 300 } } });
      break;
    case 'thread/start':
      reply({ thread: root, model: 'fixture', approvalPolicy: 'on-request' });
      break;
    case 'thread/settings/update':
      reply({});
      break;
    case 'thread/list':
      reply({ data: spawned ? [child] : [], nextCursor: null });
      break;
    case 'thread/resume':
      reply({ thread: message.params.threadId === 'child' ? child : root });
      break;
    case 'thread/read':
      reply({ thread: child });
      break;
    case 'turn/start': {
      spawned = true;
      event('turn/started', { threadId: 'root', turn: { id: 't', status: 'inProgress' } });
      event('thread/started', { thread: child });
      const content =
        JSON.stringify({
          method: 'item/agentMessage/delta',
          params: { threadId: 'root', itemId: 'a', delta: 'hello 界' },
        }) + '\n';
      const bytes = Buffer.from(content);
      const position = bytes.indexOf(Buffer.from('界')) + 1;
      process.stdout.write(bytes.subarray(0, position));
      process.stdout.write(bytes.subarray(position));
      if (mode === 'late') {
        event('turn/completed', { threadId: 'root', turn: { id: 't', status: 'completed' } });
        setTimeout(() => reply({ turn: { id: 't', status: 'inProgress' } }), 20);
      } else reply({ turn: { id: 't', status: 'inProgress' } });
      break;
    }
    case 'turn/steer':
      reply({ turnId: message.params.expectedTurnId });
      break;
    case 'turn/interrupt':
      event('turn/completed', {
        threadId: message.params.threadId,
        turn: { id: message.params.turnId, status: 'interrupted' },
      });
      reply({});
      break;
    case 'test/request':
      send({
        id: message.params.id,
        method: message.params.method,
        params: { threadId: 'child', command: 'dangerous command' },
      });
      reply({});
      break;
    case 'test/echo':
      setTimeout(() => reply(message.params), message.params.delay || 0);
      break;
    case 'test/malformed':
      process.stdout.write('not-json\n');
      break;
    default:
      send({ id: message.id, error: { code: -32601, message: 'Not implemented' } });
  }
});
input.on('close', () => {
  if (mode !== 'stubborn') process.exit();
});
