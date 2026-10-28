import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getSupabase } from './supabaseClient';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { AuthContext, type SignInResult, type SignOutResult } from './AuthContext';

/** Returns null (and logs why) instead of crashing when the env variables are missing. */
function tryGetSupabase() {
  try {
    return getSupabase();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(tryGetSupabase);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const signOutInFlight = useRef<Promise<SignOutResult> | null>(null);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false));

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  async function signIn(email: string, password: string): Promise<SignInResult> {
    setSignOutFailed(false);
    if (!supabase) return 'unreachable';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return 'success';
      return isAuthRetryableFetchError(error) ? 'unreachable' : 'wrong-credentials';
    } catch {
      return 'unreachable';
    }
  }

  function signOut(): Promise<SignOutResult> {
    if (signOutInFlight.current) return signOutInFlight.current;

    setSignOutFailed(false);
    signOutInFlight.current = (async (): Promise<SignOutResult> => {
      try {
        if (!supabase) throw new Error('Supabase is not configured');
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
        setSession(null);
        return 'success';
      } catch {
        // An SDK auth event may already have cleared the session. Keep that state
        // and expose the failure so Staff login can also explain a late error.
        setSignOutFailed(true);
        return 'failed';
      }
    })().finally(() => {
      signOutInFlight.current = null;
    });
    return signOutInFlight.current;
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut, signOutFailed }}>
      {children}
    </AuthContext.Provider>
  );
}
