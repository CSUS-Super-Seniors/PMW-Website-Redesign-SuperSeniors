import { Link, useLocation } from 'react-router';
import { routes } from '../../config/site';
import { navItems } from '../../portal/navItems';

export default function PortalTopBar() {
  const { pathname } = useLocation();
  const title = navItems.find((item) => item.path === pathname)?.label ?? '';

  return (
    <header className="flex h-18 items-center justify-between border-b border-neutral-300 bg-white px-8">
      <p className="type-h3">{title}</p>
      <div className="flex items-center gap-6">
        <Link to={routes.home} className="type-body-sm text-walnut underline">
          View public site
        </Link>
        <span className="type-label">Girlie</span>
      </div>
    </header>
  );
}
