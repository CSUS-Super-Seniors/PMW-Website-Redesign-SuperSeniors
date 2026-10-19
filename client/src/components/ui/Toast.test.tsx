import { useEffect, useState } from 'react';
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

  it('automatically dismisses despite a parent re-rendering every two seconds', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    function RerenderingParent() {
      const [, setCount] = useState(0);

      useEffect(() => {
        const intervalId = window.setInterval(() => {
          setCount((count) => count + 1);
        }, 2000);

        return () => window.clearInterval(intervalId);
      }, []);

      return <Toast message="Changes saved." onDismiss={() => onDismiss()} duration={5000} />;
    }

    render(<RerenderingParent />);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('restarts the dismissal timer when the message changes', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    const { rerender } = render(
      <Toast message="First message." onDismiss={onDismiss} duration={5000} />,
    );

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    rerender(<Toast message="Updated message." onDismiss={onDismiss} duration={5000} />);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
