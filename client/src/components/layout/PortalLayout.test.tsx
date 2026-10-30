import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { idleTimeout, routes } from '../../config/site';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';
import PortalLayout from './PortalLayout';

const auth: AuthContextValue = {
  session: null,
  loading: false,
  signOutFailed: false,
  signIn: () => Promise.resolve('success'),
  signOut: () => Promise.resolve('success'),
};

function renderAt(
  path: string,
  signOut: AuthContextValue['signOut'] = () => Promise.resolve('success'),
) {
  return render(
    <AuthContext.Provider value={{ ...auth, signOut }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/portal" element={<PortalLayout />}>
            <Route path="*" element={<p>Page content</p>} />
          </Route>
          <Route path={routes.staffSessionExpired} element={<p>Session expired page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('PortalLayout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the nav links with their addresses', () => {
    renderAt('/portal/dashboard');
    const nav = screen.getByRole('navigation', { name: 'Portal' });
    expect(within(nav).getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'href',
      '/portal/customers',
    );
  });

  it('marks the current page', () => {
    renderAt('/portal/inquiries');
    const nav = screen.getByRole('navigation', { name: 'Portal' });
    expect(within(nav).getByRole('link', { name: 'Inquiries' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows the page title and a link to the public site', () => {
    renderAt('/portal/schedule');
    expect(screen.getByText('Schedule', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View public site' })).toHaveAttribute(
      'href',
      routes.home,
    );
  });

  it('shows the timeout warning after the idle time', () => {
    vi.useFakeTimers();
    renderAt('/portal/dashboard');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(idleTimeout.idleWarningMinutes * 60 * 1000);
    });

    expect(
      screen.getByRole('dialog', { name: "You're about to be signed out" }),
    ).toBeInTheDocument();
  });

  it('goes to the expired screen when the warning runs out', async () => {
    vi.useFakeTimers();
    renderAt('/portal/dashboard');

    act(() => {
      vi.advanceTimersByTime(idleTimeout.idleWarningMinutes * 60 * 1000);
    });
    await act(async () => {
      vi.advanceTimersByTime(idleTimeout.idleWarningDurationMinutes * 60 * 1000);
    });

    expect(screen.getByText('Session expired page')).toBeInTheDocument();
  });

  it('goes to the expired screen when Escape closes the warning after sleep', () => {
    vi.useFakeTimers();
    renderAt('/portal/dashboard');
    act(() => {
      vi.advanceTimersByTime(idleTimeout.idleWarningMinutes * 60 * 1000);
    });
    expect(
      screen.getByRole('dialog', { name: "You're about to be signed out" }),
    ).toBeInTheDocument();

    vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1000);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(screen.getByText('Session expired page')).toBeInTheDocument();
  });

  it('closing the warning keeps the user signed in', () => {
    vi.useFakeTimers();
    renderAt('/portal/dashboard');
    act(() => {
      vi.advanceTimersByTime(idleTimeout.idleWarningMinutes * 60 * 1000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(
      screen.queryByRole('dialog', { name: "You're about to be signed out" }),
    ).not.toBeInTheDocument();
  });
});
