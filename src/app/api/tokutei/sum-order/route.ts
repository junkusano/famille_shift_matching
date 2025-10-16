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
  code: string | null;
  l_id: string | null;
  label: string;
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
        if (code && val) byCode[code].push(val);

        // B) 実施サービス（checkbox でチェック済み & l_id≠事前）
        const def = checkboxDefMap.get(it.item_def_id);
        if (def && isChecked(val)) {
          if (def.active && def.input_type === "checkbox" && def.l_id !== PRE_L_ID_EXCLUDE) {
            executedLabels.push(def.label);
          }
        }
      }
    }

    // ==== ここで「特変無」を補完 ====
    const adlTxt = withDefault(byCode.adl);
    const needsTxt = withDefault(byCode.needs);
    const envTxt = withDefault(byCode.enviroment);
    const otherTxt = withDefault(byCode.other_status);

    const prevSummaryText = [
      "【前回の状況】",
      executedLabels.length ? `・実施したサービス：${uniqJoin(executedLabels)}` : "",
      `・ADLの変化：${adlTxt}`,
      `・ご本人の要望：${needsTxt}`,
      `・環境・ご家族の状況：${envTxt}`,
      `・その他・ご様子：${otherTxt}`,
    ]
      .filter((s) => s !== "")
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

/** 空なら「特変無」を返す */
function withDefault(values: string[]): string {
  const txt = uniqJoin(values);
  return txt && txt.length > 0 ? txt : "特変無";
}

/** ✅判定（value_text は text のため表記ゆれを吸収） */
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
  const scopeHint = serviceScopeHint(ctx.cur.service_code);
  const prevTokutei = (ctx.cur.tokutei_comment ?? "").trim() || "(前回特記事項なし)";

  const sys =
    "あなたは訪問介護のサービス提供責任者です。" +
    " 指示は『前回状況(30)＋前回特記事項(30)＋サービス範囲(20)』を核に、必要時のみ補助情報を使います。" +
    " 季節の常套句や抽象表現は避け、前回内容を起点に具体的な確認/配慮を1〜2点だけ、1文で示してください。" +
    " 教訓リマインド(下記ガイド)から“該当するテーマを最大1つだけ”統合して多様性を出し、範囲外/医療断定/私的関与/個人情報漏洩を避ける。" +
    " 出力：日本語・150文字以内・平文1文・句点で終える。";

  const usr = [
    `今回シフト: ${ctx.cur.shift_start_date ?? ""} ${ctx.cur.shift_start_time ?? ""} / サービス: ${ctx.cur.service_code ?? "-"}`,
    `サービス範囲ヒント: ${scopeHint}`,
    "重み: 前回状況=30, 特記事項=30, サービス範囲=20（季節は必要時のみ）。",
    `前回状況:\n${ctx.prevSummaryText || "(記載なし)"}`,
    `前回特記事項:\n${prevTokutei}`,
    "教訓ガイド（必要な場合のみ1テーマ反映）:\n" + REMINDER_GUIDE,
    "出力条件: 具体/実施可能/1文/150字以内。常套句NG。"
  ].join("\n");

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: usr },
    ],
    temperature: 0.45, // 季節テンプレ回避しつつ、表現のバリエーションを少し確保
    max_tokens: 220,
  });

  const text = resp.choices?.[0]?.message?.content?.trim() ?? "";
  return text.length > 150 ? text.slice(0, 150) : text;
}


function serviceScopeHint(code: string | null): string {
  const c = (code ?? "").toLowerCase();
  if (c.includes("移動") || c.includes("同行") || c.includes("通院")) {
    return "移動支援系：道中の安全誘導・待機・経路確認に限定。居宅内の室温/掃除/調理等は含めない。";
  }
  if (c.includes("生活") || c.includes("援助") || c.includes("家事")) {
    return "生活援助：掃除・洗濯・買物・調理など家事範囲。医療判断/機能訓練の断定は不可。";
  }
  if (c.includes("身体") || c.includes("入浴") || c.includes("排泄") || c.includes("更衣")) {
    return "身体介護：体調観察・移乗・清拭・入浴・排泄など。医療行為や診断の断定は禁止。";
  }
  return "サービス種別の範囲を逸脱しない内容に限定。";
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

// 教訓リマインド要約（短文化・圧縮）— 生成時の多様性ソース
const REMINDER_GUIDE = `
【境界・倫理】
- 私的誘い・個人連絡先交換・贈与/受領・飲食の提供/受領は拒否。困難時は即マネジャー連絡。
- 他利用者の話題や個人情報は厳禁。写真/鍵・暗証番号/医療・金銭情報は厳重管理と同意徹底。
- 事業所/同僚への不満を利用者に話さない。ハラスメントは即退出→報告。

【安全・装備・衛生】
- 外出支援は運動靴・両手フリー（リュック等）。転倒/接触/破損リスクを先読み。
- きれい/汚いの分離、道具の用途確認。自分用タオル携行。香り・長い爪・アクセサリー配慮。
- 駐車は許可証・区一致。違反ゼロ方針。診療室滞在は算定外。

【金銭・会計・買物】
- 受け取り額/差額/釣銭/レシートを声出し相互確認。ポイントは利用者のもの。預かり品は袋で一括管理。
- 会計は利用者分と自分分を分離。代替購入は事前確認。

【手順・記録・連絡】
- 初回/変更時は基本情報・手順書・フェイスシートを必読。分からなければその場で確認。
- 外出支援は「経路・手段・目的」を記録。延長/内容変更は独断禁止→マネジャー経由で判断。
- 次回予定はその場で共有。グループでの即時共有・手順書反映を徹底。

【コミュニケーション設計】
- “自分の話＜相手の関心”で質問と傾聴を基本に。初対面は丁寧さ優先、冗談・フランクは慎重に。
- 障害特性に応じて具体的な情報提示（同行援護：位置/構造/勾配/タイミングを言語化）。
- 観察ポイント：行動変化、環境リスク、持ち物/装備の不備、説明や同意の抜け、記録の欠落。

【再発防止の姿勢】
- 問題は隠さず共有し仕組みで防ぐ。自力で難しい時は即座に相談・同行依頼。
`;
