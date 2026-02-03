// =============================================================
// src/lib/cm/contracts/generateConsentPdf.ts
// 電子契約同意書PDF生成
//
// pdf-lib + @pdf-lib/fontkit を使用
// 日本語フォント: Noto Sans JP（public/fonts/NotoSansJP-Regular.ttf）
// =============================================================

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createLogger } from "@/lib/common/logger";
import path from "path";
import fs from "fs/promises";

const logger = createLogger("lib/cm/contracts/generateConsentPdf");

// =============================================================
// フォントキャッシュ（モジュールレベルで保持）
// =============================================================

let cachedFontBytes: ArrayBuffer | null = null;

async function getFontBytes(): Promise<ArrayBuffer> {
  if (cachedFontBytes) {
    return cachedFontBytes;
  }

  const fontPath = path.join(
    process.cwd(),
    "public",
    "fonts",
    "NotoSansJP-Regular.ttf"
  );

  const buffer = await fs.readFile(fontPath);
  // Uint8Arrayを使用してArrayBufferを作成（SharedArrayBuffer問題を回避）
  const uint8Array = new Uint8Array(buffer);
  cachedFontBytes = uint8Array.buffer as ArrayBuffer;

  logger.info("フォントファイル読み込み完了（キャッシュ）", {
    size: cachedFontBytes.byteLength,
  });

  return cachedFontBytes;
}

// =============================================================
// Types
// =============================================================

export type ConsentPdfData = {
  // 利用者情報
  clientName: string;
  clientAddress: string;
  kaipokeCsId: string;

  // 同意内容
  consentElectronic: boolean;
  consentRecording: boolean;

  // 立会職員
  staffName: string;

  // 署名者情報
  signerType: "self" | "proxy";
  proxyName?: string;
  proxyRelationship?: string;
  proxyReason?: string;

  // 署名画像（Base64）
  signatureBase64: string;

  // 同意日時
  consentedAt: Date;
};

export type GeneratePdfResult =
  | { ok: true; data: { buffer: Buffer } }
  | { ok: false; error: string };

// =============================================================
// 定数
// =============================================================

// A4サイズ（ポイント）
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

// マージン
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 50;

// 色
const COLOR_PRIMARY = rgb(0.15, 0.23, 0.37); // #1e3a5f に近い
const COLOR_TEXT = rgb(0.2, 0.2, 0.2);
const COLOR_GRAY = rgb(0.5, 0.5, 0.5);
const COLOR_CHECK = rgb(0.13, 0.59, 0.33); // 緑色

// =============================================================
// PDF生成
// =============================================================

