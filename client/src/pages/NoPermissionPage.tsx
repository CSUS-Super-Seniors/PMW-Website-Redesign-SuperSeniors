import { useNavigate } from 'react-router';
import { routes } from '../config/site';
import { Button } from '../components/ui';
import { LockIcon } from '../components/icons';

export default function NoPermissionPage() {
  const navigate = useNavigate();

  return (
    <main className="flex justify-center px-4 py-10">
      <div className="flex w-full max-w-120 flex-col items-center gap-4 rounded-md border border-neutral-300 bg-white p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100">
          <LockIcon className="size-6" />
        </div>
        <h1 className="type-h4">You do not have access to this page</h1>
        <p className="type-body text-neutral-600">
          This page is for owners only. Head to the schedule to see your jobs.
        </p>
        <Button
          variant="outline"
          onClick={() => navigate(routes.portalSchedule, { replace: true })}
        >
          Go to schedule
        </Button>
      </div>
    </main>
  );
}
