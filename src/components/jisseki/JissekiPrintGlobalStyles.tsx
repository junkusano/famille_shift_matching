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
  /* 印刷時は帳票だけ可視化 */
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

  /* ★IDOU（移動支援）だけ下余白確保 */
  .print-only .idou-sheet{
    padding-bottom: 12mm !important;
  }

  /* ★IDOUの上余白を詰める */
  .print-only .idou-sheet .mt-2{
    margin-top: 2px !important;
  }

  /* ★同行援護（様式19）だけ中央寄せ */
  .print-only .doko-sheet{
    width: 204mm !important;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box !important;
  }
  .print-only .doko-sheet table{
    margin-left: auto !important;
    margin-right: auto !important;
  }

  /* =========================
     ✅ 空白ページ対策（ここが本命）
     「page-break」ではなく「print-page」に改ページを持たせる
     ========================= */

  /* 各帳票(=print-page)の後ろで改ページ */
  .print-only .print-page{
    width: 100% !important;
    box-sizing: border-box !important;
    display: flex;
    justify-content: center;

    page-break-after: always;
    break-after: page;
  }

  /* ★最後の帳票は改ページしない → 空白ページが出なくなる */
  .print-only .print-page:last-child{
    page-break-after: auto !important;
    break-after: auto !important;
  }

  /* 帳票本体を中央寄せ固定幅 */
  .print-only .print-page > .formBox{
    width: 204mm !important;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box !important;
  }

  /* ✅ 重要：page-break の強制改ページは無効化（空白ページ原因になりやすい） */
  .print-only .page-break{
    page-break-before: auto !important;
    break-before: auto !important;
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
    `}</style>
  );
}
