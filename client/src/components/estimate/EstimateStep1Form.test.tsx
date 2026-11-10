import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueOptions, type EstimateStep1Input } from '@pmw/validation';
import EstimateStep1Form, { type EstimateStep1Continuation } from './EstimateStep1Form';
import type { CheckServiceArea } from '../../lib/checkEstimateServiceArea';

const details: EstimateStep1Input = {
  first_name: 'Zoë-Marie',
  last_name: "O'Connor 李",
  email: 'Zoe+chair@Example.com',
  phone: '+1 (916) 555-0142',
  address: '123 Main St',
  city: 'Carmichael',
  item: 'Dining chair',
  issue_type: 'loose_joints',
  description: 'The back leg wobbles.',
};

const fetchMock = vi.fn<typeof fetch>();
const checkServiceArea = vi.fn<CheckServiceArea>();
const reply = (body: unknown, status = 200) => Response.json(body, { status });
const continueButton = () => screen.getByRole('button', { name: 'Continue to photos' });

function renderForm(
  initialValues?: EstimateStep1Input,
  onContinue = vi.fn<EstimateStep1Continuation>(),
) {
  const user = userEvent.setup();
  const onEdit = vi.fn();
  const view = render(
    <MemoryRouter>
      <EstimateStep1Form
        initialValues={initialValues}
        onContinue={onContinue}
        onEdit={onEdit}
        checkServiceArea={checkServiceArea}
      />
    </MemoryRouter>,
  );
  return { user, onContinue, onEdit, ...view };
}

