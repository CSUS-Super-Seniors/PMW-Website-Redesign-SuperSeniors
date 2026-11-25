import { useState } from 'react';
import type { RecentGalleryItem } from '@pmw/validation';
import { fetchRecentGallery } from '../../api/publicHome';
import { usePublicContent } from '../../api/usePublicContent';
import { Button, ErrorBanner } from '../ui';

function WorkPhoto({ url, stage }: { url: string | null; stage: 'Before' | 'After' }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const available = url !== null && failedUrl !== url;

  return (
    <div className="min-w-0">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-neutral-100">
        {available ? (
          <img
            src={url}
            alt={`Furniture ${stage.toLowerCase()} repair`}
            loading="lazy"
            decoding="async"
            width={480}
            height={480}
            className="h-full w-full object-cover"
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <p className="type-body-sm px-3 text-center text-neutral-600">
            {url ? 'Photo unavailable' : 'Photo not published'}
          </p>
        )}
      </div>
      <p className="type-label mt-2 text-neutral-600">{stage}</p>
    </div>
  );
}

function WorkPair({ item }: { item: RecentGalleryItem }) {
  return (
    <li>
      <figure>
        <div className="grid grid-cols-2 gap-3">
          <WorkPhoto url={item.beforeUrl} stage="Before" />
          <WorkPhoto url={item.afterUrl} stage="After" />
        </div>
        <figcaption className="type-body mt-3 text-neutral-800">
          Furniture repaired and restored
        </figcaption>
      </figure>
    </li>
  );
}

export default function RecentWork() {
  const { state, retry } = usePublicContent(fetchRecentGallery);

  if (state.status === 'loading') {
    return (
      <p role="status" className="type-body-lg py-8 text-neutral-600">
        Loading recent work…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <ErrorBanner message="We could not load our recent work right now.">
        <Button variant="outline" className="mt-3" onClick={retry}>
          Try recent work again
        </Button>
      </ErrorBanner>
    );
  }
  if (state.data.items.length === 0) {
    return (
      <div className="rounded-2xl bg-neutral-50 p-6 xl:p-8">
        <p className="type-h4">More before and after photos coming soon</p>
        <p className="type-body-lg mt-2 text-neutral-600">
          Have a piece that needs some care? Tell us about it and we can help you get started.
        </p>
      </div>
    );
  }
  return (
    <ul aria-label="Recent before and after work" className="grid gap-8 xl:grid-cols-3 xl:gap-6">
      {state.data.items.map((item) => (
        <WorkPair key={item.id} item={item} />
      ))}
    </ul>
  );
}
