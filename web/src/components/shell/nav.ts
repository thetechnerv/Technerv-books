import {
  House, FileText, ClipboardList, HandCoins, Users, Receipt, Repeat, Car, Landmark, Inbox, Scale,
  Calculator, ChartColumn, FolderLock, Settings, Wand2, type LucideIcon,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: 'review' | 'overdue'; color: string };
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: null, items: [{ href: '/', label: 'Home', icon: House, color: '#0680A2' }] },
  { label: 'Money in', items: [
    { href: '/invoices', label: 'Invoices', icon: FileText, badge: 'overdue', color: '#05A38C' },
    { href: '/estimates', label: 'Estimates', icon: ClipboardList, color: '#7C4DDB' },
    { href: '/payments', label: 'Payments', icon: HandCoins, color: '#03BB90' },
    { href: '/clients', label: 'Clients', icon: Users, color: '#0680A2' },
  ] },
  { label: 'Money out', items: [
    { href: '/expenses', label: 'Expenses', icon: Receipt, color: '#E8833A' },
    { href: '/subscriptions', label: 'Subscriptions', icon: Repeat, color: '#D9467A' },
    { href: '/mileage', label: 'Mileage', icon: Car, color: '#5E7CE2' },
  ] },
  { label: 'Banking', items: [
    { href: '/banking', label: 'Accounts & imports', icon: Landmark, color: '#0680A2' },
    { href: '/banking/review', label: 'Review', icon: Inbox, badge: 'review', color: '#E5A00D' },
    { href: '/banking/rules', label: 'Rules', icon: Wand2, color: '#7C4DDB' },
  ] },
  { label: 'Owners', items: [{ href: '/balances', label: 'Owner balances', icon: Scale, color: '#05A38C' }] },
  { label: 'Tax & records', items: [
    { href: '/tax', label: 'Tax Centre', icon: Calculator, color: '#E0352B' },
    { href: '/reports', label: 'Reports', icon: ChartColumn, color: '#7C4DDB' },
    { href: '/documents', label: 'Documents', icon: FolderLock, color: '#5B6B70' },
  ] },
  { label: null, items: [{ href: '/settings', label: 'Settings', icon: Settings, color: '#6B7B80' }] },
];

export const ALL_NAV = NAV.flatMap((g) => g.items);

/** Longest matching nav prefix wins, so /banking/review highlights Review, not Banking. */
export function activeHref(pathname: string) {
  let best = '';
  for (const i of ALL_NAV) {
    const match = i.href === '/' ? pathname === '/' : pathname === i.href || pathname.startsWith(i.href + '/');
    if (match && i.href.length > best.length) best = i.href;
  }
  return best;
}
