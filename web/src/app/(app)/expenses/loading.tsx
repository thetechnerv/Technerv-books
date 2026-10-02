import { ListSkeleton } from '@/components/expenses/skeleton';

export default function Loading() {
  return <ListSkeleton title="Expenses" stats={4} groups={2} rows={6} wide />;
}
