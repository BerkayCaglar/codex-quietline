import { object, text, list, number, safeText, type ObjectValue } from '../protocol/json.js';
import { requestKey, type Notification, type ServerRequest } from '../protocol/client.js';

export interface Entry {
  id: string;
  kind: string;
  title: string;
  body: string;
  status: string;
  revision?: number;
}
export interface Usage {
  context?: number;
  window?: number;
  input?: number;
  cached?: number;
  total?: number;
}
export interface Agent {
  id: string;
  parentId?: string;
  name: string;
  role: string;
  model: string;
  effort: string;
  status: string;
  activity: string;
  flags: string[];
  turnId?: string;
  startedAt?: number;
  entries: Entry[];
  usage: Usage;
  unread: boolean;
  draft: string;
  cursor: number;
  scroll: number;
  directInput?: boolean;
  error?: string;
  runtimeRevision?: number;
  lastTurnStatus?: string;
}
export interface Limit {
  used: number;
  minutes: number;
  resetsAt?: number;
}
export function entryFromItem(item: ObjectValue): Entry {
  const kind = text(item.type, 'event');
  let body = text(item.text);
  let title = kind;
  switch (kind) {
    case 'userMessage':
      title = 'You';
      body = list(item.content)
        .map((part) => text(object(part).text, `[${text(object(part).type, 'attachment')}]`))
        .join('\n');
      break;
    case 'agentMessage':
      title = 'Codex';
      break;
    case 'reasoning':
      title = 'Thinking';
      body = list(item.summary)
        .map((s) => (typeof s === 'string' ? s : text(object(s).text)))
        .join('\n');
      break;
    case 'commandExecution':
      title = `$ ${text(item.command)}`;
      body = text(item.aggregatedOutput);
      break;
    case 'fileChange':
      title = 'Files';
      body = list(item.changes)
        .map(
          (c) =>
            `${text(object(object(c).kind).type)} ${text(object(c).path)}\n${text(object(c).diff)}`,
        )
        .join('\n');
      break;
    case 'mcpToolCall':
      title = `${text(item.server)} / ${text(item.tool)}`;
      body = JSON.stringify(item.result ?? item.error ?? item.arguments ?? {}, null, 2);
      break;
    case 'collabAgentToolCall':
      title = `Agents · ${text(item.tool)}`;
      body = text(item.prompt) || list(item.receiverThreadIds).join(', ');
      break;
    case 'subAgentActivity':
      title = `Agent ${text(item.kind)} · ${text(item.agentPath)}`;
      body = '';
      break;
    case 'webSearch':
      title = 'Web search';
      body = text(item.query);
      break;
    case 'plan':
      title = 'Plan';
      break;
    case 'contextCompaction':
      title = 'Context compacted';
      break;
    default:
      body ||= JSON.stringify(item, null, 2);
  }
  return {
    id: text(item.id),
    kind,
    title: safeText(title),
    body: safeText(body),
    status: text(item.status),
  };
}

export class SessionStore {
  agents = new Map<string, Agent>();
  requests = new Map<string, ServerRequest>();
  rootId = '';
  selectedId = '';
  connection: 'connecting' | 'ready' | 'disconnected' = 'connecting';
  notice = '';
  limits: Limit[] = [];
  version = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = (): number => this.version;
  changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  ensure(id: string): Agent {
    let agent = this.agents.get(id);
    if (!agent) {
      agent = {
        id,
        name: 'Agent',
        role: '',
        model: '',
        effort: '',
        status: 'unknown',
        activity: '',
        flags: [],
        entries: [],
        usage: {},
        unread: false,
        draft: '',
        cursor: 0,
        scroll: 0,
      };
      this.agents.set(id, agent);
    }
    return agent;
  }

