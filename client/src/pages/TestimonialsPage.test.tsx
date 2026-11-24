import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  TESTIMONIAL_HONEYPOT_FIELD,
  type PublicTestimonial,
  type TestimonialSubmissionRequest,
} from '@pmw/validation';
import TestimonialsPage from './TestimonialsPage';
import { TestimonialSubmissionError } from '../api/testimonials';

const entry: PublicTestimonial = {
  id: '1',
  name: 'Alex',
  city: null,
  service: null,
  rating: null,
  body: 'Wonderful work.',
  submitted_at: '2026-11-19T00:00:00Z',
};

function renderPage(
  overrides: {
    loadTestimonials?: () => Promise<PublicTestimonial[]>;
    sendTestimonial?: (input: TestimonialSubmissionRequest) => Promise<void>;
  } = {},
) {
  return render(
    <TestimonialsPage
      loadTestimonials={async () => [entry]}
      sendTestimonial={async () => {}}
      {...overrides}
    />,
  );
}

async function fillCityAndService(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('City'), ' Carmichael ');
  await user.type(screen.getByLabelText('Service'), ' Refinishing ');
}

describe('TestimonialsPage', () => {
  it('shows approved entries and a helpful empty state', async () => {
    renderPage({
      loadTestimonials: async () => [
        { ...entry, city: 'Carmichael', service: 'Dining table restoration' },
      ],
    });
    expect(await screen.findByText(/Wonderful work\./)).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Carmichael · Dining table restoration')).toBeInTheDocument();
    renderPage({ loadTestimonials: async () => [] });
    expect(await screen.findByText(/No testimonials have been published yet/)).toBeInTheDocument();
  });

  it('allows long unbroken testimonial text and names to wrap inside their card', async () => {
    const longEntry = { ...entry, name: 'N'.repeat(100), body: 'T'.repeat(500) };
    renderPage({ loadTestimonials: async () => [longEntry] });

    const quote = await screen.findByText(`“${longEntry.body}”`);
    const card = quote.closest('li');
    expect(card).toHaveClass('[overflow-wrap:anywhere]');
    expect(screen.getByText(longEntry.name).closest('li')).toBe(card);
  });

  it('shows stored ratings and labels five outlined stars as Not rated for unrated entries', async () => {
    renderPage({ loadTestimonials: async () => [entry, { ...entry, id: '2', rating: 3 }] });
    const rated = await screen.findByRole('img', { name: '3 out of 5 stars' });
    expect(rated.querySelectorAll('svg[fill="currentColor"]')).toHaveLength(3);
    expect(rated.querySelectorAll('svg[fill="none"]')).toHaveLength(2);
    const unrated = screen.getByRole('img', { name: 'Not rated' });
    expect(unrated.querySelectorAll('svg')).toHaveLength(5);
    expect(unrated.querySelectorAll('svg[fill="none"]')).toHaveLength(5);
    expect(within(unrated).getByText('Not rated')).toBeVisible();
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('shows a retry action after a public-list error', async () => {
    const load = vi
      .fn<() => Promise<PublicTestimonial[]>>()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce([entry]);
    renderPage({ loadTestimonials: load });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/Wonderful work\./)).toBeInTheDocument();
  });

  it('validates required fields, email, length and permission before posting', async () => {
    const send = vi.fn(async () => {});
    renderPage({ sendTestimonial: send });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit testimonial' }));
    expect(await screen.findByText('Full name is required.')).toBeInTheDocument();
    expect(screen.getByText('Email address is required.')).toBeInTheDocument();
    expect(screen.getByText('City is required.')).toBeInTheDocument();
    expect(screen.getByText('Service is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeRequired();
    expect(screen.getByLabelText('Service')).toBeRequired();
    expect(screen.getByText('Your testimonial is required.')).toBeInTheDocument();
    expect(screen.getByText('Permission to publish is required.')).toBeInTheDocument();
    const publishConsent = screen.getByRole('checkbox', { name: /You may publish my testimonial/ });
    expect(publishConsent).toBeRequired();
    expect(publishConsent).toHaveAttribute('aria-invalid', 'true');
    expect(publishConsent).toHaveAttribute('aria-describedby', 'testimonial-consent-error');
    expect(screen.getByRole('region', { name: 'Share your story' })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('0 / 500 characters')).toBeInTheDocument();
    for (const alert of screen.getAllByRole('alert')) {
      const icon = alert.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('focusable', 'false');
    }
  });

  it('submits consent choices, announces success, and does not publish the pending entry', async () => {
    const send = vi.fn(async () => {});
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Alex Example');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await fillCityAndService(user);
    await user.type(screen.getByLabelText('Your testimonial'), 'Lovely repair.');
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    await user.click(screen.getByLabelText(/Contact me about adding a photo/));
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        name: 'Alex Example',
        email: 'alex@example.com',
        city: 'Carmichael',
        service: 'Refinishing',
        body: 'Lovely repair.',
        can_publish: true,
        photo_contact_ok: true,
        [TESTIMONIAL_HONEYPOT_FIELD]: '',
      }),
    );
    const confirmation = await screen.findByText('Thank you. Your testimonial was sent.');
    const heading = screen.getByRole('heading', { name: 'Testimonials' });
    expect(
      confirmation.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Share your story' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('');
    expect(screen.getByLabelText('Your testimonial')).toHaveValue('');
    expect(screen.getByLabelText(/You may publish my testimonial/)).not.toBeChecked();
    expect(screen.getByText(/Wonderful work\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss message' }));
    expect(screen.queryByText('Thank you. Your testimonial was sent.')).not.toBeInTheDocument();
  });

  it('keeps the honeypot out of keyboard and screen-reader navigation, sends its value, and clears it on success', async () => {
    const send = vi.fn(async () => {});
    const { container } = renderPage({ sendTestimonial: send });
    const trap = container.querySelector<HTMLInputElement>(
      `[name="${TESTIMONIAL_HONEYPOT_FIELD}"]`,
    )!;
    expect(trap.closest('[aria-hidden="true"]')).toBeInTheDocument();
    expect(trap).toHaveAttribute('tabindex', '-1');
    expect(trap).toHaveAttribute('autocomplete', 'off');
    expect(screen.queryByRole('textbox', { name: 'Leave this empty' })).not.toBeInTheDocument();
    fireEvent.change(trap, { target: { value: 'bot-filled-value' } });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Alex');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await fillCityAndService(user);
    await user.type(screen.getByLabelText('Your testimonial'), 'Great work.');
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          [TESTIMONIAL_HONEYPOT_FIELD]: 'bot-filled-value',
        }),
      ),
    );
    expect(trap).toHaveValue('');
  });

  it('clears the honeypot when the form is cancelled', async () => {
    const { container } = renderPage();
    const trap = container.querySelector<HTMLInputElement>(
      `[name="${TESTIMONIAL_HONEYPOT_FIELD}"]`,
    )!;
    fireEvent.change(trap, { target: { value: 'bot-filled-value' } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(trap).toHaveValue('');
  });

  it('retains input and exposes server errors after a failed submission', async () => {
    const send = vi.fn(async () => {
      throw new Error('offline');
    });
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Alex');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await fillCityAndService(user);
    await user.type(screen.getByLabelText('Your testimonial'), 'Still here');
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be submitted/);
    expect(screen.getByLabelText('Full name')).toHaveValue('Alex');
    expect(screen.getByLabelText('City')).toHaveValue(' Carmichael ');
    expect(screen.getByLabelText('Service')).toHaveValue(' Refinishing ');
    expect(screen.getByLabelText(/You may publish my testimonial/)).toBeChecked();
  });

  it.each([
    [429, 'Too many submissions. Please wait a minute and try again.'],
    [503, 'Testimonials are temporarily unavailable.'],
  ] as const)(
    'shows the HTTP %s message and allows retry without losing answers',
    async (status, message) => {
      const send = vi
        .fn()
        .mockRejectedValueOnce(new TestimonialSubmissionError(status, message))
        .mockResolvedValueOnce(undefined);
      renderPage({ sendTestimonial: send });
      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Full name'), 'Alex');
      await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
      await fillCityAndService(user);
      await user.type(screen.getByLabelText('Your testimonial'), 'Great work.');
      await user.click(screen.getByLabelText(/You may publish my testimonial/));
      await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByLabelText('Your testimonial')).toHaveValue('Great work.');
      await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
      expect(await screen.findByText('Thank you. Your testimonial was sent.')).toBeInTheDocument();
      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('keeps over-limit text visible with an error and blocks submission until corrected', async () => {
    const send = vi.fn(async () => {});
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Alex');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await fillCityAndService(user);
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    const field = screen.getByLabelText('Your testimonial');
    fireEvent.change(field, { target: { value: 'x'.repeat(501) } });
    expect(field).toHaveValue('x'.repeat(501));
    expect(screen.getByRole('alert')).toHaveTextContent('500 characters or fewer');
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    expect(send).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'x'.repeat(500) } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
  });

  it.each(['City', 'Service'] as const)(
    'blocks submission and focuses a whitespace-only %s',
    async (label) => {
      const send = vi.fn(async () => {});
      renderPage({ sendTestimonial: send });
      const user = userEvent.setup();
      await user.type(screen.getByLabelText('Full name'), 'Alex');
      await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
      await fillCityAndService(user);
      await user.type(screen.getByLabelText('Your testimonial'), 'Great work.');
      await user.click(screen.getByLabelText(/You may publish my testimonial/));
      const field = screen.getByLabelText(label);
      await user.clear(field);
      await user.type(field, '   ');
      await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
      expect(await screen.findByText(`${label} is required.`)).toBeInTheDocument();
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveFocus();
      expect(send).not.toHaveBeenCalled();
    },
  );

  it('trims required city and service and clears them after success', async () => {
    const send = vi.fn(async () => {});
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    expect(screen.getByLabelText('City')).toBeRequired();
    expect(screen.getByLabelText('Service')).toBeRequired();
    await user.type(screen.getByLabelText('Full name'), 'Alex');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await fillCityAndService(user);
    await user.type(screen.getByLabelText('Your testimonial'), 'Great work.');
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Carmichael', service: 'Refinishing' }),
      ),
    );
    expect(screen.getByLabelText('City')).toHaveValue('');
    expect(screen.getByLabelText('Service')).toHaveValue('');
  });
});
