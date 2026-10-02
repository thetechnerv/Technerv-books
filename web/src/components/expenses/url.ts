/** Build a URL from the current params with some keys changed (null/'' removes). */
export function hrefWith(base: string, params: Record<string, string | undefined>, changes: Record<string, string | null | undefined>) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...changes })) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `${base}?${s}` : base;
}
