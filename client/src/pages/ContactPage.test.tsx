import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactValidationError, type ContactMessage } from '../api/contact';
import { business } from '../config/site';
import ContactPage from './ContactPage';

function renderPage(
  onSend = vi.fn<(message: ContactMessage) => Promise<void>>().mockResolvedValue(undefined),
) {
  render(<ContactPage onSend={onSend} />);
  return onSend;
}

async function fillForm(contact = 'customer@example.com') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Your name'), '  Alex Peterson  ');
  await user.type(screen.getByLabelText('Phone number or email'), `  ${contact}  `);
  await user.type(screen.getByLabelText('Your message'), '  Can you repair my table?  ');
  return user;
}

describe('ContactPage', () => {
  it('shows the business number, a call button, city, and hours', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Get in touch' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: business.phoneDisplay })).toHaveAttribute(
      'href',
      business.phoneHref,
    );
    expect(screen.getByRole('link', { name: 'Tap to call' })).toHaveAttribute(
      'href',
      business.phoneHref,
    );
    expect(screen.getByText('Carmichael, CA')).toBeInTheDocument();
    expect(screen.getByText(business.hours)).toBeInTheDocument();
    expect(screen.queryByText(/nearby cities/i)).not.toBeInTheDocument();
  });

  it('shows inline errors, focuses the first empty field, and sends nothing', async () => {
    const user = userEvent.setup();
    const onSend = renderPage();
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    for (const label of ['Your name', 'Phone number or email', 'Your message']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(screen.getByLabelText('Your name')).toHaveAccessibleDescription(/Enter your name\./);
    expect(screen.getByLabelText('Phone number or email')).toHaveAccessibleDescription(
      /Enter your phone number or email address\./,
    );
    expect(screen.getByLabelText('Your message')).toHaveAccessibleDescription(
      /Enter your message\./,
    );
    expect(screen.getByLabelText('Your name')).toHaveFocus();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only fields before sending', async () => {
    const user = userEvent.setup();
    const onSend = renderPage();
    for (const label of ['Your name', 'Phone number or email', 'Your message']) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: '   ' } });
    }
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(onSend).not.toHaveBeenCalled();
  });

  it.each([
    'not-an-email',
    'alex@',
    'alex@example',
    'a@b.c',
    '12345',
    '916-CALL-NOW',
    '916555123456',
  ])('rejects invalid contact information: %s', async (contact) => {
    const onSend = renderPage();
    const user = await fillForm(contact);
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByText('Enter a valid phone number or email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number or email')).toHaveFocus();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows server errors inline and focuses the first invalid field', async () => {
    const onSend = vi
      .fn<(message: ContactMessage) => Promise<void>>()
      .mockRejectedValueOnce(
        new ContactValidationError({
          name: 'Name must be 100 characters or fewer.',
          email: 'Enter a valid email address.',
          message: 'Message must be 500 characters or fewer.',
        }),
      )
      .mockResolvedValueOnce(undefined);
    renderPage(onSend);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Name must be 100 characters or fewer.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveFocus();
    expect(screen.getByLabelText('Phone number or email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Message must be 500 characters or fewer.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your message')).toHaveValue('  Can you repair my table?  ');
    expect(screen.queryByText(/Your message could not be sent/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Message sent.')).toBeInTheDocument();
  });

  it('maps a server phone error to the combined contact field', async () => {
    const onSend = vi
      .fn<(message: ContactMessage) => Promise<void>>()
      .mockRejectedValueOnce(
        new ContactValidationError({ phone: 'Enter a valid US phone number.' }),
      );
    renderPage(onSend);
    const user = await fillForm('(916) 643-5686');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Enter a valid US phone number.')).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number or email')).toHaveFocus();
    expect(screen.queryByText('Message sent.')).not.toBeInTheDocument();
  });

  it.each([
    ['customer@example.com', 'customer@example.com', null],
    ['(916) 643-5686', null, '(916) 643-5686'],
    ['+1 916-643-5686', null, '+1 916-643-5686'],
  ])(
    'sends a trimmed message with contact information %s and announces success',
    async (contact, email, phone) => {
      const onSend = renderPage();
      const user = await fillForm(contact);
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText('Message sent.')).toBeInTheDocument();
      expect(onSend).toHaveBeenCalledExactlyOnceWith({
        name: 'Alex Peterson',
        email,
        phone,
        message: 'Can you repair my table?',
      });
      expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Send another message' }));
      expect(screen.getByLabelText('Your name')).toHaveValue('');
      expect(screen.getByLabelText('Your message')).toHaveValue('');
      expect(screen.queryByText('Message sent.')).not.toBeInTheDocument();
    },
  );

  it('disables the form and prevents duplicate requests while sending', async () => {
    let finish!: () => void;
    const onSend = vi.fn<(message: ContactMessage) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    renderPage(onSend);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    expect(screen.getByLabelText('Your name')).toBeDisabled();
    expect(screen.getByLabelText('Phone number or email')).toBeDisabled();
    expect(screen.getByLabelText('Your message')).toBeDisabled();
    expect(screen.getByText('Sending your message.')).toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText('Your name').closest('form')!);
    expect(onSend).toHaveBeenCalledTimes(1);

    finish();
    expect(await screen.findByText('Message sent.')).toBeInTheDocument();
  });

  it('keeps entered values after failure and lets the visitor retry successfully', async () => {
    const onSend = vi
      .fn<(message: ContactMessage) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(undefined);
    renderPage(onSend);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Your message could not be sent/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('  Alex Peterson  ');
    expect(screen.getByLabelText('Phone number or email')).toHaveValue('  customer@example.com  ');
    expect(screen.getByLabelText('Your message')).toHaveValue('  Can you repair my table?  ');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    expect(screen.queryByText('Message sent.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(await screen.findByText('Message sent.')).toBeInTheDocument();
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears field errors after correcting invalid information', async () => {
    const onSend = renderPage();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await fillForm();
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Message sent.')).toBeInTheDocument();
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('updates the character counter and prevents typing past the message limit', async () => {
    const user = userEvent.setup();
    renderPage();
    const message = screen.getByLabelText('Your message');
    expect(message).toHaveAttribute('maxlength', '500');
    fireEvent.change(message, { target: { value: 'a'.repeat(499) } });
    await user.type(message, 'bc');

    expect(message).toHaveValue('a'.repeat(499) + 'b');
    expect(screen.getByText('500 / 500 characters')).toBeInTheDocument();
  });

  it('rejects an over-limit value even if the HTML limit is bypassed', async () => {
    const onSend = renderPage();
    const user = await fillForm();
    fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'a'.repeat(501) } });
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    expect(screen.getByText('Keep your message to 500 characters or fewer.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Your message')).toHaveFocus());
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not move focus to the name field on the initial page load', () => {
    renderPage();

    expect(document.body).toHaveFocus();
  });

  it('keeps keyboard focus through sending, success, and starting another message', async () => {
    renderPage();
    const user = await fillForm();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveFocus();
    await user.keyboard('{Enter}');

    const successHeading = await screen.findByRole('heading', { name: 'Message sent.' });
    await waitFor(() => expect(successHeading).toHaveFocus());
    expect(successHeading).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(screen.getByRole('button', { name: 'Send another message' })).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByLabelText('Your name')).toHaveFocus());
    for (const label of ['Your name', 'Phone number or email', 'Your message']) {
      expect(screen.getByLabelText(label)).toHaveValue('');
    }
    expect(screen.queryByRole('heading', { name: 'Message sent.' })).not.toBeInTheDocument();

    await user.tab();
    expect(screen.getByLabelText('Phone number or email')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Your message')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveFocus();
  });
});
