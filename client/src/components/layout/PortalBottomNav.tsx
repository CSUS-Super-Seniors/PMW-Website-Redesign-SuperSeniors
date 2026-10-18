import { useEffect, useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { getBottomBarItems, getMoreItems } from '../../portal/navItems';
import { MenuIcon } from '../icons';

export default function PortalBottomNav() {
  const { pathname } = useLocation();
  // Remember which page the menu was opened on, so it closes by itself
  // as soon as the user navigates somewhere else.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const menuId = useId();
  const tabs = getBottomBarItems('owner');
  const moreItems = getMoreItems('owner');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOn(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <nav
      aria-label="Portal mobile"
      className="relative flex h-16 border-t border-neutral-300 bg-white"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.label}
          to={tab.path}
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
        onClick={() => setOpenOn(open ? null : pathname)}
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
                onClick={() => setOpenOn(null)}
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
