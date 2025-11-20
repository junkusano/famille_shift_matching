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

// ChatGPT クライアント
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ===========================================
// 型定義
// ===========================================

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

interface FormEntryRow {
    auth_uid: string | null;
    created_at: string | null;
}

interface UserEntryUnitedViewRow {
    user_id: string | null;
    auth_uid: string | null;
    level_sort: number | null;
}

interface ShiftRow {
    shift_id: number;
    shift_start_date: string; // yyyy-mm-dd
    shift_start_time: string | null; // HH:mm:ss
    kaipoke_cs_id: string | null;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
}

interface ShiftRecordRow {
    id: string;
    shift_id: number;
    status: string;
}

interface ItemDefRow {
    code: string | null;
    label: string | null;
}

interface RawItemRow {
    record_id: string;
    value_text: string | null;
    note: string | null;
    def?: ItemDefRow | ItemDefRow[] | null;
}

interface ShiftRecordItemRow {
    record_id: string;
    value_text: string | null;
    note: string | null;
    def?: {
        code: string | null;
        label: string | null;
    } | null;
}

interface OjtCandidate {
    shiftId: number;
    date: string;
    startTime: string;
    kaipokeCsId: string | null;
    traineeUserId: string;
    trainerUserId: string | null;
    recordId: string;
}

interface UserOjtInsertRow {
    user_id: string;
    date: string;
    start_time: string;
    trainer_user_id: string | null;
    kaipoke_cs_id: string | null;
    memo: string;
}

// ===========================================
// メイン処理
// ===========================================

