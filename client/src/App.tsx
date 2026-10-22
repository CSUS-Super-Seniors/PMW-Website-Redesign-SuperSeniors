import { Route, Routes } from 'react-router';
import RequireAuth from './auth/RequireAuth';
import PortalLayout from './components/layout/PortalLayout';
import PublicLayout from './components/layout/PublicLayout';
import { routes } from './config/site';
import DesignTokensPage from './pages/DesignTokensPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ServicesPage from './pages/ServicesPage';
import StaffLoginRoute from './pages/StaffLoginRoute';

function Home() {
  return (
    <main className="mx-auto w-full max-w-content px-4 py-10 xl:px-8">
      <h1 className="type-h1">Peterson Mobile Woodworking</h1>
      <p className="type-body-lg mt-2 text-neutral-600">
        Website redesign starter. Replace this page in Sprint 2.
      </p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path={routes.staffLogin} element={<StaffLoginRoute />} />
      <Route element={<RequireAuth />}>
        {/* Every portal page sits behind the login. The portal pages replace this placeholder. */}
        <Route path="/portal" element={<PortalLayout />}>
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Route>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path={routes.services} element={<ServicesPage />} />
        {/* Public pages are built in epic C. Until then every other path shows a placeholder. */}
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
      {import.meta.env.DEV && <Route path="/design-tokens" element={<DesignTokensPage />} />}
    </Routes>
  );
}
