import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  customerListQuery,
  fetchCustomers,
  type CustomerListParams,
  type CustomerListResult,
} from './customers';

export type CustomersState = { status: 'loading' } | CustomerListResult;

export function useCustomers(params: CustomerListParams): {
  state: CustomersState;
  retry: () => void;
} {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const tokenRef = useRef(accessToken);
  const paramsRef = useRef(params);
  const [result, setResult] = useState<{ key: string; value: CustomerListResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An answer only counts for the user, filters and page it was fetched for, so
  // results for an older search never show up under a newer one.
  const query = customerListQuery(params);
  const key = `${userId}:${query}:${attempt}`;
  const state: CustomersState =
    result !== null && result.key === key ? result.value : { status: 'loading' };

  useEffect(() => {
    tokenRef.current = accessToken;
    paramsRef.current = params;
  });

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    const controller = new AbortController();
    const requestKey = `${userId}:${query}:${attempt}`;
    fetchCustomers(token, paramsRef.current, controller.signal).then((value) => {
      if (!controller.signal.aborted) setResult({ key: requestKey, value });
    });
    return () => controller.abort();
  }, [userId, query, attempt]);

  function retry() {
    setAttempt((n) => n + 1);
  }

  return { state, retry };
}
