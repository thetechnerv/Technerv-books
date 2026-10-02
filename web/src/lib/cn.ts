import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our custom type scale so `text-subhead` and `text-red`
// aren't treated as conflicting (one is size, the other colour).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['large', 'title1', 'title2', 'title3', 'headline', 'body', 'callout', 'subhead', 'footnote', 'caption', 'caption2'] }],
    },
  },
});

/** Join class names; later Tailwind utilities override earlier conflicting ones. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return twMerge(parts.filter(Boolean).join(' '));
}
