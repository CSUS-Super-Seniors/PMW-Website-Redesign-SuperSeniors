import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Session } from '@supabase/supabase-js';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import CustomersSection from '../components/customers/CustomersSection';
import AddCustomerPage from './AddCustomerPage';

const session = { access_token: 'token-123', user: { id: 'user-1' } } as unknown as Session;

afterEach(() => {
  vi.unstubAllGlobals();
});

function authValue(current: Session | null): AuthContextValue {
  return {
    session: current,
    loading: false,
    signOutFailed: false,
    signIn: () => Promise.resolve('wrong-credentials'),
    signOut: () => Promise.resolve('success'),
  };
}

function reply(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue(reply(status, body));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// The same nesting as App.tsx, with a stand-in list page.
function renderPage(current: Session | null = session) {
  render(
    <AuthContext.Provider value={authValue(current)}>
      <MemoryRouter initialEntries={['/portal/customers/new']}>
        <Routes>
          <Route path="/portal/customers" element={<CustomersSection />}>
            <Route index element={<p>Customer list</p>} />
            <Route path="new" element={<AddCustomerPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('First name'), 'Ana');
  await user.type(screen.getByLabelText('Last name'), 'Ruiz');
  await user.type(screen.getByLabelText('Phone'), '(916) 555-0100');
}

const save = () => screen.getByRole('button', { name: 'Save customer' });

describe('AddCustomerPage', () => {
  it('shows every customer field from the data model and no Social Security field', () => {
    renderPage();

    for (const label of [
      'First name',
      'Last name',
      'Phone',
      'Email',
      'Preferred contact',
      'OK to text this customer',
      'Street address',
      'City',
      'Lead source',
      'Next follow-up date',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/social security|ssn/i)).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Yelp' })).toBeInTheDocument();
  });

  it('shows inline errors for missing required fields, focuses the first one, and sends nothing', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(201);
    renderPage();

    await user.click(save());

    expect(screen.getByText('First name is required.')).toBeInTheDocument();
    expect(screen.getByText('Last name is required.')).toBeInTheDocument();
    expect(screen.getAllByText('Enter a phone number or an email address.')).toHaveLength(2);
    expect(screen.getByLabelText('First name')).toHaveFocus();
    expect(screen.getByLabelText('First name')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows inline errors for an invalid phone and email', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(201);
    renderPage();

    await user.type(screen.getByLabelText('First name'), 'Ana');
    await user.type(screen.getByLabelText('Last name'), 'Ruiz');
    await user.type(screen.getByLabelText('Phone'), '555-0142');
    await user.type(screen.getByLabelText('Email'), 'ana@');
    await user.click(save());

    expect(
      screen.getByText('Enter a 10-digit US phone number, optionally starting with 1.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears an error as soon as the field is fixed', async () => {
    const user = userEvent.setup();
    stubFetch(201);
    renderPage();

    await user.click(save());
    await user.type(screen.getByLabelText('Phone'), '9165550100');

    expect(screen.queryByText('Enter a phone number or an email address.')).not.toBeInTheDocument();
    expect(screen.getByText('First name is required.')).toBeInTheDocument();
  });

  it('asks for texting permission when texts are the preferred contact', async () => {
    const user = userEvent.setup();
    stubFetch(201);
    renderPage();

    await fillRequired(user);
    await user.selectOptions(screen.getByLabelText('Preferred contact'), 'text');
    await user.click(save());

    expect(
      screen.getByText('Check "OK to text" to use text messages as the preferred contact.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('OK to text this customer')).toHaveFocus();
  });

  it('saves the customer, returns to the list and shows a success toast', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(201, {
      customer: { id: 'customer-1', firstName: 'Ana', lastName: 'Ruiz' },
    });
    renderPage();

    await fillRequired(user);
    await user.type(screen.getByLabelText('Email'), 'Ana@Example.com');
    await user.click(screen.getByLabelText('OK to text this customer'));
    await user.selectOptions(screen.getByLabelText('Preferred contact'), 'text');
    await user.type(screen.getByLabelText('City'), 'Fair Oaks');
    await user.selectOptions(screen.getByLabelText('Lead source'), 'yelp');
    await user.click(save());

    expect(await screen.findByText('Customer list')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Ana Ruiz was added to your customers.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/customers');
    expect(init.headers.Authorization).toBe('Bearer token-123');
    expect(JSON.parse(init.body)).toEqual({
      first_name: 'Ana',
      last_name: 'Ruiz',
      email: 'Ana@Example.com',
      phone: '(916) 555-0100',
      address: null,
      city: 'Fair Oaks',
      preferred_contact: 'text',
      text_ok: true,
      lead_source: 'yelp',
      next_follow_up_date: null,
    });
  });

  it('lets the owner dismiss the success toast', async () => {
    const user = userEvent.setup();
    stubFetch(201, { customer: { id: 'customer-1', firstName: 'Ana', lastName: 'Ruiz' } });
    renderPage();

    await fillRequired(user);
    await user.click(save());
    await screen.findByText('Customer list');
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }));

    expect(screen.queryByText('Ana Ruiz was added to your customers.')).not.toBeInTheDocument();
  });

  it('shows the already exists banner and marks the matched field', async () => {
    const user = userEvent.setup();
    stubFetch(409, { error: 'A customer with this phone number already exists.', field: 'phone' });
    renderPage();

    await fillRequired(user);
    await user.click(save());

    expect(await screen.findByText('This customer already exists')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A customer with this phone number already exists. Search the customer list for them instead of adding them again.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription(
      'A customer with this phone number already exists.',
    );
    // The owner stays on the form with what they typed.
    expect(screen.queryByText('Customer list')).not.toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Ana');
  });

  it('keeps the already exists error while other fields change, and clears it when that field changes', async () => {
    const user = userEvent.setup();
    stubFetch(409, { error: 'A customer with this phone number already exists.', field: 'phone' });
    renderPage();

    await fillRequired(user);
    await user.click(save());
    await screen.findByText('This customer already exists');

    await user.type(screen.getByLabelText('Last name'), 'z');

    expect(screen.getByText('This customer already exists')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');

    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), '(916) 555-0199');

    expect(screen.queryByText('This customer already exists')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).not.toHaveAttribute('aria-invalid');
  });

  it('shows the failed save banner, keeps the typed details and lets the owner retry', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { error: 'down' }))
      .mockResolvedValueOnce(
        reply(201, { customer: { id: 'customer-1', firstName: 'Ana', lastName: 'Ruiz' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await fillRequired(user);
    await user.click(save());

    expect(await screen.findByText('We could not save the customer')).toBeInTheDocument();
    expect(
      screen.getByText('The customer could not be saved. Check your connection and try again.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Ana');

    await user.click(save());

    expect(await screen.findByText('Customer list')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows the server field errors when the server refuses the details', async () => {
    const user = userEvent.setup();
    stubFetch(400, {
      error: 'Please check the customer details.',
      fieldErrors: { last_name: 'Last name must be 100 characters or fewer.' },
      formErrors: [],
    });
    renderPage();

    await fillRequired(user);
    await user.click(save());

    expect(
      await screen.findByText('Last name must be 100 characters or fewer.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Last name')).toHaveFocus();
  });

  it('asks the owner to log in again when the session has expired', async () => {
    const user = userEvent.setup();
    stubFetch(401);
    renderPage();

    await fillRequired(user);
    await user.click(save());

    expect(await screen.findByText('Your session has expired')).toBeInTheDocument();
  });

  it('does not send anything without a session', async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch(201);
    renderPage(null);

    await fillRequired(user);
    await user.click(save());

    expect(screen.getByText('Your session has expired')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables Save while saving so the customer is not sent twice', async () => {
    const user = userEvent.setup();
    let finish: (value: unknown) => void = () => {};
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await fillRequired(user);
    await user.click(save());

    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    await user.click(saving);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finish(reply(201, { customer: { id: 'customer-1', firstName: 'Ana', lastName: 'Ruiz' } }));
    await waitFor(() => expect(screen.getByText('Customer list')).toBeInTheDocument());
  });

  it('goes back to the list with Cancel', async () => {
    const user = userEvent.setup();
    renderPage();

    const form = screen.getByRole('form', { name: 'Add customer' });
    await user.click(within(form).getByRole('link', { name: 'Cancel' }));

    expect(screen.getByText('Customer list')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('can be filled in and saved with the keyboard only', async () => {
    const user = userEvent.setup();
    stubFetch(201, { customer: { id: 'customer-1', firstName: 'Ana', lastName: 'Ruiz' } });
    renderPage();

    screen.getByLabelText('First name').focus();
    await user.keyboard('Ana');
    await user.tab();
    await user.keyboard('Ruiz');
    await user.tab();
    await user.keyboard('9165550100');
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Customer list')).toBeInTheDocument();
  });
});
