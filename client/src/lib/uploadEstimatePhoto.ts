import {
  photoSessionSchema,
  uploadedEstimatePhotoSchema,
  type PhotoSession,
  type UploadedEstimatePhoto,
} from '@pmw/validation';

export const PHOTO_REQUEST_TIMEOUT_MS = 30_000;

/** Bound the entire request, including response-body reads, and abort its transport. */
async function photoRequest<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Photo request timed out. Retry Next or remove the photo.'));
      controller.abort();
    }, PHOTO_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function uploadError(response: Response): Promise<never> {
  let message = 'Photo upload failed. Please retry or remove the photo.';
  try {
    const body = await response.json();
    if (typeof body.error === 'string') message = body.error;
  } catch {
    /* Keep a friendly error for non-JSON outages. */
  }
  throw new Error(message);
}

export async function startPhotoSession(): Promise<PhotoSession> {
  return photoRequest(async (signal) => {
    const response = await fetch('/api/estimates/photos/session', { method: 'POST', signal });
    if (!response.ok) return uploadError(response);
    return photoSessionSchema.parse(await response.json());
  });
}

export async function renewPhotoSession(session: PhotoSession): Promise<PhotoSession> {
  return photoRequest(async (signal) => {
    const response = await fetch('/api/estimates/photos/session/renew', {
      method: 'POST',
      headers: { Authorization: `Photo ${session.token}` },
      signal,
    });
    if (!response.ok) return uploadError(response);
    return photoSessionSchema.parse(await response.json());
  });
}

export async function uploadEstimatePhoto(
  session: PhotoSession,
  id: string,
  file: File,
): Promise<UploadedEstimatePhoto> {
  return photoRequest(async (signal) => {
    const response = await fetch(`/api/estimates/photos/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { Authorization: `Photo ${session.token}`, 'Content-Type': file.type },
      body: file,
      signal,
    });
    if (!response.ok) return uploadError(response);
    const result = uploadedEstimatePhotoSchema.parse(await response.json());
    if (result.id !== id) throw new Error('Unexpected photo upload response. Please try again.');
    return result;
  });
}
