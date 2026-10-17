import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineFieldError } from './InlineFieldError';

describe('InlineFieldError', () => {
  it('renders the validation message with the provided ID', () => {
    render(<InlineFieldError id="email-error" message="Enter a valid email address." />);

    const error = screen.getByRole('alert');

    expect(error).toHaveAttribute('id', 'email-error');
    expect(error).toHaveTextContent('Enter a valid email address.');
  });

  it('does not render when the message is omitted', () => {
    const { container } = render(<InlineFieldError id="email-error" />);

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
