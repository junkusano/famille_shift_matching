// app/api/tokutei/sum-order/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

/* =========================
   型定義（必要最小限）
   ========================= */
type Shift = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string | null; // 'YYYY-MM-DD'
  shift_start_time: string | null; // 'HH:MM:SS'
  shift_end_date: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  tokutei_comment: string | null;
};

type ShiftRecord = {
  id: string;       // uuid
  shift_id: number; // bigint
  status: "draft" | "submitted" | "approved" | "archived";
};

type ShiftRecordItem = {
  record_id: string;     // uuid
  item_def_id: string;   // uuid
  value_text: string | null;
};

type ShiftRecordItemDef = {
  id: string;        // uuid
  code: string | null;  // text（NULL許容：多くはnull）
  l_id: string | null;  // uuid（大分類）
  label: string;     // 表示ラベル
  input_type: "checkbox" | "select" | "number" | "text" | "textarea" | "image" | "display";
  active: boolean;
};

const TARGET_CODES = ["adl", "needs", "enviroment", "other_status"] as const;
type TargetCode = typeof TARGET_CODES[number];

function isTargetCode(code: string | null): code is TargetCode {
  return !!code && (TARGET_CODES as readonly string[]).includes(code);
}

/** 事前カテゴリ(l_id)は実施サービスから除外 */
const PRE_L_ID_EXCLUDE = "acd682d0-2135-4a02-bc4b-0d834e9f5a27";

