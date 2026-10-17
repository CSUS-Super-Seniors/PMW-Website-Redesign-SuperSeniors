import { NavLink } from 'react-router';
import { getBottomBarItems } from '../../portal/navItems';
import { MenuIcon } from '../icons';

export default function PortalBottomNav() {
  const items = getBottomBarItems('Owner');

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
        className="flex flex-1 flex-col items-center justify-center gap-0.5 type-caption text-neutral-600"
      >
        <MenuIcon className="size-6" />
        More
      </button>
    </nav>
  );
}
