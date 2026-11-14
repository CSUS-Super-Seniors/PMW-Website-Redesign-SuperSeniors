import { useCallback, useEffect, useState } from 'react';
import { fetchPhotoViewUrl } from '../../api/inquiryDetail';
import { Button } from '../ui';

type PhotoUrl = { status: 'loading' } | { status: 'error' } | { status: 'ready'; url: string };

export interface InquiryPhotosProps {
  photos: { id: string }[];
  accessToken: string | undefined;
}

/**
 * Customer photos for one estimate request. Every image comes from a short-lived
 * signed URL that the owner-only view-url route issues; the bucket is private.
 */
export function InquiryPhotos({ photos, accessToken }: InquiryPhotosProps) {
  const [urls, setUrls] = useState<Record<string, PhotoUrl>>({});
  const [selected, setSelected] = useState(0);

  // Asks for a signed URL and stores the answer. A photo with no entry yet counts
  // as loading, so the first request needs no state change of its own.
  const request = useCallback(
    (photoId: string) => {
      if (!accessToken) return;
      fetchPhotoViewUrl(accessToken, photoId).then((url) => {
        setUrls((current) => ({
          ...current,
          [photoId]: url ? { status: 'ready', url } : { status: 'error' },
        }));
      });
    },
    [accessToken],
  );

  function retry(photoId: string) {
    setUrls((current) => ({ ...current, [photoId]: { status: 'loading' } }));
    request(photoId);
  }

  const photoIds = photos.map((photo) => photo.id).join(',');
  useEffect(() => {
    for (const id of photoIds ? photoIds.split(',') : []) request(id);
  }, [photoIds, request]);

  if (photos.length === 0) {
    return (
      <p className="type-body text-neutral-600">
        No photos were added to this request. Photos are optional.
      </p>
    );
  }

  const index = Math.min(selected, photos.length - 1);
  const current = photos[index];
  const currentUrl = urls[current.id] ?? { status: 'loading' };
  const label = (n: number) => `Photo ${n + 1} of ${photos.length}`;

  return (
    <div className="space-y-4">
      <div className="flex aspect-4/3 w-full items-center justify-center overflow-hidden rounded-md border border-neutral-300 bg-neutral-100">
        {currentUrl.status === 'ready' ? (
          <img
            src={currentUrl.url}
            alt={label(index)}
            className="size-full object-contain"
            // A signed URL that expired while the page was open fails to load;
            // offer a retry, which asks for a fresh one.
            onError={() => setUrls((all) => ({ ...all, [current.id]: { status: 'error' } }))}
          />
        ) : currentUrl.status === 'loading' ? (
          <p role="status" className="type-body text-neutral-600">
            Loading photo...
          </p>
        ) : (
          <div role="alert" className="flex flex-col items-center gap-3 p-4 text-center">
            <p className="type-body text-neutral-800">This photo could not be loaded.</p>
            <Button variant="outline" onClick={() => retry(current.id)}>
              Retry photo
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-body-sm text-neutral-600">{label(index)}</p>
        {currentUrl.status === 'ready' && (
          <a
            href={currentUrl.url}
            target="_blank"
            rel="noreferrer"
            className="type-body-sm rounded-sm text-walnut underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          >
            Open full size
          </a>
        )}
      </div>

      {photos.length > 1 && (
        <ul className="flex flex-wrap gap-2" aria-label="Choose a photo">
          {photos.map((photo, n) => {
            const thumb = urls[photo.id];
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => setSelected(n)}
                  aria-label={`Show ${label(n).toLowerCase()}`}
                  aria-pressed={n === index}
                  className={`flex size-20 items-center justify-center overflow-hidden rounded-sm border-2 bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber ${
                    n === index ? 'border-amber' : 'border-neutral-300'
                  }`}
                >
                  {thumb?.status === 'ready' ? (
                    <img src={thumb.url} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="type-body-sm text-neutral-600" aria-hidden="true">
                      {thumb?.status === 'error' ? '!' : '…'}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
