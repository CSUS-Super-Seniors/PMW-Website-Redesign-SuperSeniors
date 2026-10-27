import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { fetchStaffProfile, type StaffProfileResult } from './fetchStaffProfile';

export type StaffRoleState = { status: 'loading' } | StaffProfileResult;

export function useStaffRole(): StaffRoleState {
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [state, setState] = useState<StaffRoleState>({ status: 'loading' });

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetchStaffProfile(accessToken).then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return state;
}
