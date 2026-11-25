import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchCustomerOptions, type CustomerOptionsResult } from './jobs';

export type CustomerOptionsState = { status: 'loading' } | CustomerOptionsResult;

export function useCustomerOptions(): { state: CustomerOptionsState; retry: () => void } {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const tokenRef = useRef(accessToken);
  const [result, setResult] = useState<{ key: string; value: CustomerOptionsResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${attempt}`;
  const state: CustomerOptionsState =
    result !== null && result.key === key ? result.value : { status: 'loading' };

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    let cancelled = false;
    const requestKey = `${userId}:${attempt}`;
    fetchCustomerOptions(token).then((value) => {
      if (!cancelled) setResult({ key: requestKey, value });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  function retry() {
    setAttempt((n) => n + 1);
  }

  return { state, retry };
}
