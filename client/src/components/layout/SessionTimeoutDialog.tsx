import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ErrorBanner } from '../ui/ErrorBanner';

interface SessionTimeoutDialogProps {
  isOpen: boolean;
  onStaySignedIn: () => void;
  warningMinutes: number;
  error?: string;
}

export function SessionTimeoutDialog({
  isOpen,
  onStaySignedIn,
  warningMinutes,
  error,
}: SessionTimeoutDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onStaySignedIn} title="You're about to be signed out">
      <div className="flex flex-col gap-6">
        <p className="type-body text-dark-brown">
          You will be signed out in {warningMinutes} minutes due to inactivity.
        </p>
        {error && <ErrorBanner message={error} />}
        <Button onClick={onStaySignedIn}>Stay signed in</Button>
      </div>
    </Modal>
  );
}
