import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('renders the error message with an alert role', () => {
    render(<ErrorBanner message="Unable to load the page." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the page.');
  });

  it('renders without a dismiss button when onDismiss is omitted', () => {
    render(<ErrorBanner message="Something went wrong." />);

    expect(screen.queryByRole('button', { name: 'Dismiss error' })).not.toBeInTheDocument();
  });

  it('calls onDismiss when the dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<ErrorBanner message="Unable to save changes." onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('accepts a custom class name', () => {
    render(<ErrorBanner message="Something went wrong." className="custom-banner" />);

    expect(screen.getByRole('alert')).toHaveClass('custom-banner');
  });
});
