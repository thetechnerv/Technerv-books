import 'server-only';
import { cookies, headers } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type Db = SupabaseClient<Database, 'accounts'>;

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Local development only: when DEV_AUTH_BYPASS_EMAIL is set and we're running
 * `next dev`, act as that member with the secret key so the app can be used
 * without an emailed sign-in code. Production builds never take this path.
 *
 * The dev server listens on the whole network, so the bypass is limited to
 * requests addressed to localhost unless DEV_BYPASS_ALLOW_LAN=1 (e.g. to try
 * the app on a phone over trusted Wi-Fi).
 */
const bypassEmail = process.env.NODE_ENV === 'development' ? process.env.DEV_AUTH_BYPASS_EMAIL || null : null;

export function bypassAllowedForHost(host: string | null) {
  if (!bypassEmail) return false;
  if (process.env.DEV_BYPASS_ALLOW_LAN === '1') return true;
  const name = (host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return name === 'localhost' || name === '127.0.0.1' || name === '::1' || name.endsWith('.localhost');
}

/** The member email to act as for this request, or null when real sign-in applies. */
export async function devBypass(): Promise<string | null> {
  if (!bypassEmail) return null;
  const h = await headers();
  return bypassAllowedForHost(h.get('host')) ? bypassEmail : null;
}

/** Cookie-session client that always talks to Supabase Auth as the real user (ignores the dev bypass). */
export async function sessionClient(): Promise<Db> {
  const store = await cookies();
  return createServerClient<Database, 'accounts'>(URL, PUBLISHABLE, {
    db: { schema: 'accounts' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in RSC */ }
      },
    },
  });
}

/** A throwaway client used only to check a password without touching the session cookie. */
export function passwordProbe() {
  return createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Supabase client bound to the `accounts` schema for the current request. */
export async function db(): Promise<Db> {
  if (await devBypass()) return adminDb();
  const store = await cookies();
  return createServerClient<Database, 'accounts'>(URL, PUBLISHABLE, {
    db: { schema: 'accounts' },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component — the proxy refreshes the session instead.
        }
      },
    },
  });
}

let admin: Db | null = null;
/** Service-role client. Server-only; bypasses RLS. Use for dev bypass and storage admin tasks. */
export function adminDb(): Db {
  admin ??= createClient<Database, 'accounts'>(URL, process.env.SUPABASE_SECRET_KEY!, {
    db: { schema: 'accounts' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Throws a readable error when a Supabase call fails. */
export function must<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}
