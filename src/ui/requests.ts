import { object, list, text, type ObjectValue } from '../protocol/json.js';
import type { ServerRequest } from '../protocol/client.js';

export interface Choice {
  label: string;
  response: ObjectValue;
}
export function choicesFor(request: ServerRequest): Choice[] {
  if (request.method === 'item/permissions/requestApproval')
    return [
      { label: 'Deny additional permissions', response: { permissions: {}, scope: 'turn' } },
      {
        label: 'Grant these permissions for this turn',
        response: { permissions: object(request.params.permissions), scope: 'turn' },
      },
    ];
  if (request.method === 'mcpServer/elicitation/request')
    return [
      { label: 'Decline', response: { action: 'decline' } },
      { label: 'Cancel', response: { action: 'cancel' } },
      ...(request.params.mode === 'url'
        ? [{ label: 'I completed the browser flow', response: { action: 'accept' } }]
        : []),
    ];
  const offered = list(request.params.availableDecisions);
  const decisions = offered.length ? offered : ['accept', 'acceptForSession', 'decline', 'cancel'];
  const labels: Record<string, string> = {
    accept: 'Allow once',
    acceptForSession: 'Allow for this session',
    decline: 'Decline',
    cancel: 'Cancel this turn',
  };
  return [...decisions]
    .sort(
      (a, b) =>
        Number(a === 'accept' || a === 'acceptForSession') -
        Number(b === 'accept' || b === 'acceptForSession'),
    )
    .map((decision) => ({
      label:
        typeof decision === 'string' ? (labels[decision] ?? decision) : JSON.stringify(decision),
      response: { decision },
    }));
}
export function questionsFor(request: ServerRequest): ObjectValue[] {
  return list(request.params.questions).map(object);
}
export function requestTitle(request: ServerRequest): string {
  if (request.method.includes('requestUserInput')) return 'A question for you';
  if (request.method.includes('elicitation'))
    return `${text(request.params.serverName, 'MCP')} needs your input`;
  if (request.method.includes('permissions')) return 'Additional permissions';
  return 'Review before allowing';
}
