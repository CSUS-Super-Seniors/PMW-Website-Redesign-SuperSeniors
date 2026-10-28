import { render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { UpdatePasswordResult } from '../auth/passwordReset';
import { routes } from '../config/site';
import ResetPasswordPage from './ResetPasswordPage';

function renderPage(linkValid: boolean, result: UpdatePasswordResult | Error = 'success') {
  const onSave = vi.fn<(password: string) => Promise<UpdatePasswordResult>>(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  render(
    <MemoryRouter initialEntries={[routes.staffResetPassword]}>
      <Routes>
        <Route
          path={routes.staffResetPassword}
          element={<ResetPasswordPage linkValid={linkValid} onSave={onSave} />}
        />
        <Route path={routes.staffLogin} element={<p>Staff login page</p>} />
        <Route path={routes.staffForgotPassword} element={<p>Forgot password page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return onSave;
}

const newPassword = () => screen.getByLabelText('New password');
const confirmPassword = () => screen.getByLabelText('Type it again');
const saveButton = () => screen.getByRole('button', { name: 'Save new password' });

async function fillIn(password: string, confirm: string) {
  const user = userEvent.setup();
  if (password) await user.type(newPassword(), password);
  if (confirm) await user.type(confirmPassword(), confirm);
  await user.click(saveButton());
  return user;
}

describe('ResetPasswordPage', () => {
  it('shows the new password form with the length hint', () => {
    renderPage(true);

    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(newPassword()).toHaveAttribute('type', 'password');
    expect(confirmPassword()).toHaveAttribute('type', 'password');
  });

  it('shows the mismatch error and saves nothing', async () => {
    const onSave = renderPage(true);

    await fillIn('new-password-123', 'new-password-12');

    expect(
      screen.getByText('The two passwords do not match. Type the same password in both boxes.'),
    ).toBeInTheDocument();
    expect(confirmPassword()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('asks for both fields and saves nothing when they are empty', async () => {
    const onSave = renderPage(true);

    await fillIn('', '');

    expect(screen.getByText('Enter a new password.')).toBeInTheDocument();
    expect(screen.getByText('Type the same password again.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const onSave = renderPage(true);

    await fillIn('seven77', 'seven77');

    expect(newPassword()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Use at least 8 characters.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('accepts a password of exactly 8 characters', async () => {
    const onSave = renderPage(true);

    await fillIn('eight888', 'eight888');

    expect(onSave).toHaveBeenCalledWith('eight888');
  });

  it('disables the button while saving', async () => {
    let finish: (result: UpdatePasswordResult) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<UpdatePasswordResult>((resolve) => {
          finish = resolve;
        }),
    );
    render(
      <MemoryRouter>
        <ResetPasswordPage linkValid onSave={onSave} />
      </MemoryRouter>,
    );

    await fillIn('new-password-123', 'new-password-123');

    expect(saveButton()).toBeDisabled();
    finish('success');
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('does not move focus on first load, even in StrictMode', () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <ResetPasswordPage linkValid onSave={vi.fn()} />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(screen.getByRole('heading', { name: 'Choose a new password' })).not.toHaveFocus();
  });

  it('saves a matching password and shows the success state', async () => {
    const onSave = renderPage(true, 'success');

    const user = await fillIn('new-password-123', 'new-password-123');

    expect(onSave).toHaveBeenCalledWith('new-password-123');
    const heading = await screen.findByRole('heading', { name: 'Password changed' });
    expect(heading).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Your new password is savedLog in with your new password to continue.',
    );

    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Staff login page')).toBeInTheDocument();
  });

  it('shows the expired link state when the link was not valid', async () => {
    const user = userEvent.setup();
    renderPage(false);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This reset link has expiredReset links work for 1 hour. Send a new one to continue.',
    );
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to log in' })).toHaveAttribute(
      'href',
      routes.staffLogin,
    );

    await user.click(screen.getByRole('button', { name: 'Send a new link' }));

    expect(screen.getByText('Forgot password page')).toBeInTheDocument();
  });

  it('switches to the expired state when the reset session ran out while typing', async () => {
    renderPage(true, 'expired');

    await fillIn('new-password-123', 'new-password-123');

    expect(await screen.findByText('This reset link has expired')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toHaveFocus();
  });

  it.each([
    ['same-password', 'This is already your password. Choose a different one.'],
    [
      'weak-password',
      'This password is too easy to guess. Try a longer one with a mix of letters and numbers.',
    ],
  ] as const)('shows the %s error on the new password field', async (result, message) => {
    renderPage(true, result);

    await fillIn('new-password-123', 'new-password-123');

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(newPassword()).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['unreachable', 'We could not reach the server. Check your connection and try again.'],
    ['failed', 'We could not save your new password. Try again.'],
  ] as const)('shows the %s banner and keeps the form', async (result, message) => {
    renderPage(true, result);

    await fillIn('new-password-123', 'new-password-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(saveButton()).toBeEnabled();
  });

  it('treats a save that throws as unreachable', async () => {
    renderPage(true, new Error('offline'));

    await fillIn('new-password-123', 'new-password-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/);
  });
});
