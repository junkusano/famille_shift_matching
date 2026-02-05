// =============================================================
// src/lib/cm/contracts/generateContractPdf.ts
// HTMLテンプレート → pdfkit PDF変換（DigiSigner Text Tags対応）
//
// 処理:
//   1. タグ置換済みHTMLをcheerioでパース
//   2. HTML要素をpdfkitのAPIで描画
//   3. DigiSigner Text Tags はそのままテキスト出力
//
// 依存: pdfkit, cheerio
// フォント: NotoSansJP-Regular.ttf（public/fonts/）
// =============================================================

import PDFDocument from 'pdfkit';
import path from 'path';
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { createLogger } from '@/lib/common/logger';
import type { CmContractTemplateCode } from '@/types/cm/contractTemplate';

const logger = createLogger('lib/cm/contracts/generateContractPdf');

// =============================================================
// Types
// =============================================================

export type GeneratePdfResult =
  | { ok: true; buffer: Buffer; fileName: string }
  | { ok: false; error: string };

// =============================================================
// 定数
// =============================================================

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28;  // A4
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;

// フォントサイズ
const FONT_SIZE = {
  h1: 18,
  h2: 12,
  body: 11,
  small: 10,
  note: 9,
} as const;

// =============================================================
// PDF生成（メイン）
// =============================================================

/**
 * タグ置換済みHTMLからPDFを生成
 */
export async function generatePdfFromHtml(
  html: string,
  title: string,
): Promise<GeneratePdfResult> {
  try {
    logger.info('PDF生成開始（HTML→PDF）', { title });

    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      info: {
        Title: title,
        Subject: '電子契約書類',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // 日本語フォント登録
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.ttf');
    doc.registerFont('NotoSansJP', fontPath);
    doc.font('NotoSansJP');

    // HTML→PDF描画
    renderHtmlToPdf(doc, html);

    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const fileName = `${title}.pdf`;
    logger.info('PDF生成完了', { title, size: buffer.length });
    return { ok: true, buffer, fileName };
  } catch (e) {
    logger.error('PDF生成エラー', e as Error);
    return { ok: false, error: 'PDF生成に失敗しました' };
  }
}

/**
 * 複数のタグ置換済みHTMLを1つのPDFに結合
 */
export async function generateCombinedPdfFromHtml(
  htmlList: { html: string; templateCode: CmContractTemplateCode }[],
  clientName: string,
  contractDate: string,
): Promise<GeneratePdfResult> {
  try {
    logger.info('結合PDF生成開始', { count: htmlList.length });

    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      info: {
        Title: '契約書類一式',
        Subject: '電子契約書類',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    // 日本語フォント登録
    const fontPath = path.join(process.cwd(), 'public', 'fonts', 'NotoSansJP-Regular.ttf');
    doc.registerFont('NotoSansJP', fontPath);
    doc.font('NotoSansJP');

    // 各HTMLを順に描画
    htmlList.forEach(({ html }, index) => {
      if (index > 0) {
        doc.addPage();
      }
      renderHtmlToPdf(doc, html);
    });

    doc.end();

    const buffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const dateStr = contractDate.replace(/-/g, '');
    const fileName = `契約書類一式_${clientName}_${dateStr}.pdf`;

    logger.info('結合PDF生成完了', { fileName, size: buffer.length });
    return { ok: true, buffer, fileName };
  } catch (e) {
    logger.error('結合PDF生成エラー', e as Error);
    return { ok: false, error: 'PDF生成に失敗しました' };
  }
}

// =============================================================
// HTML → pdfkit 描画エンジン
// =============================================================

/**
 * HTMLをパースしてpdfkitで描画
 */
function renderHtmlToPdf(doc: PDFKit.PDFDocument, html: string): void {
  const $ = cheerio.load(html);
  const body = $('body');

  body.children().each((_, el) => {
    renderElement(doc, $, $(el));
  });
}

/**
 * 要素を再帰的に描画
 */
function renderElement(
  doc: PDFKit.PDFDocument,
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): void {
  const tagName = $el.prop('tagName')?.toLowerCase();
  if (!tagName) return;

  // ページ下部に達したら改ページ
  checkPageBreak(doc, 40);

  switch (tagName) {
    case 'h1':
      renderH1(doc, $el);
      break;
    case 'h2':
      renderH2(doc, $el);
      break;
    case 'p':
      renderParagraph(doc, $el);
      break;
    case 'div':
      renderDiv(doc, $, $el);
      break;
    case 'table':
      renderTable(doc, $, $el);
      break;
    case 'hr':
      renderHr(doc);
      break;
    default:
      // その他の要素はテキストだけ出力
      const text = $el.text().trim();
      if (text) {
        doc.fontSize(FONT_SIZE.body).text(text);
      }
      break;
  }
}

// =============================================================
// 各要素のレンダラー
// =============================================================

/**
 * h1: タイトル（中央、太字、下線）
 */
function renderH1(doc: PDFKit.PDFDocument, $el: cheerio.Cheerio<Element>): void {
  const text = $el.text().trim();
  doc.fontSize(FONT_SIZE.h1).text(text, { align: 'center' });

  // 下線
  const y = doc.y;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_WIDTH - PAGE_MARGIN, y).lineWidth(2).stroke();
  doc.moveDown(1.5);
}

/**
 * h2: セクション見出し（左ボーダー付き）
 */
function renderH2(doc: PDFKit.PDFDocument, $el: cheerio.Cheerio<Element>): void {
  checkPageBreak(doc, 50);

  const text = $el.text().trim();
  const y = doc.y;

  // 左ボーダー
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN, y + 16).lineWidth(3).stroke('#555555');

  doc.fontSize(FONT_SIZE.h2).text(text, PAGE_MARGIN + 8, y, {
    width: CONTENT_WIDTH - 8,
  });
  doc.moveDown(0.5);
}

