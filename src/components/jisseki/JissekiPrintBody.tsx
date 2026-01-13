"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
    kaipoke_cs_id: string;
    month: string;
};

type FormType = "TAKINO" | "KODO" | "DOKO" | "JYUHO" | "IDOU";

type PrintRow = {
    date: string;
    start: string;
    end: string;
    service_code?: string;
    minutes?: number;
    required_staff_count?: number;
    judo_ido?: string | null;

    calc_hour?: number;
    katamichi_addon?: 0 | 1;
    cs_pay?: string | number;
    staffNames?: string[];
};

type PrintForm = {
    formType: FormType;
    service_codes: string[];
    rows: PrintRow[];
};

type PrintResponse = {
    client: {
        kaipoke_cs_id: string;
        client_name: string;
        ido_jukyusyasho: string;
        address_zip: string;
    };
    month: string;
    forms: PrintForm[];
};

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function isPrintResponse(v: unknown): v is PrintResponse {
    if (!isObject(v)) return false;
    if (!isObject(v.client)) return false;
    if (typeof v.month !== "string") return false;
    if (!Array.isArray(v.forms)) return false;

    // 最低限のチェック（厳密すぎると壊れやすいので必要最低限に）
    const c = v.client as Record<string, unknown>;
    return (
        typeof c.kaipoke_cs_id === "string" &&
        typeof c.client_name === "string" &&
        typeof c.ido_jukyusyasho === "string" &&
        typeof c.address_zip === "string"
    );
}

function escapeHtml(s: string): string {
    return s
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderJsonToPrintableHtml(data: PrintResponse): string {
    const title = `${data.client.client_name}（${data.month}）`;
    const header = `
    <div style="margin-bottom:8px">
      <div style="font-size:16px;font-weight:700">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:#444">kaipoke_cs_id: ${escapeHtml(
        data.client.kaipoke_cs_id
    )}</div>
    </div>
  `;

    const formBlocks = data.forms
        .map((f) => {
            const rowsHtml = (f.rows ?? [])
                .map((r) => {
                    const staff = (r.staffNames ?? []).join("、");
                    return `
            <tr>
              <td>${escapeHtml(r.date ?? "")}</td>
              <td>${escapeHtml(r.start ?? "")}</td>
              <td>${escapeHtml(r.end ?? "")}</td>
              <td>${escapeHtml(r.service_code ?? "")}</td>
              <td style="text-align:right">${r.minutes ?? ""}</td>
              <td>${escapeHtml(staff)}</td>
            </tr>
          `;
                })
                .join("");

            const serviceCodes = (f.service_codes ?? []).filter(Boolean).join(" / ");

            return `
        <div class="page-break" style="margin-top:10px">
          <div style="font-weight:700;margin:6px 0">
            ${escapeHtml(f.formType)} ${serviceCodes ? `（${escapeHtml(serviceCodes)}）` : ""}
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:12px" border="1">
            <thead>
              <tr>
                <th style="padding:4px">日付</th>
                <th style="padding:4px">開始</th>
                <th style="padding:4px">終了</th>
                <th style="padding:4px">サービス</th>
                <th style="padding:4px">分</th>
                <th style="padding:4px">提供者</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="6" style="padding:6px">該当データなし</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
        })
        .join("");

    // 印刷用の最低限スタイル（A4/改ページ）
    const style = `
    <style>
      @page { size: A4; margin: 6mm; }
      .page-break { page-break-before: always; }
      .page-break:first-of-type { page-break-before: auto; }
      th, td { padding: 4px; }
    </style>
  `;

    return `${style}<div>${header}${formBlocks}</div>`;
}

export default function JissekiPrintBody({ kaipoke_cs_id, month }: Props) {
    const [html, setHtml] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                setLoading(true);
                setError(null);

                // 単票と同じく access_token を付与
                const { data: sessionData } = await supabase.auth.getSession();
                const accessToken = sessionData.session?.access_token;

                const res = await fetch("/api/jisseki/print", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                    },
                    credentials: "same-origin",
                    body: JSON.stringify({ kaipoke_cs_id, month }),
                });

                if (!res.ok) {
                    throw new Error(`failed: ${res.status}`);
                }

                // ★ここが本質：JSON/HTML の両対応
                const ct = res.headers.get("content-type") ?? "";
                if (ct.includes("application/json")) {
                    const raw: unknown = await res.json();
                    if (!isPrintResponse(raw)) {
                        throw new Error("failed: invalid response shape");
                    }
                    setHtml(renderJsonToPrintableHtml(raw));
                } else {
                    const text = await res.text();
                    setHtml(text);
                }
            } catch (e: unknown) {
                if (e instanceof Error) {
                    setError(e.message);
                } else {
                    setError("failed");
                }
            } finally {
                setLoading(false);
            }
        };

        if (kaipoke_cs_id && month) run();
    }, [kaipoke_cs_id, month]);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div style={{ color: "red" }}>表示に失敗しました: {error}</div>;

    return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
