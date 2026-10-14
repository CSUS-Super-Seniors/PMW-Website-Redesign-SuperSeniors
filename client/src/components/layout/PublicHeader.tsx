import { useCallback, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { business, mainNav, routes } from '../../config/site';
import Logo from '../brand/Logo';
import LogoMark from '../brand/LogoMark';
import { CloseIcon, MenuIcon } from '../icons';
import MobileMenu from './MobileMenu';

/**
 * Public site header (SSPMW-132, B4). Figma: "Header / Desktop" and "Header / Mobile".
 * The phone number is always visible: in the desktop actions and in the middle
 * of the phone header, so callers never need to open the menu to find it.
 * Desktop layout starts at the xl breakpoint (1280px), where all header items fit.
 */
export default function PublicHeader() {
  const { pathname } = useLocation();
  // The menu remembers which page it was opened on, so it closes by itself
  // as soon as the user navigates somewhere else.
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null);
  const menuOpen = menuOpenOn === pathname;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const openMenu = () => setMenuOpenOn(pathname);
  const closeMenu = useCallback((returnFocus = true) => {
    setMenuOpenOn(null);
    if (returnFocus) menuButtonRef.current?.focus();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-300 bg-white">
      {/* Desktop */}
      <div className="mx-auto hidden h-header max-w-content items-center justify-between px-8 xl:flex 2xl:max-w-none 2xl:px-20">
        <Link
          to={routes.home}
          aria-label={`${business.name} home`}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
        >
          <Logo title="" className="h-11 w-auto" />
        </Link>

        <nav aria-label="Main">
          <ul className="flex gap-7">
            {mainNav.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `type-nav group flex flex-col gap-1.5 rounded-sm pt-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown ${
                      isActive ? 'text-dark-brown' : 'text-neutral-800 hover:text-dark-brown'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      <span
                        aria-hidden="true"
                        className={`h-0.5 w-full bg-amber ${
                          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'
                        }`}
                      />
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-6">
          <a
            href={business.phoneHref}
            className="flex flex-col rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
          >
            <span className="type-caption text-neutral-600">Call us</span>
            <span className="type-h4 text-dark-brown">{business.phoneDisplay}</span>
          </a>
          <Link
            to={routes.requestEstimate}
            className="type-button rounded-sm bg-amber px-5 py-3 text-dark-brown hover:bg-amber-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark-brown"
          >
            Request an estimate
          </Link>
        </div>
      </div>

      {/* Phone and tablet */}
      <div className="flex h-header items-center justify-between px-4 xl:hidden">
        <Link
          to={routes.home}
          aria-label={`${business.name} home`}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
        >
          <LogoMark title="" className="size-10" />
        </Link>

        <a
          href={business.phoneHref}
          aria-label={`Call ${business.phoneDisplay}`}
          className="type-button rounded-sm px-2 py-3 text-dark-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark-brown"
        >
          {business.phoneDisplay}
        </a>

        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
          className="-m-2.5 rounded-sm p-2.5 text-dark-brown focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark-brown"
        >
          {menuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      <MobileMenu id={menuId} open={menuOpen} onClose={closeMenu} />
    </header>
  );
}