export async function generateConsentPdf(
  data: ConsentPdfData
): Promise<GeneratePdfResult> {
  try {
    logger.info("同意書PDF生成開始", { kaipokeCsId: data.kaipokeCsId });

    // ---------------------------------------------------------
    // PDFドキュメント作成
    // ---------------------------------------------------------
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // ---------------------------------------------------------
    // フォント読み込み（キャッシュから取得）
    // ---------------------------------------------------------
    let fontBytes: ArrayBuffer;
    try {
      fontBytes = await getFontBytes();
    } catch {
      logger.error("フォントファイル読み込みエラー");
      return { ok: false, error: "フォントファイルが見つかりません" };
    }

    const notoSansJp = await pdfDoc.embedFont(fontBytes);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ---------------------------------------------------------
    // ページ追加
    // ---------------------------------------------------------
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN_TOP;

    // ---------------------------------------------------------
    // タイトル
    // ---------------------------------------------------------
    const title = "電子契約に関する同意";
    const titleFontSize = 20;
    const titleWidth = notoSansJp.widthOfTextAtSize(title, titleFontSize);
    page.drawText(title, {
      x: (PAGE_WIDTH - titleWidth) / 2,
      y,
      size: titleFontSize,
      font: notoSansJp,
      color: COLOR_PRIMARY,
    });
    y -= 40;

    // ---------------------------------------------------------
    // 利用者情報
    // ---------------------------------------------------------
    y = drawSection(page, notoSansJp, "利用者情報", y);
    y -= 5;

    // 背景ボックス
    const boxHeight = 50;
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - boxHeight,
      width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
      height: boxHeight,
      color: rgb(0.94, 0.97, 1), // 薄い青
    });

    y -= 20;
    page.drawText(`氏名: ${data.clientName}`, {
      x: MARGIN_LEFT + 15,
      y,
      size: 12,
      font: notoSansJp,
      color: COLOR_TEXT,
    });

    y -= 18;
    const addressText = data.clientAddress || "（住所未登録）";
    page.drawText(`住所: ${addressText}`, {
      x: MARGIN_LEFT + 15,
      y,
      size: 10,
      font: notoSansJp,
      color: COLOR_GRAY,
    });

    y -= 30;

    // ---------------------------------------------------------
    // 同意日時
    // ---------------------------------------------------------
    y = drawSection(page, notoSansJp, "同意日時", y);
    y -= 5;

    const dateTimeStr = formatDateTime(data.consentedAt);
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - 30,
      width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
      height: 30,
      color: rgb(0.96, 0.96, 0.96),
    });

    y -= 20;
    page.drawText(dateTimeStr, {
      x: MARGIN_LEFT + 15,
      y,
      size: 12,
      font: notoSansJp,
      color: COLOR_TEXT,
    });

    y -= 30;

    // ---------------------------------------------------------
    // 同意項目
    // ---------------------------------------------------------
    y = drawSection(page, notoSansJp, "同意項目", y);
    y -= 10;

    // 電子契約への同意
    y = drawConsentItem(
      page,
      notoSansJp,
      helveticaBold,
      "電子契約への同意",
      "本契約および今後締結する契約について、電子署名により締結することに同意します",
      data.consentElectronic,
      y
    );

    y -= 10;

    // 説明録音への同意
    y = drawConsentItem(
      page,
      notoSansJp,
      helveticaBold,
      "説明録音への同意",
      "契約内容の説明時に、記録のため会話を録音することに同意します",
      data.consentRecording,
      y
    );

    y -= 20;

    // ---------------------------------------------------------
    // 立会職員
    // ---------------------------------------------------------
    y = drawSection(page, notoSansJp, "立会職員（説明者）", y);
    y -= 5;

    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - 30,
      width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
      height: 30,
      color: rgb(0.96, 0.96, 0.96),
    });

    y -= 20;
    page.drawText(data.staffName, {
      x: MARGIN_LEFT + 15,
      y,
      size: 12,
      font: notoSansJp,
      color: COLOR_TEXT,
    });

    y -= 30;

    // ---------------------------------------------------------
    // 署名者情報
    // ---------------------------------------------------------
    y = drawSection(page, notoSansJp, "署名者", y);
    y -= 5;

    const signerText = data.signerType === "self" ? "本人" : "代筆";
    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - (data.signerType === "proxy" ? 80 : 30),
      width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
      height: data.signerType === "proxy" ? 80 : 30,
      color:
        data.signerType === "proxy"
          ? rgb(1, 0.98, 0.94) // 薄いオレンジ
          : rgb(0.96, 0.96, 0.96),
    });

    y -= 20;
    page.drawText(`署名者: ${signerText}`, {
      x: MARGIN_LEFT + 15,
      y,
      size: 12,
      font: notoSansJp,
      color: COLOR_TEXT,
    });

    if (data.signerType === "proxy") {
      y -= 20;
      page.drawText(`代筆者氏名: ${data.proxyName || ""}`, {
        x: MARGIN_LEFT + 15,
        y,
        size: 11,
        font: notoSansJp,
        color: COLOR_TEXT,
      });

      y -= 18;
      page.drawText(
        `本人との関係: ${data.proxyRelationship || ""}　　代筆理由: ${data.proxyReason || ""}`,
        {
          x: MARGIN_LEFT + 15,
          y,
          size: 10,
          font: notoSansJp,
          color: COLOR_GRAY,
        }
      );

      y -= 30;
    } else {
      y -= 20;
    }

    // ---------------------------------------------------------
    // 署名画像
    // ---------------------------------------------------------
    y -= 10;
    y = drawSection(page, notoSansJp, "署名", y);
    y -= 10;

    // 署名画像を埋め込み
    if (data.signatureBase64) {
      try {
        const base64Data = data.signatureBase64.replace(
          /^data:image\/[a-z]+;base64,/,
          ""
        );
        const signatureBytes = Buffer.from(base64Data, "base64");

        const signatureImage = await pdfDoc.embedPng(signatureBytes);

        // アスペクト比を維持してリサイズ
        const maxWidth = 200;
        const maxHeight = 80;
        const imgWidth = signatureImage.width;
        const imgHeight = signatureImage.height;

        let drawWidth = maxWidth;
        let drawHeight = (imgHeight / imgWidth) * maxWidth;

        if (drawHeight > maxHeight) {
          drawHeight = maxHeight;
          drawWidth = (imgWidth / imgHeight) * maxHeight;
        }

        // 署名欄の枠
        page.drawRectangle({
          x: MARGIN_LEFT,
          y: y - maxHeight - 20,
          width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
          height: maxHeight + 20,
          borderColor: rgb(0.8, 0.8, 0.8),
          borderWidth: 1,
          color: rgb(0.98, 0.98, 0.98),
        });

        // 署名画像を描画
        page.drawImage(signatureImage, {
          x: MARGIN_LEFT + 20,
          y: y - maxHeight - 10,
          width: drawWidth,
          height: drawHeight,
        });

        y -= maxHeight + 30;
      } catch (imgError) {
        // 署名画像の埋め込み失敗は致命的エラーとして扱う
        logger.error("署名画像埋め込みエラー", { error: imgError });
        return { ok: false, error: "署名画像の処理に失敗しました" };
      }
    } else {
      // 署名画像がない場合もエラー
      logger.error("署名画像が未設定");
      return { ok: false, error: "署名画像が必要です" };
    }

    // ---------------------------------------------------------
    // 完了表示
    // ---------------------------------------------------------
    y -= 20;
    const completedText = "✓ 同意しました";
    const completedFontSize = 14;

    page.drawRectangle({
      x: MARGIN_LEFT,
      y: y - 35,
      width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
      height: 35,
      color: rgb(0.82, 0.95, 0.87), // 薄い緑
    });

    y -= 23;
    page.drawText(completedText, {
      x: (PAGE_WIDTH - notoSansJp.widthOfTextAtSize(completedText, completedFontSize)) / 2,
      y,
      size: completedFontSize,
      font: notoSansJp,
      color: COLOR_CHECK,
    });

    // ---------------------------------------------------------
    // PDF出力
    // ---------------------------------------------------------
    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    logger.info("同意書PDF生成完了", {
      kaipokeCsId: data.kaipokeCsId,
      size: buffer.length,
    });

    return { ok: true, data: { buffer } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logger.error("PDF生成エラー", { error: message });
    return { ok: false, error: message };
  }
}

