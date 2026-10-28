import { NavLink } from 'react-router';
import { business } from '../../config/site';
import { getNavItemsForRole } from '../../portal/navItems';
import { LogoutIcon } from '../icons';
import LogoMark from '../brand/LogoMark';

export default function PortalSidebar({
  displayName,
  onLogout,
}: {
  displayName: string;
  onLogout: () => void;
}) {
  const items = getNavItemsForRole('owner');

  return (
    <aside className="hidden md:flex min-h-dvh w-62 shrink-0 flex-col bg-dark-brown text-neutral-100">
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
            <li
              key={item.label}
              className={item.dividerBefore ? 'mt-2.5 border-t border-neutral-800 pt-3.5' : ''}
            >
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2.5 type-nav ${isActive ? 'bg-neutral-800 text-white' : 'text-neutral-300'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon className={`size-6 ${isActive ? 'text-amber' : ''}`} />
                    {item.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto flex flex-col gap-2 p-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 type-label text-dark-brown">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="type-label break-all">{displayName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left type-nav text-neutral-300 hover:bg-neutral-800"
        >
          <LogoutIcon className="size-6" />
          Log out
        </button>
      </div>
    </aside>
  );
}
