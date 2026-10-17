import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
  it('renders a labeled dropdown', () => {
    render(
      <Select label="Project type">
        <option value="deck">Deck</option>
        <option value="fence">Fence</option>
      </Select>,
    );

    expect(screen.getByLabelText('Project type')).toBeInTheDocument();
  });

  it('displays an error message when an error is provided', () => {
    render(<Select label="Project type" error="Please select a project type." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Please select a project type.');
  });

  it('marks the dropdown invalid when an error is provided', () => {
    render(<Select label="Project type" error="Selection required" />);

    expect(screen.getByLabelText('Project type')).toHaveAttribute('aria-invalid', 'true');
  });

  it('connects the error message to the dropdown', () => {
    render(<Select label="Project type" error="Selection required" />);

    const select = screen.getByLabelText('Project type');
    const error = screen.getByRole('alert');

    expect(select).toHaveAttribute('aria-describedby', error.id);
  });

  it('does not display an error when none is provided', () => {
    render(<Select label="Project type" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Project type')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('renders its options', () => {
    render(
      <Select label="Project type">
        <option value="deck">Deck</option>
        <option value="fence">Fence</option>
      </Select>,
    );

    expect(screen.getByRole('option', { name: 'Deck' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Fence' })).toBeInTheDocument();
  });

  it('supports a disabled state', () => {
    render(<Select label="Project type" disabled />);

    expect(screen.getByLabelText('Project type')).toBeDisabled();
  });

  it('supports a custom id', () => {
    render(<Select id="project-type" label="Project type" />);

    expect(screen.getByLabelText('Project type')).toHaveAttribute('id', 'project-type');
  });
});
