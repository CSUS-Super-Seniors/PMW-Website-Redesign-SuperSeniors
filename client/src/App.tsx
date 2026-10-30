import { Route, Routes } from 'react-router';
import RequireAuth from './auth/RequireAuth';
import RequireRole from './auth/RequireRole';
import PortalLayout from './components/layout/PortalLayout';
import PublicLayout from './components/layout/PublicLayout';
import { routes } from './config/site';
import ContactPage from './pages/ContactPage';
import DesignTokensPage from './pages/DesignTokensPage';
import NotFoundPage from './pages/NotFoundPage';
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
        <Route path="/portal" element={<PortalLayout />}>
          <Route element={<RequireRole allowed={['owner']} />}>
            <Route path="inquiries/*" element={<PlaceholderPage />} />
            <Route path="customers/*" element={<PlaceholderPage />} />
            <Route path="reports/*" element={<PlaceholderPage />} />
            <Route path="staff-accounts/*" element={<PlaceholderPage />} />
            <Route path="testimonials/*" element={<PlaceholderPage />} />
          </Route>
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Route>

      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />

        {/* Implemented public pages */}
        <Route path={routes.services} element={<ServicesPage />} />
        <Route path={routes.contact} element={<ContactPage />} />

        {/* Planned pages that are not implemented yet */}
        {[
          routes.gallery,
          routes.serviceArea,
          routes.testimonials,
          routes.about,
          routes.requestEstimate,
          routes.privacy,
          routes.terms,
          routes.staffForgotPassword,
        ].map((path) => (
          <Route key={path} path={path} element={<PlaceholderPage />} />
        ))}

        {/* Unknown URLs display the helpful 404 page */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {import.meta.env.DEV && <Route path="/design-tokens" element={<DesignTokensPage />} />}
    </Routes>
  );
}
