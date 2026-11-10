import { useEffect, useRef, useState } from 'react';
import type { EstimateStep1Data } from '@pmw/validation';
import EstimateStep1Form, {
  type EstimateSpamCheck,
} from '../components/estimate/EstimateStep1Form';
import { business } from '../config/site';

export default function EstimateRequestPage() {
  // Keep the validated, in-service-area handoff in memory; Step 2 wiring is pending.
  // The spam check travels with it, so the submit request (SSPMW-70) can send it.
  const [handoff, setHandoff] = useState<{
    details: EstimateStep1Data;
    spamCheck: EstimateSpamCheck;
  } | null>(null);
  const validatedDetails = handoff?.details ?? null;
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (validatedDetails) noticeRef.current?.focus();
  }, [validatedDetails]);

  return (
    <main className="flex-1 bg-neutral-50">
      <div className="mx-auto w-full max-w-content px-4 py-8 md:px-8 md:py-12">
        <p className="type-overline text-amber-dark">Step 1 of 4</p>
        <h1 className="type-h2 mt-4 md:type-h1">Request an estimate</h1>
        <p className="type-body-lg mt-4 max-w-200 text-neutral-600">
          Tell us about the item and how we can reach you. Photos are optional and can be added on
          the next step.
        </p>
        <div className="mt-6 md:mt-8">
          <EstimateStep1Form
            onContinue={(details, spamCheck) => setHandoff({ details, spamCheck })}
            onEdit={() => setHandoff(null)}
          />
        </div>
        {validatedDetails && (
          <div
            ref={noticeRef}
            role="status"
            tabIndex={-1}
            className="type-body mx-auto mt-6 max-w-190 rounded-lg border border-neutral-300 bg-white p-4 focus-visible:outline-2 focus-visible:outline-amber"
          >
            <p>
              Good news: we serve your city. Continuing to photos is not available yet, so your
              request has not been sent.
            </p>
            <p className="mt-2">
              For an estimate, call{' '}
              <a href={business.phoneHref} className="text-walnut underline">
                {business.phoneDisplay}
              </a>
              . Your details remain in the form so you can keep editing.
            </p>
          </div>
        )}
        <p className="type-body-sm mt-6 text-neutral-600">
          Next: add optional photos so we can better understand the repair.
        </p>
      </div>
    </main>
  );
}
