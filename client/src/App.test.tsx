import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
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

  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: [path],
  });
  return render(
    <AuthContext.Provider value={value}>
      <RouterProvider router={router} />
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

  it('opens photos only after service-area approval and preserves details on Back', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      url === '/api/estimates/service-area'
        ? Response.json({ inServiceArea: true })
        : Response.json({ valid: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/estimate');

    for (const [label, value] of [
      ['First name', 'Ana'],
      ['Last name', 'García'],
      ['Email address', 'ana+chair@example.com'],
      ['Phone number', '(916) 555-0142'],
      ['Service address', '123 Main St'],
      ['City', 'Carmichael'],
      ['Item', 'Chair'],
      ['Describe the problem', 'One leg is loose.'],
    ]) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.selectOptions(screen.getByLabelText('What happened?'), 'other');
    await user.selectOptions(screen.getByLabelText('How did you hear about us?'), 'referral');
    const honeypot = () => document.querySelector<HTMLInputElement>('[name="pmw_extra"]')!;
    fireEvent.change(honeypot(), { target: { value: 'bot-filled-value' } });
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));

    await screen.findByRole('heading', { name: 'Add photos of your furniture' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Request an estimate' })).toHaveFocus(),
    );
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/estimates/validate-step-1',
      '/api/estimates/service-area',
    ]);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Email address')).toHaveValue('ana+chair@example.com');
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      lead_source: 'referral',
    });
    expect(screen.getByLabelText('How did you hear about us?')).toHaveValue('referral');
    expect(screen.getByLabelText('City')).toHaveValue('Carmichael');
    expect(honeypot()).toHaveValue('bot-filled-value');
    await user.type(screen.getByLabelText('Item'), ' repair');
    await user.selectOptions(screen.getByLabelText('How did you hear about us?'), 'yelp');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    await screen.findByLabelText('Choose photos');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Your photos are ready' });
    expect(screen.getByRole('status')).toHaveTextContent('0 photo(s)');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/estimates/validate-step-1',
      '/api/estimates/service-area',
      '/api/estimates/validate-step-1',
      '/api/estimates/service-area',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[2][1]!.body as string)).toMatchObject({
      item: 'Chair repair',
      lead_source: 'yelp',
    });
    await user.click(screen.getByRole('button', { name: 'Back to photos' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Item')).toHaveValue('Chair repair');
    expect(screen.getByLabelText('How did you hear about us?')).toHaveValue('yelp');
    expect(honeypot()).toHaveValue('bot-filled-value');
  });
  it('blocks outside-area and unavailable checks before photos, then allows retry', async () => {
    const area = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ inServiceArea: false }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(Response.json({ inServiceArea: true }))
      .mockResolvedValueOnce(Response.json({ inServiceArea: false }));
    const fetchMock = vi.fn<typeof fetch>(async (url) =>
      url === '/api/estimates/service-area' ? area() : Response.json({ valid: true }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/estimate');
    for (const [label, value] of [
      ['First name', 'Ana'],
      ['Last name', 'Smith'],
      ['Email address', 'ana@example.com'],
      ['Phone number', '9165550123'],
      ['Service address', '123 Main St'],
      ['City', 'Davis'],
      ['Item', 'Chair'],
      ['Describe the problem', 'Loose leg'],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText('How did you hear about us?'), {
      target: { value: 'referral' },
    });
    const advance = () => user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    await advance();
    await screen.findByText('Outside our service area');
    expect(within(screen.getByRole('alert')).getByRole('link')).toHaveAttribute(
      'href',
      'tel:+19166435686',
    );
    expect(screen.queryByLabelText('Choose photos')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Carmichael' } });
    await advance();
    await screen.findByText(/We could not check whether we serve your city/);
    expect(screen.queryByLabelText('Choose photos')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue('ana@example.com');
    await advance();
    await screen.findByLabelText('Choose photos');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Davis' } });
    await advance();
    await screen.findByText('Outside our service area');
    expect(screen.queryByLabelText('Choose photos')).not.toBeInTheDocument();
    expect(area).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.every(
        ([url]) =>
          url === '/api/estimates/validate-step-1' || url === '/api/estimates/service-area',
      ),
    ).toBe(true);
  });
  it('keeps invalid details on Step 1 without requesting approval or opening photos', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderApp('/estimate');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    expect(screen.getByLabelText('City')).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose photos')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not warn on an empty form even after a validation attempt', async () => {
    const user = userEvent.setup();
    renderApp('/estimate');
    await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await screen.findByRole('heading', { name: 'Peterson Mobile Woodworking' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps incomplete details on Cancel and clears the request after Discard', async () => {
    const user = userEvent.setup();
    renderApp('/estimate');
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.type(screen.getByLabelText('Phone number'), 'invalid');
    await user.click(screen.getByLabelText('Contact me by text message'));
    const contact = () =>
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Contact' });
    await user.click(contact());
    const dialog = await screen.findByRole('dialog', { name: 'Discard request?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('First name')).toHaveValue('Ana');
    expect(screen.getByLabelText('Phone number')).toHaveValue('invalid');
    expect(screen.getByLabelText('Contact me by text message')).toBeChecked();
    await user.click(contact());
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }),
    );
    await screen.findByRole('heading', { name: 'Get in touch' });
    await user.click(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Request an estimate' }),
    );
    await screen.findByLabelText('First name');
    expect(screen.getByLabelText('First name')).toHaveValue('');
    expect(screen.getByLabelText('Phone number')).toHaveValue('');
    expect(screen.getByLabelText('Contact me by text message')).not.toBeChecked();
  });
  it('treats Escape as Cancel and restores focus without losing entered data', async () => {
    const user = userEvent.setup();
    renderApp('/estimate');
    await user.type(screen.getByLabelText('First name'), 'Ana');
    const cancel = screen.getByRole('link', { name: 'Cancel' });
    await user.click(cancel);
    await screen.findByRole('dialog', { name: 'Discard request?' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(cancel).toHaveFocus();
    expect(screen.getByLabelText('First name')).toHaveValue('Ana');
  });
  it('allows leaving once all entered fields and checkbox choices are cleared', async () => {
    const user = userEvent.setup();
    renderApp('/estimate');
    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.click(screen.getByLabelText('Contact me by text message'));
    await user.clear(screen.getByLabelText('First name'));
    await user.click(screen.getByLabelText('Contact me by text message'));
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await screen.findByRole('heading', { name: 'Peterson Mobile Woodworking' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('does not treat the hidden honeypot as customer-entered data', async () => {
    const user = userEvent.setup();
    renderApp('/estimate');
    fireEvent.change(document.querySelector('[name="pmw_extra"]')!, { target: { value: 'bot' } });
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await screen.findByRole('heading', { name: 'Peterson Mobile Woodworking' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
