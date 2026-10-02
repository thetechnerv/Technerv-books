'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import type { ActionResult, Insert } from '@/lib/types';
import { taxTreatment } from '@/components/clients/tax';
import {
  validateClient, validateProject, splitEmails, normalizePostal, type ClientInput, type ProjectInput,
} from '@/components/clients/validate';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blank = (s: string | null | undefined) => (s ?? '').trim() || null;
const firstError = (e: Record<string, string | undefined>) => Object.values(e).find(Boolean);

async function clientRow(input: ClientInput): Promise<ActionResult<Insert<'clients'>>> {
  const v = { ...input, country: (input.country || 'CA').toUpperCase(), province: (input.province || '').toUpperCase() };
  const err = firstError(validateClient(v));
  if (err) return { ok: false, error: err };
  const supabase = await db();
  let taxId = v.default_tax_rate_id || null;
  if (taxId && !UUID.test(taxId)) return { ok: false, error: 'Unknown tax rate.' };
  if (!taxId) {
    // Automatic: store the rate the place of supply implies so invoices pick it up.
    const { data } = await supabase.from('tax_rates').select('id').eq('code', taxTreatment(v.country, v.province).code).maybeSingle();
    taxId = data?.id ?? null;
  }
  return {
    ok: true,
    data: {
      display_name: v.display_name.trim(),
      company_name: blank(v.company_name),
      contact_name: blank(v.contact_name),
      email: blank(v.email)?.toLowerCase() ?? null,
      cc_emails: [...new Set(splitEmails(v.cc_emails).map((e) => e.toLowerCase()))],
      phone: blank(v.phone),
      address_line1: blank(v.address_line1),
      address_line2: blank(v.address_line2),
      city: blank(v.city),
      province: blank(v.province),
      postal_code: v.postal_code.trim() ? normalizePostal(v.postal_code, v.country) : null,
      country: v.country,
      currency: v.currency,
      default_tax_rate_id: taxId,
      terms_days: v.terms_days === '' ? null : Number(v.terms_days),
      notes: blank(v.notes),
    },
  };
}

export async function createClientAction(input: ClientInput): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  try {
    const row = await clientRow(input);
    if (!row.ok) return row;
    const supabase = await db();
    const { data, error } = await supabase.from('clients').insert(row.data!).select('id').single();
    if (error) return { ok: false, error: error.message };
    revalidatePath('/clients');
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateClientAction(id: string, input: ClientInput): Promise<ActionResult> {
  await currentMember();
  if (!UUID.test(id)) return { ok: false, error: 'Unknown client.' };
  try {
    const row = await clientRow(input);
    if (!row.ok) return row;
    const supabase = await db();
    const { error } = await supabase.from('clients').update(row.data!).eq('id', id);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/clients');
    revalidatePath(`/clients/${id}`, 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function setClientArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  await currentMember();
  if (!UUID.test(id)) return { ok: false, error: 'Unknown client.' };
  const supabase = await db();
  const { error } = await supabase.from('clients').update({ archived }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`, 'layout');
  return { ok: true };
}

export async function saveClientNotesAction(id: string, notes: string): Promise<ActionResult> {
  await currentMember();
  if (!UUID.test(id)) return { ok: false, error: 'Unknown client.' };
  if (notes.length > 10000) return { ok: false, error: 'Notes are too long.' };
  const supabase = await db();
  const { error } = await supabase.from('clients').update({ notes: blank(notes) }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

// ───────────────────────── Projects ─────────────────────────

function projectRow(v: ProjectInput): ActionResult<Omit<Insert<'projects'>, 'client_id'>> {
  const err = firstError(validateProject(v));
  if (err) return { ok: false, error: err };
  const budget = v.budget.trim() ? Math.round(Number(v.budget.replace(/[,$\s]/g, '')) * 100) / 100 : null;
  return {
    ok: true,
    data: { name: v.name.trim(), status: v.status, budget, started_on: v.started_on || null, ended_on: v.ended_on || null, notes: blank(v.notes) },
  };
}

export async function createProjectAction(clientId: string, input: ProjectInput): Promise<ActionResult<{ id: string }>> {
  await currentMember();
  if (!UUID.test(clientId)) return { ok: false, error: 'Unknown client.' };
  const row = projectRow(input);
  if (!row.ok) return row;
  const supabase = await db();
  const { data, error } = await supabase.from('projects').insert({ ...row.data!, client_id: clientId }).select('id').single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${clientId}`, 'layout');
  return { ok: true, data: { id: data.id } };
}

export async function updateProjectAction(id: string, input: ProjectInput): Promise<ActionResult> {
  await currentMember();
  if (!UUID.test(id)) return { ok: false, error: 'Unknown project.' };
  const row = projectRow(input);
  if (!row.ok) return row;
  const supabase = await db();
  const { data, error } = await supabase.from('projects').update(row.data!).eq('id', id).select('client_id').single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${data.client_id}`, 'layout');
  return { ok: true };
}

export async function setProjectStatusAction(id: string, status: ProjectInput['status']): Promise<ActionResult> {
  await currentMember();
  if (!UUID.test(id) || !['lead', 'active', 'paused', 'done'].includes(status)) return { ok: false, error: 'Unknown project.' };
  const supabase = await db();
  const { data, error } = await supabase.from('projects').update({ status }).eq('id', id).select('client_id').single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${data.client_id}`, 'layout');
  return { ok: true };
}

/** Only projects with nothing attached can be deleted; otherwise mark them done. */
export async function deleteProjectAction(id: string): Promise<ActionResult<{ clientId: string | null }>> {
  await currentMember();
  if (!UUID.test(id)) return { ok: false, error: 'Unknown project.' };
  const supabase = await db();
  const [inv, exp, trips] = await Promise.all([
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('project_id', id),
    supabase.from('mileage_trips').select('id', { count: 'exact', head: true }).eq('project_id', id),
  ]);
  if ((inv.count ?? 0) + (exp.count ?? 0) + (trips.count ?? 0) > 0) {
    return { ok: false, error: 'This project has invoices, expenses or trips. Mark it done instead.' };
  }
  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('client_id').single();
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${data.client_id}`, 'layout');
  return { ok: true, data: { clientId: data.client_id } };
}
