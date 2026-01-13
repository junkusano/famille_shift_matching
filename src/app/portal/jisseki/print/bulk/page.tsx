// src/app/portal/jisseki/print/bulk/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import JissekiPrintBody, { type PrintPayload } from "@/components/jisseki/JissekiPrintBody";

export default function BulkPrintPage() {
  const [data, setData] = useState<PrintPayload | null>(null);

  useEffect(() => {
    const run = async () => {
      const payload = localStorage.getItem("jisseki_bulk_print");
      if (!payload) return;

      const { kaipoke_cs_id, month } = JSON.parse(payload) as {
        kaipoke_cs_id: string;
        month: string;
      };

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch(
        `/api/jisseki/print?kaipoke_cs_id=${encodeURIComponent(kaipoke_cs_id)}&month=${encodeURIComponent(month)}`,
        {
          headers: {
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
        }
      );

      const json = (await res.json()) as PrintPayload;
      setData(json);
    };

    run();
  }, []);

  if (!data) return <div>読み込み中...</div>;

  return <JissekiPrintBody data={data} />;
}
