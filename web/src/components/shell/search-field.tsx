'use client';
import { Search } from 'lucide-react';

/** A tappable search field that opens the global search palette. */
export function SearchField({ placeholder = 'Search invoices, expenses, clients…' }: { placeholder?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('open-search'))}
      className="mb-6 flex h-10 w-full items-center gap-2 rounded-[11px] bg-fill px-3 text-left text-body text-label-3"
    >
      <Search className="size-[18px]" />
      {placeholder}
    </button>
  );
}
