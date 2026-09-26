import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { execFile } from 'node:child_process';
import spawn from 'cross-spawn';
import { object, text, type ObjectValue } from './json.js';
import { VERSION } from '../version.js';

export type RequestId = string | number;
export function requestKey(id: RequestId): string {
  return `${typeof id}:${id}`;
}
export interface Notification {
  method: string;
  params: ObjectValue;
}
export interface ServerRequest extends Notification {
  id: RequestId;
}
export interface ClientOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}
interface Pending {
  resolve: (value: ObjectValue) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class RpcError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
  }
}

/** One private stdio connection; owns requests and the lifetime of its server. */
export class CodexClient extends EventEmitter {
  private child?: ReturnType<typeof spawn>;
  private pending = new Map<number, Pending>();
  private sequence = 0;
  private buffer = '';
  private decoder = new StringDecoder('utf8');
  private closed = false;
  private stopping = false;
  private shutdown?: Promise<void>;
  private ended?: Promise<void>;
  readonly timeoutMs: number;

  constructor(private readonly options: ClientOptions = {}) {
    super();
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async start(): Promise<ObjectValue> {
    if (this.stopping || this.closed) throw new Error('This connection has been closed.');
    if (this.child) throw new Error('This connection has already been started.');
    this.child = spawn(
      this.options.command ?? 'codex',
      this.options.args ?? ['app-server', '--listen', 'stdio://'],
      {
        cwd: this.options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      },
    );
    this.ended = new Promise((resolve) => {
      this.child!.once('close', (code, signal) => {
        this.fail(
          new Error(
            `Codex disconnected (${signal ?? code ?? 'unknown'}). Resume the saved session to reconnect.`,
          ),
        );
        resolve();
      });
    });
    this.child.on('error', (error) =>
      this.fail(
        new Error(`Cannot start Codex: ${error.message}. Install Codex and run codex login.`),
      ),
    );
    this.child.stdin?.on('error', (error) => this.fail(error));
    this.child.stdout?.on('data', (chunk: Buffer) => this.receive(this.decoder.write(chunk)));
    // Drain stderr without retaining credentials or duplicating server logs.
    this.child.stderr?.on('data', () => {});
    const result = await this.request('initialize', {
      clientInfo: { name: 'codex_quietline', title: 'Codex Quietline', version: VERSION },
      capabilities: { experimentalApi: true },
    });
    this.notify('initialized');
    return result;
  }

  request(method: string, params?: ObjectValue): Promise<ObjectValue> {
    if (this.closed) return Promise.reject(new Error('Codex is disconnected.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `${method} timed out. Its outcome may be unknown; Quietline will not resend it automatically.`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, ...(params === undefined ? {} : { params }) });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method: string, params?: ObjectValue): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }
  respond(id: RequestId, result: ObjectValue): void {
    this.write({ id, result });
  }
  reject(id: RequestId, message: string): void {
    this.write({ id, error: { code: -32601, message } });
  }

  private write(message: ObjectValue): void {
    if (this.closed || !this.child?.stdin?.writable) throw new Error('Codex is disconnected.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(chunk: string): void {
    if (this.closed) return;
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      if (line.length > 32 * 1024 * 1024) {
        this.fail(new Error('Codex sent an oversized protocol message.'));
        return;
      }
      let message: ObjectValue;
      try {
        message = object(JSON.parse(line));
      } catch {
        this.fail(new Error('Codex sent invalid JSON on its protocol stream.'));
        return;
      }
      if (typeof message.method === 'string') {
        const event = { method: message.method, params: object(message.params) };
        if (typeof message.id === 'number' || typeof message.id === 'string')
          this.emit('request', { ...event, id: message.id });
        else this.emit('notification', event);
      } else if (typeof message.id === 'number') {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) {
          const error = object(message.error);
          pending.reject(
            new RpcError(
              text(error.message, 'Codex request failed.'),
              typeof error.code === 'number' ? error.code : undefined,
            ),
          );
        } else pending.resolve(object(message.result));
      }
    }
    if (this.buffer.length > 32 * 1024 * 1024)
      this.fail(new Error('Codex exceeded the protocol frame limit.'));
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.stopping) {
      this.emit('disconnect', error);
      void this.stop().catch((error) => this.emit('shutdownError', error));
    }
  }

  stop(): Promise<void> {
    this.shutdown ??= this.stopOwnedProcess();
    return this.shutdown;
  }

  private async waitForExit(milliseconds: number): Promise<boolean> {
    if (!this.ended) return true;
    let timer: NodeJS.Timeout | undefined;
    const exited = await Promise.race([
      this.ended.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
    clearTimeout(timer);
    return exited;
  }

  private async stopOwnedProcess(): Promise<void> {
    this.stopping = true;
    this.child?.stdin?.end();
    const exited = await this.waitForExit(1000);
    const child = this.child;
    if (child?.pid && !exited) {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve, reject) =>
          execFile(
            'taskkill.exe',
            ['/PID', String(child.pid), '/T', '/F'],
            { windowsHide: true },
            (error) =>
              error && child.exitCode === null
                ? reject(
                    new Error(
                      `Could not stop the owned Codex process ${child.pid}: ${error.message}`,
                    ),
                  )
                : resolve(),
          ),
        );
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          /* The owned group has already exited. */
        }
        if (!(await this.waitForExit(1000))) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            /* Already exited. */
          }
        }
      }
      if (!(await this.waitForExit(2000)))
        throw new Error(`Codex process ${child.pid} did not exit after shutdown.`);
    }
    this.fail(new Error('Codex connection closed.'));
  }
}
