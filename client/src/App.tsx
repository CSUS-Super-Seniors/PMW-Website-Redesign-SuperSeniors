import { Route, Routes } from 'react-router';
import PublicLayout from './components/layout/PublicLayout';
import DesignTokensPage from './pages/DesignTokensPage';
import PlaceholderPage from './pages/PlaceholderPage';
import PortalLayout from './components/layout/PortalLayout';

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
      <Route path="/portal" element={<PortalLayout />}>
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        {/* Public pages are built in epic C. Until then every other path shows a placeholder. */}
        <Route path="*" element={<PlaceholderPage />} />
      </Route>
      {import.meta.env.DEV && <Route path="/design-tokens" element={<DesignTokensPage />} />}
    </Routes>
  );
}
