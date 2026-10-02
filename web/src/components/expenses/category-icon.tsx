import {
  AppWindow, Cloud, Smartphone, Megaphone, UtensilsCrossed, Plane, Car, Paperclip, House, Scale, Users, Landmark,
  Shield, IdCard, BookOpen, Laptop, Armchair, Tag, Briefcase, Repeat, Percent, Plus, Receipt, type LucideIcon,
} from 'lucide-react';
import { IconTile } from '@/components/ui/group';

/** `categories.icon` names → lucide icon + tile tint (iOS Settings-style palette). */
const ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  app: { icon: AppWindow, color: '#5E7CE2' },
  cloud: { icon: Cloud, color: '#0680A2' },
  phone: { icon: Smartphone, color: '#05A38C' },
  megaphone: { icon: Megaphone, color: '#D9467A' },
  fork: { icon: UtensilsCrossed, color: '#E8833A' },
  plane: { icon: Plane, color: '#2F8FD8' },
  car: { icon: Car, color: '#5B6B70' },
  paperclip: { icon: Paperclip, color: '#8A7A3E' },
  house: { icon: House, color: '#C9772E' },
  scale: { icon: Scale, color: '#7C4DDB' },
  people: { icon: Users, color: '#0E9F6E' },
  bank: { icon: Landmark, color: '#3F6E86' },
  shield: { icon: Shield, color: '#4A7BD0' },
  id: { icon: IdCard, color: '#9B59B6' },
  book: { icon: BookOpen, color: '#B5651D' },
  laptop: { icon: Laptop, color: '#42505A' },
  chair: { icon: Armchair, color: '#8D6E63' },
  tag: { icon: Tag, color: '#7A868B' },
  briefcase: { icon: Briefcase, color: '#05A38C' },
  repeat: { icon: Repeat, color: '#05A38C' },
  percent: { icon: Percent, color: '#05A38C' },
  plus: { icon: Plus, color: '#05A38C' },
};
const FALLBACK = { icon: Receipt, color: '#7A868B' };

export function categoryVisual(name: string | null | undefined) {
  return (name && ICONS[name]) || FALLBACK;
}

export function CategoryTile({ icon, size = 30 }: { icon: string | null | undefined; size?: number }) {
  const v = categoryVisual(icon);
  const I = v.icon;
  return (
    <IconTile color={v.color} size={size}>
      <I strokeWidth={2.1} />
    </IconTile>
  );
}
