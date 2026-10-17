import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router';
import { business, mobileNav, routes } from '../../config/site';
import { ChevronRightIcon } from '../icons';

type MobileMenuProps = {
  id: string;
  open: boolean;
  /** Close the menu. returnFocus=false when the user is leaving via a link. */
  onClose: (returnFocus?: boolean) => void;
};

/**
 * Phone navigation (SSPMW-143). Figma: "Hamburger menu / Mobile".
 * Opens below the header so the phone number and close button stay visible.
 * Closes on link tap, the close button (in the header), or Escape.
 */
export default function MobileMenu({ id, open, onClose }: MobileMenuProps) {
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;

    firstLinkRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);

    // Keep the page behind the menu from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Close if the window grows to the desktop layout, where the menu does not exist.
    const desktop =
      typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 80rem)') : null;
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onClose(false);
    };
    desktop?.addEventListener('change', onDesktop);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      desktop?.removeEventListener('change', onDesktop);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      id={id}
      className="fixed inset-x-0 top-header bottom-0 z-40 overflow-y-auto bg-white xl:hidden"
    >
      <nav aria-label="Main">
        <ul>
          {mobileNav.map((item, index) => (
            <li key={item.to}>
              <NavLink
                ref={index === 0 ? firstLinkRef : undefined}
                to={item.to}
                end={item.to === routes.home}
                onClick={() => onClose(false)}
                className={({ isActive }) =>
                  `flex h-16 items-center justify-between border-b border-neutral-300 px-6 font-sans text-h4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dark-brown ${
                    isActive
                      ? 'bg-neutral-100 font-semibold text-dark-brown'
                      : 'bg-white font-medium text-neutral-800'
                  }`
                }
              >
                {item.label}
                <ChevronRightIcon className="text-dark-brown" />
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-4 px-6 py-8">
        <a
          href={business.phoneHref}
          className="flex flex-col gap-0.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
        >
          <span className="type-body text-neutral-600">Call us</span>
          <span className="type-h2 text-dark-brown">{business.phoneDisplay}</span>
        </a>
        <Link
          to={routes.requestEstimate}
          onClick={() => onClose(false)}
          className="type-button flex h-14 items-center justify-center rounded-sm bg-amber px-5 text-dark-brown hover:bg-amber-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark-brown"
        >
          Request an estimate
        </Link>
      </div>
    </div>
  );
}
