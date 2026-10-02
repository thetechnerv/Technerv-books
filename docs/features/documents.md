# Documents vault

[← Docs index](../README.md) · Related: [Files & storage](../files-and-storage.md) · [Tax Centre](tax-centre.md)

**Route** `/documents` (`?id=` opens a document; `?q=`, year and type filters) · **Files** `web/src/app/(app)/documents/**`, `web/src/components/documents/*`
**Data** `documents` (+ `account_id`, `period_start/end` for statements), `attachments` (entity_type `document`)

- Grouped by fiscal year then type: corporate, gst_return, t2_return, notice_of_assessment, contract, insurance, statement, other.
- Upload sheet (title, type, fiscal year, issued, expires, notes, files via `uploadAttachment`).
- Detail sheet with preview/download/delete (`<Attachments entity="document">`).
- **Expiring soon** (60 days) section.
- **Statements tracker**: accounts × months for the selected FY; "+" pre-fills an upload for that account/month.
- Filed returns from the Tax Centre land here.
