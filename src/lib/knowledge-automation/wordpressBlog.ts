import "server-only";

import OpenAI from "openai";
import { z } from "zod";
import { runKnowledgeSource } from "@/lib/knowledge/pipeline";
import type { KnowledgeAutomationTask } from "@/lib/knowledge-automation/types";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
  assertWordPressPostDraftAvailable,
  createWordPressPostDraft,
  findWordPressFeaturedImage,
  listWordPressPostCategories,
  uploadWordPressMedia,
  type WordPressPostCategory,
} from "@/lib/wordpress/server";

const articleSchema = z.object({
  title: z.string().trim().min(12).max(100),
  excerpt: z.string().trim().min(50).max(240),
  thesis: z.string().trim().min(80).max(500),
  trigger_heading: z.string().trim().min(6).max(80),
  trigger_body: z.string().trim().min(180).max(1_200),
  tension_heading: z.string().trim().min(6).max(80),
  tension_body: z.string().trim().min(220).max(1_400),
  viewpoint_heading: z.string().trim().min(6).max(80),
  viewpoint_body: z.string().trim().min(220).max(1_400),
  action_heading: z.string().trim().min(6).max(80),
  actions: z.array(z.string().trim().min(50).max(500)).min(2).max(4),
  conclusion: z.string().trim().min(100).max(700),
  category_id: z.number().int().positive().nullable(),
  featured_image_search_terms: z.array(z.string().trim().min(2).max(30)).min(2).max(4),
  featured_image_prompt: z.string().trim().min(80).max(1_000),
  featured_image_alt: z.string().trim().min(15).max(160),
});

type StorySeed = {
  id: string;
  kind: "thought" | "rss_article";
  title: string;
  summary: string;
  detail: string | null;
  occurredAt: string | null;
  category: string | null;
  externalUrl: string | null;
  metadata: Record<string, unknown>;
};

type PublicSource = { title: string; url: string };
type Research = { brief: string; sources: PublicSource[] };

export type WordPressBlogResult = {
  status: "created" | "skipped";
  message: string;
  sourceId?: string;
  sourceTitle?: string;
  postId?: number;
  postLink?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responsesReasoningEffort(value: string): "low" | "medium" | "high" {
  if (value === "low" || value === "medium") return value;
  return "high";
}

function safePublicUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" || hostname.endsWith(".local") ||
      hostname === "docs.google.com" || hostname === "drive.google.com" ||
      hostname.endsWith(".supabase.co") || hostname.includes("lineworks") ||
      /^(?:10|127)\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname)
    ) return null;
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function paragraphHtml(value: string) {
  return `<p>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`;
}

function articleHtml(article: z.infer<typeof articleSchema>, sources: PublicSource[]) {
  const references = sources.map((source) =>
    `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a></li>`
  ).join("\n");
  return [
    `<p><strong>${escapeHtml(article.thesis)}</strong></p>`,
    `<h2>${escapeHtml(article.trigger_heading)}</h2>`, paragraphHtml(article.trigger_body),
    `<h2>${escapeHtml(article.tension_heading)}</h2>`, paragraphHtml(article.tension_body),
    `<h2>${escapeHtml(article.viewpoint_heading)}</h2>`, paragraphHtml(article.viewpoint_body),
    `<h2>${escapeHtml(article.action_heading)}</h2>`,
    `<ul>${article.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("\n")}</ul>`,
    `<h2>結論</h2>`, paragraphHtml(article.conclusion),
    `<h2>外部参考情報</h2>`, `<ul>${references}</ul>`,
  ].join("\n");
}

