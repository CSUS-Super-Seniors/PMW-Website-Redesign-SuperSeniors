import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Active</Badge>);

    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('uses the default variant by default', () => {
    render(<Badge>Default</Badge>);

    expect(screen.getByText('Default')).toHaveClass('bg-neutral-100');
  });

  it('supports the success variant', () => {
    render(<Badge variant="success">Completed</Badge>);

    expect(screen.getByText('Completed')).toHaveClass('bg-success-light');
  });

  it('supports the warning variant', () => {
    render(<Badge variant="warning">Pending</Badge>);

    expect(screen.getByText('Pending')).toHaveClass('bg-warning-light');
  });

  it('supports the error variant', () => {
    render(<Badge variant="error">Failed</Badge>);

    expect(screen.getByText('Failed')).toHaveClass('bg-error-light');
  });

  it('supports the info variant', () => {
    render(<Badge variant="info">Information</Badge>);

    expect(screen.getByText('Information')).toHaveClass('bg-info-light');
  });

  it('supports a custom className', () => {
    render(<Badge className="my-custom-class">Active</Badge>);

    expect(screen.getByText('Active')).toHaveClass('my-custom-class');
  });

  it('passes through HTML attributes', () => {
    render(<Badge title="Current status">Active</Badge>);

    expect(screen.getByText('Active')).toHaveAttribute('title', 'Current status');
  });
});
