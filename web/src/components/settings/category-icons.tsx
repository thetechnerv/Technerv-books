import {
  AppWindow, Cloud, Smartphone, Megaphone, Utensils, Plane, Car, Paperclip, House, Scale, Users, Landmark, Shield, IdCard,
  BookOpen, Laptop, Armchair, Tag, BriefcaseBusiness, Repeat, Percent, Plus, type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import { IconTile } from '@/components/ui/group';

/**
 * Category icon names (stored in `categories.icon`) → lucide icons, plus a
 * default tile colour for each. Reuse these anywhere a category is shown.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  app: AppWindow,
  cloud: Cloud,
  phone: Smartphone,
  megaphone: Megaphone,
  fork: Utensils,
  plane: Plane,
  car: Car,
  paperclip: Paperclip,
  house: House,
  scale: Scale,
  people: Users,
  bank: Landmark,
  shield: Shield,
  id: IdCard,
  book: BookOpen,
  laptop: Laptop,
  chair: Armchair,
  tag: Tag,
  briefcase: BriefcaseBusiness,
  repeat: Repeat,
  percent: Percent,
  plus: Plus,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

export const CATEGORY_COLORS: Record<string, string> = {
  app: '#5E7CE2', cloud: '#0680A2', phone: '#05A38C', megaphone: '#D9467A', fork: '#E8833A', plane: '#0478A0',
  car: '#5E7CE2', paperclip: '#6B7B80', house: '#05A38C', scale: '#7C4DDB', people: '#0680A2', bank: '#5B6B70',
  shield: '#E0352B', id: '#E5A00D', book: '#7C4DDB', laptop: '#0C1113', chair: '#8A6A4F', tag: '#6B7B80',
  briefcase: '#05A38C', repeat: '#03BB90', percent: '#E5A00D', plus: '#6B7B80',
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Tag;
}

export function categoryColor(name: string | null | undefined, color?: string | null) {
  return color || (name && CATEGORY_COLORS[name]) || '#6B7B80';
}

/** Rounded tile with the category's icon, iOS Settings style. */
export function CategoryTile({ icon, color, size = 30 }: { icon: string | null | undefined; color?: string | null; size?: number }) {
  return (
    <IconTile color={categoryColor(icon, color)} size={size}>
      {createElement(categoryIcon(icon), { strokeWidth: 2.2 })}
    </IconTile>
  );
}
