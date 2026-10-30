import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchStaffProfile, type StaffProfileResult } from './fetchStaffProfile';

export type StaffRoleState = { status: 'loading' } | StaffProfileResult;

export function useStaffRole(): StaffRoleState {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const userId = session?.user.id;
  const tokenRef = useRef(accessToken);
  const [state, setState] = useState<StaffRoleState>({ status: 'loading' });

  useEffect(() => {
    tokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    const token = tokenRef.current;
    if (!userId || !token) return;
    let cancelled = false;
    fetchStaffProfile(token).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return state;
}
