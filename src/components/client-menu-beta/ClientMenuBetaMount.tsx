"use client";

import { ClientMenuBeta } from "./ClientMenuBeta";

/** β版ラッパーページだけに配置する固定トリガー。既存ページのDOM/CSSには触れない。 */
export function ClientMenuBetaMount() {
  return <div className="fixed right-4 top-4 z-[60]"><ClientMenuBeta /></div>;
}
