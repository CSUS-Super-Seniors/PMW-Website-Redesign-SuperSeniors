import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionTimeoutDialog } from './SessionTimeoutDialog';

describe('SessionTimeoutDialog', () => {
  it('shows the minutes in the message', () => {
    render(<SessionTimeoutDialog isOpen onStaySignedIn={vi.fn()} warningMinutes={2} />);

    expect(
      screen.getByText('You will be signed out within 2 minutes due to inactivity.'),
    ).toBeInTheDocument();
  });

  it('calls the handler when the button is clicked', async () => {
    const user = userEvent.setup();
    const onStaySignedIn = vi.fn();

    render(<SessionTimeoutDialog isOpen onStaySignedIn={onStaySignedIn} warningMinutes={2} />);

    await user.click(screen.getByRole('button', { name: 'Stay signed in' }));

    expect(onStaySignedIn).toHaveBeenCalledTimes(1);
  });

  it('treats Escape as Stay signed in', async () => {
    const user = userEvent.setup();
    const onStaySignedIn = vi.fn();

    render(<SessionTimeoutDialog isOpen onStaySignedIn={onStaySignedIn} warningMinutes={2} />);

    await user.keyboard('{Escape}');

    expect(onStaySignedIn).toHaveBeenCalledTimes(1);
  });
});
