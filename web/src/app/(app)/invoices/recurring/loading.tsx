import { ListSkeleton } from '@/components/invoices/skeleton';

export default function Loading() {
  return <ListSkeleton title="Recurring" stats={0} />;
}
