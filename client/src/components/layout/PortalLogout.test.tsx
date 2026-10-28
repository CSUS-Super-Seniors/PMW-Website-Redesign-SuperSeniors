import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import AuthProvider from '../../auth/AuthProvider';
import { routes } from '../../config/site';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../auth/supabaseClient', () => ({
  getSupabase: () => ({ auth: mocks }),
}));

function staffSession(
  role = 'owner',
  metadata: Record<string, unknown> = { full_name: 'Todd Peterson' },
): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'test-staff-id',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'todd@example.com',
      created_at: '2026-10-01T00:00:00Z',
      app_metadata: { role },
      user_metadata: metadata,
    },
  };
}

let savedSession: Session | null;
let notifyAuthChange: (event: AuthChangeEvent, session: Session | null) => void;

function renderPortal(
  initialEntries = ['/services', '/portal/schedule', '/portal/dashboard?tab=today'],
) {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries });
  const view = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return { router, ...view };
}

async function openConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Account menu for/ }));
  await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
  return screen.getByRole('dialog', { name: 'Log out?' });
}

describe('Portal account logout with shared auth and route guards', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    savedSession = staffSession();
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

  it.each(['owner', 'employee'])(
    'shows the signed-in %s and opens the account menu',
    async (role) => {
      savedSession = staffSession(role);
      const user = userEvent.setup();
      renderPortal();

      const trigger = await screen.findByRole('button', { name: 'Account menu for Todd Peterson' });
      expect(trigger).toHaveTextContent('Todd Peterson');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await user.click(trigger);

      expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(mocks.signOut).not.toHaveBeenCalled();
    },
  );

  it.each([{}, { full_name: '  ' }, { full_name: 42 }])(
    'falls back to email with metadata %j',
    async (metadata) => {
      savedSession = staffSession('employee', metadata);
      renderPortal();

      expect(
        await screen.findByRole('button', { name: 'Account menu for todd@example.com' }),
      ).toHaveTextContent('todd@example.com');
    },
  );

  it('supports keyboard opening and Escape, Tab, and outside dismissal', async () => {
    const user = userEvent.setup();
    renderPortal();
    const trigger = await screen.findByRole('button', { name: /Account menu for/ });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);
    await user.click(screen.getByText('Dashboard', { selector: 'p' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens confirmation without signing out and Cancel preserves the route and session', async () => {
    const user = userEvent.setup();
    const { router } = renderPortal();
    const dialog = await openConfirmation(user);
    const location = router.state.location;
    const session = savedSession;

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(savedSession).toBe(session);
    expect(router.state.location).toBe(location);
    expect(screen.getByRole('button', { name: /Account menu for/ })).toHaveFocus();
    expect(screen.getByRole('navigation', { name: 'Portal' })).toBeInTheDocument();
  });

  it('retains the shared dialog focus trap and Escape cancellation', async () => {
    const user = userEvent.setup();
    const { router } = renderPortal();
    const dialog = await openConfirmation(user);
    const location = router.state.location;
    const close = within(dialog).getByRole('button', { name: 'Close dialog' });
    await user.tab({ shift: true });
    expect(within(dialog).getByRole('button', { name: 'Log out' })).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(router.state.location).toBe(location);
    expect(savedSession).not.toBeNull();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it('uses the same confirmation from the existing sidebar logout button', async () => {
    const user = userEvent.setup();
    renderPortal();
    await screen.findByRole('button', { name: /Account menu for/ });
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(screen.getByRole('dialog', { name: 'Log out?' })).toBeInTheDocument();
    expect(mocks.signOut).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Log out' })).toHaveFocus();
  });

  it.each(['owner', 'employee'])(
    'logs out the %s once, replaces history, and blocks Back, direct access, and reload',
    async (role) => {
      savedSession = staffSession(role);
      const user = userEvent.setup();
      const { router, unmount } = renderPortal();
      const dialog = await openConfirmation(user);
      await user.click(within(dialog).getByRole('button', { name: 'Log out' }));

      expect(await screen.findByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
      expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
      expect(savedSession).toBeNull();
      expect(router.state.location.pathname).toBe(routes.staffLogin);
      expect(router.state.historyAction).toBe('REPLACE');
      expect(screen.queryByRole('navigation', { name: 'Portal' })).not.toBeInTheDocument();

      await act(async () => {
        await router.navigate(-1);
      });
      expect(router.state.location.pathname).toBe(routes.staffLogin);
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      // A second Back reaches the earlier public page, proving logout replaced its entry.
      await act(async () => {
        await router.navigate(-1);
      });
      expect(router.state.location.pathname).toBe('/services');

      await act(async () => {
        await router.navigate('/portal/customers');
      });
      expect(router.state.location.pathname).toBe(routes.staffLogin);
      expect(screen.queryByRole('navigation', { name: 'Portal' })).not.toBeInTheDocument();

      unmount();
      renderPortal(['/portal/dashboard']);
      expect(await screen.findByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Portal' })).not.toBeInTheDocument();
    },
  );

  it.each(['returned error', 'rejected promise'])(
    'shows a readable %s, preserves the session, and allows retry',
    async (failure) => {
      if (failure === 'returned error') {
        mocks.signOut.mockResolvedValueOnce({ error: new Error('internal server detail') });
      } else {
        mocks.signOut.mockRejectedValueOnce(new Error('internal network detail'));
      }
      const user = userEvent.setup();
      const { router } = renderPortal();
      const dialog = await openConfirmation(user);
      const location = router.state.location;
      await user.click(within(dialog).getByRole('button', { name: 'Log out' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'We could not log you out. Check your connection and try again.',
      );
      expect(router.state.location).toBe(location);
      expect(savedSession).not.toBeNull();
      expect(screen.getByRole('navigation', { name: 'Portal' })).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Log out' })).toBeEnabled();
      await user.click(within(dialog).getByRole('button', { name: 'Log out' }));

      expect(await screen.findByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
      expect(mocks.signOut).toHaveBeenCalledTimes(2);
    },
  );

  it('prevents duplicate requests and dismissal while logout is pending', async () => {
    let finish!: (value: { error: null }) => void;
    mocks.signOut.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { router } = renderPortal();
    const dialog = await openConfirmation(user);
    const location = router.state.location;
    const confirm = within(dialog).getByRole('button', { name: 'Log out' });
    await user.dblClick(confirm);

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    expect(confirm).toHaveTextContent('Logging out...');
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    await user.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    fireEvent.mouseDown(dialog.parentElement!);
    expect(dialog).toBeInTheDocument();
    expect(router.state.location).toBe(location);
    expect(savedSession).not.toBeNull();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);

    await act(async () => {
      savedSession = null;
      notifyAuthChange('SIGNED_OUT', null);
      finish({ error: null });
    });
    expect(await screen.findByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
  });

  it.each(['success', 'returned error', 'rejected promise'])(
    'coalesces logout across portal exit and re-entry, then handles %s',
    async (outcome) => {
      let resolveLogout!: (response: { error: Error | null }) => void;
      let rejectLogout!: (error: Error) => void;
      mocks.signOut.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveLogout = resolve;
            rejectLogout = reject;
          }),
      );
      const user = userEvent.setup();
      const { router } = renderPortal(['/', routes.portalHome]);
      const firstDialog = await openConfirmation(user);
      await user.click(within(firstDialog).getByRole('button', { name: 'Log out' }));
      expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });

      await act(async () => {
        await router.navigate(-1);
      });
      expect(router.state.location.pathname).toBe('/');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: 'Portal' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: 'Staff login' }));
      const secondDialog = await openConfirmation(user);
      await user.click(within(secondDialog).getByRole('button', { name: 'Log out' }));
      expect(mocks.signOut).toHaveBeenCalledTimes(1);
      expect(within(secondDialog).getByRole('button', { name: 'Logging out...' })).toBeDisabled();
      expect(savedSession).not.toBeNull();

      await act(async () => {
        if (outcome === 'success') {
          savedSession = null;
          notifyAuthChange('SIGNED_OUT', null);
          resolveLogout({ error: null });
        } else if (outcome === 'returned error') {
          resolveLogout({ error: new Error('Server unavailable') });
        } else {
          rejectLogout(new Error('Network unavailable'));
        }
      });

      if (outcome !== 'success') {
        expect(await within(secondDialog).findByRole('alert')).toHaveTextContent(
          'We could not log you out. Check your connection and try again.',
        );
        expect(router.state.location.pathname).toBe(routes.portalHome);
        expect(savedSession).not.toBeNull();
        await user.click(within(secondDialog).getByRole('button', { name: 'Log out' }));
      }

      expect(await screen.findByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(routes.staffLogin);
      expect(router.state.historyAction).toBe('REPLACE');
      expect(savedSession).toBeNull();
      expect(mocks.signOut).toHaveBeenCalledTimes(outcome === 'success' ? 1 : 2);
      await act(async () => {
        await router.navigate('/portal/schedule');
      });
      expect(router.state.location.pathname).toBe(routes.staffLogin);
      expect(screen.queryByRole('navigation', { name: 'Portal' })).not.toBeInTheDocument();
    },
  );

  it('rejects portal access as soon as Supabase reports a null session, even if logout later fails', async () => {
    let finish!: (value: { error: Error }) => void;
    mocks.signOut.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    const { router } = renderPortal();
    const dialog = await openConfirmation(user);
    await user.click(within(dialog).getByRole('button', { name: 'Log out' }));

    act(() => {
      savedSession = null;
      notifyAuthChange('SIGNED_OUT', null);
    });
    expect(await screen.findByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
    await act(async () => {
      finish({ error: new Error('late response error') });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your local session has ended, but we could not confirm logout with the server.',
    );
    await act(async () => {
      await router.navigate('/portal/schedule');
    });
    expect(router.state.location.pathname).toBe(routes.staffLogin);
    expect(screen.queryByRole('navigation', { name: 'Portal' })).not.toBeInTheDocument();
  });
});
