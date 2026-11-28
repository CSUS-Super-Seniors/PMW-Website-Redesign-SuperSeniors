import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CustomerStatusBadge } from './CustomerStatusBadge';

describe('CustomerStatusBadge', () => {
  it.each([0, 1])('shows New with %i completed jobs', (count) => {
    render(<CustomerStatusBadge completedJobCount={count} />);

    expect(screen.getByText('New')).toHaveClass('bg-info-light');
    expect(screen.queryByText('Repeat')).not.toBeInTheDocument();
  });

  it('shows Repeat exactly after the second completed job', () => {
    const { rerender } = render(<CustomerStatusBadge completedJobCount={1} />);
    expect(screen.queryByText('Repeat')).not.toBeInTheDocument();

    rerender(<CustomerStatusBadge completedJobCount={2} />);

    expect(screen.getByText('Repeat')).toHaveClass('bg-success-light');
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('stays Repeat with more completed jobs', () => {
    render(<CustomerStatusBadge completedJobCount={4} />);

    expect(screen.getByText('Repeat')).toBeInTheDocument();
  });

  it('passes extra classes to the badge', () => {
    render(<CustomerStatusBadge completedJobCount={0} className="ml-2" />);

    expect(screen.getByText('New')).toHaveClass('ml-2');
  });
});
