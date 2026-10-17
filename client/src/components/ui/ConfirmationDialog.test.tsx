import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog } from './ConfirmationDialog';

describe('ConfirmationDialog', () => {
  it('does not render when closed', () => {
    render(
      <ConfirmationDialog
        isOpen={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="This action cannot be undone."
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders its title, message, and action buttons', () => {
    render(
      <ConfirmationDialog
        isOpen
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="This action cannot be undone."
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Delete item?' })).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked without confirming', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        isOpen
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Delete item?"
        message="Are you sure?"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm when Confirm is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        isOpen
        onCancel={vi.fn()}
        onConfirm={onConfirm}
        title="Publish changes?"
        message="Publish these changes now?"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses the destructive button style when requested', () => {
    render(
      <ConfirmationDialog
        isOpen
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="This action cannot be undone."
        destructive
        confirmLabel="Delete"
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-error');
  });

  it('supports custom button labels', () => {
    render(
      <ConfirmationDialog
        isOpen
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        title="Publish changes?"
        message="Are you ready?"
        confirmLabel="Publish"
        cancelLabel="Go back"
      />,
    );

    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <ConfirmationDialog
        isOpen
        onCancel={onCancel}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="Are you sure?"
      />,
    );

    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