/**
 * p: 段落（クラスに応じたスタイル）
 */
function renderParagraph(
  doc: PDFKit.PDFDocument,
  $el: cheerio.Cheerio<Element>,
): void {
  const text = getTextContent($el);
  if (!text) return;

  const classes = ($el.attr('class') || '').split(/\s+/);
  const hasRight = classes.includes('right');
  const hasCenter = classes.includes('center');
  const hasIndent = classes.includes('indent');
  const hasIndent2 = classes.includes('indent2');
  const hasKi = classes.includes('ki');

  // フォントサイズ
  let fontSize: number = FONT_SIZE.body;
  if (hasKi) fontSize = 14;
  if (classes.includes('note') || classes.includes('proxy-note')) fontSize = FONT_SIZE.note;

  // インデント
  let leftMargin = PAGE_MARGIN;
  let width = CONTENT_WIDTH;
  if (hasIndent) {
    leftMargin += 20;
    width -= 20;
  }
  if (hasIndent2) {
    leftMargin += 40;
    width -= 40;
  }

  // 配置
  let align: 'left' | 'right' | 'center' | 'justify' = 'justify';
  if (hasRight) align = 'right';
  if (hasCenter || hasKi) align = 'center';

  doc.fontSize(fontSize).text(text, leftMargin, undefined, {
    width,
    align,
  });

  // x座標をリセット
  doc.x = PAGE_MARGIN;
  doc.moveDown(0.2);
}

/**
 * div: クラスに応じて描画
 */
function renderDiv(
  doc: PDFKit.PDFDocument,
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): void {
  const classes = ($el.attr('class') || '').split(/\s+/);

  if (classes.includes('section-box')) {
    renderSectionBox(doc, $, $el);
  } else if (classes.includes('note')) {
    renderNote(doc, $el);
  } else {
    // 通常のdivは子要素を順に描画
    $el.children().each((_, child) => {
      renderElement(doc, $, $(child));
    });
  }
}

/**
 * section-box: 枠囲みセクション
 */
