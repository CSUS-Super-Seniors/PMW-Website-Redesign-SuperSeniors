
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Save changes</Button>);

    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument();
  });

  it('uses the primary variant by default', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button')).toHaveClass('bg-dark-brown');
  });

  it('supports the outline variant', () => {
    render(<Button variant="outline">Cancel</Button>);

    expect(screen.getByRole('button')).toHaveClass('border');
  });

  it('can be disabled', () => {
    render(<Button disabled>Save</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();

    render(<Button onClick={handleClick}>Save</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();

    render(
      <Button disabled onClick={handleClick}>
        Save
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('defaults to type button', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });
});
