import { ListSkeleton } from '@/components/expenses/skeleton';

export default function Loading() {
  return <ListSkeleton title="Subscriptions" toolbar={false} stats={3} groups={2} rows={5} />;
}
