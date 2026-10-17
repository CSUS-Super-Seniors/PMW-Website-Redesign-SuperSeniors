import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

describe('Modal', () => {
  it('does not render when closed', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Example">
        Modal content
      </Modal>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders its title and content when open', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Example">
        Modal content
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Example' })).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal isOpen onClose={onClose} title="Example">
        Modal content
      </Modal>,
    );

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();

    render(
      <Modal isOpen onClose={onClose} title="Example">
        Modal content
      </Modal>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();

    const { container } = render(
      <Modal isOpen onClose={onClose} title="Example">
        Modal content
      </Modal>,
    );

    fireEvent.mouseDown(container.firstElementChild!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps keyboard focus inside the modal when tabbing forward', async () => {
    const user = userEvent.setup();

    render(
      <Modal isOpen onClose={vi.fn()} title="Example">
        <button type="button">Last action</button>
      </Modal>,
    );

    const closeButton = screen.getByRole('button', { name: 'Close dialog' });
    const lastButton = screen.getByRole('button', { name: 'Last action' });

    lastButton.focus();
    await user.tab();

    expect(closeButton).toHaveFocus();
  });

  it('wraps keyboard focus backward from the first element', async () => {
    const user = userEvent.setup();

    render(
      <Modal isOpen onClose={vi.fn()} title="Example">
        <button type="button">Last action</button>
      </Modal>,
    );

    const closeButton = screen.getByRole('button', { name: 'Close dialog' });
    const lastButton = screen.getByRole('button', { name: 'Last action' });

    closeButton.focus();
    await user.tab({ shift: true });

    expect(lastButton).toHaveFocus();
  });

  it('restores focus to the previously focused element when closed', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open modal';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Modal isOpen onClose={vi.fn()} title="Example">
        Modal content
      </Modal>,
    );

    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    unmount();

    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
