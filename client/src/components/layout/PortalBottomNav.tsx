import { useEffect, useId, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { getBottomBarItems, getMoreItems } from '../../portal/navItems';
import { MenuIcon } from '../icons';

export default function PortalBottomNav() {
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const tabs = getBottomBarItems('owner');
  const moreItems = getMoreItems('owner');

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    // Tapping anywhere outside the bar (and its menu) closes the menu.
    const onPointerDown = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <nav
      ref={navRef}
      aria-label="Portal mobile"
      className="relative flex h-16 border-t border-neutral-300 bg-white"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.label}
          to={tab.path}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 type-caption ${isActive ? 'border-t-3 border-amber text-dark-brown' : 'text-neutral-600'}`
          }
        >
          <tab.icon className="size-6" />
          {tab.label}
        </NavLink>
      ))}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 type-caption text-neutral-600"
      >
        <MenuIcon className="size-6" />
        More
      </button>
      {open && (
        <ul
          id={menuId}
          className="absolute inset-x-0 bottom-full border-t border-neutral-300 bg-white"
        >
          {moreItems.map((item) => (
            <li key={item.label}>
              <NavLink
                to={item.path}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 border-b border-neutral-300 px-4 py-4 type-nav text-dark-brown"
              >
                <item.icon className="size-6" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
