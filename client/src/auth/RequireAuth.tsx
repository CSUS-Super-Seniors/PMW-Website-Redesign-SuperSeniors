import { Navigate, Outlet, useLocation } from 'react-router';
import { routes } from '../config/site';
import { useAuth } from './AuthContext';

export default function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <p role="status" className="type-body text-neutral-600">
          Loading...
        </p>
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to={routes.staffLogin}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}
