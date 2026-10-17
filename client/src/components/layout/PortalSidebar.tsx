import { NavLink } from 'react-router';
import { business } from '../../config/site';
import { getNavItemsForRole } from '../../portal/navItems';
import LogoMark from '../brand/LogoMark';

export default function PortalSidebar() {
  const items = getNavItemsForRole('Owner');

  return (
    <aside className="flex min-h-dvh w-62 flex-col bg-dark-brown text-neutral-100">
      <div className="flex items-center gap-3 px-7 pt-8 pb-5">
        <LogoMark title="" className="size-10" />
        <div>
          <p className="type-label">{business.name}</p>
          <p className="type-caption text-neutral-400">Owner tools</p>
        </div>
      </div>

      <nav aria-label="Portal">
        <ul className="flex flex-col gap-1 p-4">
          {items.map((item) => (
            <li key={item.label}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-3 type-nav ${isActive ? 'bg-neutral-800' : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto flex flex-col gap-2 p-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-neutral-100 type-monogram text-dark-brown">
            GP
          </span>
          <div>
            <p className="type-label">Girlie Peterson</p>
            <p className="type-caption text-neutral-400">Owner</p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-md px-3 py-3 text-left type-nav hover:bg-neutral-800"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
