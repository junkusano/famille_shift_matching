import Link from "next/link";
import {
  tokenizeShiftAlertText,
  type ShiftEventAlert,
} from "@/lib/shiftEventAlerts";

function LinkifiedMemo({ memo }: { memo: string }) {
  return (
    <div className="mt-1 whitespace-pre-wrap break-words text-xs text-red-700">
      {tokenizeShiftAlertText(memo).map((token, index) =>
        token.kind === "url" ? (
          <a
            key={`${token.href}:${index}`}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            {token.value}
          </a>
        ) : (
          <span key={`text:${index}`}>{token.value}</span>
        ),
      )}
    </div>
  );
}

export default function ShiftEventAlertItems({
  alerts,
  showEventTasksLink = false,
}: {
  alerts: ShiftEventAlert[];
  showEventTasksLink?: boolean;
}) {
  if (!alerts.length) return null;

  return (
    <div className="space-y-2">
      <div className="font-semibold text-red-800">⚠ イベント {alerts.length}件</div>
      {alerts.map((alert) => (
        <div key={alert.id} className="rounded border border-red-100 bg-white p-2 text-red-800">
          <div className="font-medium">{alert.event_name}</div>
          {alert.memo ? (
            <LinkifiedMemo memo={alert.memo} />
          ) : (
            <div className="mt-1 text-xs text-red-700">メモ・備考なし</div>
          )}
        </div>
      ))}
      {showEventTasksLink ? (
        <Link
          href="/portal/event-tasks"
          className="inline-block text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          イベントタスクを確認
        </Link>
      ) : null}
    </div>
  );
}
