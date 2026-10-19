import { useRef, useState } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmationDialog({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
}: ConfirmationDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmationInProgress = useRef(false);

  const handleConfirm = async () => {
    if (confirmationInProgress.current) return;

    confirmationInProgress.current = true;
    setIsConfirming(true);

    try {
      await onConfirm();
    } finally {
      confirmationInProgress.current = false;
      setIsConfirming(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <div className="flex flex-col gap-6">
        <p className="type-body text-dark-brown">{message}</p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel}
          </Button>

          <Button
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
