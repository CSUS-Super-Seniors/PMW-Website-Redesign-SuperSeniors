import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import RequireRole from '../auth/RequireRole';
import type { InquiryDetail } from '../api/inquiryDetail';
import InquiryDetailPage from './InquiryDetailPage';

const session = {
  access_token: 'token-123',
  user: { id: 'user-1', email: 'todd@example.com' },
} as unknown as Session;

const authValue: AuthContextValue = {
  session,
  loading: false,
  signOutFailed: false,
  signIn: () => Promise.resolve('wrong-credentials'),
  signOut: () => Promise.resolve('success'),
};

const ID = '5eed0003-0000-4000-8000-000000001048';
const PHOTO_1 = 'a1b2c3d4-0000-4000-8000-000000000001';
const PHOTO_2 = 'a1b2c3d4-0000-4000-8000-000000000002';

function margaret(overrides: Partial<InquiryDetail> = {}): InquiryDetail {
  return {
    id: ID,
    inquiryNumber: 'INQ-1048',
    status: 'new',
    submittedAt: new Date(2020, 9, 1, 10, 18).toISOString(),
    item: 'Dining chair',
    issueType: 'Loose joint / wobbling',
    description: 'The chair rocks from side to side.',
    customerName: 'Margaret Lewis',
    email: 'margaret@example.com',
    phone: '(916) 555-0142',
    preferredContact: 'phone',
    textOk: true,
    address: '4821 Fair Oaks Blvd',
    city: 'Carmichael',
    inServiceArea: true,
    photos: [{ id: PHOTO_1 }, { id: PHOTO_2 }],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type Answer = 'pending' | ReturnType<typeof jsonResponse>;

// Answers /api/me, the detail, the review and each photo's signed URL.
// `detail` answers are used in turn, so a retry can get a different answer.
function fakeServer({
  inquiry = margaret(),
  detail,
  review,
  photo = (id: string) =>
    jsonResponse(200, { signedUrl: `https://storage.test/${id}?token=signed`, expiresIn: 300 }),
  role = 'owner',
}: {
  inquiry?: InquiryDetail;
  detail?: Answer[];
  review?: ReturnType<typeof jsonResponse>;
  photo?: (id: string) => ReturnType<typeof jsonResponse>;
  role?: string;
} = {}) {
  let detailCalls = 0;
  const fakeFetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/me') return jsonResponse(200, { role });
    if (url === `/api/inquiries/${ID}` && !init?.method) {
      const answers = detail ?? [jsonResponse(200, inquiry)];
      const answer = answers[Math.min(detailCalls++, answers.length - 1)];
      return answer === 'pending' ? new Promise<never>(() => {}) : answer;
    }
    if (url === `/api/inquiries/${ID}/review` && init?.method === 'POST') {
      return review ?? jsonResponse(200, { status: 'contacted' });
    }
    const photoMatch = /^\/api\/inquiry-photos\/([^/]+)\/view-url$/.exec(url);
    if (photoMatch) return photo(photoMatch[1]);
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
  });
  vi.stubGlobal('fetch', fakeFetch);
  return fakeFetch;
}

function requests(fakeFetch: ReturnType<typeof fakeServer>) {
  return fakeFetch.mock.calls
    .map(([url, init]) => `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`)
    .filter((call) => !call.endsWith('/api/me'));
}

