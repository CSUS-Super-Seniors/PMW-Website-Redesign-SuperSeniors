import { NavLink } from 'react-router';
import { getNavItemsForRole } from '../../portal/navItems';

export default function PortalSidebar() {
  const items = getNavItemsForRole('Owner');

  return (
    <nav aria-label="Portal" className="w-62 min-h-dvh bg-dark-brown text-neutral-100">
      <ul className="flex flex-col gap-1 p-4">
        {items.map((item) => (
          <li key={item.label}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 type-nav ${isActive ? 'bg-neutral-800' : ''}`
              }
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
