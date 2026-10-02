const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "09-30" → "Sep 30" */
export function monthDayLabel(md: string) {
  const [m, d] = md.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

export function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 0.72 → "72¢" */
export function cents(v: number | string) {
  return `${Math.round(Number(v) * 1000) / 10}¢`;
}