function renderPage(id = ID) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[`/portal/inquiries/${id}`]}>
        <Routes>
          <Route path="/portal/schedule" element={<p>Schedule page</p>} />
          <Route element={<RequireRole allowed={['owner']} />}>
            <Route path="/portal/inquiries" element={<p>Inquiry list</p>} />
            <Route path="/portal/inquiries/:inquiryId" element={<InquiryDetailPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function section(name: string) {
  return screen.getByRole('heading', { name }).closest('section') as HTMLElement;
}

describe('InquiryDetailPage', () => {
  it('shows a loading message until the request arrives', async () => {
    fakeServer({ detail: ['pending'] });
    renderPage();

    expect(await screen.findByText('Loading estimate request...')).toHaveAttribute(
      'role',
      'status',
    );
  });

  it('shows the request, contact and address details', async () => {
    fakeServer({ inquiry: margaret({ status: 'converted' }) });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'INQ-1048' })).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('Oct 1, 2020, 10:18 am')).toBeInTheDocument();

    const request = section('Request');
    expect(within(request).getByText('Dining chair')).toBeInTheDocument();
    expect(within(request).getByText('Loose joint / wobbling')).toBeInTheDocument();
    expect(within(request).getByText('The chair rocks from side to side.')).toBeInTheDocument();

    const contact = section('Contact');
    expect(within(contact).getByText('Margaret Lewis')).toBeInTheDocument();
    expect(within(contact).getByRole('link', { name: 'margaret@example.com' })).toHaveAttribute(
      'href',
      'mailto:margaret@example.com',
    );
    expect(within(contact).getByRole('link', { name: '(916) 555-0142' })).toHaveAttribute(
      'href',
      'tel:9165550142',
    );
    expect(within(contact).getByText('Phone call')).toBeInTheDocument();
    expect(within(contact).getByText('Yes')).toBeInTheDocument();

    const address = section('Address');
    expect(within(address).getByText('4821 Fair Oaks Blvd')).toBeInTheDocument();
    expect(within(address).getByText('Carmichael')).toBeInTheDocument();
    expect(within(address).getByText('Within service area')).toBeInTheDocument();
  });

  it('shows the readable issue label for a newly submitted request', async () => {
    fakeServer({
      inquiry: margaret({ issueType: 'loose_joints', status: 'contacted', photos: [] }),
    });
    renderPage();
    await screen.findByRole('heading', { name: 'INQ-1048' });
    const request = within(section('Request'));
    expect(request.getByText('Loose joints / wobbling')).toBeInTheDocument();
    expect(request.queryByText('loose_joints')).not.toBeInTheDocument();
  });

  it('marks a New request Reviewed when it is opened', async () => {
    const fakeFetch = fakeServer();
    renderPage();

    expect(await screen.findByText('Reviewed')).toBeInTheDocument();
    expect(screen.queryByText('New')).not.toBeInTheDocument();
    expect(requests(fakeFetch)).toContain(`POST /api/inquiries/${ID}/review`);
  });

  it.each(['contacted', 'converted', 'closed'] as const)(
    'does not ask to mark a %s request Reviewed',
    async (status) => {
      const fakeFetch = fakeServer({ inquiry: margaret({ status }) });
      renderPage();

      // Once the photos have loaded, any review request would already have been sent.
      await screen.findByRole('img', { name: 'Photo 1 of 2' });
      expect(requests(fakeFetch).some((call) => call.startsWith('POST'))).toBe(false);
    },
  );

  it('keeps showing New when marking Reviewed fails', async () => {
    fakeServer({ review: jsonResponse(503, {}) });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'INQ-1048' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('New')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads every photo through its signed URL and shows a large preview', async () => {
    const fakeFetch = fakeServer({ inquiry: margaret({ status: 'contacted' }) });
    renderPage();

    const preview = await screen.findByRole('img', { name: 'Photo 1 of 2' });
    expect(preview).toHaveAttribute('src', `https://storage.test/${PHOTO_1}?token=signed`);
    expect(screen.getByRole('link', { name: 'Open full size' })).toHaveAttribute(
      'href',
      `https://storage.test/${PHOTO_1}?token=signed`,
    );
    expect(requests(fakeFetch)).toEqual(
      expect.arrayContaining([
        `GET /api/inquiry-photos/${PHOTO_1}/view-url`,
        `GET /api/inquiry-photos/${PHOTO_2}/view-url`,
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show photo 2 of 2' }));

    expect(screen.getByRole('img', { name: 'Photo 2 of 2' })).toHaveAttribute(
      'src',
      `https://storage.test/${PHOTO_2}?token=signed`,
    );
    expect(screen.getByRole('button', { name: 'Show photo 2 of 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('never shows a photo whose signed URL is not a web address', async () => {
    fakeServer({
      inquiry: margaret({ status: 'contacted', photos: [{ id: PHOTO_1 }] }),
      photo: () => jsonResponse(200, { signedUrl: 'javascript:alert(1)', expiresIn: 300 }),
    });
    renderPage();

    expect(await screen.findByText('This photo could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows a retry for a photo that could not be loaded', async () => {
    let attempts = 0;
    fakeServer({
      inquiry: margaret({ status: 'contacted', photos: [{ id: PHOTO_1 }] }),
      photo: (id) =>
        attempts++ === 0
          ? jsonResponse(503, {})
          : jsonResponse(200, { signedUrl: `https://storage.test/${id}`, expiresIn: 300 }),
    });
    renderPage();

    expect(await screen.findByText('This photo could not be loaded.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry photo' }));

    expect(await screen.findByRole('img', { name: 'Photo 1 of 1' })).toBeInTheDocument();
  });

  it('asks for a fresh URL when a signed URL stops working', async () => {
    let attempts = 0;
    fakeServer({
      inquiry: margaret({ status: 'contacted', photos: [{ id: PHOTO_1 }] }),
      photo: (id) =>
        jsonResponse(200, {
          signedUrl: `https://storage.test/${id}?v=${++attempts}`,
          expiresIn: 1,
        }),
    });
    renderPage();

    fireEvent.error(await screen.findByRole('img', { name: 'Photo 1 of 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Retry photo' }));

    expect(await screen.findByRole('img', { name: 'Photo 1 of 1' })).toHaveAttribute(
      'src',
      `https://storage.test/${PHOTO_1}?v=2`,
    );
  });

  it('shows a request without photos cleanly', async () => {
    const fakeFetch = fakeServer({ inquiry: margaret({ status: 'contacted', photos: [] }) });
    renderPage();

    expect(
      await screen.findByText('No photos were added to this request. Photos are optional.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(requests(fakeFetch).some((call) => call.includes('/api/inquiry-photos/'))).toBe(false);
  });

  it('shows missing optional details as not provided', async () => {
    fakeServer({
      inquiry: margaret({
        status: 'contacted',
        issueType: null,
        description: null,
        email: null,
        phone: null,
        preferredContact: null,
        textOk: false,
        address: null,
        inServiceArea: false,
        photos: [],
      }),
    });
    renderPage();

    await screen.findByRole('heading', { name: 'INQ-1048' });
    expect(within(section('Request')).getAllByText('Not provided')).toHaveLength(2);
    const contact = section('Contact');
    expect(within(contact).getAllByText('Not provided')).toHaveLength(2);
    expect(within(contact).getByText('Not specified')).toBeInTheDocument();
    expect(within(contact).getByText('No')).toBeInTheDocument();
    expect(within(section('Address')).getByText('Outside service area')).toBeInTheDocument();
  });

  it('shows Accept and Decline as not yet available', async () => {
    fakeServer({ inquiry: margaret({ status: 'contacted', photos: [] }) });
    renderPage();

    expect(await screen.findByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
    expect(
      screen.getByText('Accepting and declining requests is coming soon.'),
    ).toBeInTheDocument();
  });

  it('links back to the list', async () => {
    fakeServer({ inquiry: margaret({ status: 'contacted', photos: [] }) });
    renderPage();

    fireEvent.click(await screen.findByRole('link', { name: '← All estimate requests' }));
    expect(await screen.findByText('Inquiry list')).toBeInTheDocument();
  });

  it('shows a not-found message for an unknown request', async () => {
    fakeServer({ detail: [jsonResponse(404, {})] });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'We could not find this estimate request' }),
    ).toBeInTheDocument();
  });

  it('shows an error with a retry that loads the request again', async () => {
    const fakeFetch = fakeServer({
      detail: [jsonResponse(503, {}), jsonResponse(200, margaret({ status: 'contacted' }))],
    });
    renderPage();

    expect(await screen.findByText('We could not load this estimate request')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'INQ-1048' })).toBeInTheDocument();
    expect(requests(fakeFetch).filter((call) => call === `GET /api/inquiries/${ID}`)).toHaveLength(
      2,
    );
  });

  it('asks the owner to log in again when the API rejects the session', async () => {
    fakeServer({ detail: [jsonResponse(401, {})] });
    renderPage();

    expect(
      await screen.findByText('Your session is no longer valid. Please log in again.'),
    ).toBeInTheDocument();
  });

  it('shows the no-permission page when the API refuses the request', async () => {
    fakeServer({ detail: [jsonResponse(403, {})] });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
  });

  it('never asks the API for the request, or marks it, for an employee', async () => {
    const fakeFetch = fakeServer({ role: 'employee' });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'You do not have access to this page' }),
    ).toBeInTheDocument();
    expect(requests(fakeFetch)).toEqual([]);
  });
});
