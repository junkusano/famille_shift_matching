export type ClientContextBeta = {
  clientInfoId: string | null;
  kaipokeCsId: string | null;
};

/**
 * URL だけから確定できる利用者キーを取り出す。名前は識別子として使わない。
 * client_info_id は cs_kaipoke_info.id、kaipoke_cs_id はシフト等の業務キー。
 */
export function resolveCurrentClientBeta(
  pathname: string,
  search: URLSearchParams,
): ClientContextBeta {
  const detailId = pathname.match(/^\/portal\/kaipoke-info-detail-beta\/([^/]+)/)?.[1]
    ?? pathname.match(/^\/portal\/kaipoke-info-detail\/([^/]+)/)?.[1]
    ?? search.get("client_info_id");

  const kaipokeCsId = search.get("kaipoke_cs_id")
    ?? search.get("cs")
    // assessment の client_id は、既存API上は kaipoke_cs_id を表す。
    ?? search.get("client_id")
    ?? null;

  return {
    clientInfoId: detailId ? decodeURIComponent(detailId) : null,
    kaipokeCsId: kaipokeCsId ? decodeURIComponent(kaipokeCsId) : null,
  };
}
