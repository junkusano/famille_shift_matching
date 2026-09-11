import "server-only";

import OpenAI from "openai";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import type { KnowledgeAutomationTask } from "@/lib/knowledge-automation/types";

type AutomationResult = {
  status: "succeeded" | "skipped";
  message: string;
  sourceId?: string | null;
  sourceTitle?: string | null;
};

const EVENT_DIGEST_DEFAULT_CHANNEL_ID = "146763225";

function textSetting(task: KnowledgeAutomationTask, key: string) {
  const value = task.settings?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function targetChannelId(task: KnowledgeAutomationTask, fallback = "") {
  return textSetting(task, "lineworksChannelId") || textSetting(task, "channelId") || fallback;
}

async function sendMessage(task: KnowledgeAutomationTask, text: string, fallbackChannelId = "") {
  const channelId = targetChannelId(task, fallbackChannelId);
  if (!channelId) {
    return false;
  }

  await sendLWBotMessage(channelId, text, await getAccessToken());
  return true;
}

function japaneseNow() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function isEventDigest(task: KnowledgeAutomationTask) {
  const text = [task.name, task.description ?? "", task.condition_summary ?? ""].join("\n");
  return task.settings?.operation === "event_digest" || /イベント/.test(text);
}

async function createEventDigest(task: KnowledgeAutomationTask) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.create({
    model: process.env.KNOWLEDGE_AUTOMATION_MODEL || "gpt-4.1-mini",
    tools: [{ type: "web_search_preview" }],
    input: [
      {
        role: "system",
        content: [
          "あなたは福祉事業所の利用者・ヘルパー向け情報担当です。",
          "検索結果に基づいて、名古屋市中心で直近の土日（日本時間）に参加できるイベントを最大5件だけ選びます。",
          "無料または障害者割引、車いす利用、介護同行者の扱い、屋内外、公共交通（市営地下鉄・市バス）をできる限り公式情報から確認します。",
          "暑さ・雨天が見込まれる場合は屋内を優先します。",
          "確認できない料金・割引・バリアフリー情報は推測しません。各項目に公式URLを付け、最後に天候と移動の注意を簡潔に添えます。",
          "LINE WORKSへそのまま送れる、読みやすい日本語本文だけを返してください。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "作成時刻: " + japaneseNow(),
          "タスク名: " + task.name,
          "目的: " + (task.description ?? ""),
          "条件: " + (task.condition_summary ?? ""),
        ].join("\n"),
      },
    ],
  });

  const text = response.output_text.trim();
  if (!text) throw new Error("イベント情報を作成できませんでした。");
  const delivered = await sendMessage(task, text, EVENT_DIGEST_DEFAULT_CHANNEL_ID);
  if (!delivered) return { status: "skipped" as const, message: "送信先のLINE WORKSチャンネルIDが未設定です。編集画面で設定してください。" };
  return { status: "succeeded" as const, message: "週末イベント情報をLINE WORKSへ送信しました。" };
}

function forecastText(payload: unknown) {
  return JSON.stringify(payload).slice(0, 120_000);
}

export async function runWeatherAlert(task: KnowledgeAutomationTask): Promise<AutomationResult> {
  const response = await fetch("https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json", {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("気象庁の一次情報を取得できませんでした。");

  const source = forecastText(await response.json());
  const matched = source.match(/.{0,80}(台風|大雪|暴風雪|風雪).{0,160}/g) ?? [];
  if (matched.length === 0) {
    return { status: "skipped", message: "気象庁の愛知県予報に台風・大雪等の影響は確認されませんでした。" };
  }

  const summary = Array.from(new Set(matched)).slice(0, 3).join("\n");
  const message = [
    "【気象のお知らせ】",
    "気象庁の愛知県予報で、台風・大雪等に関する注意情報を確認しました。",
    summary,
    "外出・訪問の前に、気象庁の最新情報と交通機関の運行情報を確認してください。",
    "気象庁: https://www.jma.go.jp/bosai/#pattern=forecast&area_type=offices&area_code=230000",
  ].join("\n");

  const delivered = await sendMessage(task, message);
  if (!delivered) {
    return { status: "skipped", message: "気象影響は検知しましたが、LINE WORKSの送信先が未設定です。編集画面でチャンネルIDを設定してください。" };
  }
  return { status: "succeeded", message: "気象庁の一次情報を確認し、LINE WORKSへ注意情報を送信しました。" };
}

export async function runExternalInformationAutomation(task: KnowledgeAutomationTask): Promise<AutomationResult | null> {
  if (task.task_type === "weather_alert") return runWeatherAlert(task);
  if (isEventDigest(task) && task.destination === "lineworks_message") return createEventDigest(task);
  return null;
}
