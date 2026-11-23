import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EstimatePhotosStep from './EstimatePhotosStep';
import { prepareEstimatePhoto, type PreparedEstimatePhoto } from '../../lib/estimatePhotos';
import { useEstimatePhotos } from '../../lib/useEstimatePhotos';
import { PHOTO_REQUEST_TIMEOUT_MS, uploadEstimatePhoto } from '../../lib/uploadEstimatePhoto';

vi.mock('../../lib/estimatePhotos', () => ({ prepareEstimatePhoto: vi.fn() }));
const createUrl = vi.fn();
const revokeUrl = vi.fn();
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

beforeEach(() => {
  vi.mocked(prepareEstimatePhoto).mockReset();
  vi.mocked(prepareEstimatePhoto).mockImplementation(async (file) => file);
  createUrl.mockReset().mockImplementation(() => `blob:photo-${createUrl.mock.calls.length}`);
  revokeUrl.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

const photo = (name = 'chair.jpg') => new File(['photo'], name, { type: 'image/jpeg' });

function Harness({
  onContinue,
}: {
  onContinue: (photos: PreparedEstimatePhoto[]) => void | Promise<void>;
}) {
  const { photos, addPhotos, removePhoto } = useEstimatePhotos();
  const [back, setBack] = useState(false);
  return back ? (
    <button onClick={() => setBack(false)}>Return to photos</button>
  ) : (
    <EstimatePhotosStep
      photos={photos}
      onAdd={addPhotos}
      onRemove={removePhoto}
      onBack={() => setBack(true)}
      onContinue={onContinue}
    />
  );
}

function setup(onContinue = vi.fn<(photos: PreparedEstimatePhoto[]) => void | Promise<void>>()) {
  return { ...render(<Harness onContinue={onContinue} />), onContinue, user: userEvent.setup() };
}

function select(...files: File[]) {
  fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files } });
}

describe('EstimatePhotosStep', () => {
  it('unlocks Back, Remove and Next after a stalled upload times out without losing the photo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    const onContinue = vi.fn(async (photos: PreparedEstimatePhoto[]) => {
      await uploadEstimatePhoto(
        { token: 'session', expiresAt: 4102444800 },
        photos[0].id,
        photos[0].file,
      );
    });
    setup(onContinue);
    select(photo());
    await screen.findByRole('img');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Continuing…' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHOTO_REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Remove chair.jpg' })).toBeEnabled();
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Your photos are still here');
    fireEvent.click(screen.getByRole('button', { name: 'Remove chair.jpg' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('allows zero photos without processing', async () => {
    const { user, onContinue } = setup();
    expect(screen.getByText(/No photos\? That’s okay/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onContinue).toHaveBeenCalledWith([]);
    expect(prepareEstimatePhoto).not.toHaveBeenCalled();
  });

  it('prepares selections, previews processed files, and passes stable prepared references', async () => {
    const processed = new File(['small'], 'chair.jpg', { type: 'image/jpeg' });
    vi.mocked(prepareEstimatePhoto).mockResolvedValue(processed);
    const { user, onContinue, unmount } = setup();
    const input = photo();
    select(input);
    const preview = await screen.findByRole('img', {
      name: 'Preview of chair.jpg',
    });

    await waitFor(() => {
      expect(createUrl).toHaveBeenCalledWith(processed);
      expect(preview).toHaveAttribute('src', 'blob:photo-1');
    });
    expect(screen.getByText(/Ready on this device/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onContinue).toHaveBeenCalledWith([
      { id: expect.any(String), original: input, file: processed },
    ]);
    unmount();
    expect(revokeUrl).toHaveBeenCalledWith('blob:photo-1');
  });

  it('removes ready photos, releases previews, and excludes them from continuation', async () => {
    const { user, onContinue } = setup();
    select(photo());
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Remove chair.jpg' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(revokeUrl).toHaveBeenCalledWith('blob:photo-1');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onContinue).toHaveBeenCalledWith([]);
  });

  it('does not restore a photo removed while processing', async () => {
    let finish!: (file: File) => void;
    vi.mocked(prepareEstimatePhoto).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { user, onContinue } = setup();
    const input = photo();
    select(input);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove chair.jpg' }));
    await act(async () => finish(input));
    expect(screen.queryByText('chair.jpg')).not.toBeInTheDocument();
    expect(createUrl).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onContinue).toHaveBeenCalledWith([]);
  });

  it('keeps good photos when processing fails and allows removing the failed photo', async () => {
    vi.mocked(prepareEstimatePhoto)
      .mockRejectedValueOnce(new Error('Choose a JPG or PNG photo.'))
      .mockResolvedValueOnce(photo('good.jpg'));
    const { user, onContinue } = setup();
    select(photo('bad.jpg'), photo('good.jpg'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPG or PNG');
    await screen.findByRole('img');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Remove bad.jpg' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onContinue.mock.calls[0][0]).toHaveLength(1);
    expect(onContinue.mock.calls[0][0][0].original.name).toBe('good.jpg');
  });

  it('preserves photos across Back navigation without recompression', async () => {
    const { user, onContinue } = setup();
    select(photo());
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Return to photos' }));
    await screen.findByRole('img');
    expect(prepareEstimatePhoto).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onContinue.mock.calls[0][0]).toHaveLength(1);
  });

  it('prevents duplicate continuation and preserves photos after a retryable handoff error', async () => {
    let fail!: (error: Error) => void;
    const onContinue = vi
      .fn<(photos: PreparedEstimatePhoto[]) => Promise<void>>()
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          fail = reject;
        }),
      )
      .mockResolvedValue(undefined);
    const { user } = setup(onContinue);
    select(photo());
    await screen.findByRole('img');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Continuing…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    await act(async () => fail(new Error('handoff unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your photos are still here');
    await waitFor(() => expect(screen.getByRole('alert').parentElement).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onContinue).toHaveBeenCalledTimes(2);
    expect(onContinue.mock.calls[1][0]).toEqual(onContinue.mock.calls[0][0]);
  });
});
