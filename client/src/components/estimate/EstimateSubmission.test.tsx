import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import EstimateSubmission from './EstimateSubmission';

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup();
  const onStartAnother = vi.fn();

  render(
    <MemoryRouter>
      <EstimateSubmission firstName="Alex" onSubmit={onSubmit} onStartAnother={onStartAnother} />
    </MemoryRouter>,
  );

  return { user, onSubmit, onStartAnother };
}

describe('EstimateSubmission', () => {
  it('opens confirmation and allows cancellation', async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole('button', { name: 'Submit request' }));

    const dialog = screen.getByRole('dialog', {
      name: 'Submit estimate request?',
    });

    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits and displays the personalized Thanks page', async () => {
    const { user, onSubmit, onStartAnother } = setup();

    await user.click(screen.getByRole('button', { name: 'Submit request' }));

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Submit request',
      }),
    );

    expect(await screen.findByRole('heading', { name: 'Thanks, Alex!' })).toBeInTheDocument();

    expect(onSubmit).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/');

    await user.click(screen.getByRole('button', { name: 'Start another request' }));

    expect(onStartAnother).toHaveBeenCalledOnce();
    expect(screen.queryByText('Thanks, Alex!')).not.toBeInTheDocument();
  });

  it('shows an error and allows retrying a failed submission', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(undefined);

    const { user } = setup(onSubmit);

    await user.click(screen.getByRole('button', { name: 'Submit request' }));

    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByText(/We could not send your request/)).toBeInTheDocument();

    expect(screen.queryByText('Thanks, Alex!')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByRole('heading', { name: 'Thanks, Alex!' })).toBeInTheDocument();

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate submissions while sending', async () => {
    let resolveSubmit!: () => void;

    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const { user } = setup(onSubmit);

    await user.click(screen.getByRole('button', { name: 'Submit request' }));

    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Submit request',
      }),
    );

    const sendingButton = screen.getByRole('button', {
      name: 'Sending...',
    });

    expect(sendingButton).toBeDisabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await user.click(sendingButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSubmit();
    });

    await waitFor(() => expect(screen.getByText('Thanks, Alex!')).toBeInTheDocument());

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
