import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PublicTestimonial, TestimonialSubmission } from '@pmw/validation';
import TestimonialsPage from './TestimonialsPage';

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
    sendTestimonial?: (input: TestimonialSubmission) => Promise<void>;
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

  it('shows stored ratings and hides the stars for unrated entries', async () => {
    renderPage({ loadTestimonials: async () => [entry, { ...entry, id: '2', rating: 3 }] });
    expect(await screen.findByRole('img', { name: '3 out of 5 stars' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
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
    expect(await screen.findByText('Enter your name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your testimonial.')).toBeInTheDocument();
    expect(screen.getByText('Permission to publish is required.')).toBeInTheDocument();
    const publishConsent = screen.getByRole('checkbox', { name: /You may publish my testimonial/ });
    expect(publishConsent).toBeRequired();
    expect(publishConsent).toHaveAttribute('aria-invalid', 'true');
    expect(publishConsent).toHaveAttribute('aria-describedby', 'testimonial-consent-error');
    expect(screen.getByRole('region', { name: 'Share your story' })).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('0 / 500 characters')).toBeInTheDocument();
  });

  it('submits consent choices, announces success, and does not publish the pending entry', async () => {
    const send = vi.fn(async () => {});
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Alex Example');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await user.type(screen.getByLabelText('Your testimonial'), 'Lovely repair.');
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    await user.click(screen.getByLabelText(/Contact me about adding a photo/));
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        name: 'Alex Example',
        email: 'alex@example.com',
        city: '',
        service: '',
        body: 'Lovely repair.',
        can_publish: true,
        photo_contact_ok: true,
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

  it('retains input and exposes server errors after a failed submission', async () => {
    const send = vi.fn(async () => {
      throw new Error('offline');
    });
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Alex');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await user.type(screen.getByLabelText('Your testimonial'), 'Still here');
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be submitted/);
    expect(screen.getByLabelText('Full name')).toHaveValue('Alex');
    expect(screen.getByLabelText(/You may publish my testimonial/)).toBeChecked();
  });

  it('keeps over-limit text visible with an error and blocks submission until corrected', async () => {
    const send = vi.fn(async () => {});
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Full name'), 'Alex');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
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

  it('submits optional city and service and clears them after success', async () => {
    const send = vi.fn(async () => {});
    renderPage({ sendTestimonial: send });
    const user = userEvent.setup();
    expect(screen.getByLabelText('City (optional)')).not.toBeRequired();
    expect(screen.getByLabelText('Service (optional)')).not.toBeRequired();
    await user.type(screen.getByLabelText('Full name'), 'Alex');
    await user.type(screen.getByLabelText('Email address'), 'alex@example.com');
    await user.type(screen.getByLabelText('City (optional)'), ' Carmichael ');
    await user.type(screen.getByLabelText('Service (optional)'), ' Refinishing ');
    await user.type(screen.getByLabelText('Your testimonial'), 'Great work.');
    await user.click(screen.getByLabelText(/You may publish my testimonial/));
    await user.click(screen.getByRole('button', { name: 'Submit testimonial' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ city: 'Carmichael', service: 'Refinishing' }),
      ),
    );
    expect(screen.getByLabelText('City (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Service (optional)')).toHaveValue('');
  });
});
