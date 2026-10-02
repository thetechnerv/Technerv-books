# Tax rules & assumptions

[← Docs index](README.md) · Related: [Tax Centre](features/tax-centre.md) · [Expenses](features/expenses.md)

The app encodes Canadian small-business rules as of **2026**. It is a bookkeeping aid, not tax
advice; items marked ⚠︎ are flagged in the UI for the accountant to confirm.

## Company profile assumptions

- Canadian-controlled private corporation (CCPC) in **British Columbia**.
- GST/HST registrant, **regular method** (quick method supported by a toggle), **annual** filer.
- Fiscal year-end **Sept 30** (the owner said "I think" — changeable in Settings → Tax).
- A tax year can't exceed 53 weeks, so the sample company has a short first year (Aug 15 – Sep 30 2024).

## Sales tax on invoices (place of supply for services)

| Client location | Default tax | Code |
|---|---|---|
| BC, AB, SK, MB, QC, territories | GST 5% | `GST` |
| Ontario | HST 13% | `HST-ON` |
| Nova Scotia | HST 14% | `HST-NS` |
| New Brunswick, Newfoundland, PEI | HST 15% | `HST-NB/NL/PE` |
| Outside Canada | Zero-rated export of services | `ZERO` |

⚠︎ BC PST and Quebec QST are assumed not to apply to these consulting/software services.
A discount reduces the taxable amount before tax is calculated.

## Input tax credits (ITCs)

- ITC = GST/HST paid × business share. Personal items get none.
- Meals & entertainment: **50%** deductible and 50% of the ITC (`categories.deductible_pct`).
- PST is not recoverable (it's part of the cost).
- Documentation tiers flagged in the GST worksheet: under $100, $100–$499.99, $500+ (supplier name,
  GST/HST number, etc.).
- ⚠︎ GST charged by foreign digital vendors (OpenAI, Anthropic) may not be claimable if they're
  registered under the simplified regime — the worksheet has an include/exclude switch.

## GST34 return (annual, regular method)

Computed on the **accrual basis** for the fiscal year: 101 = sales and other revenue (net of tax,
credit notes negative, CAD at each document's FX), 103 = tax charged on invoices issued in the
period, 106 = sum of `itc_cad` for expenses dated in the period; 105/108/109/112/113A–C by CRA
formulas; 104/107/110/111 entered by hand. Due **3 months after year-end** (Dec 31). Quarterly
instalments are required for the next year when net tax is ≥ $3,000 (CRA exempts you if either
the current or previous year is below $3,000).

Quick method (if enabled): BC remittance rates 3.6% (GST 5% sales), 10.5% (HST 13%), 11.3% (HST 14%)
on tax-included sales, 1% credit on the first $30,000, only capital ITCs claimed. ⚠︎ confirm.

## Corporate income tax (T2 estimate)

- Income statement grouped by **GIFI** codes (`categories.gifi_code`; revenue → 8299, expenses → 9368,
  net income → 9970). ⚠︎ Mapping to be confirmed, e.g. Subcontractors on 8871.
- Non-deductible add-backs: 50% of meals, personal portions.
- ⚠︎ Estimated tax at the **11%** combined small-business rate (9% federal + 2% BC).
- T2 due 6 months after year-end (Mar 31); balance payable 3 months after (Dec 31) for a CCPC.
- **CCA**: class 50 (computers) bought after Apr 16 2024 and available for use before 2027 —
  100% immediate expensing; other classes get the 1.5× accelerated first-year rate. Purchase date
  stands in for available-for-use date. The proposed Sept 2026 "productivity" 100% deduction is not law
  and not applied.

## Shareholder loans (s.15(2))

Personal amounts paid with company money become a loan to the owner. It must be repaid by the
**end of the fiscal year after the one in which it arose** (e.g. a loan from FY2026 → repay by
Sept 30 2027), or it becomes the owner's income. `shareholder_loan_repay_by()` computes the date;
Owner balances warns `shareholder_loan_alert_days` (default 300) before it.

## Mileage

CRA reasonable allowance **2026**: 73¢/km for the first 5,000 km per person per calendar year,
67¢ after (2025: 72¢ / 66¢). The rate is stored on each trip when saved.

## Sources

- GST34 lines — canada.ca/…/gst-hst-businesses/complete-file-return-business/calculate-net-tax.html
- ITC documentation — canada.ca/…/gst-hst-businesses/calculate-prepare-report/input-tax-credit.html
- Instalments — canada.ca/…/gst-hst-businesses/pay-instalment/need-to-pay-by-instalments.html
- Quick method (RC4058) — canada.ca/…/publications/rc4058/quick-method-accounting-gst-hst.html
- T2 balance due — canada.ca/…/corporations/corporation-payments/paying-your-balance-corporation-tax/balance-day.html
- CCA classes — canada.ca/…/claiming-capital-cost-allowance/classes-depreciable-property.html
- GIFI (RC4088) — canada.ca/…/publications/rc4088/general-index-financial-information-gifi.html
- 2026 automobile rates — canada.ca/en/department-finance/news/2026/01/…expense-benefit-rates-for-businesses.html
