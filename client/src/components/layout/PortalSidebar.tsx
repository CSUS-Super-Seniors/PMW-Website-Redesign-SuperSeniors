import { NavLink } from 'react-router';
import { getNavItemsForRole } from '../../portal/navItems';

export default function PortalSidebar() {
  const items = getNavItemsForRole('Owner');

  return (
    <nav aria-label="Portal">
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <NavLink to={item.path}>{item.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
