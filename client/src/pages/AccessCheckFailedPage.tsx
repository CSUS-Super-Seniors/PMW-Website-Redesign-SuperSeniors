import { Button } from '../components/ui';

type AccessCheckFailedPageProps = { onRetry: () => void };

export default function AccessCheckFailedPage({ onRetry }: AccessCheckFailedPageProps) {
  return (
    <main className="flex justify-center px-4 py-10">
      <div className="flex w-full max-w-120 flex-col items-center gap-4 rounded-md border border-neutral-300 bg-white p-8 text-center">
        <h1 className="type-h4">We couldn't check your access</h1>
        <p className="type-body text-neutral-600">
          We could not reach the server. Check your connection and try again.
        </p>
        <Button onClick={onRetry}>Retry</Button>
      </div>
    </main>
  );
}
