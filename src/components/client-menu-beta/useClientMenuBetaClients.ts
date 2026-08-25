"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { ClientMenuBetaClient } from "@/lib/client-menu-beta/navigation";

let clientListPromise: Promise<ClientMenuBetaClient[]> | null = null;

async function fetchClientMenuBetaClients() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch("/api/client-menu-beta/clients", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "利用者一覧を取得できませんでした。");
  }
  return (payload.data ?? []) as ClientMenuBetaClient[];
}

/** 同一画面内のAlertBarとDrawerからの一覧リクエストを共有する。 */
export function useClientMenuBetaClients() {
  const [clients, setClients] = useState<ClientMenuBetaClient[]>([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;
    clientListPromise ??= fetchClientMenuBetaClients().catch((error) => {
      clientListPromise = null;
      throw error;
    });
    void clientListPromise.then((result) => {
      if (!alive) return;
      setClients(result);
      setLoadError("");
    }).catch((error: unknown) => {
      if (!alive) return;
      setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => { alive = false; };
  }, []);

  return { clients, loadError };
}