  upsertThread(raw: ObjectValue, snapshotVersion = Number.POSITIVE_INFINITY): Agent | undefined {
    const id = text(raw.id);
    if (!id) return;
    const agent = this.ensure(id);
    const spawn = object(object(object(raw.source).subAgent).thread_spawn);
    agent.parentId = text(raw.parentThreadId) || text(spawn.parent_thread_id) || agent.parentId;
    agent.name =
      text(raw.agentNickname) ||
      text(spawn.agent_nickname) ||
      text(raw.name) ||
      (id === this.rootId ? 'Main' : agent.name);
    agent.role = text(raw.agentRole, agent.role);
    agent.model = text(raw.model, agent.model);
    agent.effort = text(raw.reasoningEffort, agent.effort);
    if (typeof raw.canAcceptDirectInput === 'boolean') agent.directInput = raw.canAcceptDirectInput;
    if (raw.status && (agent.runtimeRevision ?? 0) <= snapshotVersion)
      this.setStatus(agent, object(raw.status));
    const snapshotOrder: string[] = [];
    for (const turnValue of list(raw.turns)) {
      const turn = object(turnValue);
      for (const item of list(turn.items)) {
        const id = text(object(item).id);
        if (id) snapshotOrder.push(id);
        this.item(agent, object(item), snapshotVersion);
      }
      if (turn.status === 'inProgress' && (agent.runtimeRevision ?? 0) <= snapshotVersion)
        agent.turnId = text(turn.id);
    }
    if (snapshotOrder.length) {
      const positions = new Map(snapshotOrder.map((id, index) => [id, index]));
      agent.entries.sort(
        (a, b) =>
          (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return agent;
  }

  private setStatus(agent: Agent, status: ObjectValue): void {
    agent.status = text(status.type, agent.status);
    agent.flags = list(status.activeFlags).filter((v): v is string => typeof v === 'string');
  }

  item(agent: Agent, raw: ObjectValue, snapshotVersion = Number.POSITIVE_INFINITY): void {
    const next = entryFromItem(raw);
    if (!next.id) return;
    const prior = agent.entries.find((e) => e.id === next.id);
    if (prior && (prior.revision ?? 0) > snapshotVersion) return;
    next.revision = this.version + 1;
    if (prior) {
      // An early item/started payload must not erase already-streamed output.
      if (next.body || !prior.body) prior.body = next.body;
      prior.title = next.title;
      prior.status = next.status || prior.status;
      prior.revision = next.revision;
    } else agent.entries.push(next);
    agent.activity =
      next.kind === 'agentMessage' && next.body
        ? (next.body.split('\n').find((line) => line.trim()) ?? next.title)
        : next.title;
  }

  select(id: string): void {
    if (!this.agents.has(id)) return;
    this.selectedId = id;
    this.agents.get(id)!.unread = false;
    this.changed();
  }

  tree(): { agent: Agent; depth: number }[] {
    const result: { agent: Agent; depth: number }[] = [];
    const visited = new Set<string>();
    const visit = (id: string, depth: number): void => {
      if (visited.has(id)) return;
      const agent = this.agents.get(id);
      if (!agent) return;
      visited.add(id);
      result.push({ agent, depth });
      for (const child of this.agents.values())
        if (child.parentId === id) visit(child.id, depth + 1);
    };
    visit(this.rootId, 0);
    return result;
  }

  handle(event: Notification): void {
    const p = event.params;
    if (event.method === 'thread/started') this.upsertThread(object(p.thread));
    if (event.method === 'account/rateLimits/updated') this.setLimits(object(p.rateLimits));
    if (
      event.method === 'serverRequest/resolved' &&
      (typeof p.requestId === 'string' || typeof p.requestId === 'number')
    )
      this.requests.delete(requestKey(p.requestId));
    const id = text(p.threadId);
    if (id) {
      const agent = this.ensure(id);
      if (
        event.method === 'thread/status/changed' ||
        event.method === 'turn/started' ||
        event.method === 'turn/completed'
      )
        agent.runtimeRevision = this.version + 1;
      switch (event.method) {
        case 'thread/status/changed':
          this.setStatus(agent, object(p.status));
          break;
        case 'thread/settings/updated': {
          const settings = object(p.threadSettings);
          agent.model = text(settings.model, agent.model);
          agent.effort = text(settings.reasoningEffort, text(settings.effort, agent.effort));
          break;
        }
        case 'thread/name/updated':
          agent.name = text(p.threadName, text(p.name, agent.name));
          break;
        case 'turn/started':
          agent.turnId = text(object(p.turn).id);
          agent.status = 'active';
          agent.startedAt = Date.now();
          agent.error = undefined;
          break;
        case 'turn/completed': {
          const turn = object(p.turn);
          agent.turnId = undefined;
          agent.flags = [];
          agent.status = turn.status === 'failed' ? 'systemError' : 'idle';
          agent.lastTurnStatus = text(turn.status);
          agent.error = text(object(turn.error).message) || undefined;
          agent.unread = id !== this.selectedId;
          for (const item of list(turn.items)) this.item(agent, object(item));
          agent.activity = turn.status === 'interrupted' ? 'Interrupted' : 'Complete';
          for (const [key, request] of this.requests)
            if (
              request.params.threadId === id &&
              (!request.params.turnId || request.params.turnId === turn.id)
            )
              this.requests.delete(key);
          break;
        }
        case 'item/started':
        case 'item/completed':
          this.item(agent, object(p.item));
          break;
        case 'item/agentMessage/delta':
        case 'item/reasoning/summaryTextDelta':
        case 'item/reasoning/textDelta':
        case 'item/commandExecution/outputDelta': {
          const itemId = text(p.itemId);
          if (!itemId) break;
          let entry = agent.entries.find((e) => e.id === itemId);
          if (!entry) {
            const kind = event.method.includes('agentMessage')
              ? 'agentMessage'
              : event.method.includes('reasoning')
                ? 'reasoning'
                : 'commandExecution';
            entry = {
              id: itemId,
              kind,
              title:
                kind === 'agentMessage' ? 'Codex' : kind === 'reasoning' ? 'Thinking' : 'Command',
              body: '',
              status: 'inProgress',
            };
            agent.entries.push(entry);
          }
          entry.body += safeText(text(p.delta));
          entry.revision = this.version + 1;
          break;
        }
        case 'thread/tokenUsage/updated': {
          const usage = object(p.tokenUsage),
            last = object(usage.last),
            total = object(usage.total);
          agent.usage = {
            context: number(last.totalTokens),
            window: number(usage.modelContextWindow),
            input: number(last.inputTokens),
            cached: number(last.cachedInputTokens),
            total: number(total.totalTokens),
          };
          break;
        }
        case 'turn/plan/updated':
          this.item(agent, {
            id: `plan-${text(p.turnId)}`,
            type: 'plan',
            text: list(p.plan)
              .map((step) => `${text(object(step).status)}  ${text(object(step).step)}`)
              .join('\n'),
          });
          break;
        case 'error':
          agent.error = text(object(p.error).message, text(p.message, 'Codex reported an error.'));
          break;
      }
    }
    this.changed();
  }

  setLimits(raw: ObjectValue): void {
    this.limits = ['primary', 'secondary'].flatMap((key) => {
      const limit = object(raw[key]);
      const used = number(limit.usedPercent),
        minutes = number(limit.windowDurationMins);
      return used === undefined || minutes === undefined
        ? []
        : [{ used, minutes, resetsAt: number(limit.resetsAt) }];
    });
  }
}
