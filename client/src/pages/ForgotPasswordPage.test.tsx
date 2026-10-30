import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ResetRequestResult } from '../auth/passwordReset';
import { routes } from '../config/site';
import ForgotPasswordPage from './ForgotPasswordPage';

function renderPage(result: ResetRequestResult | Error = 'success') {
  const onRequestReset = vi.fn<(email: string) => Promise<ResetRequestResult>>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  render(
    <MemoryRouter initialEntries={[routes.staffForgotPassword]}>
      <Routes>
        <Route
          path={routes.staffForgotPassword}
          element={<ForgotPasswordPage onRequestReset={onRequestReset} />}
        />
        <Route path={routes.staffLogin} element={<p>Staff login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return onRequestReset;
}

const emailField = () => screen.getByLabelText('Email address');
const sendButton = () => screen.getByRole('button', { name: 'Send reset link' });

describe('ForgotPasswordPage', () => {
  it('shows the request form', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(
      screen.getByText('Enter your email and we will send you a link to make a new password.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to log in' })).toHaveAttribute(
      'href',
      routes.staffLogin,
    );
    expect(screen.getByRole('link', { name: 'Back to the public site' })).toHaveAttribute(
      'href',
      routes.home,
    );
  });

  it('asks for an email when the field is empty and sends nothing', async () => {
    const user = userEvent.setup();
    const onRequestReset = renderPage();

    await user.click(sendButton());

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(onRequestReset).not.toHaveBeenCalled();
  });

  it('shows the invalid email error and sends nothing', async () => {
    const user = userEvent.setup();
    const onRequestReset = renderPage();

    await user.type(emailField(), 'girlie@example');
    await user.click(sendButton());

    expect(
      screen.getByText('Enter a full email address, like name@example.com.'),
    ).toBeInTheDocument();
    expect(emailField()).toHaveAttribute('aria-invalid', 'true');
    expect(onRequestReset).not.toHaveBeenCalled();
  });

  it('sends the link and shows the link sent state', async () => {
    const user = userEvent.setup();
    const onRequestReset = renderPage('success');

    await user.type(emailField(), '  girlie@example.com ');
    await user.click(sendButton());

    expect(onRequestReset).toHaveBeenCalledWith('girlie@example.com');
    const heading = await screen.findByRole('heading', { name: 'Check your email' });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'If girlie@example.com has a staff account, a link to reset the password is on its way. The link works for 1 hour.',
    );
  });

  it('lets the link sent message be dismissed and goes back to log in', async () => {
    const user = userEvent.setup();
    renderPage('success');

    await user.type(emailField(), 'girlie@example.com');
    await user.click(sendButton());
    await user.click(await screen.findByRole('button', { name: 'Dismiss message' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to log in' }));

    expect(screen.getByText('Staff login page')).toBeInTheDocument();
  });

  it.each([
    ['rate-limited', 'Too many reset requests in a short time. Wait a few minutes and try again.'],
    ['unreachable', 'We could not reach the server. Check your connection and try again.'],
    ['failed', 'We could not send the reset link. Try again in a minute.'],
  ] as const)('shows the %s error and keeps the form', async (result, message) => {
    const user = userEvent.setup();
    renderPage(result);

    await user.type(emailField(), 'girlie@example.com');
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(emailField()).toHaveValue('girlie@example.com');
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it('treats a request that throws as unreachable', async () => {
    const user = userEvent.setup();
    renderPage(new Error('offline'));

    await user.type(emailField(), 'girlie@example.com');
    await user.click(sendButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/);
  });

  it('disables the button while the request is in flight', async () => {
    const user = userEvent.setup();
    let finish: (result: ResetRequestResult) => void = () => {};
    const onRequestReset = vi.fn(
      () =>
        new Promise<ResetRequestResult>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <ForgotPasswordPage onRequestReset={onRequestReset} />
      </MemoryRouter>,
    );

    await user.type(emailField(), 'girlie@example.com');
    await user.click(sendButton());

    expect(sendButton()).toBeDisabled();
    finish('success');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  });
});
