import {
  CodexClient,
  requestKey,
  type ServerRequest,
  type Notification,
} from '../protocol/client.js';
import { object, text, list, errorMessage, type ObjectValue } from '../protocol/json.js';
import { SessionStore } from './store.js';

export interface EngineOptions {
  cwd: string;
  model?: string;
  effort?: string;
  resume?: string;
  readOnly?: boolean;
}
export class SessionEngine {
  readonly store = new SessionStore();
  models: ObjectValue[] = [];
  permissions = 'Codex configuration';
  private subscriptions = new Map<string, Promise<void>>();
  private refreshing = false;
  private refreshTimer?: NodeJS.Timeout;
  private stopping = false;
  private busy = new Set<string>();

  constructor(
    readonly client: CodexClient,
    readonly options: EngineOptions,
  ) {
    client.on('notification', (event: Notification) => {
      this.store.handle(event);
      if (event.method === 'thread/started' && this.store.rootId) void this.discover();
      const item = object(event.params.item);
      if (
        (event.method === 'item/started' || event.method === 'item/completed') &&
        (item.type === 'collabAgentToolCall' || item.type === 'subAgentActivity')
      )
        void this.discover();
    });
    client.on('request', (request: ServerRequest) => this.onRequest(request));
    client.on('disconnect', (error: Error) => {
      this.store.connection = 'disconnected';
      this.store.notice = error.message;
      clearInterval(this.refreshTimer);
      this.store.changed();
    });
  }

  async start(): Promise<void> {
    const check = (): void => {
      if (this.stopping) throw new Error('Session initialization was cancelled.');
    };
    await this.client.start();
    check();
    const account = await this.client.request('account/read', {});
    check();
    if (!account.account && account.requiresOpenaiAuth !== false)
      throw new Error('Sign in first with codex login, then launch Quietline again.');
    const params: ObjectValue = this.options.resume
      ? { threadId: this.options.resume }
      : {
          cwd: this.options.cwd,
          ...(this.options.model ? { model: this.options.model } : {}),
          ...(this.options.readOnly ? { sandbox: 'read-only', approvalPolicy: 'on-request' } : {}),
        };
    const result = await this.client.request(
      this.options.resume ? 'thread/resume' : 'thread/start',
      params,
    );
    const thread = object(result.thread);
    check();
    this.options.cwd = text(thread.cwd, this.options.cwd);
    this.store.rootId = text(thread.id);
    if (!this.store.rootId) throw new Error('Codex returned no thread ID.');
    this.store.selectedId = this.store.rootId;
    const root = this.store.upsertThread(thread)!;
    root.model ||= text(result.model);
    root.effort ||= text(result.reasoningEffort) || this.options.effort || '';
    root.directInput = thread.canAcceptDirectInput === false ? false : true;
    if (this.options.effort)
      await this.client.request('thread/settings/update', {
        threadId: root.id,
        effort: this.options.effort,
      });
    this.permissions = text(result.approvalPolicy, 'configured');
    this.subscriptions.set(root.id, Promise.resolve());
    this.store.connection = 'ready';
    this.store.changed();
    const extras = await Promise.allSettled([
      this.client.request('model/list', {}),
      this.client.request('account/rateLimits/read', {}),
    ]);
    check();
    if (extras[0]?.status === 'fulfilled') this.models = list(extras[0].value.data).map(object);
    if (extras[1]?.status === 'fulfilled') this.store.setLimits(object(extras[1].value.rateLimits));
    await this.discover();
    check();
    this.refreshTimer = setInterval(() => {
      void this.discover();
    }, 4000);
    this.store.changed();
  }

