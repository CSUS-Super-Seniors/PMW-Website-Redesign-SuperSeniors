import { useEffect, useState } from 'react';

type Result<T> = { status: 'ready'; data: T } | { status: 'error' };

/** Sections load and retry independently; an old request cannot overwrite a retry. */
export function usePublicContent<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; value: Result<T> } | null>(null);
  const state = result?.attempt === attempt ? result.value : ({ status: 'loading' } as const);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ attempt, value: { status: 'ready', data } });
      },
      () => {
        if (!controller.signal.aborted) setResult({ attempt, value: { status: 'error' } });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  return { state, retry: () => setAttempt((value) => value + 1) };
}
