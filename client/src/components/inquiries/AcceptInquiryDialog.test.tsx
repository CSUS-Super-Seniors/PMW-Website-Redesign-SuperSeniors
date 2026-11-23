import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';
import { AcceptInquiryDialog } from './AcceptInquiryDialog';

const session = {
  access_token: 'token-123',
  user: { id: 'user-1' },
} as unknown as Session;

const job = { id: 'job-1', jobNumber: 'J-1001' };

afterEach(() => {
  vi.unstubAllGlobals();
});

function authValue(current: Session | null): AuthContextValue {
  return {
    session: current,
    loading: false,
    signOutFailed: false,
    signIn: () => Promise.resolve('wrong-credentials'),
    signOut: () => Promise.resolve('success'),
  };
}

function reply(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(reply(status, body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDialog(
  props: Partial<ComponentProps<typeof AcceptInquiryDialog>> = {},
  current: Session | null = session,
) {
  const onClose = vi.fn();
  const onAccepted = vi.fn();
  render(
    <AuthContext.Provider value={authValue(current)}>
      <MemoryRouter initialEntries={['/portal/inquiries']}>
        <Routes>
          <Route
            path="/portal/inquiries"
            element={
              <AcceptInquiryDialog
                inquiryId="inq-1"
                isOpen
                onClose={onClose}
                onAccepted={onAccepted}
                {...props}
              />
            }
          />
          <Route path="/portal/jobs/:jobNumber" element={<p>Job page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { onClose, onAccepted };
}

describe('AcceptInquiryDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks for confirmation and sends nothing until Accept is pressed', () => {
    const fetchMock = stubFetch(200, { job });
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Accept this estimate request?' })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Cancel closes the dialog and changes nothing', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(200, { job });
    const { onClose, onAccepted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Accept shows the success state with a link to the new job', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(200, { job });
    const { onAccepted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('dialog', { name: 'Estimate request accepted' })).toBeVisible();
    expect(screen.getByText(/Job J-1001 was created/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'View job' })).toHaveAttribute(
      'href',
      '/portal/jobs/J-1001',
    );
    expect(onAccepted).toHaveBeenCalledWith(job);
    expect(fetchMock).toHaveBeenCalledWith('/api/inquiries/inq-1/accept', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('opens the job from the success state and closes the dialog', async () => {
    const user = userEvent.setup();
    stubFetch(200, { job });
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.click(await screen.findByRole('link', { name: 'View job' }));

    expect(screen.getByText('Job page')).toBeVisible();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes from the success state', async () => {
    const user = userEvent.setup();
    stubFetch(200, { job });
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await user.click(await screen.findByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, 'Only an owner can accept estimate requests.'],
    [404, 'This estimate request could not be found. It may have been removed.'],
    [409, 'This estimate request was already accepted or declined.'],
    [401, 'Your session has expired. Please sign in again.'],
    [503, 'The request could not be accepted. Please try again.'],
  ])('shows a message for a %i response and stays open', async (status, message) => {
    const user = userEvent.setup();
    stubFetch(status);
    const { onAccepted } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.getByRole('dialog', { name: 'Accept this estimate request?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled();
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it('can be retried after a failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503))
      .mockResolvedValueOnce(reply(200, { job }));
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText(/could not be accepted/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByRole('dialog', { name: 'Estimate request accepted' })).toBeVisible();
    expect(screen.queryByText(/could not be accepted/)).not.toBeInTheDocument();
  });

  it('does not send a request without a login', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(200, { job });
    renderDialog({}, null);

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores Escape while the request is running', async () => {
    const user = userEvent.setup();
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByRole('button', { name: 'Accepting...' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    finish(reply(200, { job }));
    expect(await screen.findByRole('dialog', { name: 'Estimate request accepted' })).toBeVisible();
  });

  it('starts clean when it is opened again after a failure', async () => {
    const user = userEvent.setup();
    stubFetch(503);
    const tree = (isOpen: boolean) => (
      <AuthContext.Provider value={authValue(session)}>
        <MemoryRouter>
          <AcceptInquiryDialog inquiryId="inq-1" isOpen={isOpen} onClose={vi.fn()} />
        </MemoryRouter>
      </AuthContext.Provider>
    );
    const { rerender } = render(tree(true));

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText(/could not be accepted/)).toBeVisible();
    rerender(tree(false));
    rerender(tree(true));

    expect(screen.queryByText(/could not be accepted/)).not.toBeInTheDocument();
  });
});
