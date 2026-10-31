import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthContext, type AuthContextValue } from './auth/AuthContext';

const session = { user: { email: 'todd@example.com' } } as unknown as Session;
const staffSession = {
  access_token: 'token-123',
  user: { id: 'user-1', email: 'sam@example.com' },
} as unknown as Session;

function renderApp(path: string, auth: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    session: null,
    loading: false,
    signOutFailed: false,
    signIn: () => Promise.resolve('wrong-credentials'),
    signOut: () => Promise.resolve('success'),
    ...auth,
  };

  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function fakeServerRole(role: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ role }) }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the home page heading', () => {
    renderApp('/');

    expect(
      screen.getByRole('heading', { name: 'Peterson Mobile Woodworking' }),
    ).toBeInTheDocument();
  });

  it('opens the estimate form publicly inside the existing header and footer', () => {
    renderApp('/estimate');

    expect(screen.getByRole('heading', { name: 'Request an estimate' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByLabelText('Service address')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Staff login' })).not.toBeInTheDocument();
  });

  it('keeps the live form and validated details visible while the service-area and photo flow are unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ valid: true }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/estimate');

    for (const [label, value] of [
      ['First name', 'Ana'],
      ['Last name', 'García'],
      ['Email address', 'ana+chair@example.com'],
      ['Phone number', '(916) 555-0142'],
      ['Service address', '123 Main St'],
      ['Item', 'Chair'],
      ['Describe the problem', 'One leg is loose.'],
    ]) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.selectOptions(screen.getByLabelText('What happened?'), 'other');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));

    const notice = await screen.findByText(/continuing to photos is not available yet/);
    expect(notice).toHaveTextContent('Your request has not been sent');
    expect(notice).toHaveTextContent('service availability has not been confirmed');
    await waitFor(() => expect(notice.closest('[role="status"]')).toHaveFocus());
    expect(screen.getByLabelText('Email address')).toHaveValue('ana+chair@example.com');
    expect(screen.getByRole('heading', { name: 'Request an estimate' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Item'), ' repair');
    expect(screen.queryByText(/continuing to photos is not available yet/)).not.toBeInTheDocument();
  });
  it('shows the business tagline on the home page, not developer notes', () => {
    renderApp('/');

    const main = screen.getByRole('main');
    expect(main).toHaveTextContent(
      'Family-run furniture repair and restoration in Carmichael, CA since 2011.',
    );
    expect(main).not.toHaveTextContent(/sprint|starter/i);
  });

  it('shows the Services page inside the public layout', () => {
    renderApp('/services');

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Furniture repair, refinishing, and restoration',
      }),
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Services' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('sends a signed-out visitor from a portal URL to staff login', () => {
    renderApp('/portal/dashboard');

    expect(screen.getByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
  });

  it('renders the contact page inside the public layout without signing in', () => {
    renderApp('/contact');

    expect(screen.getByRole('heading', { name: 'Get in touch' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tap to call' })).toHaveAttribute(
      'href',
      'tel:+19166435686',
    );
    expect(screen.queryByText('This page is not built yet')).not.toBeInTheDocument();
  });

  it('lets a signed-in user open a portal URL', () => {
    renderApp('/portal/dashboard', { session });

    expect(screen.getByRole('heading', { name: 'This page is not built yet' })).toBeInTheDocument();
  });

  it('shows the staff login page without the public header', () => {
    renderApp('/staff/login');

    expect(screen.getByRole('heading', { name: 'Staff login' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('opens the forgot password page from staff login, without the public header', async () => {
    const user = userEvent.setup();
    renderApp('/staff/login');

    await user.click(screen.getByRole('link', { name: 'Forgot your password?' }));

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('shows the reset password page without the public header', () => {
    renderApp('/staff/reset-password');

    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('shows the portal navigation to a signed-in user', () => {
    renderApp('/portal/dashboard', { session });

    expect(screen.getByRole('navigation', { name: 'Portal' })).toBeInTheDocument();
  });

  it.each([
    '/portal/inquiries',
    '/portal/customers',
    '/portal/reports',
    '/portal/staff-accounts',
    '/portal/testimonials',
    '/portal/customers/123',
  ])('shows the no-permission screen to an employee on %s', async (path) => {
    fakeServerRole('employee');
    renderApp(path, { session: staffSession });

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
  });

  it('lets an owner open an owner-only URL', async () => {
    fakeServerRole('owner');
    renderApp('/portal/customers', { session: staffSession });

    expect(
      await screen.findByRole('heading', { name: 'This page is not built yet' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'You do not have access to this page' }),
    ).not.toBeInTheDocument();
  });

  it('shows a helpful 404 page for an unknown URL', () => {
    renderApp('/this-page-does-not-exist');

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Back to homepage' })).toHaveAttribute('href', '/');
  });

  it('keeps the placeholder for planned public pages', () => {
    renderApp('/gallery');

    expect(screen.getByRole('heading', { name: 'This page is not built yet' })).toBeInTheDocument();

    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });
});
