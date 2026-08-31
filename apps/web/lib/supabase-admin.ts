/**
 * Supabase admin client for server-side use (PDF storage).
 *
 * Optional: the rest of the app boots without these env vars.
 * Upload / signed-URL routes fail with a clear error until they are set.
 *
 * Uses the service role key — bypasses RLS. Only import from server
 * actions or API routes, never from client components.
 */

import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export const STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "bill-pdfs";

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for invoice file storage."
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
