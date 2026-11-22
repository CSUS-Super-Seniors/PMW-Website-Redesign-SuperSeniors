import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ServiceCity } from '@pmw/validation';
import { fetchServiceCities, type FetchServiceCities } from '../api/serviceCities';
import { Button, ErrorBanner } from '../components/ui';
import { business, routes } from '../config/site';

type CitiesState =
  { status: 'loading' } | { status: 'error' } | { status: 'success'; cities: ServiceCity[] };

const estimateClass =
  'type-button inline-flex min-h-11 w-full items-center justify-center rounded-sm bg-amber px-5 py-3 text-dark-brown hover:bg-amber-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark-brown sm:w-fit';
const callClass =
  'type-button inline-flex min-h-11 w-full items-center justify-center rounded-sm border border-dark-brown px-5 py-3 text-dark-brown hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dark-brown sm:w-fit';
const phoneClass =
  'rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

export default function ServiceAreaPage({
  loadCities = fetchServiceCities,
}: {
  loadCities?: FetchServiceCities;
}) {
  const [state, setState] = useState<CitiesState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadCities(controller.signal).then(
      (cities) => {
        if (!controller.signal.aborted) setState({ status: 'success', cities });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, [loadCities, attempt]);

  const phone = (
    <a href={business.phoneHref} className={phoneClass}>
      {business.phoneDisplay}
    </a>
  );

  return (
    <main className="mx-auto flex w-full max-w-360 flex-col px-4 pt-4 pb-14 xl:px-10 xl:pt-8 xl:pb-28">
      <section
        aria-labelledby="service-area-title"
        className="flex flex-col gap-6 rounded-3xl bg-neutral-50 px-4 py-10 xl:rounded-4xl xl:px-28 xl:py-20"
      >
        <p className="type-label text-walnut uppercase">Service area</p>
        <h1 id="service-area-title" className="type-h2 xl:type-h1">
          Where we work
        </h1>
        <p className="type-body-lg max-w-180 text-neutral-800">
          We come to you in Carmichael and the cities around it. Find your city below, or call us if
          you are not sure.
        </p>
      </section>

      <section
        aria-labelledby="served-cities-title"
        className="grid min-w-0 items-center gap-6 px-2 py-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)] xl:gap-16 xl:px-18 xl:py-20"
      >
        <div className="min-w-0">
          <h2 id="served-cities-title" className="type-h3 xl:type-h2">
            Cities we serve
          </h2>
          <div className="mt-6" aria-busy={state.status === 'loading'}>
            {state.status === 'loading' && (
              <p role="status" className="type-body-lg">
                Loading cities we serve…
              </p>
            )}
            {state.status === 'error' && (
              <div className="space-y-4">
                <ErrorBanner
                  title="We could not load the cities we serve"
                  message="Check your connection and try again, or call us to ask whether we can come to you."
                >
                  <p className="type-body mt-2">Call {phone}.</p>
                </ErrorBanner>
                <Button
                  variant="outline"
                  onClick={() => {
                    setState({ status: 'loading' });
                    setAttempt((value) => value + 1);
                  }}
                >
                  Try again
                </Button>
              </div>
            )}
            {state.status === 'success' &&
              (state.cities.length === 0 ? (
                <p role="status" className="type-body-lg text-neutral-800">
                  Our city list is being updated. Call {phone} and we’ll let you know if we can come
                  to you.
                </p>
              ) : (
                <>
                  <ul aria-label="Cities we serve" className="flex flex-wrap gap-3">
                    {state.cities.map(({ name }) => (
                      <li
                        key={name}
                        className="type-body-lg max-w-full rounded-full border border-neutral-300 bg-neutral-50 px-6 py-3 text-neutral-800 wrap-break-word"
                      >
                        {name}
                      </li>
                    ))}
                  </ul>
                  <p className="type-body-lg mt-6 text-neutral-800">
                    Do not see your city? Call {phone} and we will let you know if we can come to
                    you.
                  </p>
                </>
              ))}
          </div>
        </div>

        <figure className="min-w-0">
          <img
            src="/images/service-area-map.svg"
            width={1040}
            height={760}
            alt="Regional map marking Carmichael beside unlabeled river linework. No service boundary is shown."
            className="block h-60 w-full rounded-2xl bg-neutral-100 object-cover xl:h-95"
          />
          <figcaption className="type-caption mt-2 text-neutral-600">
            Geographic data: U.S. Census Bureau TIGER/Line®. Regional orientation only.
          </figcaption>
        </figure>
      </section>

      <section
        aria-labelledby="service-estimate-title"
        className="mt-2 flex flex-col gap-6 rounded-3xl bg-neutral-100 px-4 py-10 xl:mt-0 xl:rounded-4xl xl:px-28 xl:py-20"
      >
        <h2 id="service-estimate-title" className="type-h3 xl:type-h2">
          Ready for an estimate?
        </h2>
        <p className="type-body-lg max-w-180 text-neutral-800">
          Tell us what happened to your furniture. Photos are optional, and the form only takes a
          few minutes.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link to={routes.requestEstimate} className={estimateClass}>
            Request an estimate
          </Link>
          <a href={business.phoneHref} className={callClass}>
            Call {business.phoneDisplay}
          </a>
        </div>
      </section>
    </main>
  );
}