async function refreshBlogSources() {
  const { data } = await supabaseAdmin.from("knowledge_sources").select("id,source_key")
    .in("source_key", ["external-rss", "kusano-thought-log"]).eq("enabled", true).limit(4);
  const warnings: string[] = [];
  for (const source of data ?? []) {
    try {
      await runKnowledgeSource({ sourceId: source.id, jobType: "incremental", triggerType: "system" });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${source.source_key}の更新に失敗しました。`);
    }
  }
  return { sourceKeys: new Set((data ?? []).map((source) => source.source_key)), warnings };
}

async function usedSourceIds(taskId: string) {
  const { data } = await supabaseAdmin.from("knowledge_automation_runs").select("output_summary")
    .eq("task_id", taskId).eq("status", "succeeded").order("created_at", { ascending: false }).limit(300);
  return new Set((data ?? []).flatMap((row) => {
    const summary = isRecord(row.output_summary) ? row.output_summary : {};
    return typeof summary.sourceId === "string" ? [summary.sourceId] : [];
  }));
}

function compareSeeds(left: StorySeed, right: StorySeed) {
  const byDate = String(right.occurredAt ?? "").localeCompare(String(left.occurredAt ?? ""));
  if (byDate !== 0) return byDate;
  return Number(left.metadata.rowNumber ?? Number.MAX_SAFE_INTEGER) - Number(right.metadata.rowNumber ?? Number.MAX_SAFE_INTEGER);
}

async function loadStorySeed(taskId: string, allowInternalAiContext: boolean): Promise<StorySeed | null> {
  const used = await usedSourceIds(taskId);
  const { data: thoughtRows } = allowInternalAiContext
    ? await supabaseAdmin.from("knowledge_items")
      .select("id,title,summary,content,occurred_at,category,metadata,source:knowledge_sources!inner(source_key)")
      .eq("source.source_key", "kusano-thought-log").eq("is_current", true).lte("privacy_level", 1)
      .eq("contains_personal_data", false).in("review_status", ["needs_review", "approved"])
      .order("occurred_at", { ascending: false, nullsFirst: false }).limit(100)
    : { data: [] };
  const thoughts: StorySeed[] = (thoughtRows ?? []).flatMap((row) => {
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const articleCandidate = String(metadata.articleCandidate ?? "").trim();
    if (used.has(row.id) || !["高", "A", "true", "1"].includes(articleCandidate)) return [];
    return [{
      id: row.id, kind: "thought" as const, title: row.title, summary: row.summary,
      detail: typeof row.content === "string" ? row.content : null,
      occurredAt: typeof row.occurred_at === "string" ? row.occurred_at : null,
      category: row.category, externalUrl: null, metadata,
    }];
  }).sort(compareSeeds);
  if (thoughts[0]) return thoughts[0];

  const { data: rssRows } = await supabaseAdmin.from("knowledge_source_objects")
    .select("id,title,safe_excerpt,source_url,occurred_at,metadata,source:knowledge_sources!inner(source_key)")
    .eq("source.source_key", "external-rss").eq("object_type", "rss_article").eq("is_current", true)
    .eq("privacy_level", 0).eq("publishability", "public").eq("contains_personal_data", false)
    .in("processing_status", ["indexed", "promoted"]).order("occurred_at", { ascending: false, nullsFirst: false }).limit(100);
  for (const row of rssRows ?? []) {
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const externalUrl = safePublicUrl(row.source_url);
    if (used.has(row.id) || metadata.alreadyPublished === true || !externalUrl) continue;
    if (typeof row.title !== "string" || typeof row.safe_excerpt !== "string" || !row.safe_excerpt.trim()) continue;
    return {
      id: row.id, kind: "rss_article", title: row.title, summary: row.safe_excerpt, detail: null,
      occurredAt: typeof row.occurred_at === "string" ? row.occurred_at : null,
      category: typeof metadata.category === "string" ? metadata.category : null,
      externalUrl, metadata,
    };
  }
  return null;
}

function citationsFromResponse(response: OpenAI.Responses.Response): PublicSource[] {
  const found = new Map<string, PublicSource>();
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations) {
        if (annotation.type !== "url_citation") continue;
        const url = safePublicUrl(annotation.url);
        if (url && !found.has(url)) found.set(url, { title: annotation.title || new URL(url).hostname, url });
      }
    }
  }
  return [...found.values()].slice(0, 4);
}

async function researchPublicEvidence(openai: OpenAI, seed: StorySeed): Promise<Research | null> {
  const response = await openai.responses.create({
    model: OPENAI_PROFILES.standard.model,
    reasoning: { effort: responsesReasoningEffort(OPENAI_PROFILES.standard.reasoning) },
    store: false,
    max_output_tokens: 2_500,
    tools: [{
      type: "web_search", search_context_size: "high",
      user_location: { type: "approximate", country: "JP", region: "Aichi", timezone: "Asia/Tokyo" },
    }],
    instructions: [
      "以下の編集メモに直接関係する、直近14日以内の具体的な出来事または制度情報を調査してください。",
      "官公庁・自治体・制度運営主体など一次情報を優先し、公開日と出来事の日付を区別してください。",
      "編集メモは検索の手掛かりであり、外部公開してよい情報源ではありません。編集メモ自体やGoogle Drive、Google Sheetsを引用しないでください。",
      "根拠のある具体的事実を3点以内で整理し、各事実にウェブ引用を付けてください。直接裏づける新しい公開情報がなければ、見つからないと明記してください。",
    ].join("\n"),
    input: JSON.stringify({
      title: seed.title, summary: seed.summary, editorial_detail: seed.detail,
      category: seed.category, occurred_at: seed.occurredAt, known_public_url: seed.externalUrl,
    }),
  });
  const sources = citationsFromResponse(response);
  if (!response.output_text.trim() || sources.length === 0) return null;
  return { brief: response.output_text, sources };
}

function assertArticleQuality(article: z.infer<typeof articleSchema>, research: Research) {
  const fullText = [article.title, article.excerpt, article.thesis, article.trigger_body, article.tension_body,
    article.viewpoint_body, ...article.actions, article.conclusion].join("\n");
  if (fullText.length < 1_300) throw new Error("記事が短く、論点を十分に説明できていません。");
  if (/確認したいポイント|確認することが重要|無理のない範囲|安心につながります/.test(`${article.title}\n${article.thesis}`)) {
    throw new Error("一般論中心の記事になったため、下書き作成を中止しました。");
  }
  if (research.sources.length === 0) throw new Error("公開できる外部根拠がありません。");
}

async function generateArticle(
  openai: OpenAI,
  task: KnowledgeAutomationTask,
  seed: StorySeed,
  research: Research,
  categories: WordPressPostCategory[]
) {
  const categoryIds = categories.map((category) => category.id);
  const response = await openai.responses.create({
    model: OPENAI_PROFILES.heavy.model,
    reasoning: { effort: responsesReasoningEffort(OPENAI_PROFILES.heavy.reasoning) },
    store: false,
    max_output_tokens: 6_000,
    instructions: [
      "あなたはファミーユグループ代表の経営コラムを編集する、日本語の論説編集者です。",
      "ゴールは外部ニュースの要約ではなく、外部の変化を起点に、現場経営から生まれた一つの独自主張を読者が理解し、考えたくなる記事にすることです。",
      "成功条件：冒頭2文で結論が分かる／記事全体が一つの主張につながる／外部事実と筆者の見解を分ける／具体例がある／見出し間に因果関係がある。",
      "禁止：一般論の羅列、制度名の一覧、SEOキーワードの詰め込み、『確認が重要です』型の薄い助言、根拠のない数値や制度要件、編集メモや内部情報源への言及。",
      "内部の編集メモは筆者の視点として自然に文章化しますが、内部資料・草野ナレッジ・Google Sheets・社内DBを出典として書いたりリンクしたりしてはいけません。",
      "外部事実は調査メモで確認できる範囲だけを使い、断定できない部分は筆者の問題提起・仮説として書いてください。",
      "『何が起きた→既存制度とのズレ→現場経営から見えること→より合理的な判断・制度』という一本の流れにしてください。",
      "category_idには、提示されたWordPress既存カテゴリの中から記事の主題に最も近いものを一つ選びます。該当がなければnullにし、新しいカテゴリ名を創作しません。",
      "featured_image_search_termsは既存メディア検索用の具体語、featured_image_promptは記事の主張を一枚で表す横長の編集写真または上質なコンセプトイラストの指示にします。",
      "アイキャッチには文字、ロゴ、透かし、官公庁の紋章、読める書類、実在人物と識別できる顔を入れません。恐怖や過度な演出ではなく、経営コラムとして落ち着いた現実感を持たせます。",
      "検索者向けの説明より、読者が最後まで読みたくなる明確な論点と具体性を優先してください。HTMLやMarkdownは出力しません。",
    ].join("\n"),
    input: JSON.stringify({
      automation: { name: task.name, description: task.description, condition: task.condition_summary },
      private_editorial_seed: { title: seed.title, summary: seed.summary, detail: seed.detail, category: seed.category },
      public_research: { brief: research.brief, sources: research.sources },
      wordpress_existing_categories: categories.map(({ id, name, parent }) => ({ id, name, parent })),
    }),
    text: {
      verbosity: "high",
      format: {
        type: "json_schema", name: "opinionated_wordpress_article", strict: true,
        schema: {
          type: "object", additionalProperties: false,
          required: ["title", "excerpt", "thesis", "trigger_heading", "trigger_body", "tension_heading", "tension_body", "viewpoint_heading", "viewpoint_body", "action_heading", "actions", "conclusion", "category_id", "featured_image_search_terms", "featured_image_prompt", "featured_image_alt"],
          properties: {
            title: { type: "string", minLength: 12, maxLength: 100 }, excerpt: { type: "string", minLength: 50, maxLength: 240 },
            thesis: { type: "string", minLength: 80, maxLength: 500 }, trigger_heading: { type: "string", minLength: 6, maxLength: 80 },
            trigger_body: { type: "string", minLength: 180, maxLength: 1200 }, tension_heading: { type: "string", minLength: 6, maxLength: 80 },
            tension_body: { type: "string", minLength: 220, maxLength: 1400 }, viewpoint_heading: { type: "string", minLength: 6, maxLength: 80 },
            viewpoint_body: { type: "string", minLength: 220, maxLength: 1400 }, action_heading: { type: "string", minLength: 6, maxLength: 80 },
            actions: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", minLength: 50, maxLength: 500 } },
            conclusion: { type: "string", minLength: 100, maxLength: 700 },
            category_id: categoryIds.length > 0
              ? { anyOf: [{ type: "integer", enum: categoryIds }, { type: "null" }] }
              : { type: "null" },
            featured_image_search_terms: { type: "array", minItems: 2, maxItems: 4, items: { type: "string", minLength: 2, maxLength: 30 } },
            featured_image_prompt: { type: "string", minLength: 80, maxLength: 1000 },
            featured_image_alt: { type: "string", minLength: 15, maxLength: 160 },
          },
        },
      },
    },
  });
  if (!response.output_text?.trim()) throw new Error("記事生成の応答が空でした。");
  const article = articleSchema.parse(JSON.parse(response.output_text));
  assertArticleQuality(article, research);
  return article;
}

async function prepareFeaturedImage(
  openai: OpenAI,
  task: KnowledgeAutomationTask,
  article: z.infer<typeof articleSchema>,
  filenameStem: string
) {
  if (task.settings.wordpress_featured_image === false) return null;

  if (task.settings.wordpress_reuse_media !== false) {
    const existing = await findWordPressFeaturedImage(article.featured_image_search_terms);
    if (existing) return { id: existing.id, source: "existing" as const };
  }

  const configuredModel = typeof task.settings.openai_image_model === "string"
    ? task.settings.openai_image_model.trim()
    : "";
  const image = await openai.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || configuredModel || "gpt-image-2",
    prompt: [
      "Use case: ads-marketing",
      "Asset type: WordPress business-column featured image",
      `Primary request: ${article.featured_image_prompt}`,
      "Composition/framing: landscape editorial composition; clear subject; safe center crop for 780x437 and 571x373 thumbnails",
      "Style/medium: polished natural editorial photography or restrained conceptual illustration, appropriate for a Japanese care-services management column",
      "Constraints: no text, no letters, no numbers, no logos, no watermark, no government seals, no readable documents, no identifiable real person",
    ].join("\n"),
    size: "1536x1024",
    quality: "medium",
    output_format: "webp",
    output_compression: 85,
  });
  const base64 = image.data?.[0]?.b64_json;
  if (!base64) throw new Error("アイキャッチ画像の生成結果が空でした。");
  const bytes = Buffer.from(base64, "base64");
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const uploaded = await uploadWordPressMedia({
    filename: `${filenameStem}.webp`,
    contentType: "image/webp",
    bytes: arrayBuffer,
    altText: article.featured_image_alt,
  });
  return { id: uploaded.id, source: "generated" as const };
}

export async function createWordPressBlogDraft(task: KnowledgeAutomationTask): Promise<WordPressBlogResult> {
  const refreshed = await refreshBlogSources();
  if (!refreshed.sourceKeys.has("kusano-thought-log") && !refreshed.sourceKeys.has("external-rss")) {
    return { status: "skipped", message: "ブログ用のRSS・草野思考ログ取込元が登録されていません。" };
  }
  const allowInternalAiContext = task.settings.allow_external_ai_context === true;
  const seed = await loadStorySeed(task.id, allowInternalAiContext);
  if (!seed) {
    const consentMessage = allowInternalAiContext
      ? null
      : "草野思考ログを記事生成AIへ渡す許可がないため、公開RSSの実記事だけを確認しました。";
    return { status: "skipped", message: refreshed.warnings[0] ?? consentMessage ?? "未使用の具体的な記事候補がありません。監視先だけでは記事を作りません。" };
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAIの接続設定がありません。");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const date = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date()).replaceAll("/", "");
  const filenameStem = `smart-ai-${date}-${seed.id.slice(0, 8)}`;
  await assertWordPressPostDraftAvailable(filenameStem);
  const research = await researchPublicEvidence(openai, seed);
  if (!research) {
    return { status: "skipped", message: "論点を裏づける公開中の外部情報が見つからなかったため、記事を作りませんでした。" };
  }
  const categories = task.settings.wordpress_auto_category === false
    ? []
    : (await listWordPressPostCategories()).filter((category) => category.slug !== "uncategorized");
  const article = await generateArticle(openai, task, seed, research, categories);
  const featuredImage = await prepareFeaturedImage(openai, task, article, filenameStem);
  if (task.settings.wordpress_featured_image !== false && !featuredImage) {
    throw new Error("アイキャッチを用意できなかったため、画像なしの記事は作成しませんでした。");
  }
  const categoryId = article.category_id && categories.some((category) => category.id === article.category_id)
    ? article.category_id
    : null;
  const post = await createWordPressPostDraft({
    title: article.title, slug: filenameStem,
    content: articleHtml(article, research.sources), excerpt: article.excerpt,
    featuredMediaId: featuredImage?.id,
    categoryIds: categoryId ? [categoryId] : undefined,
  });
  return {
    status: "created",
    message: `「${article.title}」をWordPressの下書きに追加しました。${featuredImage ? `アイキャッチは${featuredImage.source === "existing" ? "既存画像を再利用" : "新規生成"}しました。` : ""}${categoryId ? "カテゴリも設定しました。" : ""}`,
    sourceId: seed.id, sourceTitle: seed.title, postId: post.id, postLink: post.link,
  };
}
