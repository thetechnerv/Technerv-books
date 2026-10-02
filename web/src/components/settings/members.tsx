'use client';
import { useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { Section, Row } from '@/components/ui/group';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/fields';
import { saveMember } from '@/app/(app)/settings/members/actions';
import { initials as toInitials } from '@/lib/format';
import { EditSheet, TextField, useEditor } from './settings-form';
import { Swatches } from './swatches';
import { isEmail } from './validate';
import type { Row as DbRow } from '@/lib/types';

type Member = DbRow<'members'>;


function validate(name: string, v: string) {
  if (name === 'full_name') return v.trim() ? null : 'Enter a name.';
  if (name === 'email') return isEmail(v.trim()) ? null : 'Enter a valid email.';
  if (name === 'initials') return !v.trim() || /^[A-Za-z]{1,3}$/.test(v.trim()) ? null : '1–3 letters.';
  if (name === 'ownership_pct') {
    if (!v.trim()) return null;
    const n = Number(v.replace('%', ''));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? null : 'Between 0 and 100.';
  }
  return null;
}

export function Members({ members, meId }: { members: Member[]; meId: string }) {
  const ed = useEditor<Member>();
  const [name, setName] = useState('');
  const m = ed.item;
  const active = members.filter((x) => x.active);
  const total = active.reduce((s, x) => s + Number(x.ownership_pct ?? 0), 0);
  const off = Math.abs(total - 100) > 0.001;

  function edit(x: Member | null) {
    setName(x?.full_name ?? '');
    ed.edit(x);
  }

  return (
    <>
      <Section
        title="Owners & members"
        inset={60}
        action={<Button size="sm" variant="plain" icon={<Plus className="size-4" />} onClick={() => edit(null)}>Add member</Button>}
        footer="Members can sign in and see everything. Ownership is used for dividends and the owner balances."
      >
        {members.map((x) => (
          <Row
            key={x.id}
            onClick={() => edit(x)}
            icon={<Avatar name={x.full_name} color={x.color} initials={x.initials} size={32} />}
            title={<span className={x.active ? '' : 'text-label-3'}>{x.full_name}{x.id === meId && <span className="text-label-3"> · You</span>}</span>}
            subtitle={x.email}
            value={x.ownership_pct !== null ? `${Number(x.ownership_pct)}%` : '—'}
          >
            {!x.active && <Badge>Inactive</Badge>}
            
          </Row>
        ))}
      </Section>

      {off && (
        <div className="-mt-4 mb-7 flex items-start gap-2.5 rounded-group bg-orange-soft px-4 py-3 text-subhead lg:-mt-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-orange" />
          <span>Active members’ ownership adds up to <strong className="tabular">{Math.round(total * 100) / 100}%</strong>, not 100%. Check the share register before paying dividends.</span>
        </div>
      )}


      <EditSheet
        key={ed.key}
        open={ed.open}
        onClose={ed.close}
        title={m ? 'Edit member' : 'New member'}
        saveLabel={m ? 'Save' : 'Add'}
        action={saveMember}
        validate={validate}
        footer={!m && <p className="px-4 pb-2 text-footnote text-label-2">A personal account is created for them so out-of-pocket spending can be recorded. Then use <b>Sign-in access → Set up</b> below to give them a temporary password.</p>}
      >
        {m && <input type="hidden" name="id" value={m.id} />}
        <div className="flex justify-center pb-4">
          <Avatar name={name || 'New member'} color={m?.color} initials={m?.initials ?? (name ? toInitials(name) : '+')} size={64} />
        </div>
        <Section>
          <TextField name="full_name" label="Name" defaultValue={m?.full_name ?? ''} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus={!m} />
          <TextField name="email" label="Email" type="email" inputMode="email" autoCapitalize="none" defaultValue={m?.email ?? ''} hint={m ? 'Changing the email changes how they sign in.' : undefined} />
          <TextField name="initials" label="Initials" defaultValue={m?.initials ?? ''} placeholder={name ? toInitials(name) : 'DS'} maxLength={3} autoCapitalize="characters" />
          <TextField name="ownership_pct" label="Ownership" defaultValue={m?.ownership_pct !== null && m?.ownership_pct !== undefined ? String(Number(m.ownership_pct)) : ''} inputMode="decimal" align="right" trailing="%" placeholder="0" />
        </Section>
        <Section>
          <Swatches name="color" defaultValue={m?.color ?? '#5E7CE2'} label="Avatar colour" />
        </Section>
        <Section footer={m?.id === meId ? 'You can’t deactivate yourself.' : 'Inactive members can’t sign in; their history stays.'}>
          <Toggle name="active" label="Active" defaultChecked={m?.active ?? true} disabled={m?.id === meId} />
        </Section>
      </EditSheet>
    </>
  );
}
