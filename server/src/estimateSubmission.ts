import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  estimateSubmissionSchema,
  mapEstimateStep1Errors,
  type EstimateStep1Data,
  type EstimateSubmissionData,
} from '@pmw/validation';
import type { EstimateSubmitHandler } from './app.js';
import type { ContactEmailConfig } from './config.js';
import { PhotoRequestError, type EstimatePhotosBackend } from './estimatePhotos.js';
import { buildEstimateReceiptEmail } from './estimateReceiptEmail.js';
import { buildOwnerNoticeEmail } from './ownerNoticeEmail.js';
import { EmailDeliveryError, emailFailureLogContext } from './lib/emailDeliveryError.js';
import { sendResendEmail } from './lib/resendEmail.js';

export interface SavedEstimate {
  id: string;
  inquiry_number: string;
  created_at: string;
}

export class SubmissionConflictError extends Error {}

export interface EstimateSubmissionBackend {
  findSaved(submissionId: string, hash: string): Promise<SavedEstimate | null>;
  save(
    submission: EstimateSubmissionData,
    hash: string,
    uploads: { sessionId: string | null; storagePaths: string[] },
  ): Promise<SavedEstimate & { created: boolean }>;
  sendReceipt(saved: SavedEstimate, details: EstimateStep1Data): Promise<void>;
  sendOwnerNotice(saved: SavedEstimate, details: EstimateStep1Data): Promise<void>;
}

function savedEstimate(value: unknown): SavedEstimate {
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    !('inquiry_number' in value) ||
    typeof value.inquiry_number !== 'string' ||
    !/^INQ-\d+$/.test(value.inquiry_number) ||
    !('created_at' in value) ||
    typeof value.created_at !== 'string' ||
    !value.created_at
  )
    throw new Error('Inquiry save was not acknowledged.');
  return { id: value.id, inquiry_number: value.inquiry_number, created_at: value.created_at };
}

export function createEstimateSubmissionBackend(
  client: Pick<SupabaseClient, 'from' | 'rpc'>,
  email?: ContactEmailConfig,
  fetchEmail: typeof fetch = fetch,
  ownerPortalOrigin?: string,
): EstimateSubmissionBackend {
  async function send(kind: 'receipt' | 'owner', saved: SavedEstimate, details: EstimateStep1Data) {
    if (!email) throw new EmailDeliveryError('not_configured');
    const receipt = kind === 'receipt';
    await sendResendEmail(
      email,
      {
        to: receipt ? [details.email.trim()] : email.to,
        replyTo: receipt ? email.to : details.email.trim(),
        idempotencyKey: `estimate/${saved.id}/${kind}`,
        ...(receipt
          ? buildEstimateReceiptEmail(saved, details)
          : buildOwnerNoticeEmail(saved, details, ownerPortalOrigin)),
      },
      'Estimate email',
      fetchEmail,
    );
  }
  return {
    async findSaved(submissionId, hash) {
      const { data, error } = await client
        .from('inquiries')
        .select('id,inquiry_number,created_at,submission_hash')
        .eq('submission_id', submissionId)
        .maybeSingle();
      if (error) throw new Error('Inquiry lookup failed.');
      if (!data) return null;
      if (data.submission_hash !== hash) throw new SubmissionConflictError();
      return savedEstimate(data);
    },
    async save(submission, hash, uploads) {
      const { submission_id, photoSession, photos, ...details } = submission;
      void photoSession;
      void photos;
      const { data, error } = await client.rpc('submit_estimate_request', {
        p_submission_id: submission_id,
        p_submission_hash: hash,
        p_details: details,
        p_session_id: uploads.sessionId,
        p_storage_paths: uploads.storagePaths,
      });
      if (error?.code === 'PT409') throw new SubmissionConflictError();
      if (error?.code === 'P7501')
        throw new PhotoRequestError(
          'Could not attach these photos. Return to photos and try again.',
          409,
        );
      if (error || typeof data?.created !== 'boolean') throw new Error('Inquiry save failed.');
      return { ...savedEstimate(data), created: data.created };
    },
    sendReceipt: (saved, details) => send('receipt', saved, details),
    sendOwnerNotice: (saved, details) => send('owner', saved, details),
  };
}

export function createEstimateSubmitHandler(
  backend: EstimateSubmissionBackend,
  photos: Pick<EstimatePhotosBackend, 'prepareSubmission'>,
): EstimateSubmitHandler {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const parsed = estimateSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Please check your estimate request.',
        ...mapEstimateStep1Errors(parsed.error),
      });
      return;
    }
    const input = parsed.data;
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    let saved: SavedEstimate & { created?: boolean };
    try {
      // Only an exact saved payload can skip live photo verification on retry.
      // No inquiry ID from the browser is used to claim someone else's inquiry.
      const existing = await backend.findSaved(input.submission_id, hash);
      if (existing) {
        res.status(201).json({ success: true, inquiry_number: existing.inquiry_number });
        return;
      }
      const uploads = await photos.prepareSubmission(input.photoSession?.token ?? '', input.photos);
      saved = await backend.save(input, hash, uploads);
    } catch (error) {
      const conflict = error instanceof SubmissionConflictError;
      const photo = error instanceof PhotoRequestError;
      res.status(conflict ? 409 : photo ? error.status : 503).json({
        success: false,
        error: conflict
          ? 'This submission ID was already used. Return to review and start a new submission for edited details.'
          : photo
            ? error.message
            : 'Your request could not be saved. Please retry the same request.',
      });
      return;
    }
    if (saved.created) {
      // Await bounded sends so Vercel does not terminate detached work. Either
      // failure is isolated from the other email and from the committed inquiry.
      const results = await Promise.allSettled([
        backend.sendReceipt(saved, input),
        backend.sendOwnerNotice(saved, input),
      ]);
      results.forEach((result, index) => {
        if (result.status === 'rejected')
          console.error('Estimate email failed', {
            inquiryId: saved.id,
            inquiryNumber: saved.inquiry_number,
            notification: index === 0 ? 'receipt' : 'owner',
            ...emailFailureLogContext(result.reason),
          });
      });
    }
    res.status(201).json({ success: true, inquiry_number: saved.inquiry_number });
  };
}
