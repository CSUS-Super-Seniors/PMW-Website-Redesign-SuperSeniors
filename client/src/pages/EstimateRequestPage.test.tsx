import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EstimateRequestPage from './EstimateRequestPage';

// Exercise the real photo state/upload flow without decoding an image in jsdom.
vi.mock('../lib/estimatePhotos', () => ({ prepareEstimatePhoto: async (file: File) => file }));

const values = {
  'First name': 'Ana',
  'Last name': 'Smith',
  'Email address': 'ana@example.com',
  'Phone number': '(916) 555-0142',
  'Service address': '123 Main St',
  City: 'Carmichael',
  Item: 'Dining chair',
  'Describe the problem': 'One leg is loose.\nPlease check the joints.',
};
const createUrl = vi.fn(() => 'blob:local-preview');
const revokeUrl = vi.fn();
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

beforeEach(() => {
  createUrl.mockClear();
  revokeUrl.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

async function setup(withPhoto = false, submitRequest?: (init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    if (url === '/api/estimates/validate-step-1') return Response.json({ valid: true });
    if (url === '/api/estimates/service-area')
      return Response.json({ inServiceArea: JSON.parse(String(init?.body)).city !== 'Davis' });
    if (url === '/api/estimates')
      return submitRequest
        ? submitRequest(init ?? {})
        : Response.json({ success: true, inquiry_number: 'EST-123' }, { status: 201 });
    if (url === '/api/estimates/photos/session')
      return Response.json({ token: 'private-session', expiresAt: 4102444800 });
    if (init?.method === 'PUT') {
      const id = String(url).split('/').at(-1);
      return Response.json({
        id,
        storagePath: `estimate-uploads/test/${id}.png`,
        receipt: 'private-receipt',
      });
    }
    throw new Error('Unexpected API request');
  });
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  const view = render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: '/estimate',
            element: <EstimateRequestPage />,
          },
          { path: '/', element: <h1>Home page</h1> },
        ],
        { initialEntries: ['/estimate'] },
      )}
    />,
  );
  for (const [label, value] of Object.entries(values))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.change(screen.getByLabelText('How did you hear about us?'), {
    target: { value: 'referral' },
  });
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: 'loose_joints' } });
  fireEvent.click(screen.getByLabelText('Contact me by text message'));
  fireEvent.change(document.querySelector('[name="pmw_extra"]')!, {
    target: { value: 'hidden-value' },
  });
  await user.click(screen.getByRole('button', { name: 'Continue to photos' }));
  await screen.findByLabelText('Choose photos');
  if (withPhoto) {
    fireEvent.change(screen.getByLabelText('Choose photos'), {
      target: { files: [new File(['image'], 'chair.png', { type: 'image/png' })] },
    });
    await screen.findByRole('img', { name: 'Preview of chair.png' });
  }
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: 'Review your request' });
  return { user, fetchMock, ...view };
}

