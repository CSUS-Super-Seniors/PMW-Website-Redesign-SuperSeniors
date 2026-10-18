import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from './AuthContext';
import { getSupabase } from './supabaseClient';

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

  async function signIn(email: string, password: string) {
    if (!supabase) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn }}>{children}</AuthContext.Provider>
  );
}
