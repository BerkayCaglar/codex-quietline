#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { render } from 'ink';
import { CodexClient } from './protocol/client.js';
import { errorMessage, text } from './protocol/json.js';
import { SessionEngine } from './session/engine.js';
import { lastSession } from './session/persistence.js';
import { launchSession } from './session/launch.js';
import { App } from './ui/app.js';
import { demoEngine } from './demo.js';
import { VERSION } from './version.js';

const HELP = `codex-quietline — a quiet, agent-aware terminal for Codex

Usage: codex-quietline [options] [prompt]

  --cwd, -C PATH     Working directory (default: current directory)
  --resume ID|last   Resume a saved Codex conversation
  --model ID        Model for a new conversation
  --effort LEVEL    Reasoning effort for turns sent by this client
  --read-only       Start a new conversation in the read-only sandbox
  --codex PATH      Codex executable (default: codex on PATH)
  --demo            Explore the UI without signing in or making model calls
  --doctor          Check Codex connectivity and authentication, without a turn
  --ascii           Use an ASCII context meter
  --help, -h        Show this help
  --version, -v     Show version

Requires Node.js 22+ and Codex CLI 0.157.1+. Run codex login first.
Uses your Codex configuration. No credentials are copied.
Tab selects the agent strip. /help shows all keyboard controls.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      cwd: { type: 'string', short: 'C' },
      resume: { type: 'string' },
      model: { type: 'string' },
      effort: { type: 'string' },
      codex: { type: 'string' },
      'read-only': { type: 'boolean' },
      demo: { type: 'boolean' },
      doctor: { type: 'boolean' },
      ascii: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.version) {
    console.log(VERSION);
    return;
  }
  if (values.resume && values['read-only'])
    throw new Error(
      '--read-only applies to new conversations. It cannot silently change a resumed session.',
    );
  if (values.resume && values.cwd)
    throw new Error('--resume uses the saved workspace. Use --cwd for a new conversation.');
  let cwd = resolve(values.cwd ?? process.cwd());
  let resume = values.resume;
  if (resume === 'last') {
    const last = await lastSession();
    resume = last.id;
    if (!values.cwd) cwd = last.cwd;
  }
  const client = new CodexClient({ command: values.codex, cwd });
  if (values.doctor) {
    try {
      const hello = await client.start();
      const account = await client.request('account/read', {});
      const catalog = await client.request('model/list', {});
      console.log(`Codex: connected (${text(hello.userAgent, 'App Server')})`);
      console.log(
        `Authentication: ${account.account || account.requiresOpenaiAuth === false ? 'ready' : 'run codex login'}`,
      );
      console.log(`Models: ${Array.isArray(catalog.data) ? catalog.data.length : 0}`);
      console.log('Protocol: stdio · private server · no turn started');
      if (!account.account && account.requiresOpenaiAuth !== false) process.exitCode = 1;
    } finally {
      await client.stop();
    }
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Open Quietline in an interactive terminal. Use --doctor for a non-interactive check.',
    );
  const engine = values.demo
    ? demoEngine()
    : new SessionEngine(client, {
        cwd,
        resume,
        model: values.model,
        effort: values.effort,
        readOnly: values['read-only'],
      });
  let resolveDone!: () => void;
  let cancelled = false;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const quit = (): void => {
    if (cancelled) return;
    cancelled = true;
    resolveDone();
    void engine.stop().catch((error) => {
      engine.store.notice = errorMessage(error);
      engine.store.changed();
    });
  };
  const ui = render(<App engine={engine} onQuit={quit} ascii={values.ascii} />, {
    exitOnCtrlC: false,
    alternateScreen: true,
    maxFps: 20,
    incrementalRendering: true,
  });
  const signal = (): void => quit();
  process.once('SIGTERM', signal);
  process.once('SIGINT', signal);
  try {
    if (!values.demo) {
      await launchSession(engine, positionals.join(' '), () => cancelled);
    }
    await done;
  } finally {
    ui.unmount();
    await engine.stop();
    process.off('SIGTERM', signal);
    process.off('SIGINT', signal);
    if (!values.demo && engine.store.rootId)
      console.log(`Resume: codex-quietline --resume ${engine.store.rootId}`);
  }
}

main().catch((error) => {
  console.error(`quietline: ${errorMessage(error)}`);
  process.exitCode = 1;
});
