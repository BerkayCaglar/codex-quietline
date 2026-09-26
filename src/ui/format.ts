import stringWidth from 'string-width';
import { safeText } from '../protocol/json.js';
import { graphemes } from './editor.js';
import type { Agent } from '../session/store.js';

export const colors = {
  mint: '#69d3ac',
  cyan: '#7eb9ed',
  purple: '#c4a7e7',
  amber: '#eac477',
  red: '#eb8b91',
  muted: '#7d8597',
  text: '#d8dee9',
};
export function fit(value: string, width: number): string {
  const cleaned = safeText(value).replace(/\s+/g, ' ');
  if (width <= 0) return '';
  if (stringWidth(cleaned) <= width) return cleaned;
  let result = '';
  for (const character of graphemes(cleaned)) {
    if (stringWidth(result + character) > width - 1) break;
    result += character;
  }
  return result + '…';
}
export function tokens(value?: number): string {
  if (value === undefined) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}
export function percent(agent: Agent): number | undefined {
  const { context, window } = agent.usage;
  return context === undefined || !window
    ? undefined
    : Math.min(100, Math.max(0, (context / window) * 100));
}
export function meter(value: number, width = 12, ascii = false): string {
  const filled = Math.round((Math.max(0, Math.min(100, value)) * width) / 100);
  return (ascii ? '#' : '━').repeat(filled) + (ascii ? '-' : '─').repeat(width - filled);
}
export function agentState(agent: Agent): { label: string; color: string; symbol: string } {
  if (agent.flags.length) return { label: 'needs you', color: colors.amber, symbol: '!' };
  if (agent.status === 'active') return { label: 'working', color: colors.mint, symbol: '●' };
  if (agent.status === 'systemError' || agent.error)
    return { label: 'error', color: colors.red, symbol: '!' };
  if (agent.unread) return { label: 'unread', color: colors.cyan, symbol: '◆' };
  if (agent.status === 'notLoaded') return { label: 'saved', color: colors.muted, symbol: '○' };
  if (agent.status === 'idle')
    return {
      label:
        agent.lastTurnStatus === 'interrupted'
          ? 'stopped'
          : agent.lastTurnStatus === 'completed'
            ? 'done'
            : 'ready',
      color: colors.muted,
      symbol: '✓',
    };
  return { label: 'syncing', color: colors.muted, symbol: '·' };
}
