import { render, screen } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import AuthProvider from './AuthProvider';
import { routes } from '../config/site';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  getSupabase: () => ({ auth: mocks }),
}));

const staleSession = {
  access_token: 'stale-token',
  user: { id: 'user-1', email: 'todd@example.com', user_metadata: {}, app_metadata: {} },
} as unknown as Session;

let savedSession: Session | null;
let notifyAuthChange: (event: AuthChangeEvent, session: Session | null) => void;

function renderOwnerPage() {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: ['/portal/customers'],
  });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

describe('A login the server rejects (401 from /api/me)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    savedSession = staleSession;
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    mocks.getSession.mockImplementation(async () => ({ data: { session: savedSession } }));
    mocks.onAuthStateChange.mockImplementation((callback) => {
      notifyAuthChange = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    mocks.signOut.mockImplementation(async () => {
      savedSession = null;
      notifyAuthChange('SIGNED_OUT', null);
      return { error: null };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ends on the staff login form instead of looping', async () => {
    const router = renderOwnerPage();

    expect(await screen.findByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe(routes.staffLogin);
    expect((router.state.location.state as { from?: string } | null)?.from).toBe(
      '/portal/customers',
    );
  });

  it('shows the could-not-check screen when clearing the login fails', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('offline') });
    renderOwnerPage();

    expect(
      await screen.findByRole('heading', { name: "We couldn't check your access" }),
    ).toBeInTheDocument();
  });
});
