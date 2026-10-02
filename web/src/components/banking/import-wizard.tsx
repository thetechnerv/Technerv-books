'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import Papa from 'papaparse';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Check, CheckCircle2, ChevronLeft, FileSpreadsheet, FileUp, Info, Upload } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Button } from '@/components/ui/button';
import { Select, Toggle } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/segmented';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import { bytes, date as fmtDate, money, plural } from '@/lib/format';
import { checkImport, commitImport, type CheckResult, type CommitResult, type ImportRow } from '@/app/(app)/banking/import/actions';
import { AccountTile, SignedAmount } from './bits';
import {
  DATE_FORMATS, PRESETS, detectDateFormat, detectMapping, looksLikeOfx, mapRows, parseOfx, validateMapping,
  type CsvMapping, type ParsedRow, type PresetId, type RowError,
} from './csv';

export type ImportAccount = { id: string; name: string; kind: string; currency: string; color: string | null; mapping: CsvMapping | null; lastTo: string | null };

type Parsed = { fileName: string; size: number; text: string; format: 'csv' | 'ofx'; headers: string[]; records: Record<string, string>[]; ofx?: ReturnType<typeof parseOfx> };
type Step = 'start' | 'map' | 'check' | 'done';

const SPRING = { type: 'spring' as const, bounce: 0, duration: 0.35 };

