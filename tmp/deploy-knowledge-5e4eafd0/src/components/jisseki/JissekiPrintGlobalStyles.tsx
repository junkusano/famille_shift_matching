// src/components/jisseki/JissekiPrintGlobalStyles.tsx
"use client";

import { useEffect } from "react";

type Props = {
  /** single: /portal/jisseki/print 用, bulk: /portal/jisseki/print/bulk 用 */
  mode: "single" | "bulk";
};

const PRINT_BODY_CLASS = "classic-jisseki-print-active";

export default function JissekiPrintGlobalStyles({ mode }: Props) {
  useEffect(() => {
    document.body.classList.add(PRINT_BODY_CLASS);
    return () => document.body.classList.remove(PRINT_BODY_CLASS);
  }, []);

  return (
    <style jsx global>{`
      /* =========================
         共通（印刷設定・罫線・文字詰め）
         ========================= */
      @page { size: A4 portrait; margin: 0mm; }

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

       /* ===== ★bulk は印刷時だけ“あと数mm”詰める（1枚化の決定打） ===== */
${mode === "bulk" ? `
  @media print {
    /* ★最重要：明細行高をさらに詰める */
    :root{ --row-2line: 6.3mm; } /* 7.0mm → 6.3mm */

    /* 表全体（見出し含む）も僅かに詰める */
    .grid th, .grid td{
      font-size: 10px !important;
      line-height: 1.00 !important;
      padding: 1px 2px !important;
    }
    .detail-row > td{
      padding: 0px 1px !important;
      font-size: 10px !important;
      line-height: 1.00 !important;
    }

    /* ★Tailwind の mt-2 が縦を押し出すので bulk 印刷時だけ縮める */
    .mt-2{ margin-top: 2px !important; } /* 0.5rem(約8px) → 2px */

    /* 10桁枠の高さも僅かに縮める（上部ヘッダが数px下がる） */
    .digits10{ height: 10px !important; } /* 12px → 10px */

    /* 外枠（formBox）の余白をもう一段縮める */
    .formBox{ padding: 1.5mm !important; } /* 2mm → 1.5mm */

    /* タイトルも僅かに縮める（必要な帳票だけ効く） */
    .title{ font-size: 11px !important; }
  }
` : ""}

      .center { text-align: center; }
      .right { text-align: right; }
      .small { font-size: 10px; }
      .title { font-size: 14px; font-weight: 700; text-align: center; }

      @media print{
        :root{ --row-2line: 8mm; }

        .title{ font-size: 12px !important; }
        .print-only .formBox{ padding: 1mm !important; }
        .print-only .mt-2{ margin-top: 2px !important; }
        .print-only .digits10{ height: 10px !important; }

        .print-only .grid th{
          padding: 1px !important;
          font-size: 9px !important;
          line-height: 1.05 !important;
          white-space: nowrap;
          word-break: keep-all;
          overflow-wrap: normal;
        }

        .print-only .grid td{
          padding: 1px 2px !important;
          font-size: 10px !important;
          line-height: 1 !important;
        }

        .print-only .detail-row > td{
          height: var(--row-2line);
          padding: 0 1px !important;
          font-size: 10px !important;
          line-height: 1 !important;
        }

        .print-only .biko-box{
          padding: 0 1px;
          justify-content: center;
        }
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
   同行援護（DOKO）専用指定：一旦停止
   （まず他帳票と同じ挙動に揃えて原因を切り分ける）
   ========================= */
/*
.doko-sheet{
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.doko-grid{
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 auto !important;
  table-layout: fixed;
}
*/

      /* =========================
         mode別（single/bulk）
         ========================= */

      /* ----- single: /portal/jisseki/print ----- */
      ${mode === "single" ? `
     @media print {
       body *{ visibility: hidden !important; }
       .print-only, .print-only *{ visibility: visible !important; }

       .print-only{
         position: static !important;
         width: 210mm !important;
         margin: 0 auto !important;
         padding: 0 3mm 1mm !important;
         box-sizing: border-box !important;
       }

       .print-only .print-page{
         display: block;
         width: 100% !important;
         box-sizing: border-box !important;
         page-break-inside: avoid;
         break-inside: avoid-page;
         page-break-after: auto !important;
         break-after: auto !important;
       }

       .print-only .print-page + .print-page,
       .print-only .page-break{
         page-break-before: always !important;
         break-before: page !important;
       }

       .print-only > :last-child{
         page-break-after: auto !important;
         break-after: auto !important;
       }

       .print-only .print-page > .formBox{
         width: 204mm !important;
         margin: 0 auto !important;
         box-sizing: border-box !important;
       }

       .print-only .doko-sheet,
       .print-only .doko-sheet table{
         margin-left: auto !important;
         margin-right: auto !important;
       }
     }

/* =========================
   iOS Safari 印刷：サイズ調整85%をCSSで再現
   ========================= */
@supports (-webkit-touch-callout: none) {
  html, body { -webkit-text-size-adjust: 100% !important; }

  /* ★レイアウト計算に効く縮小（transformではなくzoom） */
  .print-only{ zoom: 0.85 !important; }

  /* ★保険：縦方向も詰める（= 85%相当） */
  :root{ --row-2line: 6.9mm; } /* 8.2mm × 0.85 ≒ 6.97mm */
  .formBox{ padding: 1.5mm !important; }
  .mt-2{ margin-top: 2px !important; }
  .digits10{ height: 10px !important; }
  .title{ font-size: 10.5px !important; }
  .grid th, .grid td{
    font-size: 9.5px !important;
    line-height: 1.00 !important;
    padding: 1px 2px !important;
  }
  .detail-row > td{
    padding: 0px 1px !important;
    font-size: 9.5px !important;
    line-height: 1.00 !important;
  }
}

      @media screen {
        .print-only{
          width: 210mm;
          min-height: 295mm;
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
  width: 204mm;
  margin: 0 auto;
}
      }
      ` : ""}

      /* ----- bulk: /portal/jisseki/print/bulk ----- */
      ${mode === "bulk" ? `
      :root{
        --bulk-bottom-reserve: 20px;
      }

      @page { size: A4; margin: 0mm; }

      .print-root { background: #eee; padding: 12px; }

      @media screen {
        .sheet{
          width: 210mm;
          height: 295mm;
          margin: 0 auto 12px auto;
          background: #fff;
          box-shadow: 0 0 6px rgba(0,0,0,0.15);
          overflow: hidden;
        }
      }

      @media print {
       /* 単票と同じ：帳票以外を不可視化（余計なDOMが白紙ページ原因になりやすい） */
  body * { visibility: hidden !important; }
  .print-only, .print-only * { visibility: visible !important; }

  /* 画面用の余白を印刷では消す */
  .print-root { padding: 0 !important; background: #fff !important; }
        .sheet{
    width: 210mm !important;
      /* ★固定height/min-heightを両方やめる（白紙ページ対策） */
  height: auto !important;
  min-height: auto !important;

  margin: 0 auto !important;
  box-shadow: none !important;

  page-break-after: always;
  break-after: page;

  overflow: visible !important;
  }

  .sheet:last-child{
    page-break-after: auto !important;
    break-after: auto !important;
  }
}

  /* テーブル要素への一括 break-inside:avoid は、
     ブラウザによっては「無理やり次ページに押し出す」→白紙発生の原因になるので削除 */
}

   .sheet-inner{
  width: 210mm;
  height: auto;
  min-height: auto; /* ★白紙/押し出し対策 */

  padding: 0mm 3mm 2mm 3mm;
  box-sizing: border-box;
}
      ` : ""}

      /*
       * 従来版の帳票内容は変えず、β版と同じA4安全領域・中央基準で印刷する。
       * 既存ルールより後ろに置き、単票／一括の双方で左右ずれを抑える。
       */
      @page {
        size: A4 portrait;
        margin: 5mm;
      }

      .classic-jisseki-print-page .formBox {
        box-sizing: border-box;
      }

      @media screen {
        .classic-jisseki-print-page .print-only {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #fff;
        }

        .classic-jisseki-print-page .print-page {
          display: flex;
          width: 100%;
          justify-content: center;
        }

        .classic-jisseki-print-page .print-scale,
        .classic-jisseki-print-page .print-page > .formBox {
          width: 204mm;
          margin-right: auto;
          margin-left: auto;
        }
      }

      @media print {
        :root { --row-2line: ${mode === "bulk" ? "6.3mm" : "7.7mm"}; }

        html,
        body.classic-jisseki-print-active {
          width: auto !important;
          min-width: 0 !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }

        body.classic-jisseki-print-active * {
          visibility: hidden !important;
        }

        body.classic-jisseki-print-active .print-only,
        body.classic-jisseki-print-active .print-only * {
          visibility: visible !important;
        }

        body.classic-jisseki-print-active .left-menu,
        body.classic-jisseki-print-active .menu,
        body.classic-jisseki-print-active .hamburger,
        body.classic-jisseki-print-active .edge-hotzone,
        body.classic-jisseki-print-active .no-print,
        body.classic-jisseki-print-active footer,
        body.classic-jisseki-print-active main > .flex-1 > :not(.classic-jisseki-print-page),
        body.classic-jisseki-print-active .portal-container > :not(main) {
          display: none !important;
        }

        body.classic-jisseki-print-active .portal-container,
        body.classic-jisseki-print-active main,
        body.classic-jisseki-print-active main > .flex-1,
        body.classic-jisseki-print-active .classic-jisseki-print-page {
          display: block !important;
          width: auto !important;
          min-width: 0 !important;
          max-width: none !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }

        body.classic-jisseki-print-active .print-only {
          position: static !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          zoom: 1 !important;
        }

        body.classic-jisseki-print-active .print-page {
          display: flex !important;
          width: 200mm !important;
          height: 290mm !important;
          box-sizing: border-box !important;
          align-items: flex-start !important;
          justify-content: center !important;
          margin: 0 !important;
          padding: 10mm 0 0 !important;
          overflow: visible !important;
          break-after: auto;
          break-inside: avoid-page;
          page-break-after: auto;
          page-break-inside: avoid;
        }

        body.classic-jisseki-print-active .print-page + .print-page {
          break-before: page;
          page-break-before: always;
        }

        body.classic-jisseki-print-active .classic-print-client:not(:last-child) {
          break-after: page;
          page-break-after: always;
        }

        body.classic-jisseki-print-active .print-page:last-child,
        body.classic-jisseki-print-active .classic-print-client:last-child {
          break-after: auto !important;
          page-break-after: auto !important;
        }

        body.classic-jisseki-print-active .print-scale {
          position: relative;
          width: 200mm;
          max-width: none;
          margin: 0;
          flex: 0 0 auto;
          overflow: visible;
        }

        body.classic-jisseki-print-active .print-scale > .formBox,
        body.classic-jisseki-print-active .print-page > .formBox {
          width: 200mm !important;
          max-width: none !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          transform-origin: top center !important;
        }

        body.classic-jisseki-print-active .grid,
        body.classic-jisseki-print-active .doko-sheet table {
          display: table !important;
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
        }
      }
    `}</style>
  );
}
