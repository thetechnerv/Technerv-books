/**
 * CRA rules the Tax Centre relies on, in one place so they're easy to review
 * and update each year. Sources are listed next to each constant.
 * Everything here is guidance for preparing the books — confirm with your accountant.
 */

/**
 * Annual filers pay quarterly instalments (one month after each fiscal quarter)
 * unless net tax for the current or the previous year is under $3,000.
 * https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/pay-instalment/need-to-pay-by-instalments.html
 */
export const INSTALMENT_THRESHOLD = 3000;

/**
 * ITC documentation tiers (Input Tax Credit Information (GST/HST) Regulations;
 * thresholds raised from $30/$150 to $100/$500 in 2021). The threshold is the
 * total paid or payable for the supply, tax included.
 * https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html
 */
export const ITC_TIERS = [
  { key: 'under100', label: 'Under $100', need: 'Supplier (or intermediary) name, invoice date and total paid.' },
  { key: '100to500', label: '$100 – $499.99', need: 'Also the supplier\u2019s GST/HST registration number and the tax charged (or a note that tax is included, with the rate).' },
  { key: 'over500', label: '$500 or more', need: 'Also your company name, the terms of payment and a description of what was bought.' },
] as const;
export type ItcTierKey = (typeof ITC_TIERS)[number]['key'];
export function itcTier(totalCad: number): ItcTierKey {
  return totalCad < 100 ? 'under100' : totalCad < 500 ? '100to500' : 'over500';
}

/**
 * Quick method remittance rates — services, permanent establishment in a
 * non-participating province (BC). Applied to GST/HST-included eligible
 * supplies; 1% credit on the first $30,000 (claimed on line 107).
 * Zero-rated exports are left out. ITCs only on capital property.
 * https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/rc4058/quick-method-accounting-gst-hst.html
 */
export const QUICK_METHOD = {
  rates: { GST: 0.036, 'HST-ON': 0.105, 'HST-NS': 0.113, 'HST-NB': 0.12, 'HST-NL': 0.12, 'HST-PE': 0.12 } as Record<string, number>,
  creditRate: 0.01,
  creditBase: 30000,
  eligibilityLimit: 400000,
};

/** Capital cost allowance rates (declining balance). Class 8 = 20%, class 50 = 55%. */
export const CCA_RATES: Record<string, number> = { '50': 0.55, '8': 0.2, '10': 0.3, '12': 1, '44': 0.25, '46': 0.3, '14.1': 0.05 };

/**
 * Share of an addition's cost deductible in the year it becomes available for
 * use (purchase date is used as a stand-in). Enacted rules as of Oct 2026:
 *  · Classes 44/46/50 acquired Apr 16 2024 or later, in use before 2027 → 100% immediate expensing (Budget 2024, Bill C-15).
 *  · Acquired after 2024, in use before 2030 → reinstated Accelerated Investment Incentive: 1.5 × rate (Budget 2025, Bill C-15).
 *  · In use Nov 21 2018 – 2023 → AII 1.5 × rate; in use 2024 → AII phase-out 1.0 × rate.
 *  · Otherwise the half-year rule: 0.5 × rate.
 * Not applied: the proposed "Productivity Mega Deduction" (100% for property acquired on/after Sep 15 2026, draft legislation only).
 */
export function ccaFirstYear(date: string, ccaClass: string): { share: number; label: string; proposed?: string } {
  const rate = CCA_RATES[ccaClass] ?? 0;
  const proposed = date >= '2026-09-15' && !['1', '3', '14', '14.1', '51'].includes(ccaClass) ? 'Proposed 100% write-off (acquired on/after Sep 15 2026) — not yet law' : undefined;
  if (['44', '46', '50'].includes(ccaClass) && date >= '2024-04-16' && date < '2027-01-01') return { share: 1, label: 'Immediate expensing (100%)', proposed };
  if (date >= '2025-01-01' && date < '2030-01-01') return { share: Math.min(1, rate * 1.5), label: 'Accelerated investment incentive (1.5\u00d7)', proposed };
  if (date >= '2018-11-21' && date < '2024-01-01') return { share: Math.min(1, rate * 1.5), label: 'Accelerated investment incentive (1.5\u00d7)' };
  if (date >= '2024-01-01' && date < '2025-01-01') return { share: rate, label: 'AII phase-out (1.0\u00d7)' };
  return { share: rate * 0.5, label: 'Half-year rule', proposed };
}

/** Tax year can't exceed 53 weeks (ITA s.249.1). */
export const MAX_TAX_YEAR_DAYS = 371;

/** Combined federal (9%) + BC (2%) small-business rate on the first $500,000 of active business income. */
export const SMALL_BUSINESS_RATE_BC = 0.11;

/** GIFI (Schedule 125) names for the codes the categories use. */
export const GIFI_NAMES: Record<string, string> = {
  '8000': 'Trade sales of goods and services',
  '8090': 'Investment revenue',
  '8230': 'Other revenue',
  '8299': 'Total revenue',
  '8520': 'Advertising and promotion',
  '8523': 'Meals and entertainment',
  '8670': 'Amortization of tangible assets',
  '8690': 'Insurance',
  '8710': 'Interest and bank charges',
  '8760': 'Business taxes, licences and memberships',
  '8810': 'Office expenses',
  '8811': 'Office stationery and supplies',
  '8860': 'Professional fees',
  '8871': 'Management and administration fees',
  '8910': 'Rental',
  '9150': 'Computer-related expenses',
  '9200': 'Travel expenses',
  '9225': 'Telephone and telecommunications',
  '9270': 'Other expenses',
  '9281': 'Vehicle expenses',
  '9367': 'Total operating expenses',
  '9368': 'Total expenses',
  '9970': 'Net income/loss before taxes and extraordinary items',
  '1774': 'Computer equipment/software',
  '1787': 'Furniture and fixtures',
};

/** Due dates for an annual GST/HST filer (non-individual): 3 months after year-end. */
export function gstDueDate(periodEnd: string) {
  const [y, m] = periodEnd.split('-').map(Number);
  const due = new Date(Date.UTC(y!, m! + 3, 0)); // last day of the 3rd following month
  return due.toISOString().slice(0, 10);
}
