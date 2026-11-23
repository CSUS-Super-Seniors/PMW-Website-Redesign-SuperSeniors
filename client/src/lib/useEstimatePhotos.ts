import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareEstimatePhoto, type EstimatePhoto } from './estimatePhotos';
import type { EstimatePhotoHandoff } from './estimatePhotos';
import type { PhotoSession } from '@pmw/validation';
import { startPhotoSession, renewPhotoSession, uploadEstimatePhoto } from './uploadEstimatePhoto';

/** Own this state above the photo screen so Back/forward navigation preserves it. */
export function useEstimatePhotos() {
  const [photos, setPhotos] = useState<EstimatePhoto[]>([]);
  const mounted = useRef(false);
  const current = useRef<EstimatePhoto[]>([]);
  const sessionRef = useRef<PhotoSession | null>(null);
  const uploading = useRef(false);

  function update(transform: (previous: EstimatePhoto[]) => EstimatePhoto[]) {
    current.current = transform(current.current);
    setPhotos(current.current);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const addPhotos = useCallback((files: File[]) => {
    const additions: EstimatePhoto[] = files.map((original) => ({
      id: crypto.randomUUID(),
      original,
      status: 'processing',
    }));
    update((previous) => [...previous, ...additions]);
    // Process sequentially within a selection to avoid decoding a whole batch at once.
    void (async () => {
      for (const photo of additions) {
        if (!mounted.current) return;
        let result: EstimatePhoto;
        try {
          const file = await prepareEstimatePhoto(photo.original);
          result = { ...photo, status: 'ready', file };
        } catch (error) {
          result = {
            ...photo,
            status: 'error',
            error:
              error instanceof Error
                ? error.message
                : 'This photo could not be processed. Choose another photo.',
          };
        }
        if (!mounted.current) return;
        // A removed item is never reinserted when its asynchronous work finishes.
        update((previous) => previous.map((item) => (item.id === photo.id ? result : item)));
      }
    })();
  }, []);

  const removePhoto = useCallback((id: string) => {
    update((previous) => previous.filter((photo) => photo.id !== id));
  }, []);

  async function uploadPhotos(): Promise<EstimatePhotoHandoff> {
    if (uploading.current) throw new Error('Photos are already uploading.');
    if (current.current.some((photo) => photo.status !== 'ready'))
      throw new Error('Remove photos with errors or wait for processing.');
    if (current.current.length === 0 && !sessionRef.current)
      return { photoSession: null, photos: [] };
    uploading.current = true;
    try {
      if (
        !sessionRef.current ||
        sessionRef.current.expiresAt <= Math.floor(Date.now() / 1000) + 60
      ) {
        sessionRef.current = sessionRef.current
          ? await renewPhotoSession(sessionRef.current)
          : await startPhotoSession();
        update((previous) =>
          previous.map((photo) =>
            photo.status === 'ready' ? { ...photo, uploaded: undefined } : photo,
          ),
        );
      }
      const session = sessionRef.current;
      let failed = false;
      for (const photo of [...current.current]) {
        if (!mounted.current) throw new Error('Photo screen closed.');
        if (
          photo.status !== 'ready' ||
          photo.uploaded ||
          !current.current.some((item) => item.id === photo.id)
        )
          continue;
        try {
          const uploaded = await uploadEstimatePhoto(session, photo.id, photo.file);
          if (mounted.current)
            update((previous) =>
              previous.map((item) =>
                item.id === photo.id && item.status === 'ready'
                  ? { ...item, uploaded, uploadError: undefined }
                  : item,
              ),
            );
        } catch (error) {
          failed = true;
          if (mounted.current)
            update((previous) =>
              previous.map((item) =>
                item.id === photo.id && item.status === 'ready'
                  ? {
                      ...item,
                      uploadError: error instanceof Error ? error.message : 'Photo upload failed.',
                    }
                  : item,
              ),
            );
        }
      }
      if (failed)
        throw new Error('Some photos could not upload. Retry Next or remove those photos.');
      const retained = current.current.flatMap((photo) =>
        photo.status === 'ready' && photo.uploaded ? [photo.uploaded] : [],
      );
      if (retained.length !== current.current.length)
        throw new Error('Photos changed. Please try Next again.');
      return { photoSession: session, photos: retained };
    } finally {
      uploading.current = false;
    }
  }

  return { photos, addPhotos, removePhoto, uploadPhotos };
}
