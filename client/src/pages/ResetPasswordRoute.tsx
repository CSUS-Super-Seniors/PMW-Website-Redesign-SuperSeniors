import PasswordLinkRoute from './PasswordLinkRoute';

/** Opens from the link in the password reset email (SSPMW-299). */
export default function ResetPasswordRoute() {
  return <PasswordLinkRoute mode="reset" />;
}
