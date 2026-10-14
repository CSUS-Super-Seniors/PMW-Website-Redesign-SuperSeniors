import { Route, Routes } from 'react-router';

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-bold">Peterson Mobile Woodworking</h1>
      <p className="mt-2 text-lg">Website redesign starter. Replace this page in Sprint 2.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
