export type ClientMenuBetaClient = {
  id: string;
  kaipoke_cs_id: string | null;
  name: string | null;
  kana: string | null;
  asigned_org: string | null;
  asigned_jisseki_staff: string | null;
};

export type ClientMenuBetaLink = {
  label: string;
  href: string;
  group: string;
};

/** 利用者メニューとアラートバーで共有する唯一の遷移先定義。 */
export function buildClientMenuBetaLinks(client: ClientMenuBetaClient): ClientMenuBetaLink[] {
  const infoId = encodeURIComponent(client.id);
  const csId = encodeURIComponent(client.kaipoke_cs_id ?? "");
  return [
    { label: "基本情報詳細", href: `/portal/kaipoke-info-detail-beta/${infoId}`, group: "基本情報" },
    { label: "月間シフト", href: `/portal/roster/monthly-beta?kaipoke_cs_id=${csId}`, group: "シフト" },
    { label: "週間シフト", href: `/portal/roster/weekly-beta?cs=${csId}`, group: "シフト" },
    { label: "実績記録", href: `/portal/disability-check-menu-beta?kaipoke_cs_id=${csId}`, group: "実績" },
    { label: "アセス／プラン", href: `/portal/assessment-beta?client_id=${csId}`, group: "計画・評価" },
    { label: "モニタリング", href: `/portal/kaipoke-info-detail-beta/${infoId}/monitoring`, group: "計画・評価" },
    { label: "書類一覧", href: `/portal/cs_docs-beta?kaipoke_cs_id=${csId}`, group: "書類" },
  ];
}
