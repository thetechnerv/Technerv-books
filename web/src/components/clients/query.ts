/** URL state for /clients. Pure module. */
export type ClientsFilter = 'active' | 'owing' | 'archived';
export type ClientsSort = 'name' | 'outstanding' | 'overdue' | 'fy' | 'last' | 'billed' | 'days';
export type ClientsQuery = { filter: ClientsFilter; sort: ClientsSort; q: string };

export const SORTS: { value: ClientsSort; label: string; menu: boolean }[] = [
  { value: 'name', label: 'Name', menu: true },
  { value: 'outstanding', label: 'Outstanding', menu: true },
  { value: 'last', label: 'Last invoice', menu: true },
  { value: 'billed', label: 'Lifetime billed', menu: true },
  { value: 'overdue', label: 'Overdue', menu: false },
  { value: 'fy', label: 'Billed this year', menu: false },
  { value: 'days', label: 'Days to pay', menu: false },
];

export function parseClientsQuery(sp: Record<string, string | string[] | undefined>): ClientsQuery {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? '';
  const filter = one('filter');
  const sort = one('sort');
  return {
    filter: (['active', 'owing', 'archived'] as const).includes(filter as ClientsFilter) ? (filter as ClientsFilter) : 'active',
    sort: SORTS.some((s) => s.value === sort) ? (sort as ClientsSort) : 'name',
    q: one('q').slice(0, 80),
  };
}

export function clientsHref({ filter, sort, q }: ClientsQuery) {
  const p = new URLSearchParams();
  if (filter !== 'active') p.set('filter', filter);
  if (sort !== 'name') p.set('sort', sort);
  if (q) p.set('q', q);
  const s = p.toString();
  return s ? `/clients?${s}` : '/clients';
}
