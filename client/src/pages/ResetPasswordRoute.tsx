import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { readResetLink, recoveryFlag, updatePassword } from '../auth/passwordReset';
import ResetPasswordPage from './ResetPasswordPage';

/**
 * Opens from the link in the reset email. Supabase signs the person in from the
 * link, and this route checks that the session belongs to the account the link
 * was sent to before showing the form. Anything else shows the expired state.
 */
export default function ResetPasswordRoute() {
  const { session, loading, signOut } = useAuth();
  // Read on the first render, before Supabase clears the tokens from the URL.
  const [link] = useState(() => {
    const found = readResetLink(window.location.href);
    if (found.kind === 'recovery') recoveryFlag.set(found.userId);
    if (found.kind === 'error') recoveryFlag.clear();
    return found;
  });

  // A failed link can leave someone else's session in place (Supabase keeps an
  // existing session when the link does not work), so match the account.
  const linkUserId =
    link.kind === 'recovery' ? link.userId : link.kind === 'none' ? recoveryFlag.get() : null;
  const linkValid = !loading && linkUserId !== null && session?.user.id === linkUserId;

  useEffect(() => {
    // An old or unusable link (for example one reopened with Back after a reset)
    // must not leave the flag behind for a later sign-in in this tab.
    if (!loading && !linkValid) recoveryFlag.clear();
  }, [loading, linkValid]);

  if (loading) return null;

  async function save(password: string) {
    const result = await updatePassword(password);
    if (result === 'success' || result === 'expired') recoveryFlag.clear();
    // Sign out the reset session so the person logs in with the new password.
    // If the server cannot confirm it, Supabase still drops the session on this
    // device and Staff login explains that logout was not confirmed.
    if (result === 'success') await signOut();
    return result;
  }

  return <ResetPasswordPage linkValid={linkValid} onSave={save} />;
}
