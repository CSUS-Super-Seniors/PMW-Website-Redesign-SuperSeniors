import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { routes } from '../config/site';
import StaffLoginPage from './StaffLoginPage';

function renderPage(signedIn = true) {
  const onSignIn = vi.fn<(email: string, password: string) => Promise<boolean>>(() =>
    Promise.resolve(signedIn),
  );
  render(
    <MemoryRouter>
      <StaffLoginPage onSignIn={onSignIn} />
    </MemoryRouter>,
  );
  return onSignIn;
}

const emailField = () => screen.getByLabelText('Email address');
const passwordField = () => screen.getByLabelText('Password');
const logInButton = () => screen.getByRole('button', { name: 'Log in' });

describe('StaffLoginPage', () => {
  it('shows an inline error on each empty field and does not try to sign in', async () => {
    const user = userEvent.setup();
    const onSignIn = renderPage();

    await user.click(logInButton());

    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('only flags the password when the email is filled in', async () => {
    const user = userEvent.setup();
    const onSignIn = renderPage();

    await user.type(emailField(), 'todd@example.com');
    await user.click(logInButton());

    expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('shows the wrong email or password state and keeps the email', async () => {
    const user = userEvent.setup();
    const onSignIn = renderPage(false);

    await user.type(emailField(), 'todd@example.com');
    await user.type(passwordField(), 'not-the-password');
    await user.click(logInButton());

    expect(await screen.findByText(/Email or password is incorrect/)).toBeInTheDocument();
    expect(screen.getByText('Check your password and try again.')).toBeInTheDocument();
    expect(emailField()).toHaveValue('todd@example.com');
    expect(onSignIn).toHaveBeenCalledWith('todd@example.com', 'not-the-password');
  });

  it('closes the wrong password banner when it is dismissed', async () => {
    const user = userEvent.setup();
    renderPage(false);

    await user.type(emailField(), 'todd@example.com');
    await user.type(passwordField(), 'not-the-password');
    await user.click(logInButton());
    await user.click(await screen.findByRole('button', { name: 'Dismiss error' }));

    expect(screen.queryByText(/Email or password is incorrect/)).not.toBeInTheDocument();
  });

  it('shows no errors after a successful sign-in', async () => {
    const user = userEvent.setup();
    const onSignIn = renderPage(true);

    await user.type(emailField(), 'todd@example.com');
    await user.type(passwordField(), 'the-right-password');
    await user.click(logInButton());

    await waitFor(() => expect(logInButton()).toBeEnabled());
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Email or password is incorrect/)).not.toBeInTheDocument();
    expect(screen.queryByText('Check your password and try again.')).not.toBeInTheDocument();
  });

  it('links to forgot password and back to the public site', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute(
      'href',
      routes.staffForgotPassword,
    );
    expect(screen.getByRole('link', { name: 'Back to the public site' })).toHaveAttribute(
      'href',
      routes.home,
    );
  });
});
