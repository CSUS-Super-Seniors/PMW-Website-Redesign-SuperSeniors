import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export type SignInResult = 'success' | 'wrong-credentials' | 'unreachable';
export type SignOutResult = 'success' | 'failed';

export type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signOutFailed: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<SignOutResult>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
