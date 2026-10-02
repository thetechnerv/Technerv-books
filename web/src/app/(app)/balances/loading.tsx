import { ListSkeleton } from '@/components/expenses/skeleton';

export default function Loading() {
  return <ListSkeleton title="Owner balances" toolbar={false} stats={2} groups={2} rows={5} />;
}
