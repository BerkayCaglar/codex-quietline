import React from 'react';
import { Box, Text } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { colors, fit, tokens, meter, percent, agentState } from './format.js';
import { graphemes } from './editor.js';
import { safeText } from '../protocol/json.js';
import { RequestView, DocumentView } from './overlays.js';
import type { SessionStore, Agent } from '../session/store.js';
import type { ServerRequest } from '../protocol/client.js';

export interface ScreenProps {
  store: SessionStore;
  width: number;
  height: number;
  focus: 'composer' | 'agents';
  cwd: string;
  ascii?: boolean;
  help?: boolean;
  modal?: string;
  confirming?: boolean;
  request?: ServerRequest;
  choice?: number;
  answer?: string;
  answerCursor?: number;
  requestForm?: boolean;
  questionIndex?: number;
  overlayScroll?: number;
}
interface Line {
  value: string;
  color?: string;
  bold?: boolean;
}
export function transcriptLines(agent: Agent | undefined, width: number): Line[] {
  if (!agent) return [];
  const lines: Line[] = [];
  for (const entry of agent.entries) {
    if (entry.kind === 'reasoning' && !entry.body) continue;
    lines.push({
      value: fit(entry.title + (entry.status === 'failed' ? ' · failed' : ''), width),
      color:
        entry.kind === 'userMessage'
          ? colors.cyan
          : entry.kind === 'agentMessage'
            ? colors.mint
            : colors.purple,
      bold: true,
    });
    let code = false;
    for (const raw of entry.body.split('\n')) {
      if (raw.startsWith('```')) {
        code = !code;
        lines.push({ value: code ? `┌ ${raw.slice(3) || 'code'}` : '└', color: colors.muted });
        continue;
      }
      const heading = /^#{1,6}\s/.test(raw);
      const value = heading ? raw.replace(/^#{1,6}\s/, '') : raw;
      for (const wrapped of wrapAnsi(safeText(value), Math.max(1, width - (code ? 2 : 0)), {
        hard: true,
        trim: false,
      }).split('\n')) {
        lines.push({
          value: (code ? '│ ' : '') + wrapped,
          color: code ? colors.cyan : heading ? colors.text : undefined,
          bold: heading,
        });
      }
    }
    lines.push({ value: '' });
  }
  if (agent.error) lines.push({ value: fit(agent.error, width), color: colors.red });
  return lines;
}

function Context({
  agent,
  compact = false,
  ascii = false,
}: {
  agent: Agent;
  compact?: boolean;
  ascii?: boolean;
}): React.ReactElement {
  const used = percent(agent);
  const color =
    used === undefined
      ? colors.muted
      : used >= 90
        ? colors.red
        : used >= 75
          ? colors.amber
          : colors.mint;
  return (
    <Text color={color}>
      {used === undefined
        ? 'context —'
        : `${meter(used, compact ? 7 : 12, ascii)} ${Math.round(used)}%`}
      {!compact && used !== undefined
        ? ` ${tokens(agent.usage.context)}/${tokens(agent.usage.window)}`
        : ''}
    </Text>
  );
}

export function Screen(props: ScreenProps): React.ReactElement {
  const { store, focus, request } = props;
  if (props.width < 40 || props.height < 16)
    return (
      <Box flexDirection="column" width={props.width}>
        <Text color={colors.amber}>
          {props.confirming ? 'Quit running work?' : 'Quietline needs 40 × 16 cells.'}
        </Text>
        <Text>
          {props.confirming ? 'y quit · Esc stay' : 'Resize to continue · Ctrl+C to quit'}
        </Text>
      </Box>
    );
  const width = Math.max(18, props.width - 4);
  if (props.modal || props.help)
    return (
      <DocumentView
        value={props.modal || HELP.join('\n')}
        width={props.width}
        height={props.height}
        scroll={props.overlayScroll ?? 0}
      />
    );
  if (request) return <RequestView {...props} />;
  const agent = store.agents.get(store.selectedId);
  const tree = store.tree();
  const agentBudget = Math.max(1, Math.min(6, Math.floor(props.height / 5)));
  const index = Math.max(
    0,
    tree.findIndex((row) => row.agent.id === store.selectedId),
  );
  const first = Math.min(
    Math.max(0, index - agentBudget + 1),
    Math.max(0, tree.length - agentBudget),
  );
  const visibleAgents = tree.slice(first, first + agentBudget);
  const bodyHeight = Math.max(3, props.height - visibleAgents.length - 11);
  const content = transcriptLines(agent, width);
  const offset = Math.min(agent?.scroll ?? 0, Math.max(0, content.length - bodyHeight));
  const body = content.slice(
    Math.max(0, content.length - bodyHeight - offset),
    content.length - offset,
  );
  const totalRequests = store.requests.size;
  const working = tree.filter((row) => row.agent.status === 'active').length;
  const chars = graphemes(agent?.draft ?? '');
  const cursor = agent?.cursor ?? 0;
  const draft = [...chars.slice(0, cursor), '▏', ...chars.slice(cursor)].join('');
  const draftLines = wrapAnsi(draft, Math.max(10, width - 3), { hard: true, trim: false }).split(
    '\n',
  );
  const cursorLine =
    wrapAnsi(chars.slice(0, cursor).join('') + '▏', Math.max(10, width - 3), {
      hard: true,
      trim: false,
    }).split('\n').length - 1;
  const shownDraft = draftLines
    .slice(Math.max(0, cursorLine - 1), Math.max(0, cursorLine - 1) + 2)
    .join('\n');
  const narrow = width < 75;
  const readOnlyAgent =
    agent &&
    (agent.directInput === false || (agent.id !== store.rootId && agent.directInput !== true));
  const cacheRate =
    agent?.usage.input && agent.usage.cached !== undefined
      ? (100 * agent.usage.cached) / agent.usage.input
      : undefined;
  return (
    <Box
      flexDirection="column"
      width={props.width}
      height={props.height}
      paddingX={2}
      overflow="hidden"
    >
      <Box justifyContent="space-between" height={2} flexShrink={0}>
        <Text bold color={colors.mint}>
          quietline{' '}
          <Text color={colors.muted}>
            / {fit(props.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? '', Math.max(5, width - 45))}
          </Text>
        </Text>
        <Text color={store.connection === 'disconnected' ? colors.red : colors.muted}>
          {store.connection !== 'ready'
            ? store.connection
            : `${working} working${totalRequests ? ` · ${totalRequests} need you` : ''}`}
        </Text>
      </Box>
      <Box flexDirection="column" height={bodyHeight} flexShrink={0} overflow="hidden">
        {content.length ? (
          body.map((line, i) => (
            <Text key={i} color={line.color} bold={line.bold} wrap="truncate">
              {line.value || ' '}
            </Text>
          ))
        ) : (
          <Box flexDirection="column" paddingTop={Math.min(3, Math.max(0, bodyHeight - 5))}>
            <Text bold color={colors.text}>
              Room to think. Everything in view.
            </Text>
            <Text color={colors.muted}>Start a conversation. Your agents will appear below.</Text>
            <Text> </Text>
            <Text color={colors.muted}>/help shortcuts and commands</Text>
            <Text color={colors.muted}>Tab move between the composer and agents</Text>
          </Box>
        )}
      </Box>
      <Text color={colors.muted}>{(props.ascii ? '-' : '─').repeat(width)}</Text>
      <Box height={2} flexShrink={0}>
        <Text color={focus === 'composer' ? colors.mint : colors.muted}>{'> '}</Text>
        <Text color={focus === 'composer' ? colors.text : colors.muted}>
          {readOnlyAgent && !agent.draft
            ? fit('Inspecting agent · direct messages unavailable · /help', width - 3)
            : shownDraft || ' '}
        </Text>
      </Box>
      <Box height={1} flexShrink={0} justifyContent="space-between">
        <Text color={colors.purple}>
          {fit(
            `${agent?.model || 'Codex'}${agent?.effort ? ` · ${agent.effort}` : ''}`,
            narrow ? Math.floor(width / 2) : 35,
          )}
        </Text>
        {agent && <Context agent={agent} compact={narrow} ascii={props.ascii} />}
        {width >= 110 && cacheRate !== undefined && cacheRate < 90 && (
          <Text color={colors.amber}>cache {Math.round(cacheRate)}%</Text>
        )}
        {!narrow &&
          store.limits
            .filter((limit) => limit.used >= 70)
            .slice(0, 1)
            .map((limit) => (
              <Text key={limit.minutes} color={limit.used >= 90 ? colors.red : colors.amber}>
                {limit.minutes >= 60 ? `${Math.round(limit.minutes / 60)}h` : `${limit.minutes}m`}{' '}
                {Math.round(limit.used)}%
              </Text>
            ))}
      </Box>
      <Text color={colors.muted}>{(props.ascii ? '-' : '─').repeat(width)}</Text>
      {visibleAgents.map(({ agent: row, depth }) => {
        const state = agentState(row);
        const selected = row.id === store.selectedId;
        const pending = Array.from(store.requests.values()).some(
          (r) => r.params.threadId === row.id,
        );
        const nameWidth = Math.max(7, Math.min(20, Math.floor(width / 4)));
        return (
          <Box key={row.id} height={1} flexShrink={0}>
            <Text color={selected ? colors.mint : colors.muted}>
              {selected ? (focus === 'agents' ? '▶ ' : '› ') : '  '}
            </Text>
            <Box width={nameWidth}>
              <Text bold={selected} color={selected ? colors.text : colors.muted}>
                {fit(
                  `${' '.repeat(Math.min(depth, 3) * 2)}${depth ? '↳ ' : ''}${row.id === store.rootId ? 'Main' : row.name}`,
                  nameWidth,
                )}
              </Text>
            </Box>
            <Box width={12}>
              <Text color={pending ? colors.amber : state.color}>
                {pending ? '! needs you' : `${state.symbol} ${state.label}`}
              </Text>
            </Box>
            {width >= 110 && (
              <Box width={23}>
                <Text color={colors.purple}>
                  {fit(`${row.model || 'Codex'}${row.effort ? ` · ${row.effort}` : ''}`, 22)}
                </Text>
              </Box>
            )}
            {width >= 65 && (
              <Box flexGrow={1}>
                <Text color={colors.muted} wrap="truncate">
                  {fit(
                    row.activity || row.role || 'Ready when you are',
                    Math.max(5, width - nameWidth - 33 - (width >= 110 ? 23 : 0)),
                  )}
                </Text>
              </Box>
            )}
            {width >= 48 && <Context agent={row} compact ascii={props.ascii} />}
          </Box>
        );
      })}
      <Text color={colors.muted}>
        {fit(
          tree.length > visibleAgents.length
            ? `${first + 1}–${first + visibleAgents.length} of ${tree.length} agents · ↑↓ to reveal more`
            : agent && offset
              ? `↑ ${offset} lines above live · End to return`
              : ' ',
          width,
        )}
      </Text>
      <Text color={store.notice ? colors.amber : colors.muted} wrap="truncate">
        {fit(
          store.notice ||
            (totalRequests
              ? `${totalRequests} requests · Ctrl+R review · a attention`
              : focus === 'agents'
                ? '↑↓ select · Enter open · a attention · x interrupt · Tab compose'
                : 'Tab agents · Alt+↑↓ switch · PgUp/PgDn scroll · /help · Ctrl+C quit'),
          width,
        )}
      </Text>
    </Box>
  );
}

export const HELP = [
  'QUIETLINE / KEYBOARD',
  '',
  'Tab               Switch composer / agent strip',
  '↑ ↓ / j k         Select an agent (strip focused)',
  'Enter             Open selected agent / send message',
  'Alt+↑ ↓           Switch agent from the composer',
  'a                 Jump to next request or unread agent',
  'x                 Interrupt selected agent (confirm)',
  'PgUp / PgDn       Scroll selected conversation',
  'End               Return to live output (strip focused)',
  'Alt+Enter         Insert a newline; pasted newlines are kept',
  'Ctrl+A/E/U/K/W    Edit: start/end/clear-before/after/word',
  'Ctrl+C            Quit (confirm while work is running)',
  'Ctrl+R            Review pending requests; Esc defers',
  '',
  'COMMANDS',
  '/help             This screen (Esc to close)',
  '/agents           Focus the persistent agent strip',
  '/main             Return to the main conversation',
  '/attention        Jump to the next request/unread result',
  '/status           Usage, session ID and runtime details',
  '/models           List the account’s available models',
  '/model ID         Change the idle agent’s model',
  '/effort LEVEL     Set reasoning effort for new turns',
  '/compact          Explicitly compact an idle conversation',
  '/export PATH      Export the selected transcript as Markdown',
  '/stop             Interrupt selected turn (confirm)',
  '/quit             Save session ID and exit',
  '',
  'This is a Codex client with its own commands. Unknown slash commands',
  'are never silently sent as prompts. No automatic approvals or compaction.',
];
