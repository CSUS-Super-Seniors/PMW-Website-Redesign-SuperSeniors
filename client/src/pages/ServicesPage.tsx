import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { services as defaultServices, type Service } from '../config/services';
import { business, routes } from '../config/site';

type ServicesPageProps = {
  /** Defaults to the content list in `config/services.ts`. Tests pass their own list. */
  services?: readonly Service[];
};

/** Full width on phones (Figma "Services / Mobile"), sized to the label from tablets up. */
const estimateButtonClass =
  'type-button inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-amber px-5 py-3 text-dark-brown hover:bg-amber-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark-brown sm:w-fit';

/**
 * Section headings: H3 on phones, H2 on desktop. The Figma phone frame uses an unstyled
 * 28/36 here, so this uses the nearest design system text style that stays below the H1.
 */
const sectionHeadingClass = 'type-h3 xl:type-h2';

/**
 * Public Services page (SSPMW-247, C2). Figma: "Services / Desktop" and "Services / Mobile".
 * Every service section comes from the `services` list, so the client's final list (Q8)
 * changes the sections without layout changes. The page title and intro below name the
 * current three services, so check them too when the list changes.
 * Desktop layout starts at xl, like the header and footer. The content is up to 1440 wide
 * with 40px side margins, so the cream panels run wider than the header, as in Figma.
 */
export default function ServicesPage({ services = defaultServices }: ServicesPageProps) {
  const { hash, key } = useLocation();

  // The sections are rendered by React, so the browser cannot jump to a link like
  // /services#refinishing on its own when the page first loads. Scroll there once they exist.
  // `key` changes on every navigation, so clicking a link to the anchor already in the
  // address bar scrolls back to it too.
  useEffect(() => {
    const target = services.find((service) => `#${service.id}` === hash);
    if (target) document.getElementById(target.id)?.scrollIntoView();
  }, [hash, key, services]);

  return (
    <main className="mx-auto flex w-full max-w-360 flex-col p-4 xl:px-10 xl:py-8">
      <div className="flex flex-col gap-6 rounded-3xl bg-neutral-50 px-4 py-10 xl:rounded-4xl xl:px-28 xl:py-20">
        <p className="type-overline text-walnut">Services</p>
        <h1 className="type-h2 max-w-190 xl:type-h1">
          Furniture repair, refinishing, and restoration
        </h1>
        <p className="type-body-lg max-w-180 text-neutral-800">
          Whatever shape your furniture is in, we can help. Tell us what happened and we will give
          you an honest estimate before any work begins.
        </p>
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:gap-8">
          <Link to={routes.requestEstimate} className={estimateButtonClass}>
            Request an estimate
          </Link>
          <a
            href={business.phoneHref}
            className="type-h3 w-fit rounded-sm text-dark-brown hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
          >
            Call {business.phoneDisplay}
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-12 px-2 pt-10 pb-6 xl:gap-18 xl:px-18 xl:pt-20 xl:pb-10">
        {services.map((service, index) => (
          <ServiceSection key={service.id} service={service} photoOnRight={index % 2 === 0} />
        ))}
      </div>

      <section aria-labelledby="estimate-cta-title" className="pt-6 pb-10 xl:pt-10 xl:pb-20">
        <div className="flex flex-col gap-6 rounded-3xl bg-neutral-100 px-4 py-10 xl:rounded-4xl xl:px-28 xl:py-20">
          <h2 id="estimate-cta-title" className={sectionHeadingClass}>
            Ready for an estimate?
          </h2>
          <p className="type-body-lg max-w-180 text-neutral-800">
            Tell us what happened to your furniture. Photos are optional, and the form only takes a
            few minutes.
          </p>
          <Link to={routes.requestEstimate} className={estimateButtonClass}>
            Request an estimate
          </Link>
        </div>
      </section>
    </main>
  );
}

type ServiceSectionProps = {
  service: Service;
  /** Desktop sections alternate: the first photo sits on the right, the next on the left. */
  photoOnRight: boolean;
};

/**
 * One service: text and a photo side by side on desktop, photo on top on phones.
 * scroll-mt-24 keeps a linked section clear of the sticky header (80px plus its border).
 */
function ServiceSection({ service, photoOnRight }: ServiceSectionProps) {
  const titleId = `${service.id}-title`;

  return (
    <section
      id={service.id}
      aria-labelledby={titleId}
      className="flex scroll-mt-24 flex-col gap-6 xl:flex-row xl:items-center xl:gap-16"
    >
      {/* min-w-0 and wrap-break-word keep a long word or link from widening the page. */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 wrap-break-word">
        <h2 id={titleId} className={sectionHeadingClass}>
          {service.name}
        </h2>
        <p className="type-body-lg text-neutral-800">{service.description}</p>
        {service.commonJobs.length > 0 && (
          <>
            <h3 className="type-label text-walnut">Common jobs</h3>
            <ul className="type-body-lg list-inside list-disc text-neutral-800">
              {service.commonJobs.map((job) => (
                <li key={job}>{job}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Placeholder until the Petersons' real photos are added (SSPMW-49). */}
      <div
        role="img"
        aria-label={`Photo placeholder: ${service.photoDescription}`}
        className={`order-first flex h-60 w-full shrink-0 items-center justify-center rounded-2xl bg-neutral-100 px-6 text-center xl:h-80 xl:w-120 ${
          photoOnRight ? 'xl:order-last' : ''
        }`}
      >
        <span aria-hidden="true" className="type-body text-neutral-600">
          Photo: {service.photoDescription}
        </span>
      </div>
    </section>
  );
}
