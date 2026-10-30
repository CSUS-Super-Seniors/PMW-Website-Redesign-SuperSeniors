/**
 * Business details and site navigation in one place, so a client answer
 * (for example the phone number or a page name) only needs to change this file.
 * Services page content (Q8, the final service names) lives in `services.ts`.
 */

export const business = {
  name: 'Peterson Mobile Woodworking',
  phoneDisplay: '(916) 643-5686',
  phoneHref: 'tel:+19166435686',
  /** Hours from SSPMW-257/261 and the Updated 10-3 Contact frame. */
  hours: 'Monday to Saturday, 8 am to 5 pm',
  /** Only the city is ever shown. Never add a street address to the site. */
  location: 'Carmichael, CA',
  tagline: 'Family-run furniture repair and restoration in Carmichael, CA since 2011.',
} as const;

/** Route paths. Pages that are not built yet show a placeholder. */
export const routes = {
  home: '/',
  services: '/services',
  gallery: '/gallery',
  serviceArea: '/service-area',
  testimonials: '/testimonials',
  about: '/about',
  contact: '/contact',
  requestEstimate: '/estimate',
  privacy: '/privacy',
  terms: '/terms',
  staffLogin: '/staff/login',
  staffForgotPassword: '/staff/forgot-password',
  staffResetPassword: '/staff/reset-password',
  portalHome: '/portal/dashboard',
} as const;

export type NavLinkItem = { label: string; to: string };

/** Desktop header links (Figma "Header / Desktop"). */
export const mainNav: NavLinkItem[] = [
  { label: 'Services', to: routes.services },
  { label: 'Gallery', to: routes.gallery },
  { label: 'Service Area', to: routes.serviceArea },
  { label: 'Testimonials', to: routes.testimonials },
  { label: 'About', to: routes.about },
  { label: 'Contact', to: routes.contact },
];

/** Phone menu links (Figma "Hamburger menu / Mobile"): Home first, then the header links. */
export const mobileNav: NavLinkItem[] = [{ label: 'Home', to: routes.home }, ...mainNav];

/**
 * Footer service list. Q8 is still open with the client: these names differ from
 * the Services page and minor upholstery is missing. Update here once answered.
 */
export const footerServices: string[] = [
  'Touch-ups and repair',
  'Refinishing',
  'Fire and water damage',
  'Full restoration',
];

export const footerCompanyLinks: NavLinkItem[] = [
  { label: 'Gallery', to: routes.gallery },
  { label: 'Service area', to: routes.serviceArea },
  { label: 'Testimonials', to: routes.testimonials },
  { label: 'About', to: routes.about },
  { label: 'Contact', to: routes.contact },
];