function renderSectionBox(
  doc: PDFKit.PDFDocument,
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): void {
  checkPageBreak(doc, 80);

  const boxLeft = PAGE_MARGIN;
  const boxWidth = CONTENT_WIDTH;
  const boxPadding = 12;
  const innerWidth = boxWidth - boxPadding * 2;

  // 開始Y位置を記録
  const startY = doc.y;

  // 内部を先に描画（枠線は後で描画するためYを進めておく）
  doc.y = startY + boxPadding;

  $el.children().each((_, child) => {
    const $child = $(child);
    const childTag = $child.prop('tagName')?.toLowerCase();
    const childClasses = ($child.attr('class') || '').split(/\s+/);

    if (childClasses.includes('section-title')) {
      // セクションタイトル
      const titleText = $child.text().trim();
      doc.fontSize(FONT_SIZE.h2).text(titleText, boxLeft + boxPadding, undefined, {
        width: innerWidth,
      });
      // 下線
      const lineY = doc.y;
      doc.moveTo(boxLeft + boxPadding, lineY)
        .lineTo(boxLeft + boxWidth - boxPadding, lineY)
        .lineWidth(0.5)
        .stroke('#cccccc');
      doc.moveDown(0.5);
    } else if (childClasses.includes('field-row')) {
      // フィールド行
      const fieldText = getTextContent($child);
      doc.fontSize(FONT_SIZE.body).text(fieldText, boxLeft + boxPadding, undefined, {
        width: innerWidth,
      });
      doc.x = PAGE_MARGIN;
      doc.moveDown(0.1);
    } else if (childClasses.includes('signature-area')) {
      // 署名エリア（破線枠）
      renderSignatureArea(doc, $, $child, boxLeft + boxPadding, innerWidth);
    } else if (childClasses.includes('staff-block')) {
      // 職員ブロック
      renderStaffBlock(doc, $, $child, boxLeft + boxPadding, innerWidth);
    } else if (childClasses.includes('proxy-note')) {
      // 代筆注記
      const noteText = $child.text().trim();
      doc.fontSize(FONT_SIZE.note).fillColor('#666666')
        .text(noteText, boxLeft + boxPadding, undefined, { width: innerWidth });
      doc.fillColor('#333333');
      doc.x = PAGE_MARGIN;
      doc.moveDown(0.3);
    } else if (childTag === 'p') {
      // 段落
      const pText = getTextContent($child);
      if (pText) {
        doc.fontSize(FONT_SIZE.body).text(pText, boxLeft + boxPadding, undefined, {
          width: innerWidth,
        });
        doc.x = PAGE_MARGIN;
        doc.moveDown(0.2);
      }
    }
  });

  doc.y += boxPadding;

  // 枠線を描画
  const endY = doc.y;
  const boxHeight = endY - startY;
  doc.rect(boxLeft, startY, boxWidth, boxHeight).lineWidth(1).stroke('#999999');

  doc.moveDown(0.8);
  doc.x = PAGE_MARGIN;
}

/**
 * signature-area: 署名エリア（DigiSigner Text Tags）
 */
function renderSignatureArea(
  doc: PDFKit.PDFDocument,
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
  leftX: number,
  width: number,
): void {
  checkPageBreak(doc, 60);

  const areaPadding = 8;
  const startY = doc.y;

  doc.y = startY + areaPadding;

  $el.children().each((_, child) => {
    const $child = $(child);
    const text = getTextContent($child);
    if (!text) return;

    doc.fontSize(FONT_SIZE.body).text(text, leftX + areaPadding, undefined, {
      width: width - areaPadding * 2,
    });
    doc.x = PAGE_MARGIN;
    doc.moveDown(0.2);
  });

  doc.y += areaPadding;

  // 破線枠
  const endY = doc.y;
  const areaHeight = endY - startY;
  doc.rect(leftX, startY, width, areaHeight)
    .lineWidth(0.5)
    .dash(4, { space: 3 })
    .stroke('#999999');
  doc.undash();

  doc.moveDown(0.5);
  doc.x = PAGE_MARGIN;
}

/**
 * staff-block: 職員情報ブロック
 */
function renderStaffBlock(
  doc: PDFKit.PDFDocument,
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
  leftX: number,
  width: number,
): void {
  const blockPadding = 8;
  const startY = doc.y;

  doc.y = startY + blockPadding;

  $el.children().each((_, child) => {
    const $child = $(child);
    const childClasses = ($child.attr('class') || '').split(/\s+/);

    if (childClasses.includes('signature-area')) {
      renderSignatureArea(doc, $, $child, leftX + blockPadding, width - blockPadding * 2);
    } else {
      const text = getTextContent($child);
      if (text) {
        doc.fontSize(FONT_SIZE.body).text(text, leftX + blockPadding, undefined, {
          width: width - blockPadding * 2,
        });
        doc.x = PAGE_MARGIN;
        doc.moveDown(0.1);
      }
    }
  });

  doc.y += blockPadding;

  // 枠線
  const endY = doc.y;
  doc.rect(leftX, startY, width, endY - startY).lineWidth(0.5).stroke('#dddddd');

  doc.moveDown(0.5);
  doc.x = PAGE_MARGIN;
}