describe('estimate review and edit flow', () => {
  it('shows all entered fields using readable option labels, with an empty photo state', async () => {
    await setup();
    const heading = screen.getByRole('heading', { name: 'Review your request' });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');
    for (const value of Object.values(values))
      expect(screen.getByText(value, { normalizer: (text) => text })).toBeInTheDocument();
    expect(screen.getByText('Loose joints / wobbling')).toBeInTheDocument();
    expect(screen.getByText('Referral')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No photos selected.')).toBeInTheDocument();
    expect(screen.queryByText('hidden-value')).not.toBeInTheDocument();
  });

  it('edits one field while keeping every other value, checkbox, spam check and uploaded photo', async () => {
    const { user, fetchMock } = await setup(true);
    await user.click(screen.getByRole('button', { name: 'Edit contact details' }));
    expect(screen.getByLabelText('First name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Anita' } });
    for (const [label, value] of Object.entries(values))
      if (label !== 'First name') expect(screen.getByLabelText(label)).toHaveValue(value);
    expect(screen.getByLabelText('How did you hear about us?')).toHaveValue('referral');
    expect(screen.getByLabelText('Contact me by text message')).toBeChecked();
    expect(document.querySelector('[name="pmw_extra"]')).toHaveValue('hidden-value');
    await user.click(screen.getByRole('button', { name: 'Return to review' }));
    await screen.findByText('Anita');
    expect(screen.getByRole('heading', { name: 'Review your request' })).toHaveFocus();
    for (const [label, value] of Object.entries(values))
      if (label !== 'First name')
        expect(screen.getByText(value, { normalizer: (text) => text })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Preview of chair.png' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/estimates')).toBe(false);
  });

  it.each([
    ['Edit lead source', 'How did you hear about us?'],
    ['Edit service address', 'Service address'],
    ['Edit repair details', 'Item'],
  ])('opens the right field for %s', async (edit, field) => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: edit }));
    expect(screen.getByLabelText(field)).toHaveFocus();
  });

  it('revalidates edits and preserves details and photos while an outside-area city is corrected', async () => {
    const { user } = await setup(true);
    await user.click(screen.getByRole('button', { name: 'Edit service address' }));
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Davis' } });
    await user.click(screen.getByRole('button', { name: 'Return to review' }));
    await screen.findByText('Outside our service area');
    expect(screen.queryByRole('heading', { name: 'Review your request' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveValue(values['Email address']);
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Fair Oaks' } });
    await user.click(screen.getByRole('button', { name: 'Return to review' }));
    await screen.findByText('Fair Oaks');
    expect(screen.getByRole('img', { name: 'Preview of chair.png' })).toBeInTheDocument();
  });

  it('stays on the edited form when a required field is cleared', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Edit repair details' }));
    await user.clear(screen.getByLabelText('Item'));
    await user.click(screen.getByRole('button', { name: 'Return to review' }));
    await screen.findByText('Item is required.');
    expect(screen.getByLabelText('Item')).toHaveFocus();
    expect(screen.getByLabelText('Email address')).toHaveValue(values['Email address']);
  });

  it('removes and replaces a photo without changing the other details', async () => {
    const { user, fetchMock } = await setup(true);
    await user.click(screen.getByRole('button', { name: 'Edit photos' }));
    await user.click(screen.getByRole('button', { name: 'Remove chair.png' }));
    fireEvent.change(screen.getByLabelText('Choose photos'), {
      target: { files: [new File(['image2'], 'table.png', { type: 'image/png' })] },
    });
    await screen.findByRole('img', { name: 'Preview of table.png' });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByRole('heading', { name: 'Review your request' });
    expect(screen.queryByRole('img', { name: 'Preview of chair.png' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Request photos' })).getAllByRole('img'),
    ).toHaveLength(1);
    expect(screen.getByText(values.Item)).toBeInTheDocument();
    expect(screen.getByText('Referral')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/estimates')).toBe(false);
  });

  it('preserves edited lead source, details and photos when confirmation is cancelled', async () => {
    const { user, fetchMock } = await setup(true);
    await user.click(screen.getByRole('button', { name: 'Edit lead source' }));
    await user.selectOptions(screen.getByLabelText('How did you hear about us?'), 'yelp');
    await user.click(screen.getByRole('button', { name: 'Return to review' }));
    expect(await screen.findByText('Yelp')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Submit request' });
    await user.click(submit);
    const dialog = screen.getByRole('dialog', { name: 'Submit estimate request?' });
    expect(within(dialog).getByRole('button', { name: 'Submit request' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(submit).toHaveFocus();
    expect(screen.getByText('Yelp')).toBeInTheDocument();
    expect(screen.getByText(values['Email address'])).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Preview of chair.png' })).toBeInTheDocument();
    await user.click(submit);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/estimates')).toBe(false);
  });

  it('submits the shared contract and clears all request state for a new request', async () => {
    const { user, fetchMock } = await setup(true);
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit request' }),
    );

    const thanksHeading = await screen.findByRole('heading', { name: 'Thanks, Ana!' });
    expect(thanksHeading).toBeInTheDocument();
    expect(thanksHeading).toHaveAttribute('tabindex', '-1');
    expect(thanksHeading).toHaveFocus();
    const submission = fetchMock.mock.calls.find(([url]) => url === '/api/estimates');
    expect(submission).toBeDefined();
    expect(submission?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const body = JSON.parse(String(submission?.[1]?.body));
    expect(body).toMatchObject({
      first_name: 'Ana',
      last_name: 'Smith',
      email: 'ana@example.com',
      text_ok: true,
      lead_source: 'referral',
      pmw_extra: 'hidden-value',
      photoSession: { token: 'private-session', expiresAt: 4102444800 },
      photos: [{ storagePath: expect.stringMatching(/^estimate-uploads\//) }],
    });
    expect(body.submission_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await user.click(screen.getByRole('button', { name: 'Start another request' }));
    expect(await screen.findByLabelText('First name')).toHaveValue('');
    for (const label of Object.keys(values)) expect(screen.getByLabelText(label)).toHaveValue('');
    expect(screen.getByLabelText('How did you hear about us?')).toHaveValue('');
    expect(screen.getByLabelText('What happened?')).toHaveValue('');
    expect(screen.getByLabelText('Contact me by text message')).not.toBeChecked();
    expect(document.querySelector('[name="pmw_extra"]')).toHaveValue('');
    expect(screen.queryByRole('img', { name: 'Preview of chair.png' })).not.toBeInTheDocument();
  });

  it('shows network failures and retries the same payload with the same submission ID', async () => {
    const submit = vi
      .fn<(init: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new Error('Network connection lost'))
      .mockResolvedValueOnce(
        Response.json({ success: true, inquiry_number: 'EST-123' }, { status: 201 }),
      );
    const { user, fetchMock } = await setup(false, submit);
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit estimate request?' });
    await user.click(within(dialog).getByRole('button', { name: 'Submit request' }));

    expect(await screen.findByText('Network connection lost')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    const firstBody = JSON.parse(String(submit.mock.calls[0][0].body));

    await user.click(within(dialog).getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByRole('heading', { name: 'Thanks, Ana!' })).toBeInTheDocument();
    const secondBody = JSON.parse(String(submit.mock.calls[1][0].body));
    expect(secondBody).toEqual(firstBody);
    expect(secondBody.submission_id).toBe(firstBody.submission_id);
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/estimates')).toHaveLength(2);
  });

  it('shows a friendly generic message for server errors instead of the backend error', async () => {
    const submit = vi
      .fn<(init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(
        Response.json({ error: 'Database password or internal stack details' }, { status: 503 }),
      );
    const { user } = await setup(false, submit);
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    const dialog = screen.getByRole('dialog', { name: 'Submit estimate request?' });
    await user.click(within(dialog).getByRole('button', { name: 'Submit request' }));

    expect(
      await screen.findByText(
        'We could not send your request right now. Your information is still in the form. Please try again.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Database password or internal stack details'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(values['Email address'])).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it('allows normal home navigation after the server confirms the submission', async () => {
    const { user } = await setup();
    await user.click(screen.getByRole('button', { name: 'Submit request' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Submit request' }),
    );
    await screen.findByRole('heading', { name: 'Thanks, Ana!' });

    await user.click(screen.getByRole('link', { name: 'Return home' }));
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument();
  });

  it('clears its local preview URL on unmount', async () => {
    const { unmount } = await setup(true);
    unmount();
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:local-preview'));
  });
});
