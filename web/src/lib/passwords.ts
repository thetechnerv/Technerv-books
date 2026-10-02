import 'server-only';
import { createHmac, randomInt } from 'node:crypto';
import { adminDb, must } from './db';
import type { Row } from './types';

/**
 * PIN sign-in.
 *
 * Members sign in with a 4-digit PIN. The PIN itself is never given to
 * Supabase: the Auth password is HMAC-SHA256(AUTH_PIN_PEPPER, "email:pin"),
 * which Supabase stores bcrypt-hashed. Without the server-side pepper nobody
 * can turn a PIN guess into a valid Supabase password, so every guess has to
 * go through our sign-in action — which locks the account after a few misses.
 *
 * Owners issue a 6-digit one-time code (same derivation) that the member uses
 * once to choose their PIN.
 */
export const PIN_LENGTH = 4;
export const TEMP_CODE_LENGTH = 6;
export const TEMP_CODE_HOURS = 72;
export const LOCK_AFTER = 5;          // misses → short lock
export const LOCK_MINUTES = 15;
export const HARD_LOCK_AFTER = 10;    // misses → locked until an owner issues a new code

function pepper() {
  const p = process.env.AUTH_PIN_PEPPER;
  if (!p || p.length < 32) throw new Error('AUTH_PIN_PEPPER is not configured on the server.');
  return p;
}

/** The actual Supabase Auth password for an email + PIN (or one-time code). */
export function derivePassword(email: string, pin: string) {
  return 'pin1.' + createHmac('sha256', pepper()).update(`${email.trim().toLowerCase()}:${pin}`).digest('base64url');
}

export function generateTempCode() {
  return String(randomInt(0, 10 ** TEMP_CODE_LENGTH)).padStart(TEMP_CODE_LENGTH, '0');
}

const SEQUENCES = '01234567890 98765432109';
/** Plain-language problem with a proposed PIN, or null if acceptable. */
export function pinProblem(pin: string) {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `Your PIN is ${PIN_LENGTH} digits.`;
  if (/^(\d)\1+$/.test(pin)) return 'Avoid repeating the same digit.';
  if (SEQUENCES.includes(pin)) return 'Avoid a run like 1234 — pick something less guessable.';
  if (/^(\d\d)\1$/.test(pin)) return 'Avoid repeating pairs like 1212.';
  return null;
}

async function findAuthUserId(email: string): Promise<string | null> {
  const admin = adminDb().auth.admin;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Creates the member's sign-in (or resets it) with a fresh one-time code.
 * Also clears any lockout. Returns the plain code — it is never stored.
 */
export async function issueTempCode(member: Row<'members'>, issuedBy: string) {
  const code = generateTempCode();
  const password = derivePassword(member.email, code);
  const admin = adminDb().auth.admin;
  let userId = member.user_id ?? (await findAuthUserId(member.email));
  if (userId) {
    const { error } = await admin.updateUserById(userId, { password, email: member.email, email_confirm: true, ban_duration: 'none' });
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await admin.createUser({ email: member.email, password, email_confirm: true, user_metadata: { full_name: member.full_name } });
    if (error) throw new Error(error.message);
    userId = data.user.id;
  }
  const expires = new Date(Date.now() + TEMP_CODE_HOURS * 3600_000).toISOString();
  must(await adminDb().from('members').update({
    user_id: userId, must_change_password: true, temp_password_expires_at: expires, temp_password_issued_by: issuedBy,
    failed_pin_attempts: 0, locked_until: null,
  }).eq('id', member.id).select('id'));
  return { code, expires };
}

/** Blocks a member from signing in (their history is kept). */
export async function revokeSignIn(member: Row<'members'>) {
  if (!member.user_id) return;
  const { error } = await adminDb().auth.admin.updateUserById(member.user_id, { ban_duration: '876000h' });
  if (error) throw new Error(error.message);
  must(await adminDb().from('members').update({ must_change_password: false, temp_password_expires_at: null }).eq('id', member.id).select('id'));
}

/** Records a failed PIN attempt; returns a user-facing message. */
export async function recordFailure(member: Row<'members'>) {
  const n = member.failed_pin_attempts + 1;
  const hard = n >= HARD_LOCK_AFTER;
  const lockedUntil = hard ? new Date(Date.now() + 100 * 365 * 864e5) : n % LOCK_AFTER === 0 ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null;
  await adminDb().from('members').update({ failed_pin_attempts: n, ...(lockedUntil ? { locked_until: lockedUntil.toISOString() } : {}) }).eq('id', member.id);
  if (hard) return 'Too many wrong tries. Your sign-in is locked — ask an owner for a new code.';
  if (lockedUntil) return `Too many wrong tries. Try again in ${LOCK_MINUTES} minutes.`;
  const left = LOCK_AFTER - (n % LOCK_AFTER);
  return left <= 2 ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left before a ${LOCK_MINUTES}-minute lock.` : 'Wrong PIN.';
}

export function lockMessage(member: Row<'members'>) {
  if (!member.locked_until || new Date(member.locked_until) <= new Date()) return null;
  if (member.failed_pin_attempts >= HARD_LOCK_AFTER) return 'Your sign-in is locked after too many wrong tries. Ask an owner for a new code.';
  const mins = Math.max(1, Math.ceil((new Date(member.locked_until).getTime() - Date.now()) / 60_000));
  return `Too many wrong tries. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`;
}
