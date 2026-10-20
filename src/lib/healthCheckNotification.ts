export function buildHealthCheckPersonCommentNotification(name: string, requestId: string) {
  return `【人事労務・健康診断】産業医が本人向けコメントを登録しました\n対象者：${name}\n申請ID：${requestId}`;
}
