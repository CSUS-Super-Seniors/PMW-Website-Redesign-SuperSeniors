import { Link } from 'react-router';
import RecentWork from '../components/home/RecentWork';
import ServiceCities from '../components/home/ServiceCities';
import { services as defaultServices, type Service } from '../config/services';
import { business, routes } from '../config/site';

const outlineLink =
  'type-button inline-flex min-h-11 w-full items-center justify-center rounded-sm border border-dark-brown px-5 py-3 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown sm:w-fit';
const heading = 'type-h3 xl:type-h2';

/** SSPMW-225: Figma Home / Desktop and Home / Mobile. */
export default function HomePage({
  services = defaultServices,
}: {
  services?: readonly Service[];
}) {
  return (
    <main className="mx-auto w-full max-w-360 p-4 pb-12 xl:px-10 xl:pt-8 xl:pb-20">
      <section
        aria-labelledby="home-title"
        className="grid gap-6 rounded-3xl bg-neutral-50 p-4 xl:grid-cols-2 xl:items-center xl:gap-16 xl:rounded-4xl xl:px-28 xl:py-20"
      >
        <div className="flex min-w-0 flex-col items-start gap-5 rounded-2xl bg-white p-6 xl:p-10">
          <p className="type-overline text-walnut">
            Furniture repair and restoration in Carmichael
          </p>
          <h1 id="home-title" className="type-h2 xl:type-h1">
            Furniture repair that comes to you
          </h1>
          <p className="type-body-lg text-neutral-800">
            {business.name} repairs, refinishes, and restores your furniture. Tell us what happened
            and we will give you an honest estimate.
          </p>
          <div className="flex w-full flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-center">
            <Link
              to={routes.requestEstimate}
              className="type-button inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-amber px-5 py-3 hover:bg-amber-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown sm:w-fit"
            >
              Request an estimate
            </Link>
            <a
              href={business.phoneHref}
              className="type-h4 flex min-h-11 items-center rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
            >
              Call {business.phoneDisplay}
            </a>
          </div>
        </div>
        <div
          role="img"
          aria-label="Photo placeholder: refurbished oak dining table"
          className="flex aspect-square min-w-0 items-center justify-center rounded-2xl bg-neutral-100 p-8 text-center xl:aspect-6/5"
        >
          <span aria-hidden="true" className="type-body text-neutral-600">
            Photo: refurbished oak dining table
          </span>
        </div>
      </section>

      <div className="space-y-12 px-2 py-10 xl:space-y-16 xl:px-18 xl:py-16">
        <section aria-labelledby="home-services-title">
          <h2 id="home-services-title" className={heading}>
            What we repair and refinish
          </h2>
          <ul className="mt-6 grid gap-4 xl:grid-cols-3 xl:gap-6">
            {services.map((service) => (
              <li key={service.id} className="min-w-0 rounded-xl bg-neutral-50 p-6 wrap-break-word">
                <h3 className="type-h4">
                  <Link
                    to={`${routes.services}#${service.id}`}
                    className="rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
                  >
                    {service.name}
                  </Link>
                </h3>
                <p className="type-body-lg mt-3 text-neutral-800">
                  {service.summary ?? service.description}
                </p>
              </li>
            ))}
          </ul>
          <Link to={routes.services} className={`${outlineLink} mt-6`}>
            See all services
          </Link>
        </section>

        <section aria-labelledby="home-work-title">
          <h2 id="home-work-title" className={`${heading} mb-6`}>
            Recent work
          </h2>
          <RecentWork />
          <Link to={routes.gallery} className={`${outlineLink} mt-6`}>
            See the gallery
          </Link>
        </section>
      </div>

      <section
        aria-labelledby="home-cities-title"
        className="space-y-5 rounded-3xl bg-neutral-100 px-6 py-10 xl:rounded-4xl xl:px-28 xl:py-20"
      >
        <h2 id="home-cities-title" className={heading}>
          Proudly serving Carmichael and nearby cities
        </h2>
        <ServiceCities />
        <Link to={routes.serviceArea} className={outlineLink}>
          See where we work
        </Link>
      </section>
    </main>
  );
}
