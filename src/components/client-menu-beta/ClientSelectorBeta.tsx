"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientMenuBetaClient } from "@/lib/client-menu-beta/navigation";
import styles from "./ClientMenuBeta.module.css";

export function ClientSelectorBeta({ clients, value, onChange }: {
  clients: ClientMenuBetaClient[];
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
