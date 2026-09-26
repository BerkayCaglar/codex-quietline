import type { Key } from 'ink';

export interface Draft {
  value: string;
  cursor: number;
}
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function graphemes(value: string): string[] {
  return Array.from(segmenter.segment(value), (part) => part.segment);
}

/** Cursor offsets count graphemes, including pasted multi-line and emoji text. */
export function edit(draft: Draft, input: string, key: Partial<Key>): Draft {
  const chars = graphemes(draft.value);
  let cursor = Math.min(draft.cursor, chars.length);
  if (key.leftArrow) cursor = Math.max(0, cursor - 1);
  else if (key.rightArrow) cursor = Math.min(chars.length, cursor + 1);
  else if (key.home || (key.ctrl && input === 'a')) cursor = 0;
  else if (key.end || (key.ctrl && input === 'e')) cursor = chars.length;
  else if (key.backspace) {
    if (cursor > 0) chars.splice(--cursor, 1);
  } else if (key.delete) chars.splice(cursor, 1);
  else if (key.ctrl && input === 'u') {
    chars.splice(0, cursor);
    cursor = 0;
  } else if (key.ctrl && input === 'k') chars.splice(cursor);
  else if (key.ctrl && input === 'w') {
    const end = cursor;
    while (cursor > 0 && /\s/.test(chars[cursor - 1]!)) cursor--;
    while (cursor > 0 && !/\s/.test(chars[cursor - 1]!)) cursor--;
    chars.splice(cursor, end - cursor);
  } else if (key.return && (key.shift || key.meta)) {
    chars.splice(cursor++, 0, '\n');
  } else if (!key.ctrl && !key.meta && !key.escape && !key.return && !key.tab && input) {
    const inserted = graphemes(
      input.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ''),
    );
    chars.splice(cursor, 0, ...inserted);
    cursor += inserted.length;
  }
  return { value: chars.join(''), cursor };
}
