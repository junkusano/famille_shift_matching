"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRoleContext } from "@/context/RoleContext";
import { supabase } from "@/lib/supabaseClient";
import { resolveCurrentClientBeta } from "@/lib/client-menu-beta/context";
import { ClientMenuPortalBeta } from "./ClientMenuPortalBeta";
import styles from "./ClientMenuBeta.module.css";

type ClientRow = {
  id: string;
  kaipoke_cs_id: string | null;
  name: string | null;
  kana: string | null;
  asigned_org: string | null;
  asigned_jisseki_staff: string | null;
};

function ClientSelectorBeta({
  clients,
  value,
  onChange,
}: {
  clients: ClientRow[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = clients.find((client) => client.id === value) ?? null;
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
  const matches = clients.filter((client) => !normalizedQuery || [client.name, client.kana, client.kaipoke_cs_id]
    .filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery));

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  return <div className={styles.selector} ref={rootRef}>
    <button type="button" className={styles.selectorTrigger} aria-expanded={isOpen} aria-haspopup="listbox" onClick={() => { setQuery(""); setIsOpen((current) => !current); }}>
      <span>{selected ? `${selected.name?.trim() || "（氏名未設定）"} (${selected.kaipoke_cs_id ?? "ID未設定"})` : "利用者を選択してください"}</span><span aria-hidden>⌄</span>
    </button>
    {isOpen && <div className={styles.selectorPopover} role="listbox" aria-label="利用者候補">
      <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="氏名・カナ・利用者IDで検索..." className={styles.selectorSearch} />
      <div className={styles.selectorList}>
        {matches.length === 0 ? <p className={styles.selectorEmpty}>該当する利用者がいません。</p> : matches.map((client) => <button key={client.id} type="button" role="option" aria-selected={client.id === value} className={styles.selectorOption} onClick={() => { onChange(client.id); setIsOpen(false); }}>
          {client.name?.trim() || "（氏名未設定）"}<small>{client.kaipoke_cs_id ?? "ID未設定"}</small>
        </button>)}
      </div>
      {value && <button type="button" className={styles.selectorClear} onClick={() => { onChange(null); setIsOpen(false); }}>選択をクリア</button>}
    </div>}
  </div>;
}

function hrefs(client: ClientRow) {
  const infoId = encodeURIComponent(client.id);
  const csId = encodeURIComponent(client.kaipoke_cs_id ?? "");
  return [
    ["基本情報詳細", `/portal/kaipoke-info-detail-beta/${infoId}`, "基本情報"],
    ["月間シフト", `/portal/roster/monthly-beta?kaipoke_cs_id=${csId}`, "シフト"],
    ["週間シフト", `/portal/roster/weekly-beta?cs=${csId}`, "シフト"],
    ["実績記録", `/portal/disability-check-menu-beta?kaipoke_cs_id=${csId}`, "実績"],
    ["アセス／プラン", `/portal/assessment-beta?client_id=${csId}`, "計画・評価"],
    ["モニタリング", `/portal/kaipoke-info-detail-beta/${infoId}/monitoring`, "計画・評価"],
    ["書類一覧", `/portal/cs_docs-beta?kaipoke_cs_id=${csId}`, "書類"],
  ] as const;
}

export function ClientMenuBeta() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { role, loading: roleLoading } = useRoleContext();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loadError, setLoadError] = useState("");
  const [manualId, setManualId] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const pageContext = useMemo(
    () => resolveCurrentClientBeta(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams],
  );

  useEffect(() => {
    let alive = true;
    async function loadClients() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const response = await fetch("/api/client-menu-beta/clients", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!alive) return;
      if (!response.ok || !payload?.ok) {
        setLoadError(payload?.error || "利用者一覧を取得できませんでした。");
        return;
      }
      setClients(payload.data as ClientRow[]);
      setLoadError("");
    }
    void loadClients();
    return () => { alive = false; };
  }, []);

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

  const links = selectedClient ? hrefs(selectedClient) : [];
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
            {links.map(([label, href, group]) => <Link key={label} href={href} onClick={() => setOpen(false)}><span>{group}</span>{label}</Link>)}
            {!selectedClient && ["基本情報詳細", "月間シフト", "週間シフト", "実績記録", "アセス／プラン", "モニタリング", "書類一覧"].map((label) => <button key={label} type="button" disabled>{label}</button>)}
          </nav>
        </section>
      </ClientMenuPortalBeta>}
    </div>
  );
}
