export type ObjectValue = Record<string, unknown>;

export function object(value: unknown): ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
}
export function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Untrusted model/tool text must not inject terminal control sequences. */
export function safeText(value: string): string {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '');
}
