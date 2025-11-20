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

// -----------------------------
// 型定義（any なし）
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
        code: string;
        label: string;
    } | null;
}

interface ExistingOjtRow {
    user_id: string;
    date: string;
    start_time: string | null;
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

    // ★ 入社判定：直近3ヶ月以内
    const entryFromDate = subMonths(baseDate, 6);
    const entryFromStr = formatInTimeZone(entryFromDate, timeZone, "yyyy-MM-dd");

    // ★ 期間：1ヶ月前の1日以降
    const fromDate = startOfMonth(subMonths(baseDate, 1));
    const fromDateStr = formatInTimeZone(fromDate, timeZone, "yyyy-MM-dd");

    const errors: { message: string }[] = [];

    try {
        console.log("[OJT] 開始 baseDate =", baseDate.toISOString());
        console.log("[OJT] home entry 対象 >= ", entryFromStr);

        // ------------------------------------------------------------
        // ① home entry (form_entries) から「最近エントリーのある auth_uid」を取得
        //    - created_at >= fromDateStr
        //    - auth_uid が NULL でないもの
        // ------------------------------------------------------------

        const feRes = await supabase
            .from("form_entries")
            .select("auth_uid, created_at")
            .gte("created_at", entryFromStr);

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
        //    - user_entry_united_view.auth_uid IN authUidSet
        // ------------------------------------------------------------

        const traineeRes = await supabase
            .from("user_entry_united_view_single")
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
        // ④ シフト取得（トレーナー＋トレーニーが同じシフトに入っているものだけ）
        // ------------------------------------------------------------

        // すでに上で作っているはず：
        // const traineeUserSet = new Set<string>();
        // const trainerUserSet = new Set<string>();

        const traineeUsers = Array.from(traineeUserSet);
        const trainerUsers = Array.from(trainerUserSet);

        console.log("[OJT] traineeUsers =", traineeUsers);
        console.log("[OJT] trainerUsers =", trainerUsers);

        if (traineeUsers.length === 0 || trainerUsers.length === 0) {
            console.log("[OJT] trainee or trainer が 0 のため終了");
            return {
                ok: true,
                checkedShifts: 0,
                candidateOjtCount: 0,
                inserted: 0,
                skippedExisting: 0,
            };
        }

        // in(...) 用の文字列
        const traineeList = traineeUsers.join(",");
        const trainerList = trainerUsers.join(",");

        // 条件イメージ：
        //
        // 1) staff_01 がトレーニー かつ (staff_02 or staff_03 がトレーナー)
        // 2) staff_02 がトレーニー かつ staff_01 がトレーナー
        // 3) staff_03 がトレーニー かつ staff_01 がトレーナー
        //
        // PostgREST の or / and で書くと：
        const orFilter = [
            // case 1
            `and(staff_01_user_id.in.(${traineeList}),or(staff_02_user_id.in.(${trainerList}),staff_03_user_id.in.(${trainerList})))`,
            // case 2
            `and(staff_02_user_id.in.(${traineeList}),staff_01_user_id.in.(${trainerList}))`,
            // case 3
            `and(staff_03_user_id.in.(${traineeList}),staff_01_user_id.in.(${trainerList}))`,
        ].join(",");

        const shiftRes = await supabase
            .from("shift")
            .select(
                "shift_id, shift_start_date, shift_start_time, kaipoke_cs_id, staff_01_user_id, staff_02_user_id, staff_03_user_id"
            )
            .gte("shift_start_date", fromDateStr)
            .or(orFilter);

        if (shiftRes.error) {
            console.error("[OJT] shift 取得エラー:", shiftRes.error);
            throw shiftRes.error;
        }

        const shiftRows = (shiftRes.data ?? []) as ShiftRow[];

        const checkedShifts = shiftRows.length;
        console.log("[OJT] shiftRows（トレーナー＋トレーニー同席のみ） =", checkedShifts);
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

        const srRes = await supabase
            .from("shift_records")
            .select("id, shift_id, status")
            .in("shift_id", shiftIds)
            .in("status", ["submitted", "approved"]);

        if (srRes.error) {
            console.error("[OJT] shift_records 取得エラー:", srRes.error);
            throw srRes.error;
        }

        const recordRows = (srRes.data ?? []) as ShiftRecordRow[];

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
            ].filter((x): x is string => x !== null);

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

        const itemRes = await supabase
            .from("shift_record_items")
            .select(
                "record_id, value_text, note, def:shift_record_item_defs(code, label)"
            )
            .in("record_id", recordIds);

        if (itemRes.error) {
            console.error("[OJT] shift_record_items 取得エラー:", itemRes.error);
            throw itemRes.error;
        }

        const rawItems = (itemRes.data ?? []) as RawItemRow[];
        console.log("[OJT] shift_record_items rows =", rawItems.length);

        const itemsByRecordId = new Map<string, ShiftRecordItemRow[]>();

        for (const it of rawItems) {
            let def: ShiftRecordItemRow["def"] = undefined;

            const rawDef = it.def;
            if (Array.isArray(rawDef)) {
                if (rawDef.length > 0) {
                    const d0 = rawDef[0];
                    def = {
                        code: (d0.code ?? "").toString(),
                        label: (d0.label ?? "").toString(),
                    };
                }
            } else if (rawDef) {
                def = {
                    code: (rawDef.code ?? "").toString(),
                    label: (rawDef.label ?? "").toString(),
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
            console.error("[OJT] user_ojt_record 取得エラー:", existRes.error);
            throw existRes.error;
        }

        const existRows = (existRes.data ?? []) as ExistingOjtRow[];

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

        // ★ 同じ user_id + date は 1件だけ残す
        // その日に一番早いシフトを優先したいので、先にソート
        deduped.sort((a, b) => {
            if (a.date === b.date) {
                return a.startTime.localeCompare(b.startTime);
            }
            return a.date.localeCompare(b.date);
        });

        const byTraineeDay = new Map<string, OjtCandidate>();

        for (const c of deduped) {
            const key = `${c.traineeUserId}__${c.date}`;
            if (!byTraineeDay.has(key)) {
                byTraineeDay.set(key, c);
            }
        }

        const dailyReduced = Array.from(byTraineeDay.values());

        console.log(
            "[OJT] user/day 単位に絞り込んだ OJT候補 =",
            dailyReduced.length
        );
        console.log("[OJT] dailyReduced sample =", dailyReduced.slice(0, 5));

        if (dailyReduced.length === 0) {
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
            } catch (e) {
                const msg =
                    e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
                console.error("[OJT] ChatGPT 生成失敗:", msg);
                errors.push({
                    message: `ChatGPT 生成失敗: ${msg}`,
                });
            }
        }

        console.log("[OJT] insertRows length =", insertRows.length);

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
            checkedShifts,
            candidateOjtCount: rawCandidates.length,
            inserted,
            skippedExisting: existingKey.size,
            errors: errors.length ? errors : undefined,
        };
    } catch (e) {
        const msg =
            e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
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
            const value =
                (it.value_text ?? "").trim() ||
                (it.note ? `（備考）${it.note}` : "");
            if (!value) return null;
            return `・${label}: ${value}`;
        })
        .filter((v): v is string => v !== null)
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

    const content = res.choices[0]?.message?.content;
    return (content ?? "").trim() ||
        "自動生成に失敗しましたが、当該シフトで育成を実施しました。";
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
