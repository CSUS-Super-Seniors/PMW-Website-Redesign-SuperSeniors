import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { routes } from '../../config/site';
import { navItems } from '../../portal/navItems';
import { ChevronRightIcon, LogoutIcon } from '../icons';

export default function PortalTopBar({
  displayName,
  onLogout,
}: {
  displayName: string;
  onLogout: () => void;
}) {
  const { pathname } = useLocation();
  const title = navItems.find((item) => item.path === pathname)?.label ?? '';
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!menuOpen) return;
    logoutRef.current?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  return (
    <header className="flex min-h-18 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-neutral-300 bg-white px-4 py-2 md:px-8">
      <p className="type-h3">{title}</p>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 md:gap-x-6">
        <Link to={routes.home} className="type-body-sm text-walnut underline">
          View public site
        </Link>
        <div
          ref={accountRef}
          className="relative min-w-0"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && menuOpen) {
              event.preventDefault();
              setMenuOpen(false);
              triggerRef.current?.focus();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              setMenuOpen(true);
              logoutRef.current?.focus();
            }
          }}
        >
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Account menu for ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            onClick={() => setMenuOpen(!menuOpen)}
            className="type-label flex min-h-11 max-w-full items-center gap-2 rounded-sm px-2 text-dark-brown hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            <span className="max-w-36 truncate sm:max-w-60" title={displayName}>
              {displayName}
            </span>
            <ChevronRightIcon className="size-4 shrink-0 rotate-90" />
          </button>
          {menuOpen && (
            <div
              id={menuId}
              role="menu"
              aria-label="Account"
              className="absolute right-0 z-50 mt-1 w-44 rounded-lg border border-neutral-300 bg-white p-1 shadow-overlay"
            >
              <button
                ref={logoutRef}
                type="button"
                role="menuitem"
                onClick={() => {
                  triggerRef.current?.focus();
                  setMenuOpen(false);
                  onLogout();
                }}
                className="type-label flex min-h-11 w-full items-center gap-3 rounded-sm px-3 text-dark-brown hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-amber"
              >
                <LogoutIcon className="size-5" />
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
