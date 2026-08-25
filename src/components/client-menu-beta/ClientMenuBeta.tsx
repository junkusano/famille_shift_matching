"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRoleContext } from "@/context/RoleContext";
import { resolveCurrentClientBeta } from "@/lib/client-menu-beta/context";
import { buildClientMenuBetaLinks } from "@/lib/client-menu-beta/navigation";
import { ClientMenuPortalBeta } from "./ClientMenuPortalBeta";
import { ClientSelectorBeta } from "./ClientSelectorBeta";
import { useClientMenuBetaClients } from "./useClientMenuBetaClients";
import styles from "./ClientMenuBeta.module.css";

export function ClientMenuBeta() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { role, loading: roleLoading } = useRoleContext();
  const [open, setOpen] = useState(false);
  const { clients, loadError } = useClientMenuBetaClients();
  const [manualId, setManualId] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const pageContext = useMemo(
    () => resolveCurrentClientBeta(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams],
  );

  const pageClient = useMemo(() => clients.find((client) =>
    (pageContext.clientInfoId && client.id === pageContext.clientInfoId)
    || (pageContext.kaipokeCsId && client.kaipoke_cs_id === pageContext.kaipokeCsId),
  ) ?? null, [clients, pageContext]);

  // 新しいページに移動したら、そのページ由来の利用者を必ず初期値に戻す。
  // 同じページで明示的にSelectを変更した直後だけ、手動選択を遷移先に使える。
  useEffect(() => { setManualId(null); }, [pathname, searchParams]);
  const selectedClient = clients.find((client) => client.id === manualId) ?? pageClient ?? null;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let lockedBackground: Array<{
      element: HTMLElement;
      inert: boolean;
      ariaHidden: string | null;
    }> = [];
    const lockFrame = window.requestAnimationFrame(() => {
      lockedBackground = Array.from(document.body.children)
        .filter((element): element is HTMLElement =>
          element instanceof HTMLElement &&
          !element.hasAttribute("data-client-menu-beta-layer") &&
          !["SCRIPT", "STYLE", "LINK"].includes(element.tagName),
        )
        .map((element) => {
          const previous = {
            element,
            inert: element.inert,
            ariaHidden: element.getAttribute("aria-hidden"),
          };
          element.inert = true;
          element.setAttribute("aria-hidden", "true");
          return previous;
        });
    });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]") ?? []).filter((element) => element.offsetParent !== null);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trapFocus);
    window.requestAnimationFrame(() => sheetRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(lockFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trapFocus);
      lockedBackground.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [open]);
  const canUse = role === "manager" || role === "admin";

  if (roleLoading || !canUse) return null;

  const links = selectedClient ? buildClientMenuBetaLinks(selectedClient) : [];
  return (
    <div className={styles.root}>
      <button type="button" onClick={() => setOpen(true)} className={styles.trigger} aria-haspopup="dialog">
        <Menu size={18} /> 利用者メニュー <span className={styles.badge}>BETA</span>
      </button>
      {open && <ClientMenuPortalBeta>
        <div data-client-menu-beta-layer className={styles.backdrop} aria-hidden="true" onMouseDown={() => setOpen(false)} />
        <section data-client-menu-beta-layer ref={sheetRef} tabIndex={-1} className={styles.sheet} role="dialog" aria-modal="true" aria-label="利用者メニュー">
          <header className={styles.header}><div><p>利用者情報ハブ</p><h2>利用者メニュー</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="閉じる"><X size={20} /></button></header>
          <div className={styles.label}><span>利用者</span>
            <ClientSelectorBeta clients={clients} value={selectedClient?.id ?? null} onChange={setManualId} />
          </div>
          {loadError ? <p className={styles.error}>{loadError}</p> : null}
          {selectedClient ? <div className={styles.summary}><strong>{selectedClient.name ?? "氏名未設定"} 様</strong><span>利用者ID：{selectedClient.kaipoke_cs_id ?? "未設定"}</span>{selectedClient.asigned_org && <span>担当部門：{selectedClient.asigned_org}</span>}{selectedClient.asigned_jisseki_staff && <span>担当マネージャー：{selectedClient.asigned_jisseki_staff}</span>}</div> : <p className={styles.empty}>{loadError ? "権限とログイン状態を確認してください。" : "利用者を選択すると、その利用者の関連情報を確認できます。"}</p>}
          <nav className={styles.links} aria-label="利用者別メニュー">
            {links.map(({ label, href, group }) => <Link key={label} href={href} onClick={() => setOpen(false)}><span>{group}</span>{label}</Link>)}
            {!selectedClient && ["基本情報詳細", "月間シフト", "週間シフト", "実績記録", "アセス／プラン", "モニタリング", "書類一覧"].map((label) => <button key={label} type="button" disabled>{label}</button>)}
          </nav>
        </section>
      </ClientMenuPortalBeta>}
    </div>
  );
}
