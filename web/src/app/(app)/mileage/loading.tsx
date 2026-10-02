import { ListSkeleton } from '@/components/expenses/skeleton';

export default function Loading() {
  return <ListSkeleton title="Mileage" stats={2} groups={2} rows={4} />;
}