// =============================================================
// ヘルパー関数
// =============================================================

/**
 * セクションタイトルを描画
 */
function drawSection(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  title: string,
  y: number
): number {
  page.drawText(title, {
    x: MARGIN_LEFT,
    y,
    size: 11,
    font,
    color: COLOR_GRAY,
  });
  return y - 15;
}

/**
 * 同意項目を描画
 */
function drawConsentItem(
  page: ReturnType<PDFDocument["addPage"]>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  _fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  title: string,
  description: string,
  checked: boolean,
  y: number
): number {
  const boxHeight = 50;

  // 背景
  page.drawRectangle({
    x: MARGIN_LEFT,
    y: y - boxHeight,
    width: PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT,
    height: boxHeight,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  // チェックマーク
  const checkText = checked ? "✓" : "ー";
  const checkColor = checked ? COLOR_CHECK : COLOR_GRAY;

  page.drawText(checkText, {
    x: MARGIN_LEFT + 15,
    y: y - 30,
    size: 16,
    font,
    color: checkColor,
  });

  // タイトル
  page.drawText(title, {
    x: MARGIN_LEFT + 45,
    y: y - 20,
    size: 12,
    font,
    color: COLOR_TEXT,
  });

  // 説明
  page.drawText(description, {
    x: MARGIN_LEFT + 45,
    y: y - 38,
    size: 9,
    font,
    color: COLOR_GRAY,
  });

  return y - boxHeight;
}

/**
 * 日時をフォーマット
 */
function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}