  async discover(): Promise<void> {
    if (
      this.refreshing ||
      !this.store.rootId ||
      this.stopping ||
      this.store.connection === 'disconnected'
    )
      return;
    this.refreshing = true;
    try {
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const snapshotVersion = this.store.version;
        const result = await this.client.request('thread/list', {
          ancestorThreadId: this.store.rootId,
          sourceKinds: ['subAgentThreadSpawn'],
          limit: 100,
          ...(cursor ? { cursor } : {}),
        });
        if (this.stopping) return;
        const toSubscribe: string[] = [];
        for (const value of list(result.data)) {
          const agent = this.store.upsertThread(object(value), snapshotVersion);
          if (agent && agent.status !== 'notLoaded' && !this.subscriptions.has(agent.id))
            toSubscribe.push(agent.id);
        }
        await Promise.all(toSubscribe.map((id) => this.subscribe(id)));
        const next = text(result.nextCursor);
        if (!next || seen.has(next)) break;
        seen.add(next);
        cursor = next;
      } while (cursor);
    } catch (error) {
      this.store.notice = `Agent discovery: ${errorMessage(error)}`;
    } finally {
      this.refreshing = false;
      this.store.changed();
    }
  }

  private subscribe(id: string): Promise<void> {
    const existing = this.subscriptions.get(id);
    if (existing) return existing;
    const snapshotVersion = this.store.version;
    const promise = this.client
      .request('thread/resume', { threadId: id })
      .then((result) => {
        this.store.upsertThread(object(result.thread), snapshotVersion);
        this.store.changed();
      })
      .catch((error) => {
        this.subscriptions.delete(id);
        throw error;
      });
    this.subscriptions.set(id, promise);
    return promise;
  }

  async select(id: string): Promise<void> {
    this.store.select(id);
    const agent = this.store.agents.get(id);
    if (!agent || this.subscriptions.has(id)) return;
    if (agent.status === 'notLoaded') {
      const result = await this.client.request('thread/read', { threadId: id, includeTurns: true });
      this.store.upsertThread(object(result.thread));
    } else await this.subscribe(id);
    this.store.changed();
  }

  async send(id: string, message: string): Promise<void> {
    const agent = this.store.agents.get(id);
    if (!agent || !message.trim()) return;
    if (agent.directInput === false || (id !== this.store.rootId && agent.directInput !== true))
      throw new Error(
        'Codex does not expose direct input for this agent. Its conversation and approval requests remain available.',
      );
    if (this.busy.has(id)) throw new Error('This message is still being submitted.');
    this.busy.add(id);
    const submittedDraft = agent.draft;
    const submittedCursor = agent.cursor;
    agent.draft = '';
    agent.cursor = 0;
    this.store.changed();
    try {
      const input = [{ type: 'text', text: message }];
      if (agent.turnId)
        await this.client.request('turn/steer', {
          threadId: id,
          expectedTurnId: agent.turnId,
          input,
        });
      else {
        const before = this.store.version;
        const result = await this.client.request('turn/start', { threadId: id, input });
        const turn = object(result.turn);
        if (turn.status === 'inProgress' && (agent.runtimeRevision ?? 0) <= before) {
          agent.turnId = text(turn.id);
          agent.status = 'active';
        }
      }
      agent.scroll = 0;
      this.store.notice = '';
      this.store.changed();
    } catch (error) {
      if (!agent.draft && submittedDraft) {
        agent.draft = submittedDraft;
        agent.cursor = submittedCursor;
      }
      this.store.changed();
      throw error;
    } finally {
      this.busy.delete(id);
    }
  }

  async interrupt(id: string): Promise<void> {
    const agent = this.store.agents.get(id);
    if (!agent?.turnId) throw new Error('There is no known running turn to interrupt.');
    await this.client.request('turn/interrupt', { threadId: id, turnId: agent.turnId });
  }

  async compact(): Promise<void> {
    const agent = this.store.agents.get(this.store.selectedId);
    if (!agent || agent.status === 'active')
      throw new Error('Wait for this agent to finish before compacting.');
    await this.client.request('thread/compact/start', { threadId: agent.id });
  }

  async setModel(model: string): Promise<void> {
    if (!this.models.some((m) => m.id === model || m.model === model))
      throw new Error('Choose a model from /models.');
    const agent = this.store.agents.get(this.store.selectedId)!;
    if (agent.status === 'active')
      throw new Error('Wait for this agent to finish before changing its model.');
    await this.client.request('thread/settings/update', { threadId: agent.id, model });
    agent.model = model;
    this.store.changed();
  }

  async setEffort(effort: string): Promise<void> {
    const agent = this.store.agents.get(this.store.selectedId)!;
    const model = this.models.find((m) => m.id === agent.model || m.model === agent.model);
    const supported = list(model?.supportedReasoningEfforts).map((v) =>
      text(object(v).reasoningEffort),
    );
    if (!supported.includes(effort))
      throw new Error(`Available efforts: ${supported.join(', ') || 'not supplied by this model'}`);
    if (agent.status === 'active')
      throw new Error('Wait for this agent to finish before changing its effort.');
    await this.client.request('thread/settings/update', { threadId: agent.id, effort });
    agent.effort = effort;
    this.store.changed();
  }

  private onRequest(request: ServerRequest): void {
    if (request.method === 'currentTime/read') {
      this.client.respond(request.id, { currentTimeAt: Math.floor(Date.now() / 1000) });
      return;
    }
    const supported = [
      'item/commandExecution/requestApproval',
      'item/fileChange/requestApproval',
      'item/permissions/requestApproval',
      'item/tool/requestUserInput',
      'mcpServer/elicitation/request',
    ];
    if (!supported.includes(request.method)) {
      this.client.reject(
        request.id,
        `Quietline does not implement ${request.method}. No action was approved.`,
      );
      this.store.notice = `Unsupported server request: ${request.method}. No action was approved.`;
    } else this.store.requests.set(requestKey(request.id), request);
    this.store.changed();
  }

  answer(request: ServerRequest, response: ObjectValue): void {
    if (!this.store.requests.has(requestKey(request.id)))
      throw new Error('This request is no longer pending.');
    this.client.respond(request.id, response);
    this.store.requests.delete(requestKey(request.id));
    this.store.changed();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.refreshTimer);
    await this.client.stop();
  }
}
