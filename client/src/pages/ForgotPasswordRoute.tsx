import { requestPasswordReset } from '../auth/passwordReset';
import ForgotPasswordPage from './ForgotPasswordPage';

export default function ForgotPasswordRoute() {
  return <ForgotPasswordPage onRequestReset={requestPasswordReset} />;
}
