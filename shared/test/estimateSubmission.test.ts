import { describe, expect, it } from 'vitest';
import { estimateSubmissionSchema } from '../src/estimateSubmission.js';
import { leadSourceOptions } from '../src/leadSource.js';
import { ESTIMATE_PHOTO_LIMIT_MESSAGE, MAX_ESTIMATE_PHOTOS } from '../src/estimatePhotos.js';

const details = {
  submission_id: '60000000-0000-4000-8000-000000000001',
  first_name: 'Zoë',
  last_name: '李',
  email: 'zoe@example.com',
  phone: '9165550142',
  address: '123 Main St',
  city: 'Carmichael',
  item: 'Chair',
  issue_type: 'loose_joints',
  description: 'Loose leg',
  lead_source: 'google',
};
const photo = { id: '60000000-0000-4000-8000-000000000002', storagePath: 'path', receipt: 'proof' };

describe('final submission schema', () => {
  it('accepts ten unique photos and rejects eleven with the shared limit message', () => {
    const photos = Array.from({ length: MAX_ESTIMATE_PHOTOS + 1 }, (_, index) => ({
      ...photo,
      id: `60000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      storagePath: `photo-${index}.jpg`,
    }));
    const input = {
      ...details,
      photoSession: { token: 'signed-session', expiresAt: 1900000000 },
    };
    expect(
      estimateSubmissionSchema.safeParse({ ...input, photos: photos.slice(0, MAX_ESTIMATE_PHOTOS) })
        .success,
    ).toBe(true);
    const rejected = estimateSubmissionSchema.safeParse({ ...input, photos });
    expect(rejected.success).toBe(false);
    if (!rejected.success)
      expect(rejected.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['photos'],
          message: ESTIMATE_PHOTO_LIMIT_MESSAGE,
        }),
      );
  });
  it.each(leadSourceOptions)(
    'accepts lead source $value and defaults an optional empty photo handoff',
    ({ value }) => {
      expect(estimateSubmissionSchema.parse({ ...details, lead_source: value })).toMatchObject({
        lead_source: value,
        text_ok: false,
        photoSession: null,
        photos: [],
      });
    },
  );
  it('accepts the existing photo handoff and rejects duplicate identifiers or paths', () => {
    const input = {
      ...details,
      photoSession: { token: 'signed-session', expiresAt: 1900000000 },
      photos: [photo],
    };
    expect(estimateSubmissionSchema.safeParse(input).success).toBe(true);
    for (const duplicate of [
      photo,
      { ...photo, storagePath: 'different' },
      { ...photo, id: '60000000-0000-4000-8000-000000000003' },
    ]) {
      expect(
        estimateSubmissionSchema.safeParse({ ...input, photos: [photo, duplicate] }).success,
      ).toBe(false);
    }
    expect(estimateSubmissionSchema.safeParse({ ...input, photoSession: null }).success).toBe(
      false,
    );
  });
  it.each(['inquiry_number', 'in_service_area', 'status', 'customer_id'])(
    'refuses a browser-supplied %s field',
    (key) => {
      expect(estimateSubmissionSchema.safeParse({ ...details, [key]: 'forged' }).success).toBe(
        false,
      );
    },
  );
});
