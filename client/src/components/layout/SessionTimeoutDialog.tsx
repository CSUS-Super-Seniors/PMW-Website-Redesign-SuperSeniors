import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface SessionTimeoutDialogProps {
  isOpen: boolean;
  onStaySignedIn: () => void;
  warningMinutes: number;
}

export function SessionTimeoutDialog({
  isOpen,
  onStaySignedIn,
  warningMinutes,
}: SessionTimeoutDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={() => {}} title="You're about to be signed out">
      <div className="flex flex-col gap-6">
        <p className="type-body text-dark-brown">
          You will be signed out in {warningMinutes} minutes due to inactivity.
        </p>
        <Button onClick={onStaySignedIn}>Stay signed in</Button>
      </div>
    </Modal>
  );
}
