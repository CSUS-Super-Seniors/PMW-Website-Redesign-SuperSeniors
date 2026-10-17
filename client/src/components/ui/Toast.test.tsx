import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a success message with an accessible status role', () => {
    render(<Toast message="Changes saved successfully." />);

    expect(screen.getByRole('status')).toHaveTextContent('Changes saved successfully.');
  });

  it('renders Undo when an undo handler is provided', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();

    render(<Toast message="Item deleted." onUndo={onUndo} />);

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when dismissed', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(<Toast message="Changes saved." onDismiss={onDismiss} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('automatically dismisses after the configured duration', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<Toast message="Changes saved." onDismiss={onDismiss} duration={3000} />);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('does not set an automatic dismissal timer when duration is zero', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(<Toast message="Changes saved." onDismiss={onDismiss} duration={0} />);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
