// C:\Users\USER\famille_shift_matching\src\lib\supabase\analyzeTalksAndDispatchToRPA.ts

import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";
import { rpaInstructionPrompt } from "@/lib/supabase/rpaInstructionPrompt";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage"; // ★ 追加：既存の送信ヘルパーを使用
// 既存（変更なし）
import { insertShifts } from "@/lib/supabase/shiftAdd";
import { deleteShifts } from "@/lib/supabase/shiftDelete";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type GroupedTalk = {
  ids: number[];
  talks: { role: "user" | "assistant" | "system"; content: string }[];
};

type GroupMember = {
  externalKey: string;
  id: string;
  type: "USER" | "ORGUNIT" | "GROUP";
};

const analyzePendingTalksAndDispatch = async (): Promise<void> => {
  const { data: logs, error } = await supabase
    .from("msg_lw_log_with_group_account")
    .select("id, user_id, channel_id, message, timestamp, group_account")
    .eq("status", 0)
    .eq("event_type", "message")
    .neq("message", null)
    .eq("is_numeric_group_account", true)
    .order("timestamp", { ascending: true });

  console.log("Supabase status fetch error:", error);
  console.log("logs:", logs);

  if (error || !logs || logs.length === 0) return;

  const grouped: Record<string, GroupedTalk> = logs.reduce((acc, log) => {
    const key = log.channel_id || `user:${log.user_id}`;
    if (!acc[key]) acc[key] = { ids: [], talks: [] };
    acc[key].ids.push(log.id);
    acc[key].talks.push({ role: "user", content: log.message });
    return acc;
  }, {} as Record<string, GroupedTalk>);

  for (const [channel_id, { ids, talks }] of Object.entries(grouped)) {
    if (talks.length === 0) continue;

    const baseLog = logs.find((log) => ids.includes(log.id));
    const group_account = baseLog?.group_account || "不明";
    const timestampUtc = baseLog?.timestamp || new Date().toISOString();
    const jstDate = new Date(timestampUtc);
    jstDate.setHours(jstDate.getHours() + 9);
    const timestamp = jstDate.toISOString().replace("T", " ").replace(".000Z", "");

    // 既存：メンバー取得のためのトークン（この後の返信にも再利用）
    const accessToken = await getAccessToken();

    const groupRes = await fetch(`https://www.worksapis.com/v1.0/groups/${channel_id}/members`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const groupData = await groupRes.json();
    const members: GroupMember[] = groupData.members || [];

    const mentionMap = members
      .filter((m): m is GroupMember & { type: "USER" } => m.type === "USER")
      .map((m) => ({ name: m.externalKey, user_id: m.id }));

    const messages: ChatCompletionMessageParam[] = [
      rpaInstructionPrompt,
      { role: "system", content: `この会話は group_account=${group_account} のやりとりです。` },
      { role: "system", content: `この会話の基準日（最終発言時刻）は ${timestamp} です。` },
      {
        role: "system",
        content:
          `この会話には以下のメンションがあります（JSON形式）。文中に出てくる @名前 に対応する user_id は以下のとおりです。内容に登場する人物の担当者IDを特定する際に必ず参考にしてください。\n` +
          JSON.stringify(mentionMap, null, 2),
      },
      ...talks.map((t) => ({ role: t.role, content: t.content })),
    ];

    const res = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0,
    });

    const responseText = (res.choices?.[0]?.message?.content ?? "").trim();
    console.log("🔍 AI応答内容:", responseText);

    await supabase.from("msg_lw_analysis_log").insert({
      timestamp: new Date().toISOString(),
      channel_id: channel_id,
      text: responseText,
      reason: responseText.toLowerCase() === "処理なし" ? "処理不要" : "処理判定済",
    });

    if (responseText.trim() === "処理なし") {
      for (const id of ids) {
        const { error: updateErr } = await supabase.from("msg_lw_log").update({ status: 2 }).eq("id", id);
        if (updateErr) {
          console.error(`❌ Update failed for id=${id} (status=2):`, updateErr.message);
        }
      }
      continue;
    }

    try {
      let cleanedText = responseText;
      if (cleanedText.startsWith("```") && cleanedText.endsWith("```")) {
        cleanedText = cleanedText.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
      }

      const parsed = JSON.parse(cleanedText) as {
        template_id: string;
        request_detail: any; // 既存仕様を維持
      };
      const { template_id, request_detail } = parsed;

      // === シフト削除（まずDBから直接削除） ===
      if (template_id === "9bcfa71a-e800-4b49-a6aa-b80016b4b683") {
        console.log("🚀 シフト削除リクエストを検知。shiftテーブルから直接削除を試行します。");
        const deleteResult = await deleteShifts(request_detail);

        if (deleteResult.success) {
          // ★ 追加：成功時のフィードバックを元のチャネルへ
          const deletions: Array<{ shift_date?: string; shift_time?: string }> =
            Array.isArray(request_detail?.deletions) ? request_detail.deletions : [];
          const ga = request_detail?.group_account ?? group_account;

          const lines: string[] = ["✅ シフト削除を反映しました。"];
          for (const d of deletions) {
            lines.push(`・利用者: ${ga} / 日付: ${d.shift_date ?? "不明"} / 時間: ${d.shift_time ?? "不明"}`);
          }
          lines.push("", "※ カイポケ側の反映には時間がかかる場合があります。");

          await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
        } else {
          console.error("⚠️ シフト削除処理中にエラーが発生しました:", deleteResult.errors);

          // ★ 既に実装済み：失敗理由を元の会話チャネルへ返す
          const deletions: Array<{ shift_date?: string; shift_time?: string }> =
            Array.isArray(request_detail?.deletions) ? request_detail.deletions : [];
          const ga = request_detail?.group_account ?? group_account;

          const errs: string[] = Array.isArray(deleteResult.errors) ? deleteResult.errors : [];
          const isMissing = errs.some((e) => typeof e === "string" && e.includes("必須情報不足"));
          const isNotFound = errs.some(
            (e) => typeof e === "string" && (e.includes("見つかりません") || e.includes("not found"))
          );

          let header = "⚠️ シフト削除に失敗しました。";
          if (isMissing) header = "⚠️ シフト削除できませんでした（必須情報が不足しています）。";
          else if (isNotFound) header = "⚠️ シフト削除警告: 対象シフトが見つかりませんでした。";

          const lines: string[] = [header];
          for (const d of deletions) {
            lines.push(`・利用者: ${ga} / 日付: ${d.shift_date ?? "不明"} / 時間: ${d.shift_time ?? "不明"}`);
          }
          if (isMissing) {
            lines.push("", "例）「10/13 08:00 のシフトを削除」 のように日時を一緒に送ってください。");
          } else if (isNotFound) {
            lines.push("", "候補：時間の表記ゆれ（例: 08:00 / 8:00 / 8:00-9:00）や別日の同名案件が無いかをご確認ください。");
          }
          if (errs.length > 0) lines.push("", `詳細: ${errs[0]}`);

          await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
        }
      }

      // === シフト追加（直接挿入） ===
      if (template_id === "2f9dacc7-92bc-4888-8ff3-eadca4e4f75a") {
        console.log("🚀 シフト追加リクエストを検知。shiftテーブルに直接挿入を試行します。");
        const insertResult = await insertShifts(request_detail);

        if (insertResult.success) {
          // ★ 追加：成功時のフィードバックを元のチャネルへ
          // リクエスト形状の揺れに対応（insertions / additions / shifts）
          const additions: Array<{ shift_date?: string; shift_time?: string; service_code?: string }> =
            (Array.isArray(request_detail?.insertions) && request_detail.insertions) ||
            (Array.isArray(request_detail?.additions) && request_detail.additions) ||
            (Array.isArray(request_detail?.shifts) && request_detail.shifts) ||
            [];

          const ga = request_detail?.group_account ?? group_account;

          const lines: string[] = ["✅ シフト追加を登録しました。"];
          for (const a of additions) {
            const svc = a.service_code ? ` / 種別:${a.service_code}` : "";
            lines.push(`・利用者: ${ga} / 日付: ${a.shift_date ?? "不明"} / 時間: ${a.shift_time ?? "不明"}${svc}`);
          }
          lines.push("", "※ カイポケ側の反映には時間がかかる場合があります。");

          await sendLWBotMessage(channel_id, lines.join("\n"), accessToken);
        } else {
          console.error("⚠️ シフト追加処理中にエラーが発生しました:", insertResult.errors);
          // 既存仕様：失敗しても後続のRPA登録は継続（必要なら失敗通知も足せます）
        }
      }

      // === 既存：RPAリクエストをキューへ ===
      const lw_user_id = logs.find((l) => l.id === ids[0])?.user_id ?? null;
      const { data: user } = await supabase
        .from("users")
        .select("auth_user_id")
        .eq("lw_userid", lw_user_id)
        .maybeSingle();
      const requestorId = user?.auth_user_id ?? null;

      await supabase.from("rpa_command_requests").insert({
        template_id,
        request_details: request_detail,
        requester_id: requestorId,
        status: "approved",
        requested_at: new Date().toISOString(),
      });

      for (const id of ids) {
        const { error: updateErr } = await supabase.from("msg_lw_log").update({ status: 9 }).eq("id", id);
        if (updateErr) {
          console.error(`❌ Update failed for id=${id} (status=3):`, updateErr.message);
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("💥 JSON解析またはInsertエラー:", errorMsg);

      await supabase.from("msg_lw_analysis_log").insert({
        timestamp: new Date().toISOString(),
        channel_id: channel_id,
        text: responseText,
        reason: "JSON parse or insert error",
      });

      for (const id of ids) {
        const { error: updateErr } = await supabase.from("msg_lw_log").update({ status: 9 }).eq("id", id);
        if (updateErr) {
          console.error(`❌ Update failed for id=${id} (status=4):`, updateErr.message);
        }
      }
    }
  }
};

export default analyzePendingTalksAndDispatch;
