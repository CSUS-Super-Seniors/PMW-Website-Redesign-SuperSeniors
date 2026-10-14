import { Route, Routes } from 'react-router';
import DesignTokensPage from './pages/DesignTokensPage';

function Home() {
  return (
    <main className="mx-auto max-w-content px-4 py-10 xl:px-8">
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
      <Route path="/" element={<Home />} />
      {import.meta.env.DEV && <Route path="/design-tokens" element={<DesignTokensPage />} />}
    </Routes>
  );
}
