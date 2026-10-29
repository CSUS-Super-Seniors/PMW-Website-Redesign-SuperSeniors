import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIdleTimeout } from './useIdleTimeout';

describe('useIdleTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
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

  it('restarts the countdown when another tab is active', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdleTimeout(vi.fn(), 15, 2));

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000); // t = 10 min
    });

    act(() => {
      // pretend another tab saved its activity time and the browser told us:
      localStorage.setItem('pmw:lastActivity', String(Date.now()));
      window.dispatchEvent(new StorageEvent('storage', { key: 'pmw:lastActivity' }));
    });

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000); // t = 20 min
    });
    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000); // t = 25 min
    });
    expect(result.current.isIdle).toBe(true);
  });

  it('resets the countdown when the user is active', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdleTimeout(vi.fn(), 15, 2));

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000); // t = 10 min
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown')); // user presses a key
    });

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000); // t = 20 min
    });
    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(true);
  });

  it('does not show the warning if another tab was recently active', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdleTimeout(vi.fn(), 15, 2));

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000); // t = 10 min
    });

    // another tab was active, but this tab never got the event
    localStorage.setItem('pmw:lastActivity', String(Date.now()));

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000); // t = 15 min
    });
    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000); // t = 25 min
    });
    expect(result.current.isIdle).toBe(true);
  });

  it('does not sign out if another tab was active during the warning', () => {
    vi.useFakeTimers();
    const signOut = vi.fn();
    const { result } = renderHook(() => useIdleTimeout(signOut, 15, 2));

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000); // t = 15 min
    });
    expect(result.current.isIdle).toBe(true);

    act(() => {
      vi.advanceTimersByTime(60 * 1000); // t = 16 min
    });
    localStorage.setItem('pmw:lastActivity', String(Date.now()));

    act(() => {
      vi.advanceTimersByTime(60 * 1000); // t = 17 min
    });
    expect(signOut).not.toHaveBeenCalled();
    expect(result.current.isIdle).toBe(false);
  });

  it('shows the warning again after another idle period', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdleTimeout(vi.fn(), 15, 2));

    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(true);

    act(() => {
      result.current.stayLoggedIn();
    });
    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(14 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(true);
  });
});