/**
 * table: テーブル描画
 */
function renderTable(
  doc: PDFKit.PDFDocument,
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): void {
  checkPageBreak(doc, 60);

  const tableLeft = PAGE_MARGIN;
  const tableWidth = CONTENT_WIDTH;
  const cellPadding = 8;

  const rows: { cells: { text: string; isHeader: boolean; colSpan: number; align: string }[] }[] = [];

  $el.find('tr').each((_, tr) => {
    const cells: { text: string; isHeader: boolean; colSpan: number; align: string }[] = [];
    $(tr).children('th, td').each((__, cell) => {
      const $cell = $(cell);
      const isHeader = $cell.prop('tagName')?.toLowerCase() === 'th';
      const colSpan = parseInt($cell.attr('colspan') || '1', 10);
      const cellClasses = ($cell.attr('class') || '').split(/\s+/);
      const align = cellClasses.includes('unit-cell') ? 'right'
        : cellClasses.includes('table-title') ? 'center'
        : 'left';
      cells.push({
        text: $cell.text().trim(),
        isHeader: isHeader || cellClasses.includes('table-title'),
        colSpan,
        align,
      });
    });
    rows.push({ cells });
  });

  if (rows.length === 0) return;

  // カラム数を推定（colSpan考慮）
  let maxCols = 0;
  rows.forEach(row => {
    const totalCols = row.cells.reduce((sum, c) => sum + c.colSpan, 0);
    if (totalCols > maxCols) maxCols = totalCols;
  });

  const colWidth = tableWidth / maxCols;
  const rowHeight = 24;
  let tableY = doc.y;

  rows.forEach((row) => {
    checkPageBreak(doc, rowHeight + 5);
    tableY = doc.y;

    let cellX = tableLeft;
    row.cells.forEach((cell) => {
      const cellWidth = colWidth * cell.colSpan;
      const bgColor = cell.isHeader ? '#e8e8e8' : '#ffffff';

      // 背景＋枠
      doc.rect(cellX, tableY, cellWidth, rowHeight).fillAndStroke(bgColor, '#666666');

      // テキスト
      doc.fillColor('#333333').fontSize(FONT_SIZE.small);
      const textX = cellX + cellPadding;
      const textWidth = cellWidth - cellPadding * 2;
      doc.text(cell.text, textX, tableY + 5, {
        width: textWidth,
        align: cell.align as 'left' | 'right' | 'center',
      });

      cellX += cellWidth;
    });

    doc.y = tableY + rowHeight;
    doc.x = PAGE_MARGIN;
  });

  doc.moveDown(0.8);
}

/**
 * hr: 水平線
 */
function renderHr(doc: PDFKit.PDFDocument): void {
  doc.moveDown(0.5);
  const y = doc.y;
  doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_WIDTH - PAGE_MARGIN, y).lineWidth(0.5).stroke('#cccccc');
  doc.moveDown(1);
}

/**
 * note: 注記ボックス
 */
function renderNote(
  doc: PDFKit.PDFDocument,
  $el: cheerio.Cheerio<Element>,
): void {
  const text = $el.text().trim();
  if (!text) return;

  const padding = 10;
  const startY = doc.y;

  doc.y = startY + padding;
  doc.fontSize(FONT_SIZE.note).fillColor('#555555')
    .text(text, PAGE_MARGIN + padding, undefined, {
      width: CONTENT_WIDTH - padding * 2,
    });
  doc.fillColor('#333333');
  doc.y += padding;

  // 枠
  doc.rect(PAGE_MARGIN, startY, CONTENT_WIDTH, doc.y - startY)
    .lineWidth(0.5).stroke('#dddddd');

  doc.moveDown(0.8);
  doc.x = PAGE_MARGIN;
}

// =============================================================
// ユーティリティ
// =============================================================

/**
 * 要素からテキストを取得（子要素のテキストも含む）
 */
function getTextContent(
  $el: cheerio.Cheerio<Element>,
): string {
  // innerTextに近い取得（改行を適切にスペースに変換）
  return $el.text().replace(/\s+/g, ' ').trim();
}

/**
 * ページ下部チェック＆改ページ
 */
function checkPageBreak(doc: PDFKit.PDFDocument, requiredSpace: number): void {
  const pageBottom = doc.page.height - PAGE_MARGIN;
  if (doc.y + requiredSpace > pageBottom) {
    doc.addPage();
  }
}