import '@fontsource-variable/inter';
import '@fontsource-variable/jost';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import App from './App';
import AuthProvider from './auth/AuthProvider';
import { forwardInviteLanding } from './auth/passwordReset';
import './index.css';

// The existing route tree stays in App. A data router supplies navigation blocking
// for unfinished estimate requests, including browser Back/Forward navigation.
const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <AuthProvider>
        <App />
      </AuthProvider>
    ),
  },
]);

// Before Supabase starts and clears the hash: an invite link that landed on the
// Site URL instead of Set password is sent on (SSPMW-271).
if (!forwardInviteLanding()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
