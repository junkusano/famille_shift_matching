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

// ==== ★★ あなたの DB に合わせる設定（この3つ） =====================

// form_entries 側で「この home entry はどの利用者のものか」を表すキー
// → form_entries.auth_uid （auth.users.id へのFK）
const HOME_ENTRY_KEY_COLUMN = "auth_uid";

// form_entries 側で「home entry の作成日時」を表すカラム
// → form_entries.created_at
const HOME_ENTRY_DATE_COLUMN = "created_at";

// user_entry_united_view 側で、上記 HOME_ENTRY_KEY_COLUMN と対応するカラム名
// → user_entry_united_view.auth_uid を想定
// もし別名なら、ここだけ実際のカラム名に変えてください。
const USER_VIEW_KEY_COLUMN = "auth_uid";

// ======================================================================

// ChatGPT クライアント
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -----------------------------
// 型定義（TS エラー回避のためゆるく定義）
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

// form_entries / user_entry_united_view は柔らかく扱う
type AnyRow = Record<string, any>;

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

  // ★★ 期間を「1ヶ月前の1日以降」にする ★★
  const fromDate = startOfMonth(subMonths(baseDate, 1));
  const fromDateStr = formatInTimeZone(fromDate, timeZone, "yyyy-MM-dd");

  const errors: { message: string }[] = [];

  try {
    console.log("[OJT] 開始 baseDate =", baseDate.toISOString());
    console.log("[OJT] home entry 対象 >= ", fromDateStr);

    // ------------------------------------------------------------
    // ① home entry (form_entries) から「最近エントリーのあるキー」を取得
    //    - HOME_ENTRY_DATE_COLUMN で期間フィルタ
    //    - HOME_ENTRY_KEY_COLUMN で対象者を特定
    // ------------------------------------------------------------

    const selectColumns = `${HOME_ENTRY_KEY_COLUMN}, ${HOME_ENTRY_DATE_COLUMN}`;

    const { data: feRowsRaw, error: feErr } = await supabase
      .from("form_entries")
      .select(selectColumns)
      .gte(HOME_ENTRY_DATE_COLUMN, fromDateStr);

    if (feErr) {
      console.error("[OJT] form_entries 取得エラー:", feErr);
      throw feErr;
    }

    const feRows = (feRowsRaw ?? []) as AnyRow[];
    console.log("[OJT] form_entries rows =", feRows.length);

    const entryKeySet = new Set<string>();
    for (const r of feRows) {
      const keyVal = r[HOME_ENTRY_KEY_COLUMN];
      if (typeof keyVal === "string" && keyVal) {
        entryKeySet.add(keyVal);
      }
    }

    console.log(
      "[OJT] home entry key size =",
      entryKeySet.size,
      "sample =",
      Array.from(entryKeySet).slice(0, 10)
    );

    if (entryKeySet.size === 0) {
      console.log("[OJT] home entry 対象 0 のため終了");
      return {
        ok: true,
        checkedShifts: 0,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    // ------------------------------------------------------------
    // ② OJTされる側（trainee）の user_id を user_entry_united_view から取得
    //    - 条件①: 1ヶ月前の1日以降に home entry がある (= entryKeySet)
    // ------------------------------------------------------------

    const traineeSelect = `user_id, ${USER_VIEW_KEY_COLUMN}`;

    const { data: traineeRowsRaw, error: traineeErr } = await supabase
      .from("user_entry_united_view")
      .select(traineeSelect)
      .in(USER_VIEW_KEY_COLUMN, Array.from(entryKeySet));

    if (traineeErr) {
      console.error("[OJT] trainee 取得エラー:", traineeErr);
      throw traineeErr;
    }

    const traineeRows = (traineeRowsRaw ?? []) as AnyRow[];

    const traineeUserSet = new Set<string>();
    for (const r of traineeRows) {
      const uid = r["user_id"];
      if (typeof uid === "string" && uid) {
        traineeUserSet.add(uid);
      }
    }

    console.log(
      "[OJT] traineeUserSet size =",
      traineeUserSet.size,
      "sample =",
      Array.from(traineeUserSet).slice(0, 10)
    );

    if (traineeUserSet.size === 0) {
      console.log("[OJT] trainee が 0 名のため終了");
      return {
        ok: true,
        checkedShifts: 0,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    // ------------------------------------------------------------
    // ③ トレーナー: user_entry_united_view.level_sort < 4,500,000
    // ------------------------------------------------------------

    const { data: trainerRowsRaw, error: trainerErr } = await supabase
      .from("user_entry_united_view")
      .select("user_id, level_sort")
      .lt("level_sort", 4_500_000);

    if (trainerErr) {
      console.error("[OJT] trainer 取得エラー:", trainerErr);
      throw trainerErr;
    }

    const trainerRows = (trainerRowsRaw ?? []) as AnyRow[];

    const trainerUserSet = new Set<string>();
    for (const u of trainerRows) {
      const uid = u["user_id"];
      if (typeof uid === "string" && uid) {
        trainerUserSet.add(uid);
      }
    }

    console.log(
      "[OJT] trainerUserSet size =",
      trainerUserSet.size,
      "sample =",
      Array.from(trainerUserSet).slice(0, 10)
    );

    if (trainerUserSet.size === 0) {
      console.log("[OJT] trainer が 0 名のため終了");
      return {
        ok: true,
        checkedShifts: 0,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    // ------------------------------------------------------------
    // ④ シフト取得（cs_id では絞り込まない。日付のみ）
    // ------------------------------------------------------------

    const { data: shiftRowsRaw, error: shiftErr } = await supabase
      .from("shift")
      .select(
        "shift_id, shift_start_date, shift_start_time, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id"
      )
      .gte("shift_start_date", fromDateStr);

    if (shiftErr) {
      console.error("[OJT] shift 取得エラー:", shiftErr);
      throw shiftErr;
    }

    const shiftRows = (shiftRowsRaw ?? []) as ShiftRow[];

    const checkedShifts = shiftRows.length;
    console.log("[OJT] shiftRows =", checkedShifts);
    console.log("[OJT] shiftRows sample =", shiftRows.slice(0, 5));

    if (checkedShifts === 0) {
      console.log("[OJT] 対象期間内のシフトが 0 件のため終了");
      return {
        ok: true,
        checkedShifts,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    // ------------------------------------------------------------
    // ⑤ shift_records 取得（submitted / approved のみ）
    // ------------------------------------------------------------

    const shiftIds = Array.from(new Set(shiftRows.map((s) => s.shift_id)));
    console.log("[OJT] shiftIds count =", shiftIds.length);

    const { data: recordRowsRaw, error: srErr } = await supabase
      .from("shift_records")
      .select("id, shift_id, status")
      .in("shift_id", shiftIds)
      .in("status", ["submitted", "approved"]);

    if (srErr) {
      console.error("[OJT] shift_records 取得エラー:", srErr);
      throw srErr;
    }

    const recordRows = (recordRowsRaw ?? []) as ShiftRecordRow[];

    console.log("[OJT] shift_records rows =", recordRows.length);

    const recordByShiftId = new Map<number, ShiftRecordRow>();
    for (const r of recordRows) {
      recordByShiftId.set(r.shift_id, r);
    }

    // ------------------------------------------------------------
    // ⑥ trainee と trainer が同じシフトにいるものだけ抽出
    // ------------------------------------------------------------

    const rawCandidates: {
      shift: ShiftRow;
      record: ShiftRecordRow;
      traineeUserId: string;
      trainerUserId: string;
    }[] = [];

    for (const shift of shiftRows) {
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
    console.log(
      "[OJT] rawCandidates sample =",
      rawCandidates.slice(0, 5).map((c) => ({
        shiftId: c.shift.shift_id,
        date: c.shift.shift_start_date,
        start: c.shift.shift_start_time,
        trainee: c.traineeUserId,
        trainer: c.trainerUserId,
      }))
    );

    if (rawCandidates.length === 0) {
      console.log("[OJT] trainee & trainer 同席シフト 0 件のため終了");
      return {
        ok: true,
        checkedShifts,
        candidateOjtCount: 0,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    // ------------------------------------------------------------
    // ⑦ record_items をまとめて取得（def の配列/単体を正規化）
    // ------------------------------------------------------------

    const recordIds = Array.from(
      new Set(rawCandidates.map((c) => c.record.id))
    );
    console.log("[OJT] recordIds count =", recordIds.length);

    const { data: itemRowsRaw, error: itemErr } = await supabase
      .from("shift_record_items")
      .select(
        "record_id, value_text, note, def:shift_record_item_defs(code, label)"
      )
      .in("record_id", recordIds);

    if (itemErr) {
      console.error("[OJT] shift_record_items 取得エラー:", itemErr);
      throw itemErr;
    }

    const rawItems = (itemRowsRaw ?? []) as RawItemRow[];
    console.log("[OJT] shift_record_items rows =", rawItems.length);

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
    // ⑧ 重複チェック（user_id + date + start_time）
    // ------------------------------------------------------------

    const { data: existRowsRaw, error: existErr } = await supabase
      .from("user_ojt_record")
      .select("user_id, date, start_time")
      .gte("date", fromDateStr);

    if (existErr) {
      console.error("[OJT] user_ojt_record 取得エラー:", existErr);
      throw existErr;
    }

    const existRows = (existRowsRaw ?? []) as ExistingOjtRow[];

    console.log("[OJT] 既存 user_ojt_record rows =", existRows.length);

    const existingKey = new Set<string>();
    for (const r of existRows) {
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

      if (localKey.has(key)) continue; // 同一キーの重複候補をまとめる
      localKey.add(key);

      if (existingKey.has(key)) continue; // 既に user_ojt_record にあるものはスキップ

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

    console.log("[OJT] deduped (新規 OJT候補) =", deduped.length);
    console.log("[OJT] deduped sample =", deduped.slice(0, 5));

    if (deduped.length === 0) {
      console.log("[OJT] 新規 OJT 0 件のため終了");
      return {
        ok: true,
        checkedShifts,
        candidateOjtCount: rawCandidates.length,
        inserted: 0,
        skippedExisting: 0,
      };
    }

    // ------------------------------------------------------------
    // ⑨ ChatGPT で memo 生成 → INSERT
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
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[OJT] ChatGPT 生成失敗:", msg);
        errors.push({
          message: `ChatGPT 生成失敗: ${msg}`,
        });
      }
    }

    console.log("[OJT] insertRows length =", insertRows.length);

    let inserted = 0;

    if (!dryRun && insertRows.length > 0) {
      const { error: insErr } = await supabase
        .from("user_ojt_record")
        .insert(insertRows);
      if (insErr) {
        console.error("[OJT] user_ojt_record INSERT エラー:", insErr);
        throw insErr;
      }
      inserted = insertRows.length;
      console.log("[OJT] INSERT 完了 rows =", inserted);
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
    console.error("[OJT] 例外発生:", msg);
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
