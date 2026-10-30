import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SuccessBanner } from './SuccessBanner';

describe('SuccessBanner', () => {
  it('renders the title and message with a status role', () => {
    render(<SuccessBanner title="Reset link sent" message="Check your inbox." />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Reset link sent');
    expect(banner).toHaveTextContent('Check your inbox.');
  });

  it('renders without a dismiss button when onDismiss is omitted', () => {
    render(<SuccessBanner message="Saved." />);

    expect(screen.queryByRole('button', { name: 'Dismiss message' })).not.toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<SuccessBanner message="Saved." onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss message' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
