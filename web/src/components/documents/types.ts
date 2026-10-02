/** Vault document types (matches the documents_doc_type_check constraint). */
export const DOC_TYPES = [
  { value: 'corporate', label: 'Corporate', plural: 'Corporate records', color: '#0680A2' },
  { value: 'gst_return', label: 'GST/HST return', plural: 'GST/HST', color: '#E0352B' },
  { value: 't2_return', label: 'T2 return', plural: 'T2 returns', color: '#7C4DDB' },
  { value: 'notice_of_assessment', label: 'Notice of assessment', plural: 'Notices of assessment', color: '#D9467A' },
  { value: 'contract', label: 'Contract', plural: 'Contracts', color: '#05A38C' },
  { value: 'insurance', label: 'Insurance', plural: 'Insurance', color: '#E5A00D' },
  { value: 'statement', label: 'Statement', plural: 'Bank & card statements', color: '#5E7CE2' },
  { value: 'other', label: 'Other', plural: 'Other', color: '#6B7B80' },
] as const;
export type DocType = (typeof DOC_TYPES)[number]['value'];
export const DOC_TYPE = Object.fromEntries(DOC_TYPES.map((t) => [t.value, t])) as Record<string, (typeof DOC_TYPES)[number]>;

/** Expiring-soon window for contracts, policies and registrations. */
export const EXPIRING_DAYS = 60;
