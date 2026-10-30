import { act, render, screen } from '@testing-library/react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import AuthProvider from '../../auth/AuthProvider';
import { idleTimeout, routes } from '../../config/site';
import { lastActivityKey } from '../../auth/lastActivity';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../auth/supabaseClient', () => ({
  getSupabase: () => ({ auth: mocks }),
}));

const staffSession = {
  access_token: 'test-access-token',
  user: { id: 'test-staff-id', email: 'todd@example.com', user_metadata: {}, app_metadata: {} },
} as unknown as Session;

let savedSession: Session | null;
let notifyAuthChange: (event: AuthChangeEvent, session: Session | null) => void;

function renderApp(initialEntries: string[], initialIndex?: number) {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries,
    initialIndex,
  });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

async function idleUntilTimeout() {
  const router = renderApp(['/portal/dashboard']);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(idleTimeout.idleWarningMinutes * 60 * 1000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(idleTimeout.idleWarningDurationMinutes * 60 * 1000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return router;
}

describe('Idle timeout with the real AuthProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    savedSession = staffSession;
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
    vi.useRealTimers();
  });

  it('ends on the session expired page and signs out once', async () => {
    const router = await idleUntilTimeout();

    expect(router.state.location.pathname).toBe(routes.staffSessionExpired);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Go to staff login' })).toBeInTheDocument();
    expect(localStorage.getItem(lastActivityKey)).toBeNull();
  });

  it('stays on the expired page with a Retry when sign-out fails', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('offline') });
    const router = await idleUntilTimeout();

    expect(router.state.location.pathname).toBe(routes.staffSessionExpired);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go to staff login' })).not.toBeInTheDocument();
    expect(localStorage.getItem(lastActivityKey)).not.toBeNull();
  });

  it('does not sign out a new session when Back returns to the expired page', async () => {
    localStorage.setItem(lastActivityKey, String(Date.now())); // they just signed in
    const router = renderApp([routes.staffSessionExpired, routes.portalHome], 1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await router.navigate(-1);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe(routes.portalHome);
  });

  const expiredMs =
    (idleTimeout.idleWarningMinutes + idleTimeout.idleWarningDurationMinutes) * 60 * 1000 + 1000;

  it.each([
    ['writes the fresh time after SIGNED_IN, like signIn does', true],
    ['never writes a time, like a password reset link', false],
  ])(
    'does not sign out a session that appears while the expired page is open (%s)',
    async (_name, writesTime) => {
      localStorage.setItem(lastActivityKey, String(Date.now() - expiredMs)); // left from the idle session
      savedSession = null;
      const router = renderApp([routes.staffSessionExpired]);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByRole('link', { name: 'Go to staff login' })).toBeInTheDocument();

      await act(async () => {
        notifyAuthChange('SIGNED_OUT', null); // a real sign-out is what forgets the old time
      });
      expect(localStorage.getItem(lastActivityKey)).toBeNull();

      await act(async () => {
        notifyAuthChange('SIGNED_IN', staffSession); // supabase-js broadcasts this first
      });
      if (writesTime) localStorage.setItem(lastActivityKey, String(Date.now()));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(mocks.signOut).not.toHaveBeenCalled();
      expect(router.state.location.pathname).toBe(routes.portalHome);
    },
  );

  it('keeps the old time when a reload had no session because of a network error', async () => {
    localStorage.setItem(lastActivityKey, String(Date.now() - expiredMs));
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: new Error('offline') });
    const router = renderApp([routes.staffSessionExpired]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(localStorage.getItem(lastActivityKey)).not.toBeNull();

    await act(async () => {
      notifyAuthChange('TOKEN_REFRESHED', staffSession); // Wi-Fi is back, the stored session returns
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(router.state.location.pathname).toBe(routes.staffSessionExpired);
  });
});
