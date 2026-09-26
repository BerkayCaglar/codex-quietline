import { useEffect, useState, type SetStateAction } from 'react';
import type { ObjectValue } from '../protocol/json.js';
import type { Draft } from './editor.js';

interface RequestEditor {
  choice: number;
  draft: Draft;
  questionIndex: number;
  answers: ObjectValue;
  form: boolean;
}
function empty(): RequestEditor {
  return { choice: 0, draft: { value: '', cursor: 0 }, questionIndex: 0, answers: {}, form: false };
}

export function useRequestEditor(
  key: string,
  pendingKeys: string[],
): {
  editor: RequestEditor;
  set: <K extends keyof RequestEditor>(field: K, change: SetStateAction<RequestEditor[K]>) => void;
} {
  const [editors, setEditors] = useState<Record<string, RequestEditor>>({});
  const pendingSignature = JSON.stringify(pendingKeys);
  useEffect(() => {
    const live = new Set<string>(JSON.parse(pendingSignature) as string[]);
    setEditors((previous) =>
      Object.keys(previous).some((id) => !live.has(id))
        ? Object.fromEntries(Object.entries(previous).filter(([id]) => live.has(id)))
        : previous,
    );
  }, [pendingSignature]);
  return {
    editor: editors[key] ?? empty(),
    set: (field, change) =>
      setEditors((previous) => {
        const current = previous[key] ?? empty();
        const next =
          typeof change === 'function'
            ? (change as (value: (typeof current)[typeof field]) => (typeof current)[typeof field])(
                current[field],
              )
            : change;
        return { ...previous, [key]: { ...current, [field]: next } };
      }),
  };
}
