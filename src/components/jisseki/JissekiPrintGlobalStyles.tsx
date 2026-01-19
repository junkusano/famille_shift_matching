// src/components/jisseki/JissekiPrintGlobalStyles.tsx
"use client";

type Props = {
  /** single: /portal/jisseki/print 用, bulk: /portal/jisseki/print/bulk 用 */
  mode: "single" | "bulk";
};

export default function JissekiPrintGlobalStyles({ mode }: Props) {
  return (
    <style jsx global>{`
      /* =========================
         共通（印刷設定・罫線・文字詰め）
         ========================= */
      @page { size: A4; margin: 0mm; }

      html, body{
        margin: 0 !important;
        padding: 0 !important;
      }

      /* 帳票用 罫線・レイアウト（print/page.tsx を基準） */
      .formBox { border: none !important; }
      .box { border: 1px solid #000; }
      .grid { border-collapse: collapse; width: 100%; table-layout: fixed; }
      .grid th, .grid td {
        border: 1px solid #000;
        padding: 2px 4px;
        font-size: 11px;
        line-height: 1.2;
        vertical-align: middle;
      }

      /* 明細行高さ固定（A4安定） */
      :root{ --row-2line: 8.2mm; }
      .detail-row > td{
        height: var(--row-2line);
        padding: 0px 2px;
        line-height: 1.0;
        font-size: 11px;
        vertical-align: middle;
        overflow: hidden;
      }

      .center { text-align: center; }
      .right { text-align: right; }
      .small { font-size: 10px; }
      .title { font-size: 14px; font-weight: 700; text-align: center; }

      @media print{
        .title{ font-size: 12px !important; }
        .grid th, .grid td{ padding: 1px 2px !important; }
      }

      /* 10桁：外枠なし、区切り線のみ */
      .digits10 { display: grid; grid-template-columns: repeat(10, 1fr); height: 12px; }
      .digitCell { display: flex; align-items: center; justify-content: center; }
      .digitCell + .digitCell { border-left: 1px solid #000; }

      /* 斜線 */
      .diag {
        position: relative;
        background:
          linear-gradient(to bottom left,
            transparent calc(50% - 0.5px),
            #000 calc(50% - 0.5px),
            #000 calc(50% + 0.5px),
            transparent calc(50% + 0.5px));
      }

      /* 縦書き */
      .vtext {
        writing-mode: vertical-rl;
        text-orientation: upright;
        line-height: 1;
        padding: 0 !important;
      }

      /* セル内折り返し禁止 */
      .cell-wrap {
        display: block;
        height: 100%;
        overflow: hidden;
        white-space: nowrap;
      }

      /* fit-text（縮小計測安定用） */
      .fit-text{
        display: inline-block;
        max-width: 100%;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
        transform-origin: center center;
      }

      /* 同行援護など備考セル */
      .biko-td{
        padding: 1px 2px !important;
        overflow: hidden;
        height: var(--row-2line);
        text-align: center;
        vertical-align: middle;
      }

      .biko-box {
        box-sizing: border-box;
        height: 100%;
        padding: 2px 3px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 1px;
      }

      .biko-line {
        line-height: 1.05;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
      }

      /* =========================
   同行援護（DOKO）だけ：中央寄せ＆横幅フルを強制
   ========================= */
.doko-sheet{
  width: 100%;
  margin: 0 auto;           /* ★全体を中央へ */
  box-sizing: border-box;
}

.doko-grid{
  width: 100% !important;   /* ★どこかで幅が縮められても戻す */
  max-width: 100% !important;
  margin: 0 auto !important; /* ★テーブル自体を中央へ */
  table-layout: fixed;
}

      /* =========================
         mode別（single/bulk）
         ========================= */

      /* ----- single: /portal/jisseki/print ----- */
      ${mode === "single" ? `
      @media print {
        /* 印刷時は帳票だけ可視化（白紙化の原因になりやすいので必ず print 内に） */
        body * { visibility: hidden !important; }
        .print-only, .print-only * { visibility: visible !important; }

        /* 左右対称の余白＋中央寄せ */
        .print-only{
          position: relative;
          margin: 0 auto;
          width: 210mm;
          padding: 0mm 3mm 1mm 3mm;
          box-sizing: border-box;
        }

        .print-only .p-6,
        .print-only .page-break {
          width: 100% !important;
          box-sizing: border-box !important;
        }

          /* ★追加：print-page を常にページ幅いっぱいにし、帳票を中央へ */
  .print-only .print-page{
    width: 100% !important;
    box-sizing: border-box !important;
    display: flex;
    justify-content: center;
  }

  /* ★追加：帳票本体は親の中央に、幅は親に追従 */
  .print-only .print-page > .formBox{
    width: 100% !important;
    box-sizing: border-box !important;
  }
      }

      @media screen {
        .print-only{
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #fff;
        }
      /* ★追加：画面でもページを中央揃え基準に統一 */
  .print-only .print-page{
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .print-only .print-page > .formBox{
    width: 100%;
  }
      }
      ` : ""}

      /* ----- bulk: /portal/jisseki/print/bulk ----- */
      ${mode === "bulk" ? `
      :root{
        --bulk-bottom-reserve: 20px;
      }

      @page { size: A4; margin: 3mm; }

      .print-root { background: #eee; padding: 12px; }

      @media screen {
        .sheet{
          width: 210mm;
          height: 297mm;
          margin: 0 auto 12px auto;
          background: #fff;
          box-shadow: 0 0 6px rgba(0,0,0,0.15);
          overflow: hidden;
        }
      }

      @media print {
        .sheet{
          width: 100% !important;
          height: 297mm !important;
          min-height: 0 !important;

          margin: 0 !important;
          box-shadow: none !important;

          page-break-after: always;
          break-after: page;
          overflow: hidden;

           /* ★追加：テーブル途中で改ページさせない（フッタ/合計欄が次ページへ飛ぶのを防ぐ） */
  table, thead, tbody, tfoot, tr, th, td{
    break-inside: avoid;
    page-break-inside: avoid;
        }
      }

      .sheet-inner{
        padding: 2mm 4mm 4mm 4mm;
        box-sizing: border-box;
        transform-origin: top left;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      ` : ""}
    `}</style>
  );
}