export function ImportWizard({ accounts, initialAccount }: { accounts: ImportAccount[]; initialAccount: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [accountId, setAccountId] = useState(initialAccount ?? (accounts.length === 1 ? accounts[0]!.id : ''));
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const [step, setStep] = useState<Step>('start');
  const [file, setFile] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [saveMapping, setSaveMapping] = useState(true);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const mapped = useMemo<{ rows: ParsedRow[]; errors: RowError[] }>(() => {
    if (!file) return { rows: [], errors: [] };
    if (file.format === 'ofx') return { rows: file.ofx!.rows, errors: file.ofx!.errors };
    if (!mapping) return { rows: [], errors: [] };
    return mapRows(file.records, mapping);
  }, [file, mapping]);
  const mappingError = file?.format === 'csv' && mapping ? validateMapping(mapping) : null;

  async function readFile(f: File) {
    setReadError(null);
    if (f.size > 15 * 1024 * 1024) return setReadError('That file is larger than 15 MB. Export a shorter date range.');
    const text = (await f.text()).replace(/^﻿/, '');
    if (looksLikeOfx(text) || /\.(ofx|qfx)$/i.test(f.name)) {
      const ofx = parseOfx(text);
      if (!ofx.rows.length) return setReadError('No transactions found in this OFX/QFX file.');
      setFile({ fileName: f.name, size: f.size, text, format: 'ofx', headers: [], records: [], ofx });
      setMapping(null);
      setStep('map');
      return;
    }
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim() });
    const headers = (res.meta.fields ?? []).filter(Boolean);
    if (headers.length < 2 || !res.data.length) return setReadError('This doesn’t look like a bank CSV — it needs a header row and at least one transaction.');
    const records = res.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : ''])));
    const samples = (h: string) => records.slice(0, 60).map((r) => r[h] ?? '');
    const saved = account?.mapping && headers.includes(account.mapping.date) && headers.includes(account.mapping.description) ? normalisePreset(account.mapping) : null;
    let m = saved ?? detectMapping(headers, samples);
    if (saved) m = { ...m, dateFormat: detectDateFormat(samples(m.date)) || m.dateFormat };
    // Card files with one Amount column often list purchases as positive.
    if (!saved && account?.kind === 'credit_card' && m.amount && !m.debit) {
      const vals = mapRows(records, m).rows;
      if (vals.length && vals.filter((r) => r.amount > 0).length / vals.length > 0.6) m = { ...m, invert: true };
    }
    setFile({ fileName: f.name, size: f.size, text, format: 'csv', headers, records });
    setMapping(m);
    setStep('map');
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void readFile(f);
  }
  function onDrop(e: DragEvent) {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void readFile(f);
  }

  const rowsForServer = (): ImportRow[] => mapped.rows.map((r) => ({ posted_on: r.posted_on, description: r.description, amount: r.amount, balance: r.balance, external_id: r.external_id ?? null }));

  async function runCheck() {
    if (!account) return toast({ title: 'Choose the account this statement is for.', tone: 'error' });
    if (!mapped.rows.length) return toast({ title: 'No rows could be read with these columns.', tone: 'error' });
    setBusy(true);
    const res = await checkImport(account.id, rowsForServer());
    setBusy(false);
    if (!res.ok) return toast({ title: res.error, tone: 'error' });
    setCheck(res.data!);
    setStep('check');
  }

  async function runImport() {
    if (!account || !file) return;
    setBusy(true);
    const res = await commitImport({ accountId: account.id, fileName: file.fileName, format: file.format, rows: rowsForServer(), mapping, saveMapping });
    if (!res.ok) { setBusy(false); return toast({ title: res.error, tone: 'error' }); }
    // Keep the original file with the import (gzipped on the server).
    try {
      const up = await fetch(`/api/banking/imports/${res.data!.batchId}`, { method: 'POST', body: file.text, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      if (!up.ok) toast({ title: 'Imported, but the original file couldn’t be saved.', tone: 'info' });
    } catch { toast({ title: 'Imported, but the original file couldn’t be saved.', tone: 'info' }); }
    setBusy(false);
    setResult(res.data!);
    setStep('done');
    router.refresh();
  }

  function restart() {
    setFile(null); setMapping(null); setCheck(null); setResult(null); setStep('start');
  }

  const dateRange = mapped.rows.length
    ? (() => { const ds = mapped.rows.map((r) => r.posted_on).sort(); return `${fmtDate(ds[0], 'MMM d')} – ${fmtDate(ds[ds.length - 1], 'MMM d, yyyy')}`; })()
    : '';

  return (
    <div className="mx-auto max-w-[760px]">
      <Steps step={step} />
      <AnimatePresence mode="wait" initial={false}>
        {step === 'start' && (
          <motion.div key="start" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={SPRING}>
            <Section title="Account" inset={58}>
              {accounts.map((a) => (
                <Row key={a.id} onClick={() => setAccountId(a.id)} icon={<AccountTile kind={a.kind} color={a.color} />} title={a.name}
                  subtitle={a.lastTo ? `Imported up to ${fmtDate(a.lastTo, 'MMM d, yyyy')}` : 'Nothing imported yet'}>
                  {a.id === accountId ? <Check className="size-5 shrink-0 text-accent-text" strokeWidth={2.6} /> : <span className="size-5" />}
                </Row>
              ))}
            </Section>

            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
              className={cn('pressable mb-4 flex cursor-pointer flex-col items-center rounded-group border-2 border-dashed px-6 py-10 text-center transition-colors',
                drag ? 'border-accent bg-accent-soft' : 'border-separator-strong bg-cell', !account && 'pointer-events-none opacity-50')}
            >
              <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-text"><FileUp className="size-7" /></span>
              <span className="text-headline font-semibold">Choose statement file</span>
              <span className="mt-1 text-subhead text-label-2">CSV from EQ Bank or your card · OFX/QFX also works</span>
              <span className="mt-0.5 hidden text-footnote text-label-3 lg:block">or drop it here</span>
              <input ref={input} type="file" className="sr-only" disabled={!account}
                accept=".csv,.txt,.ofx,.qfx,text/csv,text/comma-separated-values,text/plain,application/vnd.ms-excel,application/x-ofx" onChange={onPick} />
            </label>
            {readError && <p role="alert" className="mb-4 rounded-md bg-red-soft px-3 py-2 text-footnote text-red">{readError}</p>}
            <p className="px-1 text-footnote text-label-3">
              <Info className="mr-1 inline size-3.5 align-[-2px]" />
              EQ Bank: sign in on the web, open the account, tap the download icon and pick CSV. On iPhone, the file lands in Files → Downloads.
            </p>
          </motion.div>
        )}

        {step === 'map' && file && (
          <motion.div key="map" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={SPRING}>
            <FileBadge file={file} account={account} onChange={restart} />
            {file.format === 'csv' && mapping && (
              <>
                <Section title="Layout">
                  <div className="p-2"><Segmented full options={PRESETS.map((p) => ({ value: p.id, label: p.label }))} value={mapping.preset as PresetId} onChange={(v) => setMapping(applyPreset(mapping, v, file.headers))} /></div>
                  <p className="px-4 pb-3 text-footnote text-label-2 lg:px-3">{PRESETS.find((p) => p.id === mapping.preset)?.hint}</p>
                </Section>
                <Section title="Columns" footer={mappingError ?? (mapped.errors.length ? `${plural(mapped.errors.length, 'row')} can’t be read: ${mapped.errors[0]!.message} (row ${mapped.errors[0]!.line})${mapped.errors.length > 1 ? ' …' : ''}` : `${plural(mapped.rows.length, 'transaction')} · ${dateRange}`)}>
                  <ColumnSelect label="Date" value={mapping.date} headers={file.headers} onChange={(v) => setMapping({ ...mapping, date: v, dateFormat: detectDateFormat(file.records.slice(0, 60).map((r) => r[v] ?? '')) })} />
                  <Select label="Date format" name="dateFormat" value={mapping.dateFormat} options={DATE_FORMATS} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value })} />
                  <ColumnSelect label="Description" value={mapping.description} headers={file.headers} onChange={(v) => setMapping({ ...mapping, description: v })} />
                  {mapping.preset === 'debit_credit' || (mapping.preset === 'custom' && !mapping.amount) ? (
                    <>
                      <ColumnSelect label="Money out" value={mapping.debit ?? ''} headers={file.headers} optional onChange={(v) => setMapping({ ...mapping, debit: v || null })} />
                      <ColumnSelect label="Money in" value={mapping.credit ?? ''} headers={file.headers} optional onChange={(v) => setMapping({ ...mapping, credit: v || null })} />
                    </>
                  ) : (
                    <ColumnSelect label="Amount" value={mapping.amount ?? ''} headers={file.headers} optional={mapping.preset === 'custom'} onChange={(v) => setMapping({ ...mapping, amount: v || null })} />
                  )}
                  <ColumnSelect label="Balance" value={mapping.balance ?? ''} headers={file.headers} optional onChange={(v) => setMapping({ ...mapping, balance: v || null })} />
                  {mapping.preset === 'custom' && <ColumnSelect label="Extra detail" value={mapping.memo ?? ''} headers={file.headers} optional onChange={(v) => setMapping({ ...mapping, memo: v || null })} />}
                  {mapping.amount && mapping.preset !== 'debit_credit' && (
                    <Toggle label={account?.kind === 'credit_card' ? 'Purchases show as positive' : 'Flip signs'} hint="Turn on if money out appears without a minus sign" checked={!!mapping.invert} onChange={(v) => setMapping({ ...mapping, invert: v })} />
                  )}
                </Section>
              </>
            )}
            {file.format === 'ofx' && (
              <Section footer={`${plural(mapped.rows.length, 'transaction')} · ${dateRange}${file.ofx?.currency && account && file.ofx.currency !== account.currency ? ` · file is in ${file.ofx.currency}, account is ${account.currency}` : ''}`}>
                <Row title="Format" value="OFX / QFX" />
              </Section>
            )}

            <Preview rows={mapped.rows.slice(0, 8)} currency={account?.currency ?? 'CAD'} card={account?.kind === 'credit_card'} />

            <BottomBar>
              <Button variant="gray" size="lg" onClick={restart} icon={<ChevronLeft className="size-4" />}>Back</Button>
              <Button variant="filled" size="lg" block loading={busy} disabled={!!mappingError || !mapped.rows.length || !account} onClick={runCheck}>
                Check {mapped.rows.length ? plural(mapped.rows.length, 'row') : 'rows'}
              </Button>
            </BottomBar>
          </motion.div>
        )}

        {step === 'check' && file && check && account && (
          <motion.div key="check" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={SPRING}>
            <div className="mb-6 rounded-group bg-cell p-5 text-center shadow-card">
              <p className="tabular text-title1 font-bold">
                {check.newCount} new<span className="text-label-3"> · </span><span className={check.duplicateCount ? 'text-label-2' : 'text-label-3'}>{check.duplicateCount} duplicate{check.duplicateCount === 1 ? '' : 's'} skipped</span>
              </p>
              <p className="mt-1 text-subhead text-label-2">{account.name} · {dateRange}</p>
              {check.batches.length > 0 && (
                <p className="mt-3 inline-flex items-start gap-1.5 rounded-md bg-orange-soft px-3 py-2 text-left text-footnote text-label">
                  <AlertTriangle className="mt-px size-4 shrink-0 text-orange" />
                  <span>Overlaps {check.batches.length === 1 ? `the earlier import “${check.batches[0]!.fileName}”` : `${check.batches.length} earlier imports`}. Rows already there are skipped; new rows inside that period are marked.</span>
                </p>
              )}
            </div>

            {check.newCount === 0 ? (
              <div className="mb-6 text-center text-subhead text-label-2">Everything in this file is already imported. Nothing to do.</div>
            ) : null}

            <Section title="Transactions" inset={16}>
              <div className="max-h-[50dvh] overflow-y-auto group-rows lg:max-h-[420px]">
                {mapped.rows.map((r, i) => {
                  const dup = check.status[i] === 'duplicate';
                  return (
                    <div key={i} className={cn('flex min-h-[var(--row-h)] items-center gap-3 px-4 lg:px-3', dup && 'opacity-45')}>
                      <span className="tabular w-14 shrink-0 text-footnote text-label-2">{fmtDate(r.posted_on, 'MMM d')}</span>
                      <span className={cn('min-w-0 flex-1 truncate py-2', dup && 'line-through decoration-label-3')}>{r.description}</span>
                      {dup ? <Badge>Duplicate</Badge> : check.overlaps[i] ? <Badge tone="orange">In earlier period</Badge> : null}
                      <SignedAmount value={r.amount} currency={account.currency} className="text-subhead" />
                    </div>
                  );
                })}
              </div>
            </Section>

            {file.format === 'csv' && (
              <Section>
                <Toggle label={`Remember these columns for ${account.name}`} hint="Next import from this account skips the column step" checked={saveMapping} onChange={setSaveMapping} />
              </Section>
            )}

            <BottomBar>
              <Button variant="gray" size="lg" onClick={() => setStep('map')} icon={<ChevronLeft className="size-4" />}>Back</Button>
              <Button variant="filled" size="lg" block loading={busy} disabled={check.newCount === 0} onClick={runImport} icon={<Upload className="size-4" />}>
                Import {plural(check.newCount, 'transaction')}
              </Button>
            </BottomBar>
          </motion.div>
        )}

        {step === 'done' && result && account && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }} className="flex flex-col items-center py-10 text-center">
            <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.25, duration: 0.6 }} className="mb-5 flex size-20 items-center justify-center rounded-full bg-accent-soft text-accent-text">
              <CheckCircle2 className="size-10" strokeWidth={1.8} />
            </motion.span>
            <h2 className="text-title2 font-bold">Imported {plural(result.imported, 'transaction')}</h2>
            <p className="mt-1.5 max-w-md text-subhead text-label-2">
              {[result.matched && `${result.matched} matched automatically`, result.withRule && `${result.withRule} with rule suggestions`, result.duplicates && `${plural(result.duplicates, 'duplicate')} skipped`].filter(Boolean).join(' · ') || account.name}
            </p>
            <div className="mt-7 flex w-full max-w-sm flex-col gap-2">
              {result.toReview > 0 && <Button href={`/banking/review?account=${account.id}`} variant="filled" size="lg" block>Review {plural(result.toReview, 'transaction')}</Button>}
              <Button href={`/banking/${account.id}`} variant="gray" size="lg" block>View {account.name}</Button>
              <Button variant="plain" onClick={restart}>Import another file</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function normalisePreset(m: CsvMapping): CsvMapping {
  return m.preset === 'generic_card' ? { ...m, preset: 'debit_credit' } : m;
}

