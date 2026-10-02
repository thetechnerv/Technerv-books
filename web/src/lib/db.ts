import 'server-only';
import { cookies } from 'next/headers';
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
 */
export const devBypassEmail =
  process.env.NODE_ENV === 'development' ? process.env.DEV_AUTH_BYPASS_EMAIL || null : null;

/** Supabase client bound to the `accounts` schema for the current request. */
export async function db(): Promise<Db> {
  if (devBypassEmail) return adminDb();
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
