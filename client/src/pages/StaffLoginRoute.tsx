import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { routes } from '../config/site';
import StaffLoginPage from './StaffLoginPage';

export default function StaffLoginRoute() {
  const { session, loading, signIn, signOutFailed } = useAuth();
  const location = useLocation();

  const from = (location.state as { from?: string } | null)?.from;
  const destination =
    from && from.startsWith('/') && !from.startsWith('//') ? from : routes.portalHome;

  if (loading) return null;
  if (session) return <Navigate to={destination} replace />;

  return <StaffLoginPage onSignIn={signIn} logoutFailed={signOutFailed} />;
}
