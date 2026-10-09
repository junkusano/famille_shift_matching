export function isSelfQuitRequest(text: string | null): boolean {
  if (!text) return false;
  const normalized = text
    .replace(/@[\S]+/g, "")
    .replace(/[\s　、。！？!?,.]/g, "")
    .toLowerCase();

  const refersToSelf = /(私|わたし|自分|僕|ぼく|俺)/.test(normalized)
    // 「利用者様のグループを退会したい」のように、本人語を省略する表現も許可する。
    || /グループ.*(退会|退出|退室|抜け)/.test(normalized);
  const refersToRoom = /(この)?(部屋|ルーム|グループ|トーク)/.test(normalized);
  const asksToLeave = /(退出|退室|退会|抜け).*(して|させて|お願い)|.*(退出|退室|退会|抜け)(したい)/.test(normalized);
  return refersToSelf && refersToRoom && asksToLeave;
}
