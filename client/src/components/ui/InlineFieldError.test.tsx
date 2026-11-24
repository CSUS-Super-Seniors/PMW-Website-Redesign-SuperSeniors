import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineFieldError } from './InlineFieldError';

describe('InlineFieldError', () => {
  it('renders the validation message with the provided ID', () => {
    render(<InlineFieldError id="email-error" message="Enter a valid email address." />);

    const error = screen.getByRole('alert');

    expect(error).toHaveAttribute('id', 'email-error');
    expect(error).toHaveTextContent('Enter a valid email address.');
    expect(error.querySelector('svg')).not.toBeInTheDocument();
  });

  it('can add a decorative warning icon without changing the error announcement', () => {
    render(<InlineFieldError id="city-error" message="City is required." showIcon />);
    const error = screen.getByRole('alert');
    expect(error).toHaveAttribute('id', 'city-error');
    expect(error).toHaveTextContent('City is required.');
    expect(error.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(error.querySelector('svg')).toHaveAttribute('focusable', 'false');
  });

  it('does not render when the message is omitted', () => {
    const { container } = render(<InlineFieldError id="email-error" showIcon />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not render when the message is empty', () => {
    const { container } = render(<InlineFieldError id="email-error" message="" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('accepts a custom class name', () => {
    render(
      <InlineFieldError id="email-error" message="Email is required." className="custom-error" />,
    );

    expect(screen.getByRole('alert')).toHaveClass('custom-error');
  });
});
