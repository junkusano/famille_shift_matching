export function spotApplicationLabel(value: {applicant_source?: string | null; application_state?: string | null; application_conflict?: boolean; applicant_control_url?: string | null}): string {
  let source = value.applicant_source;
  if (!source && value.applicant_control_url) {
    try { const host = new URL(value.applicant_control_url).hostname; source = host.endsWith('.taimee.co.jp') ? 'taimee' : host === 'client.sharefull.com' ? 'sharefull' : host === 'jmty.jp' ? 'jmty' : null; } catch { /* 未設定 */ }
  }
  const names: Record<string,string> = {taimee:'タイミー',sharefull:'シェアフル',jmty:'ジモティ'};
  return (value.application_conflict ? '重複応募・要確認 ／ ' : '') + (source ? names[source] ?? source : 'スポット') + (value.application_state === 'applied' ? ' 応募あり' : ' 確定');
}
