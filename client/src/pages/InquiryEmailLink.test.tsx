import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import AuthProvider from '../auth/AuthProvider';
import { inquiryDetailPath, routes } from '../config/site';
import type { InquiryDetail } from '../api/inquiryDetail';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../auth/supabaseClient', () => ({
  getSupabase: () => ({ auth }),
}));

const ID = '60000000-0000-4000-8000-000000000002';
const destination = inquiryDetailPath(ID);
const session = {
  access_token: 'test-owner-token',
  user: { id: 'owner-1', email: 'todd@example.com', user_metadata: {} },
} as unknown as Session;
const inquiry: InquiryDetail = {
  id: ID,
  inquiryNumber: 'INQ-1048',
  status: 'new',
  submittedAt: '2026-11-11T12:00:00Z',
  item: 'Dining chair',
  issueType: 'Loose joints / wobbling',
  description: 'One leg is loose.',
  customerName: 'Margaret Lewis',
  email: 'margaret@example.com',
  phone: '9165550142',
  preferredContact: null,
  textOk: false,
  address: '123 Test Street',
  city: 'Carmichael',
  inServiceArea: true,
  photos: [],
};

let notifyAuthChange: (event: AuthChangeEvent, session: Session | null) => void;
let staffRole: 'owner' | 'employee';
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.resetAllMocks();
  staffRole = 'owner';
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockImplementation((callback) => {
    notifyAuthChange = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  auth.signInWithPassword.mockImplementation(async () => {
    notifyAuthChange('SIGNED_IN', session);
    return { error: null };
  });
  fetchMock.mockImplementation(async (url, options) => {
    if (url === '/api/me') return Response.json({ role: staffRole });
    if (url === `/api/inquiries/${ID}` && !options?.method) return Response.json(inquiry);
    if (url === `/api/inquiries/${ID}/review` && options?.method === 'POST')
      return Response.json({ status: 'contacted' });
    throw new Error(`Unexpected API request: ${String(url)}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

function openEmailLink() {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: [destination],
  });
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
  return router;
}

async function logIn() {
  await screen.findByRole('heading', { name: 'Staff login' });
  fireEvent.change(screen.getByLabelText('Email address'), {
    target: { value: 'todd@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Log in' }));
}

describe('owner notice inquiry link', () => {
  it('requires login, preserves the inquiry URL, and opens that inquiry after signing in', async () => {
    const router = openEmailLink();
    await screen.findByRole('heading', { name: 'Staff login' });
    expect(router.state.location.pathname).toBe(routes.staffLogin);
    expect((router.state.location.state as { from?: string })?.from).toBe(destination);
    expect(fetchMock).not.toHaveBeenCalled();
    await logIn();
    expect(await screen.findByRole('heading', { name: 'INQ-1048' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(destination);
    expect(fetchMock).toHaveBeenCalledWith(`/api/inquiries/${ID}`, {
      headers: { Authorization: 'Bearer test-owner-token' },
    });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'todd@example.com',
      password: 'test-password',
    });
  });

  it('opens the same inquiry immediately for an already signed-in owner', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    const router = openEmailLink();
    expect(await screen.findByRole('heading', { name: 'INQ-1048' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(destination);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('keeps an employee behind the owner-role check after login', async () => {
    staffRole = 'employee';
    openEmailLink();
    await logIn();
    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/inquiries/'))).toBe(
      false,
    );
    expect(screen.queryByRole('heading', { name: 'INQ-1048' })).not.toBeInTheDocument();
  });
});