function applyPreset(m: CsvMapping, preset: PresetId, headers: string[]): CsvMapping {
  const guess = detectMapping(headers, () => []);
  if (preset === 'debit_credit') return { ...m, preset, amount: null, debit: m.debit ?? guess.debit ?? findLike(headers, /debit|withdraw|out/i), credit: m.credit ?? guess.credit ?? findLike(headers, /credit|deposit|in\b/i), invert: false };
  if (preset === 'eq_bank' || preset === 'signed_amount') return { ...m, preset, debit: null, credit: null, amount: m.amount ?? guess.amount ?? findLike(headers, /amount/i) };
  return { ...m, preset };
}
const findLike = (headers: string[], re: RegExp) => headers.find((h) => re.test(h)) ?? null;

function ColumnSelect({ label, value, headers, onChange, optional }: { label: string; value: string; headers: string[]; onChange: (v: string) => void; optional?: boolean }) {
  return <Select label={label} name={label} value={value} placeholder={optional ? 'None' : 'Choose…'} options={headers.map((h) => ({ value: h, label: h }))} onChange={(e) => onChange(e.target.value)} />;
}

function FileBadge({ file, account, onChange }: { file: Parsed; account: ImportAccount | null; onChange: () => void }) {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-group bg-cell p-3.5 shadow-card">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-text"><FileSpreadsheet className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{file.fileName}</p>
        <p className="truncate text-footnote text-label-2">{bytes(file.size)} · into {account?.name ?? '—'}</p>
      </div>
      <Button size="sm" variant="plain" onClick={onChange}>Change</Button>
    </div>
  );
}

