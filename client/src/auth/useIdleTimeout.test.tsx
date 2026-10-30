import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIdleTimeout } from './useIdleTimeout';
import { lastActivityKey } from './lastActivity';

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
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimeout(onTimeout, 15, 2));

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

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('signs out right away on load when the saved activity is older than idle plus warning', () => {
    vi.useFakeTimers();
    localStorage.setItem(lastActivityKey, String(Date.now() - 3 * 60 * 60 * 1000));
    const onTimeout = vi.fn();

    renderHook(() => useIdleTimeout(onTimeout, 15, 2));

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('opens the warning on load with the time that is left', () => {
    vi.useFakeTimers();
    localStorage.setItem(lastActivityKey, String(Date.now() - 16 * 60 * 1000));
    const onTimeout = vi.fn();

    const { result } = renderHook(() => useIdleTimeout(onTimeout, 15, 2));
    expect(result.current.isIdle).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite an old saved time when the page loads', () => {
    vi.useFakeTimers();
    const old = String(Date.now() - 16 * 60 * 1000);
    localStorage.setItem(lastActivityKey, old);

    renderHook(() => useIdleTimeout(vi.fn(), 15, 2));

    expect(localStorage.getItem(lastActivityKey)).toBe(old);
  });

  it('treats a saved value that is not a number as expired', () => {
    vi.useFakeTimers();
    localStorage.setItem(lastActivityKey, 'not-a-number');
    const onTimeout = vi.fn();

    renderHook(() => useIdleTimeout(onTimeout, 15, 2));

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('checks the saved time when the tab becomes visible after sleep', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    renderHook(() => useIdleTimeout(onTimeout, 15, 2));

    vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1000); // the laptop slept; no timers ran
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('closes the warning as soon as another tab is active', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdleTimeout(vi.fn(), 15, 2));
    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(true);

    act(() => {
      vi.advanceTimersByTime(60 * 1000); // t = 16 min, before the warning ends
    });
    act(() => {
      localStorage.setItem(lastActivityKey, String(Date.now()));
      window.dispatchEvent(new StorageEvent('storage', { key: lastActivityKey }));
    });

    expect(result.current.isIdle).toBe(false);
  });

  it('does not bring back an expired session when a key is pressed after sleep', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    renderHook(() => useIdleTimeout(onTimeout, 15, 2));

    vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1000); // slept: no timers ran, no focus event
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('opens the warning instead of resetting when a key is pressed after the idle limit', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdleTimeout(vi.fn(), 15, 2));

    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown'));
    });

    expect(result.current.isIdle).toBe(true);
  });

  it('does not expire a saved time that is only a second in the future', () => {
    vi.useFakeTimers();
    localStorage.setItem(lastActivityKey, String(Date.now() + 1000));
    const onTimeout = vi.fn();

    renderHook(() => useIdleTimeout(onTimeout, 15, 2));

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('does not bring back an expired session when Stay signed in is clicked after sleep', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useIdleTimeout(onTimeout, 15, 2));
    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(true);

    vi.setSystemTime(Date.now() + 3 * 60 * 60 * 1000); // asleep with the warning open; no timer ran
    act(() => {
      result.current.stayLoggedIn();
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(Date.now() - Number(localStorage.getItem(lastActivityKey))).toBeGreaterThan(
      60 * 60 * 1000,
    ); // the old time was not overwritten
  });

  it('restarts the idle time from now when the saved time is in the future', () => {
    vi.useFakeTimers();
    localStorage.setItem(lastActivityKey, String(Date.now() + 24 * 60 * 60 * 1000));
    const { result } = renderHook(() => useIdleTimeout(vi.fn(), 15, 2));

    expect(Number(localStorage.getItem(lastActivityKey))).toBeLessThanOrEqual(Date.now());
    act(() => {
      vi.advanceTimersByTime(15 * 60 * 1000);
    });
    expect(result.current.isIdle).toBe(true);
  });
});
