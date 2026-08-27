/**
 * Supabase browser client (anon key only).
 *
 * The anon key is a PUBLIC credential — row level security in the database is
 * what actually protects the data. The service_role key must never appear in
 * this bundle; privileged work happens inside the Edge Function.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { appError } from './errors';

let cached: SupabaseClient | null = null;

export function supabaseAvailable(): boolean {
  return env.supabase.configured;
}

export function getSupabase(): SupabaseClient {
  if (!env.supabase.configured) throw appError('NOT_CONFIGURED');
  if (!cached) {
    cached = createClient(env.supabase.url, env.supabase.anonKey, {
      auth: {
        // No authentication in the MVP. Keeping these off avoids a pointless
        // anonymous session in localStorage and makes adding Supabase Auth
        // later a one-line change (flip these to true).
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { 'x-cm-app-version': env.appVersion },
      },
    });
  }
  return cached;
}
