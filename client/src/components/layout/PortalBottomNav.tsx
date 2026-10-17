import { NavLink } from 'react-router';
import { getBottomBarItems, getMoreItems } from '../../portal/navItems';
import { MenuIcon } from '../icons';
import { useState } from 'react';

export default function PortalBottomNav() {
  const items = getBottomBarItems('Owner');
  const [open, setOpen] = useState(false);
  const moreItems = getMoreItems('Owner');

  return (
    <nav aria-label="Portal mobile" className="flex h-16 border-t border-neutral-300 bg-white">
      {items.map((items) => (
        <NavLink
          key={items.label}
          to={items.path}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center gap-0.5 type-caption ${isActive ? 'border-t-3 border-amber text-dark-brown' : 'text-neutral-600'}`
          }
        >
          <items.icon className="size-6" />
          {items.label}
        </NavLink>
      ))}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="portal-more-menu"
        onClick={() => setOpen(!open)}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 type-caption text-neutral-600"
      >
        <MenuIcon className="size-6" />
        More
      </button>
      {open && (
        <ul
          id="portal-more-menu"
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
