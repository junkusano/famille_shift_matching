import "server-only";

import * as XLSX from "xlsx";
import { load } from "cheerio";
import { supabaseAdmin } from "@/lib/supabase/service";

const RESULTS_URL = "https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html";
const SOURCE_NAME = "資源エネルギー庁 石油製品価格調査";

function normalise(value: unknown): string {
  return String(value ?? "").replace(/[\s　]+/g, "").trim();
}

function numberValue(value: unknown): number | null {
  const parsed = Number(String(value ?? "").replace(/[,円]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getLatestWorkbookUrl(): Promise<string> {
  const response = await fetch(RESULTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`資源エネルギー庁ページ取得失敗: HTTP ${response.status}`);
  const html = await response.text();
  const $ = load(html);
  const links = $("a[href]").toArray().map((element) => ({
    href: new URL($(element).attr("href") ?? "", RESULTS_URL).toString(),
    text: $(element).text().trim(),
  }));
  const candidate = links.find((link) =>
    /\.(xlsx?|xls)(?:\?|$)/i.test(link.href) &&
    !/週次ファイル|一覧/i.test(link.text),
  );
  if (!candidate) throw new Error("資源エネルギー庁の最新Excelリンクを検出できませんでした");
  return candidate.href;
}

function extractAichiRegularPrice(workbook: XLSX.WorkBook): number {
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const headerIndexes = rows
      .map((row, index) => ({ index, text: row.map(normalise).join(" ") }))
      .filter((row) => row.text.includes("レギュラー"));

    for (const header of headerIndexes) {
      const headerRow = rows[header.index] ?? [];
      const regularIndex = headerRow.findIndex((cell) => normalise(cell).includes("レギュラー"));
      if (regularIndex < 0) continue;

      for (const row of rows.slice(header.index + 1, header.index + 12)) {
        if (!row.some((cell) => normalise(cell) === "愛知" || normalise(cell) === "愛知県")) continue;
        const direct = numberValue(row[regularIndex]);
        if (direct != null) return direct;
        const nearby = row.slice(Math.max(0, regularIndex - 1), regularIndex + 3)
          .map(numberValue)
          .find((value): value is number => value != null);
        if (nearby != null) return nearby;
      }
    }
  }
  throw new Error("Excel内から愛知県のレギュラーガソリン価格を抽出できませんでした");
}

export async function syncLatestGasolinePrice(): Promise<{ price: number; sourceUrl: string }> {
  const sourceUrl = await getLatestWorkbookUrl();
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`資源エネルギー庁Excel取得失敗: HTTP ${response.status}`);
  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array" });
  const price = extractAichiRegularPrice(workbook);
  const priceDate = new Date().toISOString().slice(0, 10);

  const { error } = await supabaseAdmin.from("monthly_gasoline_prices").upsert({
    target_month: `${priceDate.slice(0, 7)}-01`,
    price_date: priceDate,
    prefecture: "愛知県",
    fuel_type: "レギュラー",
    price_yen_per_liter: price,
    source_name: SOURCE_NAME,
    source_url: sourceUrl,
    price_basis: "latest_official_weekly_price_at_distance_update",
    observed_at: priceDate,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "target_month,prefecture,fuel_type" });
  if (error) throw new Error(`ガソリン単価の保存に失敗しました: ${error.message}`);
  return { price, sourceUrl };
}
