// src/lib/supabase/service.ts

import { createClient } from "@supabase/supabase-js";

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase環境変数が未設定です");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
