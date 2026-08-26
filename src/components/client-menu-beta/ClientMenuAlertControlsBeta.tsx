"use client";

import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { buildClientMenuBetaLinks } from "@/lib/client-menu-beta/navigation";
import { ClientSelectorBeta } from "./ClientSelectorBeta";
import { useClientMenuBetaClients } from "./useClientMenuBetaClients";
import styles from "./ClientMenuBeta.module.css";

export function ClientMenuAlertControlsBeta() {
  const pathname = usePathname();
  const { clients, loadError } = useClientMenuBetaClients();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedId) ?? null,
    [clients, selectedId],
  );
  const links = selectedClient ? buildClientMenuBetaLinks(selectedClient) : [];

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [menuOpen]);

  const guide = "利用者を選択すると、利用者関連ページへ移動できます";

  return <div className={styles.alertControls}>
    <span className={styles.alertGuide} title={guide} aria-label={guide}>
      <CircleHelp size={18} aria-hidden />
    </span>
    <div className={styles.alertSelector} title={loadError || undefined}>
      <ClientSelectorBeta clients={clients} value={selectedId} onChange={(nextId) => { setSelectedId(nextId); setMenuOpen(false); }} />
    </div>
    <div className={styles.alertMenu} ref={menuRef}>
      <button type="button" disabled={!selectedClient} className={styles.alertMenuTrigger} onClick={() => setMenuOpen((current) => !current)}>
        利用者メニュー
      </button>
      {menuOpen && selectedClient && <nav className={styles.alertMenuPopover} aria-label="選択利用者のメニュー">
        {links.map((link) => <Link key={link.label} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</Link>)}
      </nav>}
    </div>
  </div>;
}
