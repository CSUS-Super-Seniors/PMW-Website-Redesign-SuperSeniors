import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  inviteFlag,
  readResetLink,
  recoveryFlag,
  updatePassword,
  type PasswordLinkType,
} from '../auth/passwordReset';
import ResetPasswordPage, { type PasswordPageMode } from './ResetPasswordPage';

const linkSettings: Record<
  PasswordPageMode,
  { type: PasswordLinkType; flag: typeof recoveryFlag }
> = {
  reset: { type: 'recovery', flag: recoveryFlag },
  invite: { type: 'invite', flag: inviteFlag },
};

/**
 * Opens from the link in a reset email (Reset password) or an invite email (Set
 * password, SSPMW-271). Supabase signs the person in from the link, and this route
 * checks that the session belongs to the account the link was sent to before
 * showing the form. Anything else shows the expired state.
 */
export default function PasswordLinkRoute({ mode }: { mode: PasswordPageMode }) {
  const { session, loading, signOut } = useAuth();
  const { type, flag } = linkSettings[mode];
  // Read on the first render, before Supabase clears the tokens from the URL.
  const [link] = useState(() => {
    const found = readResetLink(window.location.href, type);
    if (found.kind === 'valid') flag.set(found.userId);
    if (found.kind === 'error') flag.clear();
    return found;
  });

  // A failed link can leave someone else's session in place (Supabase keeps an
  // existing session when the link does not work), so match the account.
  const linkUserId = link.kind === 'valid' ? link.userId : link.kind === 'none' ? flag.get() : null;
  const linkValid = !loading && linkUserId !== null && session?.user.id === linkUserId;

  useEffect(() => {
    // An old or unusable link (for example one reopened with Back after a reset)
    // must not leave the flag behind for a later sign-in in this tab.
    if (!loading && !linkValid) flag.clear();
  }, [loading, linkValid, flag]);

  if (loading) return null;

  async function save(password: string) {
    const result = await updatePassword(password);
    if (result === 'success' || result === 'expired') flag.clear();
    // Sign out the link's session so the person logs in with the new password.
    // If the server cannot confirm it, Supabase still drops the session on this
    // device and Staff login explains that logout was not confirmed.
    if (result === 'success') await signOut();
    return result;
  }

  return <ResetPasswordPage mode={mode} linkValid={linkValid} onSave={save} />;
}
