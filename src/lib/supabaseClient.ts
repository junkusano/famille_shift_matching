// lib/supabaseClient.ts

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

declare global {
  var __supabaseClient:
    | SupabaseClient
    | undefined;
}

export const supabase =
  globalThis.__supabaseClient ??
  createClient(
    supabaseUrl,
    supabaseAnonKey,
  );

if (
  process.env.NODE_ENV !== "production"
) {
  globalThis.__supabaseClient = supabase;
}