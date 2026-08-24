"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/SearchableSelect";
import { useRoleContext } from "@/context/RoleContext";
import { supabase } from "@/lib/supabaseClient";
import { resolveCurrentClientBeta } from "@/lib/client-menu-beta/context";
import styles from "./ClientMenuBeta.module.css";

type ClientRow = {
  id: string;
  kaipoke_cs_id: string | null;
  name: string | null;
  kana: string | null;
  asigned_org: string | null;
  asigned_jisseki_staff: string | null;
};

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
  const [manualId, setManualId] = useState<string | null>(null);
  const pageContext = useMemo(
    () => resolveCurrentClientBeta(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams],
  );

  useEffect(() => {
    let alive = true;
    async function loadClients() {
      const { data, error } = await supabase
        .from("cs_kaipoke_info")
        .select("id,kaipoke_cs_id,name,kana,asigned_org,asigned_jisseki_staff")
        .eq("is_active", true)
        .order("kana", { ascending: true })
        .order("name", { ascending: true });
      if (!error && alive) setClients((data ?? []) as ClientRow[]);
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
  const options = useMemo<SearchableSelectOption[]>(() => clients.map((client) => ({
    value: client.id,
    label: `${client.name?.trim() || "（氏名未設定）"} (${client.kaipoke_cs_id ?? "ID未設定"})`,
    searchText: [client.name, client.kana, client.kaipoke_cs_id].filter(Boolean).join(" "),
  })), [clients]);
  const canUse = role === "manager" || role === "admin";

  if (roleLoading || !canUse) return null;

  const links = selectedClient ? hrefs(selectedClient) : [];
  return (
    <div className={styles.root}>
      <button type="button" onClick={() => setOpen(true)} className={styles.trigger} aria-haspopup="dialog">
        <Menu size={18} /> 利用者メニュー <span className={styles.badge}>BETA</span>
      </button>
      {open && <div className={styles.backdrop} onMouseDown={() => setOpen(false)}>
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="利用者メニュー" onMouseDown={(event) => event.stopPropagation()}>
          <header className={styles.header}><div><p>利用者情報ハブ</p><h2>利用者メニュー</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="閉じる"><X size={20} /></button></header>
          <label className={styles.label}>利用者
            <SearchableSelect options={options} value={selectedClient?.id ?? null} onChange={setManualId} placeholder="利用者を選択してください" searchPlaceholder="氏名・カナ・利用者IDで検索..." clearable />
          </label>
          {selectedClient ? <div className={styles.summary}><strong>{selectedClient.name ?? "氏名未設定"} 様</strong><span>利用者ID：{selectedClient.kaipoke_cs_id ?? "未設定"}</span>{selectedClient.asigned_org && <span>担当部門：{selectedClient.asigned_org}</span>}{selectedClient.asigned_jisseki_staff && <span>担当マネージャー：{selectedClient.asigned_jisseki_staff}</span>}</div> : <p className={styles.empty}>利用者を選択すると、その利用者の関連情報を確認できます。</p>}
          <nav className={styles.links} aria-label="利用者別メニュー">
            {links.map(([label, href, group]) => <Link key={label} href={href} onClick={() => setOpen(false)}><span>{group}</span>{label}</Link>)}
            {!selectedClient && ["基本情報詳細", "月間シフト", "週間シフト", "実績記録", "アセス／プラン", "モニタリング", "書類一覧"].map((label) => <button key={label} type="button" disabled>{label}</button>)}
          </nav>
        </section>
      </div>}
    </div>
  );
}