export async function runUserOjtJob(
    options: UserOjtJobOptions = {}
): Promise<UserOjtJobResult> {
    const baseDate = options.baseDate ?? new Date();
    const dryRun = options.dryRun ?? DRY_RUN_DEFAULT;

    // ★ 期間：2ヶ月前の1日以降
    const fromDate = startOfMonth(subMonths(baseDate, 2));
    const fromDateStr = formatInTimeZone(fromDate, timeZone, "yyyy-MM-dd");

    const errors: { message: string }[] = [];

    try {
        console.log("[OJT] 開始 baseDate =", baseDate.toISOString());
        console.log("[OJT] home entry 対象 >= ", fromDateStr);

        // ------------------------------------------------------------
        // ① home entry (form_entries) から「最近エントリーのある auth_uid」を取得
        //    - created_at >= fromDateStr
        // ------------------------------------------------------------

        const feRes = await supabase
            .from("form_entries")
            .select("auth_uid, created_at")
            .gte("created_at", fromDateStr);

        if (feRes.error) {
            console.error("[OJT] form_entries 取得エラー:", feRes.error);
            throw feRes.error;
        }

        const feRows = (feRes.data ?? []) as FormEntryRow[];
        console.log("[OJT] form_entries rows =", feRows.length);

        const authUidSet = new Set<string>();
        for (const r of feRows) {
            if (typeof r.auth_uid === "string" && r.auth_uid) {
                authUidSet.add(r.auth_uid);
            }
        }

        console.log(
            "[OJT] home entry auth_uid size =",
            authUidSet.size,
            "sample =",
            Array.from(authUidSet).slice(0, 10)
        );

        if (authUidSet.size === 0) {
            console.log("[OJT] home entry 対象 0 件のため終了");
            return {
                ok: true,
                checkedShifts: 0,
                candidateOjtCount: 0,
                inserted: 0,
                skippedExisting: 0,
            };
        }

        // ------------------------------------------------------------
        // ② OJTされる側（トレーニー）
        //    - user_entry_united_view.auth_uid IN authUidSet
        //    - ★ level_sort の条件はかけない（指定どおり）
        // ------------------------------------------------------------

        const traineeRes = await supabase
            .from("user_entry_united_view")
            .select("user_id, auth_uid")
            .in("auth_uid", Array.from(authUidSet));

        if (traineeRes.error) {
            console.error("[OJT] trainee 取得エラー:", traineeRes.error);
            throw traineeRes.error;
        }

        const traineeRows = (traineeRes.data ?? []) as UserEntryUnitedViewRow[];

        const traineeUserSet = new Set<string>();
        for (const r of traineeRows) {
            if (typeof r.user_id === "string" && r.user_id) {
                traineeUserSet.add(r.user_id);
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
        //    - 付き添う人だけ level_sort で絞る
        // ------------------------------------------------------------

        const trainerRes = await supabase
            .from("user_entry_united_view")
            .select("user_id, level_sort")
            .lt("level_sort", 4_500_000);

        if (trainerRes.error) {
            console.error("[OJT] trainer 取得エラー:", trainerRes.error);
            throw trainerRes.error;
        }

        const trainerRows = (trainerRes.data ?? []) as UserEntryUnitedViewRow[];

        const trainerUserSet = new Set<string>();
        for (const u of trainerRows) {
            if (typeof u.user_id === "string" && u.user_id) {
                trainerUserSet.add(u.user_id);
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
        // ④ シフト取得（期間内のシフト → メモリ上で trainer / trainee 判定）
        // ------------------------------------------------------------

        const shiftRes = await supabase
            .from("shift")
            .select(
                "shift_id, shift_start_date, shift_start_time, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id"
            )
            .gte("shift_start_date", fromDateStr);

        if (shiftRes.error) {
            console.error("[OJT] shift 取得エラー:", shiftRes.error);
            throw shiftRes.error;
        }

        const shiftRows = (shiftRes.data ?? []) as ShiftRow[];

        console.log("[OJT] 期間内 shift rows =", shiftRows.length);

        if (shiftRows.length === 0) {
            console.log("[OJT] 期間内 shift 0 件のため終了");
            return {
                ok: true,
                checkedShifts: 0,
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

        const srRes = await supabase
            .from("shift_records")
            .select("id, shift_id, status")
            .in("shift_id", shiftIds)
            .in("status", ["submitted", "approved"]);

        if (srRes.error) {
            console.error("[OJT] shift_records 取得エラー:", srRes.error);
            throw srRes.error;
        }

        const srRows = (srRes.data ?? []) as ShiftRecordRow[];
        console.log("[OJT] shift_records rows =", srRows.length);

        const recordByShiftId = new Map<number, ShiftRecordRow>();
        for (const r of srRows) {
            recordByShiftId.set(r.shift_id, r); // shift_id は unique 制約あり
        }

        // ------------------------------------------------------------
        // ⑥ OJT 候補（rawCandidates）作成
        //    - 同じ shift に traineeUserSet ∧ trainerUserSet が両方存在するもの
        // ------------------------------------------------------------

        const rawCandidates: {
            shift: ShiftRow;
            record: ShiftRecordRow;
            traineeUserId: string;
            trainerUserId: string | null;
        }[] = [];

        for (const shiftRow of shiftRows) {
            const record = recordByShiftId.get(shiftRow.shift_id);
            if (!record) continue; // 記録が無いシフトは対象外

            const staffIds = [
                shiftRow.staff_01_user_id,
                shiftRow.staff_02_user_id,
                shiftRow.staff_03_user_id,
            ].filter((id): id is string => typeof id === "string" && !!id);

            if (staffIds.length < 2) continue; // 一人勤務はOJT対象外

            const traineesInShift = staffIds.filter((id) =>
                traineeUserSet.has(id)
            );
            const trainersInShift = staffIds.filter((id) =>
                trainerUserSet.has(id)
            );

            if (traineesInShift.length === 0) continue; // OJT対象者がいない
            if (trainersInShift.length === 0) continue; // 付き添う人がいない

            for (const traineeUserId of traineesInShift) {
                // trainee 以外の trainer を優先
                const trainerUserId =
                    trainersInShift.find((id) => id !== traineeUserId) ??
                    trainersInShift[0] ??
                    null;

                if (!trainerUserId) continue;

                rawCandidates.push({
                    shift: shiftRow,
                    record,
                    traineeUserId,
                    trainerUserId,
                });
            }
        }

        console.log("[OJT] rawCandidates =", rawCandidates.length);

        if (rawCandidates.length === 0) {
            console.log("[OJT] trainer+trainee が同席するシフトが無いため終了");
            return {
                ok: true,
                checkedShifts: shiftRows.length,
                candidateOjtCount: 0,
                inserted: 0,
                skippedExisting: 0,
            };
        }

        // ------------------------------------------------------------
        // ⑦ shift_record_items をまとめて取得
        // ------------------------------------------------------------

        const recordIds = Array.from(
            new Set(rawCandidates.map((c) => c.record.id))
        );
        console.log("[OJT] recordIds =", recordIds.length);

        const itemsRes = await supabase
            .from("shift_record_items")
            .select(
                "record_id, value_text, note, def:shift_record_item_defs(code, label)"
            )
            .in("record_id", recordIds);

        if (itemsRes.error) {
            console.error("[OJT] shift_record_items 取得エラー:", itemsRes.error);
            throw itemsRes.error;
        }

        const rawItems = (itemsRes.data ?? []) as RawItemRow[];

        const itemsByRecordId = new Map<string, ShiftRecordItemRow[]>();

        for (const it of rawItems) {
            const defValue = it.def;
            let def: { code: string | null; label: string | null } | null = null;

            if (Array.isArray(defValue)) {
                const v = defValue[0];
                def = v
                    ? {
                          code: v.code ?? null,
                          label: v.label ?? null,
                      }
                    : null;
            } else if (defValue) {
                def = {
                    code: defValue.code ?? null,
                    label: defValue.label ?? null,
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

        const existRes = await supabase
            .from("user_ojt_record")
            .select("user_id, date, start_time")
            .gte("date", fromDateStr);

        if (existRes.error) {
            console.error("[OJT] user_ojt_record 既存取得エラー:", existRes.error);
            throw existRes.error;
        }

        const existRows = (existRes.data ?? []) as {
            user_id: string;
            date: string;
            start_time: string | null;
        }[];

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
                checkedShifts: shiftRows.length,
                candidateOjtCount: rawCandidates.length,
                inserted: 0,
                skippedExisting: existingKey.size,
            };
        }

        // ------------------------------------------------------------
        // ⑨ ChatGPT で memo を生成 & INSERT 行を作成
        // ------------------------------------------------------------

        const insertRows: UserOjtInsertRow[] = [];

        for (const c of deduped) {
            const items = itemsByRecordId.get(c.recordId) ?? [];

            try {
                const memoBody = await generateOjtMemo(c, items);
                const memo = memoBody + "\n\n" + buildFooter();

                insertRows.push({
                    user_id: c.traineeUserId,
                    date: c.date,
                    start_time: c.startTime,
                    trainer_user_id: c.trainerUserId,
                    kaipoke_cs_id: c.kaipokeCsId,
                    memo,
                });
            } catch (e) {
                const msg =
                    e instanceof Error
                        ? e.message
                        : typeof e === "string"
                        ? e
                        : String(e);
                console.error("[OJT] ChatGPT 生成失敗:", msg);
                errors.push({ message: msg });
            }
        }

        let inserted = 0;

        if (!dryRun && insertRows.length > 0) {
            const insRes = await supabase
                .from("user_ojt_record")
                .insert(insertRows);

            if (insRes.error) {
                console.error("[OJT] user_ojt_record INSERT エラー:", insRes.error);
                throw insRes.error;
            }
            inserted = insertRows.length;
            console.log("[OJT] INSERT 完了 rows =", inserted);
        } else if (dryRun) {
            console.log("[OJT] DRY RUN: 挿入予定行数 =", insertRows.length);
        }

        return {
            ok: true,
            checkedShifts: shiftRows.length,
            candidateOjtCount: rawCandidates.length,
            inserted,
            skippedExisting: existingKey.size,
            errors: errors.length ? errors : undefined,
        };
    } catch (e) {
        const msg =
            e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
        console.error("[OJT] 予期せぬエラー:", msg);
        errors.push({ message: msg });

        return {
            ok: false,
            checkedShifts: 0,
            candidateOjtCount: 0,
            inserted: 0,
            skippedExisting: 0,
            errors,
        };
    }
}

// ===========================================
// ChatGPT でメモ生成
// ===========================================

async function generateOjtMemo(
    c: OjtCandidate,
    items: ShiftRecordItemRow[]
): Promise<string> {
    const lines = items
        .map((it) => {
            const label = it.def?.label ?? it.def?.code ?? "項目";
            const value =
                (it.value_text ?? "").trim() ||
                (it.note ? `（備考）${it.note}` : "");
            if (!value) return null;
            return `・${label}: ${value}`;
        })
        .filter((v): v is string => v !== null)
        .join("\n");

    const prompt = `
以下は、ある訪問サービスのシフト実績記録です。

- 実施日: ${c.date}
- 開始時間: ${c.startTime}
- OJT対象職員（育成される側）: ${c.traineeUserId}
- トレーナー（付き添う側）: ${c.trainerUserId ?? "（同席者）"}

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

    const content = res.choices[0]?.message?.content;
    return (content ?? "").trim() || "OJT内容の自動生成に失敗しました。";
}

// ===========================================
// BCP・虐待防止などの定型文
// ===========================================

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
