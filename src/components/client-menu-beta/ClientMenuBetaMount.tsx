"use client";

import { ClientMenuBeta } from "./ClientMenuBeta";

/** β版ラッパーページだけに配置する固定トリガー。既存ページのDOM/CSSには触れない。 */
export function ClientMenuBetaMount() {
  // PopoverはPortalで z-50 に描画されるため、この親で新しい重なり順を作らない。
  return <div className="fixed right-4 top-4"><ClientMenuBeta /></div>;
}
