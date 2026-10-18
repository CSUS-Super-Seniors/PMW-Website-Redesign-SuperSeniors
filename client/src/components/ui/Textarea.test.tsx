import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders a labeled textarea', () => {
    render(<Textarea label="Project details" />);

    expect(screen.getByLabelText('Project details')).toBeInTheDocument();
  });

  it('displays an error message when an error is provided', () => {
    render(<Textarea label="Project details" error="Please provide project details." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Please provide project details.');
  });

  it('marks the textarea invalid when an error is provided', () => {
    render(<Textarea label="Project details" error="Details are required" />);

    expect(screen.getByLabelText('Project details')).toHaveAttribute('aria-invalid', 'true');
  });

  it('connects the error message to the textarea', () => {
    render(<Textarea label="Project details" error="Details are required" />);

    const textarea = screen.getByLabelText('Project details');
    const error = screen.getByRole('alert');

    expect(textarea).toHaveAttribute('aria-describedby', error.id);
  });

  it('does not display an error when none is provided', () => {
    render(<Textarea label="Project details" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Project details')).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('supports standard textarea attributes', () => {
    render(<Textarea label="Project details" placeholder="Describe your project" required />);

    const textarea = screen.getByLabelText('Project details');

    expect(textarea).toHaveAttribute('placeholder', 'Describe your project');
    expect(textarea).toBeRequired();
  });

  it('supports a disabled state', () => {
    render(<Textarea label="Project details" disabled />);

    expect(screen.getByLabelText('Project details')).toBeDisabled();
  });

  it('supports a custom id', () => {
    render(<Textarea id="project-details" label="Project details" />);

    expect(screen.getByLabelText('Project details')).toHaveAttribute('id', 'project-details');
  });
});
