import { useEffect, useState, type ReactNode } from 'react';
import { getSupabase } from './supabaseClient';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { AuthContext, type SignInResult } from './AuthContext';

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
    if (!supabase) return 'unreachable';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error) return 'success';
      return isAuthRetryableFetchError(error) ? 'unreachable' : 'wrong-credentials';
    } catch {
      return 'unreachable';
    }
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn }}>{children}</AuthContext.Provider>
  );
}
