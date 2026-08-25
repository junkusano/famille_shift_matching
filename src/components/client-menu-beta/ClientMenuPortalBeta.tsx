"use client";

import { createPortal } from "react-dom";

/** β版利用者メニューをページ側のstacking contextから切り離してbody直下へ描画する。 */
export function ClientMenuPortalBeta({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