function Preview({ rows, currency, card }: { rows: ParsedRow[]; currency: string; card: boolean }) {
  if (!rows.length) return null;
  return (
    <Section title="Preview" footer={card ? 'Purchases should show as money out (−) and payments to the card as money in (+).' : 'Money in shows with +, money out with −.'}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-subhead">
          <thead className="text-footnote text-label-2">
            <tr className="hairline-b"><th className="px-4 py-2 font-medium lg:px-3">Date</th><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Amount</th><th className="px-4 py-2 text-right font-medium lg:px-3">Balance</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.line} className="hairline-b last:shadow-none">
                <td className="tabular whitespace-nowrap px-4 py-2 text-label-2 lg:px-3">{fmtDate(r.posted_on, 'MMM d, yyyy')}</td>
                <td className="max-w-[40vw] truncate py-2 pr-2 lg:max-w-[320px]">{r.description}</td>
                <td className="py-2 text-right"><SignedAmount value={r.amount} currency={currency} /></td>
                <td className="tabular whitespace-nowrap px-4 py-2 text-right text-label-3 lg:px-3">{r.balance === null ? '—' : money(r.balance, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+20px)] z-10 -mx-1 mt-2 flex gap-2 rounded-[18px] bg-[var(--material-thick)] p-1 shadow-bar backdrop-blur-[30px] backdrop-saturate-[1.8] lg:static lg:mx-0 lg:justify-end lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none lg:[&>*:last-child]:w-auto">
      {children}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [{ id: 'start', label: 'File' }, { id: 'map', label: 'Columns' }, { id: 'check', label: 'Check' }, { id: 'done', label: 'Done' }];
  const at = steps.findIndex((s) => s.id === step);
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Import steps">
      {steps.map((s, i) => (
        <li key={s.id} className="flex flex-1 flex-col gap-1.5" aria-current={i === at ? 'step' : undefined}>
          <span className={cn('h-1 rounded-full transition-colors duration-300', i <= at ? 'bg-accent' : 'bg-fill')} />
          <span className={cn('text-caption font-medium', i === at ? 'text-label' : 'text-label-3')}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

