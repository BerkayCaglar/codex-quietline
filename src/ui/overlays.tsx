import React from 'react';
import { Box, Text } from 'ink';
import wrapAnsi from 'wrap-ansi';
import { colors, fit } from './format.js';
import { graphemes } from './editor.js';
import { object, text, safeText, list } from '../protocol/json.js';
import { choicesFor, questionsFor, requestTitle } from './requests.js';
import type { ScreenProps } from './screen.js';

function Row({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box height={1} flexShrink={0}>
      {children}
    </Box>
  );
}

export function DocumentView({
  value,
  width,
  height,
  scroll,
}: {
  value: string;
  width: number;
  height: number;
  scroll: number;
}): React.ReactElement {
  const innerWidth = width - 4;
  const lines = wrapAnsi(safeText(value), innerWidth, { hard: true }).split('\n');
  const pageSize = height - 3;
  const start = Math.min(scroll, Math.max(0, lines.length - pageSize));
  return (
    <Box flexDirection="column" width={width} height={height} paddingX={2}>
      <Box flexDirection="column" height={pageSize} flexShrink={0}>
        {lines.slice(start, start + pageSize).map((line, i) => (
          <Row key={i}>
            <Text wrap="truncate">{line || ' '}</Text>
          </Row>
        ))}
      </Box>
      <Row>
        <Text color={colors.muted}>{'─'.repeat(innerWidth)}</Text>
      </Row>
      <Row>
        <Text color={colors.muted}>
          {fit(
            `PgUp/PgDn · ${start + 1}–${Math.min(lines.length, start + pageSize)}/${lines.length} · Esc back`,
            innerWidth,
          )}
        </Text>
      </Row>
    </Box>
  );
}

export function RequestView(props: ScreenProps): React.ReactElement {
  const request = props.request!;
  const width = props.width - 4;
  const thread = props.store.agents.get(text(request.params.threadId));
  const question = questionsFor(request)[props.questionIndex ?? 0];
  const form = props.requestForm ?? false;
  const input = Boolean(question) || form;
  const choice = props.choice ?? 0;
  const choices = choicesFor(request);
  const choiceCount = Math.min(choices.length, 5);
  const choiceStart = Math.max(0, Math.min(choice - choiceCount + 1, choices.length - choiceCount));
  const details = question
    ? text(question.question)
    : text(request.params.reason) || text(request.params.message) || '';
  const payload = question
    ? list(question.options)
        .map((v, i) => `${i + 1}. ${text(object(v).label)} — ${text(object(v).description)}`)
        .join('\n')
    : JSON.stringify(form ? request.params.requestedSchema : request.params, null, 2);
  const lines = wrapAnsi(safeText(details + '\n' + payload), width, { hard: true }).split('\n');
  const pageSize = Math.max(1, props.height - 7 - (input ? 3 : choiceCount));
  const start = Math.min(props.overlayScroll ?? 0, Math.max(0, lines.length - pageSize));
  const chars = graphemes(props.answer ?? '');
  const cursor = props.answerCursor ?? chars.length;
  const shown = question?.isSecret ? chars.map(() => '•') : chars;
  const withCursor = [...shown.slice(0, cursor), '▏', ...shown.slice(cursor)].join('');
  const answerLines = wrapAnsi(withCursor, width, { hard: true, trim: false }).split('\n');
  const cursorLine =
    wrapAnsi(shown.slice(0, cursor).join('') + '▏', width, { hard: true, trim: false }).split('\n')
      .length - 1;
  return (
    <Box flexDirection="column" width={props.width} height={props.height} paddingX={2}>
      <Row>
        <Text bold color={colors.amber}>
          {fit(`${requestTitle(request)} · ${thread?.name ?? 'Codex'}`, width)}
        </Text>
      </Row>
      <Row>
        <Text color={colors.muted}>{fit(`Request ${request.id} · ${request.method}`, width)}</Text>
      </Row>
      <Box flexDirection="column" height={pageSize} flexShrink={0}>
        {lines.slice(start, start + pageSize).map((line, i) => (
          <Row key={i}>
            <Text wrap="truncate">{line || ' '}</Text>
          </Row>
        ))}
      </Box>
      <Row>
        <Text color={colors.muted}>
          {fit(
            `Details ${start + 1}–${Math.min(start + pageSize, lines.length)}/${lines.length} · PgUp/PgDn`,
            width,
          )}
        </Text>
      </Row>
      <Row>
        <Text color={colors.muted}>{'─'.repeat(width)}</Text>
      </Row>
      {input ? (
        <>
          <Row>
            <Text color={colors.cyan}>
              {fit(
                form ? 'JSON response · Enter submits' : 'Option number or answer · Enter submits',
                width,
              )}
            </Text>
          </Row>
          {answerLines
            .slice(Math.max(0, cursorLine - 1), Math.max(0, cursorLine - 1) + 2)
            .map((line, i) => (
              <Row key={i}>
                <Text>{line}</Text>
              </Row>
            ))}
        </>
      ) : (
        choices.slice(choiceStart, choiceStart + choiceCount).map((item, i) => (
          <Row key={i}>
            <Text color={choiceStart + i === choice ? colors.amber : colors.muted}>
              {choiceStart + i === choice ? '› ' : '  '}
              {fit(item.label, width - 2)}
            </Text>
          </Row>
        ))
      )}
      <Row>
        <Text color={colors.muted}>
          {fit(
            !form &&
              request.method === 'mcpServer/elicitation/request' &&
              request.params.mode !== 'url'
              ? 'f fill form · Esc defer · Ctrl+C quit'
              : form
                ? 'Ctrl+B choices · Esc defer · Ctrl+C quit'
                : '↑↓ choose · Esc defer · Ctrl+C quit',
            width,
          )}
        </Text>
      </Row>
      <Row>
        <Text color={colors.amber}>{fit(props.store.notice, width)}</Text>
      </Row>
    </Box>
  );
}
