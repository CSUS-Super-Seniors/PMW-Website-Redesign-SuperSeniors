import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchStaffAccounts, type StaffAccount, type StaffListResult } from './staff';

export type StaffAccountsState = { status: 'loading' } | StaffListResult;

export function useStaffAccounts(): {
  state: StaffAccountsState;
  retry: () => void;
  /** Shows a person who was just invited without loading the whole list again. */
  add: (person: StaffAccount) => void;
} {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const tokenRef = useRef(accessToken);
  const [result, setResult] = useState<{ userId: string; value: StaffListResult } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // An answer only counts for the user it was fetched for.
  const state: StaffAccountsState =
    result !== null && result.userId === userId ? result.value : { status: 'loading' };

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    let cancelled = false;
    fetchStaffAccounts(token).then((value) => {
      if (!cancelled) setResult({ userId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  function retry() {
    setResult(null);
    setAttempt((n) => n + 1);
  }

  function add(person: StaffAccount) {
    setResult((current) => {
      if (!current || current.value.status !== 'ok') return current;
      const others = current.value.staff.filter((row) => row.id !== person.id);
      // Same order as the server: by name.
      const staff = [...others, person].sort((a, b) => a.fullName.localeCompare(b.fullName));
      return { ...current, value: { status: 'ok', staff } };
    });
  }

  return { state, retry, add };
}
