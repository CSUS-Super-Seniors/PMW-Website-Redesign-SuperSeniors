import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
  it('renders a labeled input', () => {
    render(<Input label="Email address" type="email" />);

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('displays an error message when an error is provided', () => {
    render(<Input label="Email address" error="Email is required" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Email is required');
  });

  it('marks the input invalid when an error is provided', () => {
    render(<Input label="Email address" error="Email is required" />);

    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
  });

  it('connects the error message to the input', () => {
    render(<Input label="Email address" error="Email is required" />);

    const input = screen.getByLabelText('Email address');
    const error = screen.getByRole('alert');

    expect(input).toHaveAttribute('aria-describedby', error.id);
  });

  it('supports an error icon and keeps the message associated with the input', () => {
    render(<Input id="city" label="City" error="City is required." showErrorIcon />);
    const input = screen.getByLabelText('City');
    expect(input).toHaveAttribute('aria-describedby', 'city-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(input).not.toHaveAttribute('showerroricon');
  });

  it('does not display an error when none is provided', () => {
    render(<Input label="Email address" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('supports standard input attributes', () => {
    render(<Input label="Email address" type="email" placeholder="you@example.com" required />);

    const input = screen.getByLabelText('Email address');

    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('placeholder', 'you@example.com');
    expect(input).toBeRequired();
  });

  it('supports a disabled state', () => {
    render(<Input label="Email address" disabled />);

    expect(screen.getByLabelText('Email address')).toBeDisabled();
  });

  it('supports a custom id', () => {
    render(<Input id="contact-email" label="Email address" />);

    expect(screen.getByLabelText('Email address')).toHaveAttribute('id', 'contact-email');
  });

  it('shows a hint connected to the input', () => {
    render(<Input label="New password" hint="Use at least 8 characters." />);

    const hint = screen.getByText('Use at least 8 characters.');
    expect(screen.getByLabelText('New password')).toHaveAttribute('aria-describedby', hint.id);
  });

  it('replaces the hint with the error while there is one', () => {
    render(<Input label="New password" hint="Use at least 8 characters." error="Too short." />);

    expect(screen.queryByText('Use at least 8 characters.')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Too short.');
  });
});
