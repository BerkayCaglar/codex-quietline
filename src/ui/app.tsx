import React, { useState, useSyncExternalStore, useEffect } from 'react';
import { useInput, useStdout } from 'ink';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { SessionEngine } from '../session/engine.js';
import { object, text, list, errorMessage, type ObjectValue } from '../protocol/json.js';
import { edit, graphemes } from './editor.js';
import { choicesFor, questionsFor } from './requests.js';
import { Screen } from './screen.js';
import { useRequestEditor } from './request-editor.js';
import { requestKey as rpcRequestKey } from '../protocol/client.js';

export interface AppProps {
  engine: SessionEngine;
  onQuit: () => void;
  ascii?: boolean;
  dimensions?: { width: number; height: number };
}
export function App({ engine, onQuit, ascii, dimensions }: AppProps): React.ReactElement {
  const store = engine.store;
  useSyncExternalStore(store.subscribe, store.snapshot);
  const { stdout } = useStdout();
  const [size, setSize] = useState({ width: stdout.columns || 100, height: stdout.rows || 30 });
  const [focus, setFocus] = useState<'composer' | 'agents'>('composer');
  const [help, setHelp] = useState(false);
  const [modal, setModal] = useState('');
  const [confirm, setConfirm] = useState<'quit' | 'stop' | undefined>();
  const [overlayScroll, setOverlayScroll] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const pending = Array.from(store.requests.values());
  const candidate = pending.find((r) => r.params.threadId === store.selectedId) ?? pending[0];
  const request = reviewing ? candidate : undefined;
  const requestKey = candidate ? rpcRequestKey(candidate.id) : '';
  const { editor, set } = useRequestEditor(
    requestKey,
    pending.map((r) => rpcRequestKey(r.id)),
  );
  const { choice, draft: answerDraft, questionIndex, answers, form } = editor;
  const answer = answerDraft.value;
  const setAnswer = (value: string): void =>
    set('draft', { value, cursor: graphemes(value).length });
  const setChoice = (change: React.SetStateAction<number>): void => set('choice', change);
  const setQuestionIndex = (change: React.SetStateAction<number>): void =>
    set('questionIndex', change);
  const setAnswers = (value: ObjectValue): void => set('answers', value);
  const setForm = (value: boolean): void => set('form', value);
  useEffect(() => {
    setOverlayScroll(0);
    if (!requestKey) setReviewing(false);
  }, [requestKey]);
  useEffect(() => {
    const resize = (): void => setSize({ width: stdout.columns || 100, height: stdout.rows || 30 });
    stdout.on('resize', resize);
    return () => {
      stdout.off('resize', resize);
    };
  }, [stdout]);
  const run = (operation: Promise<unknown>): void => {
    void operation.catch((error) => {
      store.notice = errorMessage(error);
      store.changed();
    });
  };
  const select = (direction: number): void => {
    const rows = store.tree();
    const index = rows.findIndex((row) => row.agent.id === store.selectedId);
    const next = rows[(index + direction + rows.length) % rows.length];
    if (next) run(engine.select(next.agent.id));
  };
  const attention = (): void => {
    const rows = store.tree().map((row) => row.agent);
    const start = rows.findIndex((a) => a.id === store.selectedId);
    const next = [...rows.slice(start + 1), ...rows.slice(0, start + 1)].find(
      (a) => a.unread || pending.some((r) => r.params.threadId === a.id) || a.error,
    );
    if (next) {
      setFocus('agents');
      setReviewing(pending.some((r) => r.params.threadId === next.id));
      run(engine.select(next.id));
    } else {
      store.notice = 'Nothing needs your attention.';
      store.changed();
    }
  };
  const quit = (): void => {
    if (store.tree().some((row) => row.agent.status === 'active') || store.requests.size) {
      setConfirm('quit');
      setModal(
        'Work is still running.\n\nQuitting closes this private Codex server and interrupts its work.\nSaved conversations can be resumed.\n\nPress y to quit, or Esc to stay.',
      );
    } else onQuit();
  };

  const command = async (value: string, consumeDraft = false): Promise<void> => {
    const [name = '', ...args] = value.trim().split(/\s+/);
    const arg = args.join(' ');
    const agent = store.agents.get(store.selectedId);
    setOverlayScroll(0);
    switch (name) {
      case '/help':
        setHelp(true);
        break;
      case '/agents':
        setFocus('agents');
        break;
      case '/main':
        await engine.select(store.rootId);
        break;
      case '/attention':
        attention();
        break;
      case '/quit':
        quit();
        break;
      case '/stop':
        setConfirm('stop');
        setModal(
          `Interrupt ${agent?.name ?? 'this agent'}?\n\nPress y to interrupt its current turn, or Esc to return.`,
        );
        break;
      case '/status':
        setModal(
          JSON.stringify(
            {
              threadId: agent?.id,
              parentId: agent?.parentId,
              model: agent?.model,
              effort: agent?.effort,
              status: agent?.status,
              directInput: agent?.directInput,
              usage: agent?.usage,
              limits: store.limits,
              approvals: engine.permissions,
              connection: store.connection,
            },
            null,
            2,
          ),
        );
        break;
      case '/models':
        setModal(
          engine.models
            .map(
              (model) =>
                `${text(model.id)}  ${text(model.displayName)}\n  ${text(model.description)}`,
            )
            .join('\n\n') + '\n\nUse /model ID to select.',
        );
        break;
      case '/model':
        await engine.setModel(arg);
        break;
      case '/effort':
        await engine.setEffort(arg);
        break;
      case '/compact':
        await engine.compact();
        break;
      case '/export': {
        if (!arg || !agent) throw new Error('Usage: /export PATH (creates a new Markdown file)');
        const path = resolve(engine.options.cwd, arg);
        await writeFile(
          path,
          `# ${agent.name}\n\nThread: ${agent.id}\n\n` +
            agent.entries.map((e) => `## ${e.title}\n\n${e.body}\n`).join('\n'),
          { flag: 'wx', mode: 0o600 },
        );
        store.notice = `Exported to ${path}`;
        break;
      }
      default:
        throw new Error(`Unknown command ${name}. Use /help. Nothing was sent.`);
    }
    if (agent && consumeDraft && agent.draft === value) {
      agent.draft = '';
      agent.cursor = 0;
    }
    store.changed();
  };

  useInput((input, key) => {
    if (key.eventType === 'release') return;
    if (key.ctrl && input === 'c') {
      quit();
      return;
    }
    if (confirm) {
      if (input.toLowerCase() === 'y') {
        if (confirm === 'quit') onQuit();
        else run(engine.interrupt(store.selectedId));
        setConfirm(undefined);
        setModal('');
      } else if (key.escape || input.toLowerCase() === 'n') {
        setConfirm(undefined);
        setModal('');
      }
      return;
    }
    if ((dimensions?.width ?? size.width) < 40 || (dimensions?.height ?? size.height) < 16) return;
    if (key.pageUp || key.pageDown) {
      if (help || modal || request)
        setOverlayScroll((v) => Math.max(0, v + (key.pageDown ? 5 : -5)));
      else {
        const agent = store.agents.get(store.selectedId);
        if (agent) {
          agent.scroll = Math.max(0, agent.scroll + (key.pageUp ? 8 : -8));
          store.changed();
        }
      }
      return;
    }
    if (help || modal) {
      if (key.escape) {
        setHelp(false);
        setModal('');
        setOverlayScroll(0);
      }
      return;
    }
    if (key.ctrl && input === 'r') {
      setReviewing((value) => !value);
      setOverlayScroll(0);
      return;
    }
    if (request) {
      if (key.escape) {
        setReviewing(false);
        return;
      }
      if (key.ctrl && input === 'b' && form) {
        setForm(false);
        return;
      }
      const question = questionsFor(request)[questionIndex];
      if (question || form) {
        if (key.return && !key.shift && !key.meta) {
          try {
            if (form) {
              const value: unknown = JSON.parse(answer);
              const schema = object(request.params.requestedSchema);
              const validator = text(schema.$schema).includes('2020')
                ? new Ajv2020({ strict: false })
                : new Ajv({ strict: false });
              const validate = validator.compile(schema);
              if (!validate(value)) throw new Error(validator.errorsText(validate.errors));
              engine.answer(request, { action: 'accept', content: value });
            } else if (question) {
              if (!answer.trim()) throw new Error('Enter an answer.');
              const option = list(question.options)[Number(answer.trim()) - 1];
              const value = option ? text(object(option).label) : answer;
              const next = { ...answers, [text(question.id)]: { answers: [value] } };
              if (questionIndex + 1 < questionsFor(request).length) {
                setAnswers(next);
                setQuestionIndex((v) => v + 1);
                setAnswer('');
              } else engine.answer(request, { answers: next });
            }
          } catch (error) {
            store.notice = errorMessage(error);
            store.changed();
          }
        } else set('draft', (previous) => edit(previous, input, key));
        return;
      }
      const choices = choicesFor(request);
      if (key.upArrow) setChoice((v) => (v - 1 + choices.length) % choices.length);
      else if (key.downArrow) setChoice((v) => (v + 1) % choices.length);
      else if (key.return && choices[choice]) {
        try {
          engine.answer(request, choices[choice]!.response);
        } catch (error) {
          store.notice = errorMessage(error);
          store.changed();
        }
      } else if (
        input === 'f' &&
        request.method === 'mcpServer/elicitation/request' &&
        request.params.mode !== 'url'
      ) {
        setForm(true);
      }
      return;
    }
    if (key.tab) {
      setFocus((v) => (v === 'composer' ? 'agents' : 'composer'));
      return;
    }
    if (key.meta && (key.upArrow || key.downArrow)) {
      select(key.upArrow ? -1 : 1);
      return;
    }
    if (focus === 'agents') {
      if (key.upArrow || input === 'k') select(-1);
      else if (key.downArrow || input === 'j') select(1);
      else if (key.return || key.escape) setFocus('composer');
      else if (input === 'a') attention();
      else if (input === 'x') run(command('/stop'));
      else if (input === '?') setHelp(true);
      else if (key.end) {
        const agent = store.agents.get(store.selectedId);
        if (agent) {
          agent.scroll = 0;
          store.changed();
        }
      }
      return;
    }
    const agent = store.agents.get(store.selectedId);
    if (!agent) return;
    if (key.return && !key.shift && !key.meta) {
      if (agent.draft.startsWith('/')) run(command(agent.draft, true));
      else run(engine.send(agent.id, agent.draft));
    } else {
      const next = edit({ value: agent.draft, cursor: agent.cursor }, input, key);
      agent.draft = next.value;
      agent.cursor = next.cursor;
      store.changed();
    }
  });
  return (
    <Screen
      store={store}
      cwd={engine.options.cwd}
      width={dimensions?.width ?? size.width}
      height={dimensions?.height ?? size.height}
      focus={focus}
      ascii={ascii}
      help={help}
      modal={modal}
      confirming={Boolean(confirm)}
      request={request}
      requestForm={form}
      choice={choice}
      answer={answer}
      answerCursor={answerDraft.cursor}
      questionIndex={questionIndex}
      overlayScroll={overlayScroll}
    />
  );
}
