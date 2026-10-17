import { Link } from 'react-router';
import { business, footerCompanyLinks, footerServices, routes } from '../../config/site';
import Logo from '../brand/Logo';

const linkClass =
  'type-body-sm rounded-sm text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';
const smallLinkClass =
  'type-caption rounded-sm text-neutral-400 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

/**
 * Public site footer (SSPMW-139). Figma: "Footer / Desktop" and "Footer / Mobile".
 * Shows Carmichael as the only location (never a street address) and the
 * Staff login link Todd and Girlie use to reach the portal.
 */
export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-dark-brown">
      <div className="mx-auto flex max-w-content flex-col gap-8 px-4 pt-10 pb-6 xl:gap-10 xl:px-8 xl:pt-14 xl:pb-8 2xl:max-w-none 2xl:px-20">
        <div className="flex flex-col gap-8 xl:flex-row xl:justify-between">
          <div className="flex flex-col gap-4">
            <Link
              to={routes.home}
              aria-label={`${business.name} home`}
              className="w-fit rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber"
            >
              <Logo variant="light" title="" className="h-11 w-auto" />
            </Link>
            <p className="type-body-sm max-w-90 text-neutral-300">{business.tagline}</p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-6 xl:flex xl:gap-24">
            <div className="flex flex-col gap-3">
              <h2 className="type-overline text-amber">Services</h2>
              <ul className="type-body-sm flex flex-col gap-3">
                {footerServices.map((service) => (
                  <li key={service}>
                    <Link to={routes.services} className={linkClass}>
                      {service}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="type-overline text-amber">Company</h2>
              <ul className="type-body-sm flex flex-col gap-3">
                {footerCompanyLinks.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className={linkClass}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="type-overline text-amber">Get started</h2>
              <ul className="type-body-sm flex flex-col gap-3">
                <li>
                  <Link to={routes.requestEstimate} className={linkClass}>
                    Request an estimate
                  </Link>
                </li>
                <li>
                  <Link to={routes.contact} className={linkClass}>
                    Contact us
                  </Link>
                </li>
                <li>
                  <a href={business.phoneHref} className={linkClass}>
                    Call {business.phoneDisplay}
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>

        <hr className="border-0 border-t border-neutral-800" />

        <div className="flex flex-col gap-3 xl:flex-row xl:justify-between">
          <p className="type-caption text-neutral-400">
            © {year} {business.name}
          </p>
          <ul className="type-caption flex gap-6">
            <li>
              <Link to={routes.privacy} className={smallLinkClass}>
                Privacy
              </Link>
            </li>
            <li>
              <Link to={routes.terms} className={smallLinkClass}>
                Terms
              </Link>
            </li>
            <li>
              <Link to={routes.staffLogin} className={smallLinkClass}>
                Staff login
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
