'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField, useSettingsForm } from './settings-form';

/** CRA reasonable per-km allowance for 2026, provinces (territories add 4¢). */
export const CRA_RATES = { year: 2026, first: 0.73, after: 0.67, territoriesExtra: 0.04 };

export function MileageRates({ first, after }: { first: number; after: number }) {
  const ctx = useSettingsForm();
  const [a, setA] = useState(String(first));
  const [b, setB] = useState(String(after));
  const matches = Number(a) === CRA_RATES.first && Number(b) === CRA_RATES.after;
  return (
    <>
      <TextField name="mileage_rate" label="First 5,000 km" value={a} onChange={(e) => setA(e.target.value)} inputMode="decimal" align="right" trailing="$/km" />
      <TextField name="mileage_rate_after_5000" label="After 5,000 km" value={b} onChange={(e) => setB(e.target.value)} inputMode="decimal" align="right" trailing="$/km" />
      <div className="flex items-center gap-3 px-4 py-3 lg:px-3">
        <p className="flex-1 text-footnote text-label-2">
          CRA {CRA_RATES.year}: <span className="tabular font-medium text-label">{CRA_RATES.first * 100}¢</span> for the first 5,000 km,
          {' '}<span className="tabular font-medium text-label">{CRA_RATES.after * 100}¢</span> after.
        </p>
        <Button
          type="button"
          size="sm"
          variant={matches ? 'gray' : 'tinted'}
          disabled={matches}
          onClick={() => { setA(String(CRA_RATES.first)); setB(String(CRA_RATES.after)); requestAnimationFrame(() => ctx?.markDirty()); }}
        >
          {matches ? 'Using CRA rates' : `Use ${CRA_RATES.year} rates`}
        </Button>
      </div>
    </>
  );
}