/* =========================
   エンドポイント
   ========================= */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { shift_id?: number };
    const shiftIdParam = body?.shift_id ?? 0;
    if (!shiftIdParam) {
      return NextResponse.json({ error: "shift_id required" }, { status: 400 });
    }

    /* 0) 今回のシフト取得 */
    const { data: curRow, error: e0 } = await supabase
      .from("shift")
      .select("*")
      .eq("shift_id", shiftIdParam)
      .maybeSingle();
    if (e0 || !curRow) throw e0 ?? new Error("shift not found");
    const cur = curRow as Shift;

    /* 1) “前方連結チェーン”を進め、その先の「真の次回」を特定
       - end == next.start を連結し切った先（chainEnd）より“後”に開始する最初を nextShift
       - 次回が無ければ書き込みは行わない
    */
    if (!cur.kaipoke_cs_id || !cur.shift_end_date || !cur.shift_end_time) {
      return NextResponse.json({ ok: true, reason: "skip: insufficient end fields to compute next" });
    }

    let chainEndDate = cur.shift_end_date;
    let chainEndTime = cur.shift_end_time;

    for (let i = 0; i < 20; i++) {
      const { data: conts, error: eCont } = await supabase
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", cur.kaipoke_cs_id)
        .eq("shift_start_date", chainEndDate)
        .eq("shift_start_time", chainEndTime)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true })
        .limit(1);
      if (eCont) throw eCont;

      const cont = (conts as unknown as Shift[] | null)?.[0];
      if (!cont) break; // 連結終端

      chainEndDate = cont.shift_end_date ?? cont.shift_start_date ?? chainEndDate;
      chainEndTime = cont.shift_end_time ?? cont.shift_start_time ?? chainEndTime;
    }

    const [sameDayLater, laterDay] = await Promise.all([
      supabase
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", cur.kaipoke_cs_id)
        .eq("shift_start_date", chainEndDate)
        .gt("shift_start_time", chainEndTime)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true })
        .limit(1),
      supabase
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", cur.kaipoke_cs_id)
        .gt("shift_start_date", chainEndDate)
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true })
        .limit(1),
    ]);

    const cand1 = (sameDayLater.data as unknown as Shift[] | null)?.[0];
    const cand2 = (laterDay.data as unknown as Shift[] | null)?.[0];

    const nextShift: Shift | undefined = cand1 ?? cand2 ?? undefined;
    if (!nextShift) {
      return NextResponse.json({ ok: true, reason: "no_next_shift_after_chain" });
    }

    /* 2) “過去連結チェーン”を遡って収集（prev.end == cur.start の連なり）
          → 前回状況はこの直前連結列の全レコードを集約
    */
    const series: Shift[] = [cur];
    let cursor = cur;
    for (let i = 0; i < 20; i++) {
      if (!cursor.shift_start_date || !cursor.shift_start_time || !cursor.kaipoke_cs_id) break;
      const { data: prevRows, error: ePrev } = await supabase
        .from("shift")
        .select("*")
        .eq("kaipoke_cs_id", cursor.kaipoke_cs_id)
        .eq("shift_end_date", cursor.shift_start_date)
        .eq("shift_end_time", cursor.shift_start_time)
        .limit(1);
      if (ePrev) throw ePrev;
      const prev = (prevRows as unknown as Shift[] | null)?.[0];
      if (!prev) break;
      series.unshift(prev);
      cursor = prev;
    }
    const shiftIds = series.map((s) => s.shift_id);

    /* 3) defs を2系統で取得
          A) TARGET_CODES（adl/needs/enviroment/other_status）
          B) 実施サービス用：active=true & input_type='checkbox' & l_id != PRE_L_ID_EXCLUDE
    */
    const [{ data: defsTargetRows, error: eDefs1 }, { data: defsCbxRows, error: eDefs2 }] = await Promise.all([
      supabase
        .from("shift_record_item_defs")
        .select("id, code, l_id, label, input_type, active")
        .in("code", TARGET_CODES as unknown as string[]),
      supabase
        .from("shift_record_item_defs")
        .select("id, code, l_id, label, input_type, active")
        .eq("active", true)
        .eq("input_type", "checkbox")
        .neq("l_id", PRE_L_ID_EXCLUDE),
    ]);
    if (eDefs1) throw eDefs1;
    if (eDefs2) throw eDefs2;

    const defsTarget = (defsTargetRows as unknown as ShiftRecordItemDef[] | null) ?? [];
    const defsCheckbox = (defsCbxRows as unknown as ShiftRecordItemDef[] | null) ?? [];

    const codeToDefId = new Map<TargetCode, string>();
    for (const d of defsTarget) {
      if (isTargetCode(d.code)) codeToDefId.set(d.code, d.id);
    }
    const defIdsTarget = Array.from(codeToDefId.values());

    const checkboxDefMap = new Map<string, ShiftRecordItemDef>(); // id -> def
    for (const d of defsCheckbox) checkboxDefMap.set(d.id, d);
    const defIdsCheckbox = Array.from(checkboxDefMap.keys());

    const allDefIds = [...new Set([...defIdsTarget, ...defIdsCheckbox])];

    /* 4) series の “提出済み以上” record と items を取得 */
    const { data: recRows, error: eRecs } = await supabase
      .from("shift_records")
      .select("id, shift_id, status")
      .in("shift_id", shiftIds)
      .in("status", ["submitted", "approved", "archived"]);
    if (eRecs) throw eRecs;
    const records = (recRows as unknown as ShiftRecord[] | null) ?? [];
    const recIds = records.map((r) => r.id);

    const byCode: Record<TargetCode, string[]> = {
      adl: [],
      needs: [],
      enviroment: [],
      other_status: [],
    };
    const executedLabels: string[] = [];

    if (recIds.length && allDefIds.length) {
      const { data: itemRows, error: eItems } = await supabase
        .from("shift_record_items")
        .select("record_id, item_def_id, value_text")
        .in("record_id", recIds)
        .in("item_def_id", allDefIds);
      if (eItems) throw eItems;

      const items = (itemRows as unknown as ShiftRecordItem[] | null) ?? [];

      // defId -> code / label マップ
      const defIdToCode = new Map<string, TargetCode>();
      for (const d of defsTarget) {
        if (isTargetCode(d.code)) defIdToCode.set(d.id, d.code);
      }

      for (const it of items) {
        const val = (it.value_text ?? "").trim();

        // A) TARGET_CODES の値収集
        const code = defIdToCode.get(it.item_def_id);
        if (code && val) {
          byCode[code].push(val);
        }

        // B) 実施サービス（checkbox でチェック済み & l_id≠事前）
        const def = checkboxDefMap.get(it.item_def_id);
        if (def && isChecked(val)) {
          // 念のためフィルタ（active/checkbox/除外l_id）
          if (def.active && def.input_type === "checkbox" && def.l_id !== PRE_L_ID_EXCLUDE) {
            executedLabels.push(def.label);
          }
        }
      }
    }

    const bullets = {
      executed: uniqJoin(executedLabels), // ★追加：実施したサービス
      adl: uniqJoin(byCode.adl),
      needs: uniqJoin(byCode.needs),
      enviroment: uniqJoin(byCode.enviroment),
      other_status: uniqJoin(byCode.other_status),
    };

    const prevSummaryText = [
      "【前回の状況】",
      bullets.executed ? `・実施したサービス：${bullets.executed}` : "",
      bullets.adl ? `・ADLの変化：${bullets.adl}` : "",
      bullets.needs ? `・ご本人の要望：${bullets.needs}` : "",
      bullets.enviroment ? `・環境・ご家族の状況：${bullets.enviroment}` : "",
      bullets.other_status ? `・その他・ご様子：${bullets.other_status}` : "",
    ]
      .filter((s) => s && s.length > 0)
      .join("\n");

    /* 5) OpenAIで“次回（今回）サービスの指示事項”（最大100字・平文1文） */
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const instruction = await generateInstruction(openai, { cur, prevSummaryText });

    const finalPlain = [prevSummaryText, instruction ? `【指示】${instruction}` : ""]
      .filter((s) => s && s.length > 0)
      .join("\n");

    /* 6) 書き込み先: 必ず「真の次回」に書く（なければ書かない） */
    const { error: eUp } = await supabase
      .from("shift")
      .update({ tokutei_comment: finalPlain })
      .eq("shift_id", nextShift.shift_id);
    if (eUp) throw eUp;

    return NextResponse.json({
      ok: true,
      target_shift_id: nextShift.shift_id,
      wrote_to: "next_after_chain",
      length: finalPlain.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tokutei/sum-order] error", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/* =========================
   helpers
   ========================= */
function uniqJoin(arr: string[], sep = " / "): string {
  const set = new Set<string>();
  for (const s of arr) {
    const t = (s ?? "").trim();
    if (t) set.add(t);
  }
  return Array.from(set).join(sep);
}

/** ✅判定の頑健化（value_text が text のため表記ゆれを吸収） */
function isChecked(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return (
    v === "true" ||
    v === "1" ||
    v === "on" ||
    v === "yes" ||
    v === "y" ||
    v === "checked" ||
    v === "✓" ||
    v === "☑" ||
    v === "✅"
  );
}

async function generateInstruction(
  openai: OpenAI,
  ctx: { cur: Shift; prevSummaryText: string }
): Promise<string> {
  const season = getSeasonHint();
  const sys =
    "あなたは訪問介護のサービス提供責任者です。日本語で簡潔・平文・最大100文字で指示を1文だけ返します。医療行為の推奨や計画の断定は避け、現場で実施可能な声掛け・確認事項に限定してください。";
  const usr = [
    `今回シフト: ${ctx.cur.shift_start_date ?? ""} ${ctx.cur.shift_start_time ?? ""} / サービス: ${ctx.cur.service_code ?? "-"}`,
    `前回状況:\n${ctx.prevSummaryText || "(記載なし)"}`,
    `季節配慮: ${season}`,
    "含めたい観点: 体調の継続確認・ご意見のフォロー・水分/室温/感染症・行事(盆/正月等)予定確認。",
    "禁止: 医療的助言の断定、ケアマネ領域の限定的断定、大掃除等の過大提案、料理の華美化、庭掃除等。",
    "出力は最大100文字・1文・句点で終える。",
  ].join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr },
    ],
    temperature: 0.5,
    max_tokens: 120,
  });

  const text = resp.choices?.[0]?.message?.content?.trim() ?? "";
  return text.length > 110 ? text.slice(0, 110) : text;
}

function getSeasonHint(): string {
  const now = new Date();
  const m = now.getMonth() + 1;
  if (m <= 2) return "寒冷期（乾燥・低温）";
  if (m <= 4) return "季節の変わり目（花粉・寒暖差）";
  if (m <= 6) return "梅雨〜初夏（湿度・食中毒）";
  if (m <= 8) return "猛暑（熱中症・水分補給）";
  if (m <= 10) return "秋（寒暖差・乾燥傾向）";
  return "冬（乾燥・低温・感染予防）";
}
