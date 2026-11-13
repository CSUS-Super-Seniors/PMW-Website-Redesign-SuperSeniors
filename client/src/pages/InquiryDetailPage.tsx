import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, Button, ErrorBanner } from '../components/ui';
import { InquiryPhotos } from '../components/inquiry/InquiryPhotos';
import type { InquiryDetail } from '../api/inquiryDetail';
import { useInquiryDetail } from '../api/useInquiryDetail';
import { routes } from '../config/site';
import {
  formatIssueType,
  formatSubmittedAt,
  inquiryStatusBadgeVariants,
  inquiryStatusLabels,
} from '../lib/inquiryFormat';
import NoPermissionPage from './NoPermissionPage';

const contactPreferenceLabels: Record<NonNullable<InquiryDetail['preferredContact']>, string> = {
  email: 'Email',
  phone: 'Phone call',
  text: 'Text message',
};

const linkClass =
  'rounded-sm text-walnut underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-neutral-300 bg-white p-5 md:p-6">
      <h2 className="type-h4">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="type-label text-neutral-600">{label}</dt>
      <dd className="type-body mt-1 break-words">{children}</dd>
    </div>
  );
}

function NotProvided() {
  return <span className="text-neutral-600">Not provided</span>;
}

function BackLink() {
  return (
    <Link to={routes.portalInquiries} className={`type-body-sm ${linkClass}`}>
      ← All estimate requests
    </Link>
  );
}

function Details({ inquiry, accessToken }: { inquiry: InquiryDetail; accessToken?: string }) {
  return (
    <>
      <header className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="type-h2">{inquiry.inquiryNumber}</h1>
        <Badge variant={inquiryStatusBadgeVariants[inquiry.status]}>
          {inquiryStatusLabels[inquiry.status]}
        </Badge>
        <p className="type-body-sm basis-full text-neutral-600">
          Submitted{' '}
          <time dateTime={inquiry.submittedAt}>{formatSubmittedAt(inquiry.submittedAt)}</time>
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Section title="Request">
            <dl className="space-y-4">
              <Field label="Item">{inquiry.item}</Field>
              <Field label="What happened?">
                {inquiry.issueType ? formatIssueType(inquiry.issueType) : <NotProvided />}
              </Field>
              <Field label="Description">
                {inquiry.description ? (
                  <span className="whitespace-pre-line">{inquiry.description}</span>
                ) : (
                  <NotProvided />
                )}
              </Field>
            </dl>
          </Section>

          <Section title="Photos">
            <InquiryPhotos photos={inquiry.photos} accessToken={accessToken} />
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          <Section title="Contact">
            <dl className="space-y-4">
              <Field label="Name">{inquiry.customerName}</Field>
              <Field label="Email">
                {inquiry.email ? (
                  <a href={`mailto:${inquiry.email}`} className={linkClass}>
                    {inquiry.email}
                  </a>
                ) : (
                  <NotProvided />
                )}
              </Field>
              <Field label="Phone">
                {inquiry.phone ? (
                  <a href={`tel:${inquiry.phone.replace(/[^\d+]/g, '')}`} className={linkClass}>
                    {inquiry.phone}
                  </a>
                ) : (
                  <NotProvided />
                )}
              </Field>
              <Field label="Preferred contact">
                {inquiry.preferredContact ? (
                  contactPreferenceLabels[inquiry.preferredContact]
                ) : (
                  <span className="text-neutral-600">Not specified</span>
                )}
              </Field>
              <Field label="Contact me by text">{inquiry.textOk ? 'Yes' : 'No'}</Field>
            </dl>
          </Section>

          <Section title="Address">
            <dl className="space-y-4">
              <Field label="Service address">{inquiry.address ?? <NotProvided />}</Field>
              <Field label="City">{inquiry.city ?? <NotProvided />}</Field>
            </dl>
            {/* The value saved at submit, so a later rule change does not alter it (Q7). */}
            <div className="mt-4">
              <Badge variant={inquiry.inServiceArea ? 'success' : 'warning'}>
                {inquiry.inServiceArea ? 'Within service area' : 'Outside service area'}
              </Badge>
            </div>
          </Section>

          <Section title="Decision">
            {/* Accept is SSPMW-156 (G3) and Decline is SSPMW-172 (G4). */}
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" disabled aria-describedby="decision-note">
                Accept
              </Button>
              <Button variant="outline" disabled aria-describedby="decision-note">
                Decline
              </Button>
            </div>
            <p id="decision-note" className="type-body-sm mt-3 text-neutral-600">
              Accepting and declining requests is coming soon.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}

export default function InquiryDetailPage() {
  const { inquiryId = '' } = useParams();
  const { state, retry, accessToken } = useInquiryDetail(inquiryId);

  if (state.status === 'no-access') return <NoPermissionPage />;

  let content;
  if (state.status === 'loading') {
    content = (
      <p role="status" className="type-body mt-6 text-neutral-600">
        Loading estimate request...
      </p>
    );
  } else if (state.status === 'not-found') {
    content = (
      <div className="mt-6 rounded-md border border-neutral-300 bg-white px-4 py-10 text-center">
        <h1 className="type-h4">We could not find this estimate request</h1>
        <p className="type-body mt-2 text-neutral-600">
          It may have been removed, or the link may be wrong.
        </p>
      </div>
    );
  } else if (state.status !== 'ok') {
    content = (
      <div className="mt-6 space-y-4">
        <h1 className="sr-only">Estimate request</h1>
        <ErrorBanner
          title="We could not load this estimate request"
          message={
            state.status === 'unauthenticated'
              ? 'Your session is no longer valid. Please log in again.'
              : 'Check your connection and try again.'
          }
        />
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  } else {
    content = <Details inquiry={state.inquiry} accessToken={accessToken} />;
  }

  return (
    <main className="w-full px-4 py-6 md:px-8">
      <BackLink />
      {content}
    </main>
  );
}
