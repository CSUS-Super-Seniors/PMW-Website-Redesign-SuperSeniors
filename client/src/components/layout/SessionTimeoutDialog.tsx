import { Button, Modal } from '../ui';

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
}: SessionTimeoutDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onStaySignedIn} title="You're about to be signed out">
      <div className="flex flex-col gap-6">
        <p className="type-body text-dark-brown">
          You will be signed out in {warningMinutes} minutes due to inactivity.
        </p>
        <Button onClick={onStaySignedIn}>Stay signed in</Button>
      </div>
    </Modal>
  );
}
