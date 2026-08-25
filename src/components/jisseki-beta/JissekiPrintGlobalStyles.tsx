"use client";

import { useEffect } from "react";

type Props = {
  /** single: /portal/jisseki-beta/print, bulk: /portal/jisseki-beta/print/bulk */
  mode: "single" | "bulk";
};

const PRINT_BODY_CLASS = "beta-jisseki-print-active";

export default function JissekiPrintGlobalStyles({ mode }: Props) {
  useEffect(() => {
    document.body.classList.add(PRINT_BODY_CLASS);
    return () => document.body.classList.remove(PRINT_BODY_CLASS);
  }, []);

  return (
    <style jsx global>{`
      @page {
        size: A4 portrait;
        margin: 3mm;
      }

      .formBox {
        border: none !important;
        box-sizing: border-box;
      }
      .box { border: 1px solid #000; }
      .grid {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .grid th,
      .grid td {
        border: 1px solid #000;
        padding: 2px 4px;
        font-size: 11px;
        line-height: 1.2;
        vertical-align: middle;
      }

      :root { --row-2line: 8.2mm; }
      .detail-row > td {
        height: var(--row-2line);
        padding: 0 2px;
        overflow: hidden;
        font-size: 11px;
        line-height: 1;
        vertical-align: middle;
      }

      .center { text-align: center; }
      .right { text-align: right; }
      .small { font-size: 10px; }
      .title {
        font-size: 14px;
        font-weight: 700;
        text-align: center;
      }

      .digits10 {
        display: grid;
        grid-template-columns: repeat(10, 1fr);
        height: 12px;
      }
      .digitCell {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .digitCell + .digitCell { border-left: 1px solid #000; }

      .diag {
        position: relative;
        background: linear-gradient(
          to bottom left,
          transparent calc(50% - 0.5px),
          #000 calc(50% - 0.5px),
          #000 calc(50% + 0.5px),
          transparent calc(50% + 0.5px)
        );
      }

      .vtext {
        padding: 0 !important;
        writing-mode: vertical-rl;
        text-orientation: upright;
        line-height: 1;
      }
      .cell-wrap {
        display: block;
        height: 100%;
        overflow: hidden;
        white-space: nowrap;
      }
      .fit-text {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: clip;
        transform-origin: center center;
      }

      .biko-td {
        height: var(--row-2line);
        padding: 1px 2px !important;
        overflow: hidden;
        text-align: center;
        vertical-align: middle;
      }
      .biko-box {
        display: flex;
        height: 100%;
        box-sizing: border-box;
        flex-direction: column;
        justify-content: flex-start;
        gap: 1px;
        padding: 2px 3px;
        overflow: hidden;
      }
      .biko-line {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: clip;
        line-height: 1.05;
      }

      @media screen {
        .beta-jisseki-print-page .print-only {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #fff;
        }
        .beta-jisseki-print-page .print-page {
          display: flex;
          width: 100%;
          justify-content: center;
        }
        .beta-jisseki-print-page .print-scale,
        .beta-jisseki-print-page .print-page > .formBox {
          width: 204mm;
          margin-right: auto;
          margin-left: auto;
        }
      }

      @media print {
        :root { --row-2line: ${mode === "bulk" ? "6.3mm" : "7.7mm"}; }

        html,
        body.beta-jisseki-print-active {
          width: auto !important;
          min-width: 0 !important;
          height: auto !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
        }

        body.beta-jisseki-print-active * {
          visibility: hidden !important;
        }
        body.beta-jisseki-print-active .print-only,
        body.beta-jisseki-print-active .print-only * {
          visibility: visible !important;
        }

        /* ポータル共通UIを印刷フローから外し、非表示要素の幅・高さを残さない。 */
        body.beta-jisseki-print-active .left-menu,
        body.beta-jisseki-print-active .menu,
        body.beta-jisseki-print-active .hamburger,
        body.beta-jisseki-print-active .edge-hotzone,
        body.beta-jisseki-print-active .no-print,
        body.beta-jisseki-print-active footer,
        body.beta-jisseki-print-active main > .flex-1 > :not(.beta-jisseki-print-page) {
          display: none !important;
        }

        body.beta-jisseki-print-active .portal-container,
        body.beta-jisseki-print-active main,
        body.beta-jisseki-print-active main > .flex-1,
        body.beta-jisseki-print-active .beta-jisseki-print-page {
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

        body.beta-jisseki-print-active .print-only {
          position: static !important;
          width: 100% !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          zoom: 1 !important;
        }

        /* @pageの3mm余白を除いた204x291mmを、全ページ共通の基準領域にする。 */
        body.beta-jisseki-print-active .print-page {
          display: flex !important;
          width: 204mm !important;
          height: 291mm !important;
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
        body.beta-jisseki-print-active .print-page + .print-page {
          break-before: page;
          page-break-before: always;
        }
        body.beta-jisseki-print-active .beta-print-client:not(:last-child) {
          break-after: page;
          page-break-after: always;
        }

        body.beta-jisseki-print-active .print-scale {
          position: relative;
          width: 204mm;
          max-width: none;
          margin: 0;
          flex: 0 0 auto;
          overflow: visible;
        }
        body.beta-jisseki-print-active .print-scale > .formBox,
        body.beta-jisseki-print-active .print-page > .formBox {
          width: 204mm !important;
          max-width: none !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          transform-origin: top center !important;
        }

        body.beta-jisseki-print-active .grid,
        body.beta-jisseki-print-active .doko-sheet table {
          width: 100% !important;
          max-width: 100% !important;
          table-layout: fixed !important;
        }

        body.beta-jisseki-print-active .title { font-size: ${mode === "bulk" ? "11px" : "12px"} !important; }
        body.beta-jisseki-print-active .formBox { padding: ${mode === "bulk" ? "1.5mm" : "1mm"} !important; }
        body.beta-jisseki-print-active .mt-2 { margin-top: 2px !important; }
        body.beta-jisseki-print-active .digits10 { height: 10px !important; }
        body.beta-jisseki-print-active .grid th {
          padding: 1px !important;
          font-size: ${mode === "bulk" ? "10px" : "9px"} !important;
          line-height: 1.05 !important;
          white-space: nowrap;
          word-break: keep-all;
          overflow-wrap: normal;
        }
        body.beta-jisseki-print-active .grid td {
          padding: 1px 2px !important;
          font-size: 10px !important;
          line-height: 1 !important;
        }
        body.beta-jisseki-print-active .detail-row > td {
          height: var(--row-2line);
          padding: 0 1px !important;
          font-size: 10px !important;
          line-height: 1 !important;
        }
        body.beta-jisseki-print-active .biko-box {
          padding: 0 1px;
          justify-content: center;
        }
      }
    `}</style>
  );
}
