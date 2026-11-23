import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useEstimateLeaveGuard } from './useEstimateLeaveGuard';

function RequestHarness() {
  const [draft, setDraft] = useState('');
  const { blocker, markSubmitted, startNewRequest } = useEstimateLeaveGuard(draft.length > 0);
  const navigate = useNavigate();
  return (
    <>
      <input aria-label="Draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <Link to="/other">Leave form</Link>
      <Link to="/estimate?step=photos#photos">Same request</Link>
      <button onClick={markSubmitted}>Mark successful submission</button>
      <button
        onClick={() => {
          markSubmitted();
          void navigate('/other');
        }}
      >
        Submit and leave
      </button>
      <button
        onClick={() => {
          setDraft('');
          startNewRequest();
        }}
      >
        Start another request
      </button>
      {blocker.state === 'blocked' && (
        <div role="dialog" aria-label="Unsaved request">
          <button onClick={() => blocker.reset()}>Stay</button>
          <button onClick={() => blocker.proceed()}>Discard</button>
        </div>
      )}
    </>
  );
}

function setup(initialEntries = ['/estimate']) {
  const router = createMemoryRouter(
    [
      { path: '/estimate', element: <RequestHarness /> },
      { path: '/other', element: <h1>Other page</h1> },
    ],
    { initialEntries },
  );
  return { user: userEvent.setup(), router, ...render(<RouterProvider router={router} />) };
}

function unloadIsBlocked() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('unfinished estimate navigation', () => {
  it('leaves an empty request without either warning', async () => {
    const { user, router } = setup();
    expect(unloadIsBlocked()).toBe(false);
    await user.click(screen.getByRole('link', { name: 'Leave form' }));
    await screen.findByRole('heading', { name: 'Other page' });
    expect(router.state.location.pathname).toBe('/other');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the draft on Cancel, and discards it when leaving and returning', async () => {
    const { user, router } = setup();
    await user.type(screen.getByLabelText('Draft'), 'Unfinished details');
    await user.click(screen.getByRole('link', { name: 'Leave form' }));
    await screen.findByRole('dialog');
    expect(router.state.location.pathname).toBe('/estimate');
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Draft')).toHaveValue('Unfinished details');
    expect(unloadIsBlocked()).toBe(true);
    await user.click(screen.getByRole('link', { name: 'Leave form' }));
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByRole('heading', { name: 'Other page' });
    expect(unloadIsBlocked()).toBe(false);
    await act(async () => {
      await router.navigate('/estimate');
    });
    expect(screen.getByLabelText('Draft')).toHaveValue('');
  });

  it('removes the unload warning when the current draft becomes empty', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: ' ' } });
    expect(unloadIsBlocked()).toBe(true);
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: '' } });
    expect(unloadIsBlocked()).toBe(false);
  });

  it('allows same-request query and anchor changes while retaining the draft', async () => {
    const { user, router } = setup();
    await user.type(screen.getByLabelText('Draft'), 'Ana');
    await user.click(screen.getByRole('link', { name: 'Same request' }));
    await waitFor(() => expect(router.state.location.search).toBe('?step=photos'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Draft')).toHaveValue('Ana');
    expect(unloadIsBlocked()).toBe(true);
  });

  it('blocks browser Back and resumes that original navigation after Discard', async () => {
    const { user, router } = setup(['/other', '/estimate']);
    await user.type(screen.getByLabelText('Draft'), 'Ana');
    await act(async () => {
      await router.navigate(-1);
    });
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/estimate');
    await act(async () => {
      await router.navigate(-1);
    });
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await screen.findByRole('heading', { name: 'Other page' });
  });

  it('allows immediate navigation after the submission-success callback', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Draft'), 'Ana');
    expect(unloadIsBlocked()).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Submit and leave' }));
    await screen.findByRole('heading', { name: 'Other page' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(unloadIsBlocked()).toBe(false);
  });

  it('disables both warnings after success and re-enables them for a new request', async () => {
    const { user, router } = setup();
    await user.type(screen.getByLabelText('Draft'), 'Ana');
    await user.click(screen.getByRole('button', { name: 'Mark successful submission' }));
    expect(unloadIsBlocked()).toBe(false);
    await user.click(screen.getByRole('link', { name: 'Same request' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start another request' }));
    expect(unloadIsBlocked()).toBe(false);
    await user.type(screen.getByLabelText('Draft'), 'New request');
    expect(unloadIsBlocked()).toBe(true);
    await user.click(screen.getByRole('link', { name: 'Leave form' }));
    await screen.findByRole('dialog');
    expect(router.state.location.pathname).toBe('/estimate');
  });
});
