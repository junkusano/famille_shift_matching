// src/lib/auth/getUserFromBearer.ts
import "server-only";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function getUserFromBearer(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1];

  if (!token) return { user: null, token: null };

  // service-role でも auth.getUser(token) は検証に使える
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { user: null, token };

  return { user: data.user, token };
}
