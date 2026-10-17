import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders its label', () => {
    render(<Checkbox label="Accept terms" />);

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toBeInTheDocument();
  });

  it('starts unchecked by default', () => {
    render(<Checkbox label="Accept terms" />);

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).not.toBeChecked();
  });

  it('can be checked by clicking the checkbox', () => {
    render(<Checkbox label="Accept terms" />);

    const checkbox = screen.getByRole('checkbox', {
      name: 'Accept terms',
    });

    fireEvent.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it('supports a controlled checked value', () => {
    render(<Checkbox label="Accept terms" checked readOnly />);

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toBeChecked();
  });

  it('calls onChange when toggled', () => {
    const handleChange = vi.fn();

    render(<Checkbox label="Accept terms" onChange={handleChange} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept terms' }));

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('can be disabled', () => {
    render(<Checkbox label="Accept terms" disabled />);

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toBeDisabled();
  });

  it('uses the supplied id', () => {
    render(<Checkbox id="terms" label="Accept terms" />);

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toHaveAttribute('id', 'terms');
  });

  it('passes through the name attribute', () => {
    render(<Checkbox name="terms" label="Accept terms" />);

    expect(screen.getByRole('checkbox', { name: 'Accept terms' })).toHaveAttribute('name', 'terms');
  });
});
