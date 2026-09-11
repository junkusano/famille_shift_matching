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
          "あなたは名古屋市の障害福祉事業所の利用者・ヘルパー向け情報担当です。",
          "対象地域は愛知県名古屋市内だけです。名古屋市外（東京・大阪など）は、検索結果に出ても絶対に掲載しません。",
          "直近の土日に、名古屋市内で実施されるイベントだけを最大3件選びます。件数を埋めるために不適切な候補を加えません。",
          "各候補は主催者・会場・自治体の公式ページで、開催日、会場の名古屋市内住所、料金を確認できた場合だけ掲載します。チケット販売サイト、まとめサイト、検索結果だけを根拠にしません。",
          "無料を最優先とし、有料イベントは障害者本人の割引と介護同行者の無料・割引人数を公式ページで確認できる場合だけ掲載します。料金または割引が確認できない候補は除外します。",
          "車いす利用、段差、エレベーター、多目的トイレ、介護同行者の扱いは、公式情報で確認できた事実だけを記載します。不明なら、その候補を除外します。",
          "アクセスは会場公式情報から確認した経路だけを書きます。すべての候補に同じ経路を流用しません。名古屋市営地下鉄・市バスを実際に使える場合だけ、福祉乗車券の活用に触れます。",
          "気象庁の名古屋市周辺予報を確認し、雨・猛暑・雷雨が見込まれる日は屋内会場を優先します。",
          "各候補は『日時／会場（名古屋市の区まで）／料金と障害者・同行者条件／車いす等の確認内容／公式URL』を必ず含めます。",
          "条件を満たす候補がない場合は、無理に紹介せず『今週末は公式情報で条件を満たす候補を確認できませんでした』だけを返します。",
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
  if (!/名古屋市/.test(text)) {
    throw new Error("名古屋市内の開催地を公式情報で確認できないため、配信を中止しました。");
  }
  if (/(東京都|大阪府|東京ドーム|阪急うめだ|eplus\\.jp)/.test(text)) {
    throw new Error("名古屋市外またはチケット販売サイト由来の候補が含まれるため、配信を中止しました。");
  }
  if (/(詳細は公式サイトをご確認ください|公式確認が必要)/.test(text)) {
    throw new Error("料金またはバリアフリー条件を確認できない候補が含まれるため、配信を中止しました。");
  }
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
