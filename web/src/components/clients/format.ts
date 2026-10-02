import type { Row } from '@/lib/types';

/** Pure display helpers for clients (safe on client and server). */
export function formatLocation(c: Pick<Row<'clients'>, 'city' | 'province' | 'country'>) {
  const parts = [c.city, c.province].filter(Boolean).join(', ');
  if (c.country && c.country !== 'CA') return parts ? `${parts} · ${c.country}` : c.country;
  return parts;
}

export function addressLines(c: Pick<Row<'clients'>, 'address_line1' | 'address_line2' | 'city' | 'province' | 'postal_code' | 'country'>) {
  const cityLine = [[c.city, c.province].filter(Boolean).join(', '), c.postal_code].filter(Boolean).join('  ');
  return [c.address_line1, c.address_line2, cityLine, c.country && c.country !== 'CA' ? c.country : null].filter(Boolean) as string[];
}
