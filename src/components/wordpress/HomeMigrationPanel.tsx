"use client";

import { useState } from "react";
import { ExternalLink, FilePlus2, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LegacyContentBlock, LegacyHomeAnalysis } from "@/lib/site-migration/types";
import type { WordPressPageSummary } from "@/lib/wordpress/types";

type Props = {
  connected: boolean;
  authenticatedFetch: (url: string, init?: RequestInit) => Promise<unknown>;
  onOpenPage: (id: number) => void;
  onDraftCreated: () => void;
};

type DraftResult = {
  page: WordPressPageSummary;
  uploadedImageCount: number;
  skippedImageCount: number;
  mapCount: number;
  featuredImageSet: boolean;
  warnings: string[];
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function blockDescription(block: LegacyContentBlock) {
  if (block.kind === "heading") return `H${block.level}　${block.text}`;
  if (block.kind === "paragraph") return block.text;
  if (block.kind === "list") return `リスト（${block.items.length}件）`;
  if (block.kind === "image") return `画像　${block.alt || "altなし"}`;
  if (block.kind === "cta") return `CTA　${block.text}`;
  if (block.kind === "youtube") return `YouTube　${block.videoId}`;
  return `Google Map　${block.title}`;
}

function wordPressAdminUrl(page: WordPressPageSummary) {
  try {
    const url = new URL(page.link);
    return `${url.origin}/wp-admin/post.php?post=${page.id}&action=edit`;
  } catch {
    return null;
  }
}

export function HomeMigrationPanel({ connected, authenticatedFetch, onOpenPage, onDraftCreated }: Props) {
  const [analysis, setAnalysis] = useState<LegacyHomeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = await authenticatedFetch("/api/admin/wordpress/migration/home/analyze", {
        method: "POST",
      }) as { analysis: LegacyHomeAnalysis };
      setAnalysis(body.analysis);
    } catch (cause) {
      setError(errorMessage(cause, "現行サイトを取得・解析できませんでした。"));
    } finally {
      setLoading(false);
    }
  }

  async function createDraft() {
    if (!analysis || creating) return;
    if (!window.confirm("既存ページは変更せず、画像・Google Map・アイキャッチを含む下書きをWordPressに作成します。よろしいですか？")) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const body = await authenticatedFetch("/api/admin/wordpress/migration/home/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, fingerprint: analysis.fingerprint }),
      }) as DraftResult;
      setResult(body);
      onDraftCreated();
    } catch (cause) {
      setError(errorMessage(cause, "WordPress下書きを作成できませんでした。"));
    } finally {
      setCreating(false);
    }
  }

  const adminUrl = result ? wordPressAdminUrl(result.page) : null;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg">現行サイト移行</CardTitle>
        <p className="text-sm text-slate-600">
          対象：<a className="text-blue-700 underline" href="https://www.shi-on.net/" target="_blank" rel="noopener noreferrer">https://www.shi-on.net/</a>
        </p>
        <p className="text-xs text-slate-500">
          本文、画像、メインビジュアル、Google Mapsを取り込みます。ナビゲーション、フッター、スクリプトは除外します。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => void analyze()} disabled={!connected || loading || creating}>
          {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
          現行トップページを取得・解析
        </Button>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        {analysis && (
          <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div><p className="text-xs font-semibold text-slate-500">ページタイトル</p><p className="mt-1 text-sm font-medium">{analysis.pageTitle || "—"}</p></div>
              <div><p className="text-xs font-semibold text-slate-500">H1</p><p className="mt-1 text-sm font-medium">{analysis.h1 || "—"}</p></div>
              <div><p className="text-xs font-semibold text-slate-500">抽出ブロック</p><p className="mt-1 text-sm">{analysis.blocks.length}件</p></div>
              <div><p className="text-xs font-semibold text-slate-500">画像 / 旧サイト内部リンク</p><p className="mt-1 text-sm">{analysis.images.length}件 / {analysis.internalLinks.length}件</p></div>
              <div><p className="text-xs font-semibold text-slate-500">メインビジュアル</p><p className="mt-1 text-sm">{analysis.heroImages.length}件（PC・スマートフォン）</p></div>
              <div><p className="text-xs font-semibold text-slate-500">Google Map</p><p className="mt-1 text-sm">{analysis.blocks.filter((block) => block.kind === "google-map").length}件</p></div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-800">取得結果（構造プレビュー）</h3>
              <div className="mt-2 max-h-80 space-y-1 overflow-y-auto rounded border bg-white p-2 text-sm">
                {analysis.blocks.map((block, index) => (
                  <div key={`${block.kind}-${index}`} className="border-b py-1.5 last:border-0">
                    <span className={block.kind === "heading" ? "font-semibold text-slate-900" : "text-slate-700"}>
                      {blockDescription(block)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {analysis.images.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-800">画像</h3>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {analysis.images.map((image) => <li key={image.sourceUrl} className="break-all">{image.alt || "altなし"} — {image.sourceUrl}</li>)}
                </ul>
              </div>
            )}

            {analysis.internalLinks.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-800">旧サイト内部リンク</h3>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {analysis.internalLinks.map((link) => <li key={`${link.text}-${link.href}`} className="break-all">{link.text} — {link.href}</li>)}
                </ul>
              </div>
            )}

            {analysis.warnings.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}

            <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              WordPressには「ファミーユ トップページ 新版（画像・地図対応）」／slug「home-new-visual」／<strong>draft</strong> として新規作成します。既存のトップページと、先に作成した下書きは変更しません。
            </div>
            <Button onClick={() => void createDraft()} disabled={creating || loading}>
              {creating ? <LoaderCircle className="animate-spin" /> : <FilePlus2 />}
              {creating ? "WordPress下書きを作成中…" : "WordPress下書きを作成"}
            </Button>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">WordPress下書きを作成しました（page ID: {result.page.id}）。</p>
            <p className="mt-1">画像：{result.uploadedImageCount}件をWordPressメディアへ移行、{result.skippedImageCount}件を除外。</p>
            <p className="mt-1">アイキャッチ：{result.featuredImageSet ? "メインビジュアルを設定済み" : "設定できませんでした"}／Google Map：{result.mapCount}件を移行。</p>
            {result.warnings.map((warning) => <p key={warning} className="mt-1">{warning}</p>)}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onOpenPage(result.page.id)}>MyFamilleで下書きを開く</Button>
              {adminUrl && <Button size="sm" variant="outline" asChild><a href={adminUrl} target="_blank" rel="noopener noreferrer">WordPress管理画面で開く <ExternalLink /></a></Button>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
