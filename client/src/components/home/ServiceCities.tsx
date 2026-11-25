import { fetchPublicServiceCities } from '../../api/publicHome';
import { usePublicContent } from '../../api/usePublicContent';
import { business } from '../../config/site';
import { Button, ErrorBanner } from '../ui';

export default function ServiceCities() {
  const { state, retry } = usePublicContent(fetchPublicServiceCities);

  if (state.status === 'loading') {
    return (
      <p role="status" className="type-body-lg text-neutral-600">
        Loading the cities we serve…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <ErrorBanner message="We could not load the cities we serve right now.">
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button variant="outline" onClick={retry}>
            Try cities again
          </Button>
          <a
            href={business.phoneHref}
            className="type-button rounded-sm underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-dark-brown"
          >
            Call {business.phoneDisplay}
          </a>
        </div>
      </ErrorBanner>
    );
  }
  if (state.data.cities.length === 0) {
    return (
      <p className="type-body-lg text-neutral-800">
        Please call us to check whether we serve your city.
      </p>
    );
  }
  const cityNames = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
    state.data.cities,
  );
  return (
    <p className="type-body-lg text-neutral-800">
      We come to your home in {cityNames}. Not sure if we serve your street? Check the list of
      cities, or give us a call.
    </p>
  );
}
