import { z } from 'zod';
import { estimateStep1Schema } from './estimateStep1.js';
import { photoSessionSchema, uploadedEstimatePhotoSchema } from './estimatePhotos.js';

// Flatten details and spamCheck from the review handoff into this request. The
// honeypot middleware consumes pmw_extra before this strict schema is applied.
export const estimateSubmissionSchema = estimateStep1Schema
  .extend({
    submission_id: z.uuid(),
    photoSession: photoSessionSchema.nullable().default(null),
    photos: z.array(uploadedEstimatePhotoSchema).default([]),
  })
  .superRefine((value, context) => {
    if (value.photos.length && !value.photoSession) {
      context.addIssue({ code: 'custom', path: ['photos'], message: 'Photo session is required.' });
    }
    if (
      new Set(value.photos.map((photo) => photo.id)).size !== value.photos.length ||
      new Set(value.photos.map((photo) => photo.storagePath)).size !== value.photos.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['photos'],
        message: 'Duplicate photos are not allowed.',
      });
    }
  });

export type EstimateSubmissionInput = z.input<typeof estimateSubmissionSchema>;
export type EstimateSubmissionData = z.infer<typeof estimateSubmissionSchema>;

export interface EstimateSubmissionSuccess {
  success: true;
  inquiry_number: string;
}