beforeEach(() => {
  fetchMock.mockReset();
  checkServiceArea.mockReset().mockResolvedValue(true);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('EstimateStep1Form', () => {
  it('starts without errors, permits submission, and uses the shared issue options', async () => {
    const { user } = renderForm();
    const select = screen.getByLabelText('What happened?');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
    expect(screen.getByLabelText('Contact me by text message')).not.toBeChecked();
    expect(select).toHaveValue('');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Select a problem',
      ...issueOptions.map((option) => option.label),
    ]);
    await user.selectOptions(select, 'other');
    expect(select).toHaveValue('other');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows associated errors for missing fields, focuses the first, and blocks the API and continuation', async () => {
    const { user, onContinue } = renderForm();
    await user.click(continueButton());

    expect(screen.getAllByRole('alert')).toHaveLength(9);
    const firstName = screen.getByLabelText('First name');
    expect(firstName).toHaveAttribute('aria-invalid', 'true');
    expect(firstName).toHaveAccessibleDescription('First name is required.');
    expect(firstName).toHaveFocus();
    expect(screen.getByLabelText('Describe the problem')).toHaveAccessibleDescription(
      'Description is required.',
    );
    expect(screen.getByLabelText('What happened?')).toHaveAccessibleDescription(
      'Select a problem from the list.',
    );
    expect(screen.getByLabelText('City')).toHaveAccessibleDescription('City is required.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(checkServiceArea).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('updates field errors after submission as the customer corrects or invalidates values', async () => {
    const { user } = renderForm();
    await user.click(continueButton());
    await user.type(screen.getByLabelText('First name'), 'Ana');

    expect(screen.queryByText('First name is required.')).not.toBeInTheDocument();
    expect(screen.getByText('Last name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).not.toHaveAttribute('aria-invalid');
    await user.clear(screen.getByLabelText('First name'));
    expect(screen.getByText('First name is required.')).toBeInTheDocument();
  });

  it('blocks malformed email and phone values and focuses the first invalid field', async () => {
    const { user, onContinue } = renderForm({
      ...details,
      email: 'not-an-email',
      phone: '916-CALL-NOW',
    });
    await user.click(continueButton());

    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(
      screen.getByText('Enter a 10-digit US phone number, optionally starting with 1.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('posts valid details without authentication and continues with parsed data only after server acceptance', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user, onContinue } = renderForm(details);
    const form = continueButton().closest('form')!;
    await user.click(continueButton());

    expect(screen.getByRole('button', { name: 'Checking details…' })).toBeDisabled();
    expect(screen.getByLabelText('First name')).toBeDisabled();
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/estimates/validate-step-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      ...details,
      text_ok: false,
    });

    resolve(reply({ valid: true }));
    await waitFor(() =>
      expect(onContinue).toHaveBeenCalledExactlyOnceWith({ ...details, text_ok: false }),
    );
    expect(screen.getByLabelText('Email address')).toHaveValue(details.email);
    expect(continueButton()).toBeEnabled();
  });

  it('sends explicit text permission and the chosen configured issue value', async () => {
    fetchMock.mockResolvedValue(reply({ valid: true }));
    const { user, onContinue } = renderForm(details);
    await user.click(screen.getByLabelText('Contact me by text message'));
    await user.selectOptions(screen.getByLabelText('What happened?'), 'other');
    await user.click(continueButton());

    await waitFor(() =>
      expect(onContinue).toHaveBeenCalledWith({ ...details, text_ok: true, issue_type: 'other' }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toMatchObject({
      text_ok: true,
      issue_type: 'other',
    });
  });

  it('supports keyboard navigation through the fields and submission with Enter', async () => {
    fetchMock.mockResolvedValue(reply({ valid: true }));
    const { user, onContinue } = renderForm(details);
    for (const label of [
      'First name',
      'Last name',
      'Email address',
      'Phone number',
      'Contact me by text message',
      'Service address',
      'City',
      'Item',
      'What happened?',
      'Describe the problem',
    ]) {
      await user.tab();
      expect(screen.getByLabelText(label)).toHaveFocus();
    }
    await user.tab();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveFocus();
    await user.tab();
    expect(continueButton()).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  });

  it('renders server field and form errors, preserves values, and revalidates a corrected field', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        {
          valid: false,
          fieldErrors: { phone: 'Please check this phone number.' },
          formErrors: ['Please review your details before continuing.'],
        },
        400,
      ),
    );
    const { user, onContinue } = renderForm(details);
    await user.click(continueButton());

    expect(await screen.findByText('Please check this phone number.')).toBeInTheDocument();
    expect(screen.getByText('Please review your details before continuing.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Phone number')).toHaveFocus());
    expect(screen.getByLabelText('First name')).toHaveValue(details.first_name);
    expect(screen.getByLabelText('Describe the problem')).toHaveValue(details.description);
    expect(onContinue).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Phone number'));
    await user.type(screen.getByLabelText('Phone number'), '(916) 555-0142');
    expect(screen.queryByText('Please check this phone number.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).not.toHaveAttribute('aria-invalid');
    fetchMock.mockResolvedValueOnce(reply({ valid: true }));
    await user.click(continueButton());
    await waitFor(() =>
      expect(onContinue).toHaveBeenCalledWith({
        ...details,
        phone: '(916) 555-0142',
        text_ok: false,
      }),
    );
  });

  it('associates a server text-permission error using InlineFieldError', async () => {
    fetchMock.mockResolvedValue(
      reply(
        {
          valid: false,
          fieldErrors: { text_ok: 'Please confirm text permission.' },
          formErrors: [],
        },
        400,
      ),
    );
    const { user, onContinue } = renderForm(details);
    await user.click(continueButton());

    expect(await screen.findByText('Please confirm text permission.')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact me by text message')).toHaveAccessibleDescription(
      'Please confirm text permission.',
    );
    await user.click(screen.getByLabelText('Contact me by text message'));
    expect(screen.queryByText('Please confirm text permission.')).not.toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('focuses form-level server errors and associates a server city error with the City field', async () => {
    fetchMock.mockResolvedValue(
      reply(
        {
          valid: false,
          fieldErrors: { city: 'Please check the city.' },
          formErrors: ['Please review the form.'],
        },
        400,
      ),
    );
    const { user, onContinue } = renderForm(details);
    await user.click(continueButton());

    expect(await screen.findByText('Please review the form.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('City')).toHaveFocus());
    expect(screen.getByLabelText('City')).toHaveAccessibleDescription('Please check the city.');
    expect(checkServiceArea).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('checks the city after the details pass and continues for an address in the service area', async () => {
    fetchMock.mockImplementation(async () => reply({ valid: true }));
    const { user, onContinue } = renderForm(details);
    await user.click(continueButton());

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(checkServiceArea).toHaveBeenCalledExactlyOnceWith('Carmichael', expect.any(AbortSignal));
    expect(screen.queryByText('Outside our service area')).not.toBeInTheDocument();
  });

  it('stops a Davis address with a call link and does not continue', async () => {
    fetchMock.mockImplementation(async () => reply({ valid: true }));
    checkServiceArea.mockResolvedValue(false);
    const { user, onContinue } = renderForm({ ...details, city: 'Davis' });
    await user.click(continueButton());

    const alert = await screen.findByText('Outside our service area');
    expect(checkServiceArea).toHaveBeenCalledWith('Davis', expect.any(AbortSignal));
    expect(onContinue).not.toHaveBeenCalled();
    const call = screen.getByRole('link', { name: '(916) 643-5686' });
    expect(call).toHaveAttribute('href', 'tel:+19166435686');
    await waitFor(() => expect(alert.closest('[tabindex="-1"]')).toHaveFocus());
    expect(continueButton()).toBeEnabled();
    expect(screen.getByLabelText('City')).toHaveValue('Davis');

    // Trying again with the same city is still blocked.
    await user.click(continueButton());
    await waitFor(() => expect(checkServiceArea).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Outside our service area')).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('clears the outside-area error when the customer edits and continues with a city we serve', async () => {
    fetchMock.mockImplementation(async () => reply({ valid: true }));
    checkServiceArea.mockImplementation(async (city) => city !== 'Davis');
    const { user, onContinue } = renderForm({ ...details, city: 'Davis' });
    await user.click(continueButton());
    expect(await screen.findByText('Outside our service area')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('City'));
    expect(screen.queryByText('Outside our service area')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('City'), 'Carmichael');
    await user.click(continueButton());
    await waitFor(() =>
      expect(onContinue).toHaveBeenCalledWith({ ...details, city: 'Carmichael', text_ok: false }),
    );
  });

  it('does not continue when the service-area check is unavailable and lets the customer retry', async () => {
    fetchMock.mockImplementation(async () => reply({ valid: true }));
    checkServiceArea.mockRejectedValueOnce(new Error('Service-area checking is unavailable.'));
    const { user, onContinue } = renderForm(details);
    await user.click(continueButton());

    const message = await screen.findByText(/We could not check whether we serve your city/);
    await waitFor(() => expect(message.closest('[tabindex="-1"]')).toHaveFocus());
    expect(onContinue).not.toHaveBeenCalled();
    expect(continueButton()).toBeEnabled();

    await user.click(continueButton());
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
  });

  it('aborts a pending service-area check when the form unmounts', async () => {
    fetchMock.mockResolvedValue(reply({ valid: true }));
    let resolve!: (inside: boolean) => void;
    checkServiceArea.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user, unmount, onContinue } = renderForm(details);
    await user.click(continueButton());
    await waitFor(() => expect(checkServiceArea).toHaveBeenCalledTimes(1));
    const signal = checkServiceArea.mock.calls[0][1];
    unmount();
    expect(signal.aborted).toBe(true);
    resolve(true);
    await waitFor(() => expect(onContinue).not.toHaveBeenCalled());
  });

  it('preserves input on network failure and lets the customer retry successfully', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { user, onContinue } = renderForm(details);
    await user.click(continueButton());

    const message = await screen.findByText(
      'We could not check your details. Check your connection and try again.',
    );
    expect(screen.getByLabelText('Email address')).toHaveValue(details.email);
    expect(screen.getByLabelText('What happened?')).toHaveValue(details.issue_type);
    expect(continueButton()).toBeEnabled();
    expect(message.closest('[tabindex="-1"]')).toHaveFocus();
    expect(onContinue).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(reply({ valid: true }));
    await user.click(continueButton());
    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/We could not check your details/)).not.toBeInTheDocument();
  });

  it.each([
    () => new Response('Service unavailable', { status: 503 }),
    () => reply({ valid: true }, 500),
    () => reply({ valid: false, fieldErrors: {}, formErrors: [] }, 400),
  ])('does not continue after an unexpected server response', async (response) => {
    fetchMock.mockResolvedValue(response());
    const { user, onContinue } = renderForm(details);
    await user.click(continueButton());

    expect(await screen.findByText(/We could not check your details/)).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
    expect(screen.getByLabelText('Service address')).toHaveValue(details.address);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('keeps the pending state until an asynchronous continuation finishes and exposes a retryable handoff failure', async () => {
    fetchMock.mockResolvedValue(reply({ valid: true }));
    let reject!: (reason: Error) => void;
    const onContinue = vi.fn<EstimateStep1Continuation>(
      () =>
        new Promise((_done, fail) => {
          reject = fail;
        }),
    );
    const { user } = renderForm(details, onContinue);
    await user.click(continueButton());

    await waitFor(() => expect(onContinue).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Checking details…' })).toBeDisabled();
    reject(new Error('Next step unavailable'));
    expect(
      await screen.findByText(/We could not continue to photos. Your request has not been sent/),
    ).toBeInTheDocument();
    expect(continueButton()).toBeEnabled();
    expect(screen.getByLabelText('Item')).toHaveValue(details.item);
  });

  it('aborts a pending validation request when the form unmounts', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { user, unmount, onContinue } = renderForm(details);
    await user.click(continueButton());
    const signal = fetchMock.mock.calls[0][1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    resolve(reply({ valid: true }));
    await waitFor(() => expect(onContinue).not.toHaveBeenCalled());
  });
});
