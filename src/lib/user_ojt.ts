// ===========================================
//  src/lib/user_ojt.ts
//  シフトレコードから自動 OJT 記録生成
// ===========================================

import { supabase } from "@/lib/supabaseClient";
import { startOfMonth, subMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import OpenAI from "openai";

const timeZone = "Asia/Tokyo";
const DRY_RUN_DEFAULT = false;

// ChatGPT
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -----------------------------
// 型定義
// -----------------------------

export type UserOjtJobOptions = {
  baseDate?: Date;
  dryRun?: boolean;
};

export type UserOjtJobResult = {
  ok: boolean;
  checkedShifts: number;
  candidateOjtCount: number;
  inserted: number;
  skippedExisting: number;
  errors?: { message: string }[];
};

type FormEntryRow = {
  user_id: string | null;
  kaipoke_cs_id: string | null;
  create_at: string;
};

type TrainerRow = {
  user_id: string | null;
  level_sort: number | null;
};

type ShiftRow = {
  shift_id: number;
  shift_start_date: string; // yyyy-mm-dd
  shift_start_time: string | null; // HH:mm:ss
  kaipoke_cs_id: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
};

type ShiftRecordRow = {
  id: string;
  shift_id: number;
  status: string;
};

type RawItemRow = {
  record_id: string;
  value_text: string | null;
  note: string | null;
  def?:
    | { code: string | null; label: string | null }
    | { code: string | null; label: string | null }[]
    | null;
};

type ShiftRecordItemRow = {
  record_id: string;
  value_text: string | null;
  note: string | null;
  def?: {
    code: string;
    label: string;
  } | null;
};

type ExistingOjtRow = {
  user_id: string;
  date: string;
  start_time: string | null;
};

type OjtCandidate = {
  shiftId: number;
  date: string;
  startTime: string;
  kaipokeCsId: string | null;
  traineeUserId: string;
  trainerUserId: string | null;
  recordId: string;
};

type UserOjtInsertRow = {
  user_id: string;
  date: string;
  start_time: string;
  trainer_user_id: string | null;
  kaipoke_cs_id: string | null;
  memo: string;
};

// ===========================================
// メイン処理
// ===========================================

export async function runUserOjtJob(
  options: UserOjtJobOptions = {}
): Promise<UserOjtJobResult> {
  const baseDate = options.baseDate ?? new Date();
  const dryRun = options.dryRun ?? DRY_RUN_DEFAULT;

  const fromDate = startOfMonth(subMonths(baseDate, 2));
  const fromDateStr = formatInTimeZone(fromDate, timeZone, "yyyy-MM-dd");

  const errors: { message: string }[] = [];

  try {
    console.log("[OJT] 開始 baseDate =", baseDate.toISOString());
    console.log("[OJT] form_entries 対象 >= ", fromDateStr);

    // ------------------------------------------------------------
    // ① OJTされる側: form_entries に基づき抽出 (trainee)
    // ------------------------------------------------------------
    const { data: feRows, error: feErr } = await supabase
      .from("form_entries")
      .select("user_id, kaipoke_cs_id, create_at")
      .gte("create_at", fromDateStr)
      .returns<FormEntryRow[]>();

    if (feErr) throw feErr;

    const traineeUserSet = new Set<string>();
    const formCsIds = new Set<string>();

    for (const r of feRows ?? []) {
      if (r.user_id) traineeUserSet.add(r.user_id);
      if (r.kaipoke_cs_id) formCsIds.add(r.kaipoke_cs_id);
    }

    if (traineeUserSet.size === 0) {
      console.log("[OJT] trainee が 0 名");
      return {
        ok: true,
        checkedShifts: 0,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    console.log("[OJT] trainee:", traineeUserSet.size);

    // ------------------------------------------------------------
    // ② トレーナー: level_sort < 4,500,000 (trainer)
    // ------------------------------------------------------------

    const { data: trainerRows, error: trainerErr } = await supabase
      .from("user_entry_united_view_single")
      .select("user_id, level_sort")
      .lt("level_sort", 4_500_000)
      .returns<TrainerRow[]>();

    if (trainerErr) throw trainerErr;

    const trainerUserSet = new Set<string>();
    for (const u of trainerRows ?? []) {
      if (u.user_id) trainerUserSet.add(u.user_id);
    }

    if (trainerUserSet.size === 0) {
      console.log("[OJT] trainer が 0 名");
      return {
        ok: true,
        checkedShifts: 0,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    console.log("[OJT] trainer:", trainerUserSet.size);

    // ------------------------------------------------------------
    // ③ シフト取得
    // ------------------------------------------------------------

   // ③ シフト取得

let shiftQuery = supabase
  .from("shift")
  .select(
    "shift_id, shift_start_date, shift_start_time, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id"
  )
  .gte("shift_start_date", fromDateStr);   // ★ ここでは returns を付けない

if (formCsIds.size > 0) {
  shiftQuery = shiftQuery.in("kaipoke_cs_id", Array.from(formCsIds));
}

const {
  data: shiftRowsRaw,
  error: shiftErr,
} = await shiftQuery;                         // ★ 普通に実行して
if (shiftErr) throw shiftErr;

const shiftRows = (shiftRowsRaw ?? []) as ShiftRow[];  // ★ ここで型を合わせる

const checkedShifts = shiftRows.length;
console.log("[OJT] shiftRows =", checkedShifts);

if (checkedShifts === 0) {
  return {
    ok: true,
    checkedShifts,
    candidateOjtCount: 0,
    inserted: 0,
    skippedExisting: 0,
  };
}


    // ------------------------------------------------------------
    // ④ shift_records 取得
    // ------------------------------------------------------------

    const shiftIds = Array.from(new Set(shiftRows.map((s) => s.shift_id)));

    const { data: recordRows, error: srErr } = await supabase
      .from("shift_records")
      .select("id, shift_id, status")
      .in("shift_id", shiftIds)
      .in("status", ["submitted", "approved"])
      .returns<ShiftRecordRow[]>();

    if (srErr) throw srErr;

    const recordByShiftId = new Map<number, ShiftRecordRow>();
    for (const r of recordRows ?? []) {
      recordByShiftId.set(r.shift_id, r);
    }

    // ------------------------------------------------------------
    // ⑤ trainee と trainer が同じシフトにいるものだけ抽出
    // ------------------------------------------------------------

    const rawCandidates: {
      shift: ShiftRow;
      record: ShiftRecordRow;
      traineeUserId: string;
      trainerUserId: string;
    }[] = [];

    for (const shift of shiftRows ?? []) {
      const rec = recordByShiftId.get(shift.shift_id);
      if (!rec) continue;

      const staff = [
        shift.staff_01_user_id,
        shift.staff_02_user_id,
        shift.staff_03_user_id,
      ].filter((x): x is string => !!x);

      if (staff.length < 2) continue;

      const trainees = staff.filter((u) => traineeUserSet.has(u));
      const trainers = staff.filter((u) => trainerUserSet.has(u));

      if (trainees.length === 0 || trainers.length === 0) continue;

      for (const t of trainees) {
        const trainer = trainers.find((u) => u !== t);
        if (!trainer) continue;

        rawCandidates.push({
          shift,
          record: rec,
          traineeUserId: t,
          trainerUserId: trainer,
        });
      }
    }

    console.log("[OJT] rawCandidates =", rawCandidates.length);

    if (rawCandidates.length === 0) {
      return {
        ok: true,
        checkedShifts,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    // ------------------------------------------------------------
    // ⑥ record_items をまとめて取得（def の配列/単体を正規化）
    // ------------------------------------------------------------

    const recordIds = Array.from(
      new Set(rawCandidates.map((c) => c.record.id))
    );

    const { data: itemRows, error: itemErr } = await supabase
      .from("shift_record_items")
      .select(
        "record_id, value_text, note, def:shift_record_item_defs(code, label)"
      )
      .in("record_id", recordIds);

    if (itemErr) throw itemErr;

    const rawItems = (itemRows ?? []) as RawItemRow[];
    const itemsByRecordId = new Map<string, ShiftRecordItemRow[]>();

    for (const it of rawItems) {
      let def: ShiftRecordItemRow["def"] = null;

      const rawDef = it.def;
      if (Array.isArray(rawDef)) {
        if (rawDef.length > 0) {
          def = {
            code: String(rawDef[0]?.code ?? ""),
            label: String(rawDef[0]?.label ?? ""),
          };
        }
      } else if (rawDef) {
        def = {
          code: String(rawDef.code ?? ""),
          label: String(rawDef.label ?? ""),
        };
      }

      const normalized: ShiftRecordItemRow = {
        record_id: it.record_id,
        value_text: it.value_text,
        note: it.note,
        def,
      };

      const arr = itemsByRecordId.get(it.record_id) ?? [];
      arr.push(normalized);
      itemsByRecordId.set(it.record_id, arr);
    }

    // ------------------------------------------------------------
    // ⑦ 重複チェック（user_id + date + start_time）
    // ------------------------------------------------------------

    const { data: existRows, error: existErr } = await supabase
      .from("user_ojt_record")
      .select("user_id, date, start_time")
      .gte("date", fromDateStr)
      .returns<ExistingOjtRow[]>();

    if (existErr) throw existErr;

    const existingKey = new Set<string>();
    for (const r of existRows ?? []) {
      const k = `${r.user_id}__${r.date}__${r.start_time ?? ""}`;
      existingKey.add(k);
    }

    const deduped: OjtCandidate[] = [];
    const localKey = new Set<string>();

    for (const c of rawCandidates) {
      const dateStr = formatInTimeZone(
        new Date(c.shift.shift_start_date),
        timeZone,
        "yyyy-MM-dd"
      );
      const start = c.shift.shift_start_time ?? "00:00:00";

      const key = `${c.traineeUserId}__${dateStr}__${start}`;

      if (localKey.has(key)) continue;
      localKey.add(key);

      if (existingKey.has(key)) continue;

      deduped.push({
        shiftId: c.shift.shift_id,
        date: dateStr,
        startTime: start,
        kaipokeCsId: c.shift.kaipoke_cs_id,
        traineeUserId: c.traineeUserId,
        trainerUserId: c.trainerUserId,
        recordId: c.record.id,
      });
    }

    console.log("[OJT] 新規 OJT候補 =", deduped.length);

    if (deduped.length === 0) {
      return {
        ok: true,
        checkedShifts,
        candidateOjtCount: rawCandidates.length,
        inserted: 0,
        skippedExisting: existingKey.size,
      };
    }

    // ------------------------------------------------------------
    // ⑧ ChatGPT で memo 生成 → INSERT
    // ------------------------------------------------------------

    const insertRows: UserOjtInsertRow[] = [];

    for (const c of deduped) {
      const items = itemsByRecordId.get(c.recordId) ?? [];

      try {
        const memoBody = await generateOjtMemo(c, items);
        const memo = memoBody + buildFooter();

        insertRows.push({
          user_id: c.traineeUserId,
          date: c.date,
          start_time: c.startTime,
          trainer_user_id: c.trainerUserId,
          kaipoke_cs_id: c.kaipokeCsId,
          memo,
        });
      } catch (e: unknown) {
        const msg =
          e instanceof Error ? e.message : String(e);
        errors.push({
          message: `ChatGPT 生成失敗: ${msg}`,
        });
      }
    }

    let inserted = 0;

    if (!dryRun && insertRows.length > 0) {
      const { error: insErr } = await supabase
        .from("user_ojt_record")
        .insert(insertRows);
      if (insErr) throw insErr;
      inserted = insertRows.length;
    } else if (dryRun) {
      console.log("[OJT] DRY RUN: 挿入予定行数 =", insertRows.length);
    }

    return {
      ok: true,
      checkedShifts,
      candidateOjtCount: rawCandidates.length,
      inserted,
      skippedExisting: existingKey.size,
      errors: errors.length ? errors : undefined,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      checkedShifts: 0,
      candidateOjtCount: 0,
      inserted: 0,
      skippedExisting: 0,
      errors: [{ message: msg }],
    };
  }
}

// ------------------------------------------------------------
// ChatGPT でメモ生成
// ------------------------------------------------------------

async function generateOjtMemo(
  c: OjtCandidate,
  items: ShiftRecordItemRow[]
): Promise<string> {
  const lines = items
    .map((it) => {
      const label = it.def?.label ?? it.def?.code ?? "項目";
      const val =
        (it.value_text ?? "").trim() ||
        (it.note ? `（備考）${it.note}` : "");
      if (!val) return null;
      return `・${label}: ${val}`;
    })
    .filter((v): v is string => !!v)
    .join("\n");

  const prompt = `
以下は訪問サービスのシフト記録です。

- 日付: ${c.date}
- 開始: ${c.startTime}
- OJT対象: ${c.traineeUserId}
- トレーナー: ${c.trainerUserId ?? "（同席者）"}

【訪問記録内容】
${lines || "記録内容がほとんどありません。"}

これをもとに、OJTとして実施した育成内容・振り返りを
200〜350文字の日本語でまとめてください。

条件:
- 箇条書き形式
- 具体的・簡潔
- 指導内容、できた点、次回の改善ポイントを含める
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "あなたは訪問介護の管理者です。OJT記録を簡潔にまとめます。",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 400,
    temperature: 0.4,
  });

  return (
    res.choices[0]?.message?.content?.trim() ??
    "自動生成に失敗しましたが、当該シフトで育成を実施しました。"
  );
}

// ------------------------------------------------------------
// BCP・虐待防止などの定型文
// ------------------------------------------------------------

function buildFooter(): string {
  return `
---
【合わせて実施した育成項目】
- BCP（災害時対応・緊急時手順）の確認
- 虐待防止の基本方針と通報手順の再確認
- 身体拘束を行わないケアの原則
- 訪問記録の書き方（事実と解釈の分離・記録ルール）
- 当日の振り返り・次回に向けたリマインド
`.trim();
}
