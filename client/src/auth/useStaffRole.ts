import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchStaffProfile, type StaffProfileResult } from './fetchStaffProfile';

export type StaffRoleState = { status: 'loading' } | StaffProfileResult;

export function useStaffRole(): { state: StaffRoleState; retry: () => void } {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const tokenRef = useRef(accessToken);
  const [result, setResult] = useState<{ userId: string; value: StaffProfileResult } | null>(null);
  // An answer only counts for the user it was fetched for.
  const state: StaffRoleState =
    result !== null && result.userId === userId ? result.value : { status: 'loading' };
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    let cancelled = false;
    fetchStaffProfile(token).then((value) => {
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

  return { state, retry };
}
