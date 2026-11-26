import PasswordLinkRoute from './PasswordLinkRoute';

/** Opens from the link in the staff invite email (SSPMW-271, N4). */
export default function SetPasswordRoute() {
  return <PasswordLinkRoute mode="invite" />;
}
