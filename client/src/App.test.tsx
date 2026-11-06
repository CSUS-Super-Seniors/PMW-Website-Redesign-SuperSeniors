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

  it('opens the real photo step after field validation without requesting service-area approval', async () => {
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

    expect(
      await screen.findByRole('heading', { name: 'Add photos of your furniture' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/development preview/i)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/api/estimates/validate-step-1',
      expect.any(Object),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Request an estimate' })).toHaveFocus(),
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Email address')).toHaveValue('ana+chair@example.com');
    expect(screen.getByRole('heading', { name: 'Request an estimate' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Item'), ' repair');
    expect(screen.getByLabelText('Item')).toHaveValue('Chair repair');
  });
  it('shows the business tagline on the home page, not developer notes', () => {
    renderApp('/');

    const main = screen.getByRole('main');
    expect(main).toHaveTextContent(
      'Family-run furniture repair and restoration in Carmichael, CA since 2011.',
    );
    expect(main).not.toHaveTextContent(/sprint|starter/i);
  });

  it('preserves details on Back and continues with zero photos without an upload or area request', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ valid: true }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/estimate');
    for (const [label, value] of [
      ['First name', 'Ana'],
      ['Last name', 'Smith'],
      ['Email address', 'ana@example.com'],
      ['Phone number', '9165550123'],
      ['Service address', '123 Main St'],
      ['Item', 'Chair'],
      ['Describe the problem', 'Loose leg'],
    ])
      await user.type(screen.getByLabelText(label), value);
    await user.selectOptions(screen.getByLabelText('What happened?'), 'other');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    await screen.findByLabelText('Choose photos');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Email address')).toHaveValue('ana@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    await screen.findByLabelText('Choose photos');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(
      await screen.findByRole('heading', { name: 'Your photos are ready' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('0 photo(s)');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => url === '/api/estimates/validate-step-1')).toBe(
      true,
    );
  });

  it('keeps invalid Step 1 details on the form instead of advancing', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/estimate');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    expect(screen.getByLabelText('Service address')).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose photos')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
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
