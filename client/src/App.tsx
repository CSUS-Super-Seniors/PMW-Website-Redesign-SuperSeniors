import { Route, Routes } from 'react-router';
import RequireAuth from './auth/RequireAuth';
import RequireRole from './auth/RequireRole';
import PortalLayout from './components/layout/PortalLayout';
import PublicLayout from './components/layout/PublicLayout';
import { routes } from './config/site';
import ContactPage from './pages/ContactPage';
import HomePage from './pages/HomePage';
import DesignTokensPage from './pages/DesignTokensPage';
import EstimateRequestPage from './pages/EstimateRequestPage';
import InquiriesPage from './pages/InquiriesPage';
import InquiryDetailPage from './pages/InquiryDetailPage';
import ForgotPasswordRoute from './pages/ForgotPasswordRoute';
import NotFoundPage from './pages/NotFoundPage';
import PlaceholderPage from './pages/PlaceholderPage';
import ResetPasswordRoute from './pages/ResetPasswordRoute';
import ServicesPage from './pages/ServicesPage';
import StaffAccountsPage from './pages/StaffAccountsPage';
import StaffLoginRoute from './pages/StaffLoginRoute';
import SessionExpiredPage from './components/layout/SessionExpiredPage';
import { lazy, Suspense } from 'react';

const EstimatePhotosPreviewPage = import.meta.env.DEV
  ? lazy(() => import('./pages/EstimatePhotosPreviewPage'))
  : null;

export default function App() {
  return (
    <Routes>
      <Route path={routes.staffLogin} element={<StaffLoginRoute />} />
      <Route path={routes.staffSessionExpired} element={<SessionExpiredPage />} />
      <Route path={routes.staffForgotPassword} element={<ForgotPasswordRoute />} />
      <Route path={routes.staffResetPassword} element={<ResetPasswordRoute />} />
      <Route element={<RequireAuth />}>
        <Route path="/portal" element={<PortalLayout />}>
          <Route element={<RequireRole allowed={['owner']} />}>
            <Route path="inquiries" element={<InquiriesPage />} />
            <Route path="inquiries/:inquiryId" element={<InquiryDetailPage />} />
            <Route path="customers/*" element={<PlaceholderPage />} />
            <Route path="reports/*" element={<PlaceholderPage />} />
            <Route path="staff-accounts" element={<StaffAccountsPage />} />
            <Route path="testimonials/*" element={<PlaceholderPage />} />
          </Route>
          <Route path="*" element={<PlaceholderPage />} />
        </Route>
      </Route>

      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />

        {/* Implemented public pages */}
        <Route path={routes.requestEstimate} element={<EstimateRequestPage />} />
        <Route path={routes.services} element={<ServicesPage />} />
        <Route path={routes.contact} element={<ContactPage />} />

        {/* Planned pages that are not implemented yet */}
        {[
          routes.gallery,
          routes.serviceArea,
          routes.testimonials,
          routes.about,
          routes.privacy,
          routes.terms,
        ].map((path) => (
          <Route key={path} path={path} element={<PlaceholderPage />} />
        ))}

        {/* Unknown URLs display the helpful 404 page */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {import.meta.env.DEV && <Route path="/design-tokens" element={<DesignTokensPage />} />}
      {EstimatePhotosPreviewPage && (
        <Route
          path="/dev/estimate-photos"
          element={
            <Suspense fallback={<p role="status">Loading preview…</p>}>
              <EstimatePhotosPreviewPage />
            </Suspense>
          }
        />
      )}
    </Routes>
  );
}
