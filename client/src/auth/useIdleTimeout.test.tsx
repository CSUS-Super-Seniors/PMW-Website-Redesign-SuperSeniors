import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIdleTimeout } from './useIdleTimeout';

describe('useIdleTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the warning after the idle time passes', () => {
    vi.useFakeTimers();
    const signOut = vi.fn();

    const { result } = renderHook(() => useIdleTimeout(signOut, 15, 2));

    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(result.current.isIdle).toBe(true);
  });

  it('signs out if no activity is detected after the warning time passes', () => {
    vi.useFakeTimers();
    const signOut = vi.fn();

    renderHook(() => useIdleTimeout(signOut, 15, 2));

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });
    expect(signOut).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('hides the warning and cancels the sign-out when the user chooses to stay signed in', () => {
    vi.useFakeTimers();
    const signOut = vi.fn();

    const { result } = renderHook(() => useIdleTimeout(signOut, 15, 2));

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(true);

    act(() => {
      result.current.stayLoggedIn();
    });
    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('keeps the sign-out time when the signOut function is replaced', () => {
    vi.useFakeTimers();
    const signOut = vi.fn();

    const { rerender } = renderHook(({ onTimeout }) => useIdleTimeout(onTimeout, 15, 2), {
      initialProps: { onTimeout: () => signOut() },
    });

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });

    act(() => {
      vi.advanceTimersByTime(90 * 1000);
    });

    rerender({ onTimeout: () => signOut() });

    act(() => {
      vi.advanceTimersByTime(30 * 1000);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
