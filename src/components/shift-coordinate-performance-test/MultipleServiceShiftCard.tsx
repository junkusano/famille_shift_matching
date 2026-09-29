"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarDays, Clock3, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { minutesLabel, type MultipleServiceGroup } from "@/lib/multiple-services";
import type { ShiftData } from "@/types/shift";

type Props = {
  group: MultipleServiceGroup<ShiftData>;
  creatingRequest?: boolean;
  onRequest: (attendRequest: boolean, timeAdjustNote?: string) => void;
};

function formatDate(value: string) {
  try {
    return format(parseISO(value), "M/d（E）", { locale: ja });
  } catch {
    return value;
  }
}

export default function MultipleServiceShiftCard({
  group,
  creatingRequest = false,
  onRequest,
}: Props) {
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [timeAdjustNote, setTimeAdjustNote] = useState("");

  return (
    <Card className="h-full overflow-hidden border-violet-300 bg-violet-50/40 shadow-sm ring-1 ring-violet-100 transition hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-base font-bold text-violet-950">
              <CalendarDays className="h-4 w-4 text-violet-600" aria-hidden="true" />
              {formatDate(group.date)}
            </div>
            <div className="mt-3 flex items-center gap-2 text-xl font-bold text-slate-950 sm:text-2xl">
              <Clock3 className="h-5 w-5 text-violet-600" aria-hidden="true" />
              <span className="tabular-nums">{group.startTime} - {group.endTime}</span>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-700 px-2.5 py-1 text-xs font-bold text-white">
            <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
            複数サービス
          </span>
        </div>

        <h3 className="mt-4 text-base font-bold leading-6 text-slate-950">{group.title}</h3>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-lg bg-white px-2 py-2">
            <div className="text-slate-500">拘束</div>
            <div className="mt-1 font-bold text-slate-900">{minutesLabel(group.spanMinutes)}</div>
          </div>
          <div className="rounded-lg bg-white px-2 py-2">
            <div className="text-slate-500">サービス</div>
            <div className="mt-1 font-bold text-slate-900">{minutesLabel(group.serviceMinutes)}</div>
          </div>
          <div className="rounded-lg bg-white px-2 py-2">
            <div className="text-slate-500">間隔</div>
            <div className="mt-1 font-bold text-slate-900">{minutesLabel(group.gapMinutes)}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
          <span className="text-xs font-semibold text-emerald-900">概算給与 合計</span>
          <span className="text-lg font-bold tabular-nums text-emerald-800">
            {group.estimatedPayAmount.toLocaleString()}<span className="ml-0.5 text-sm">円</span>
          </span>
        </div>

        <div className="mt-4 space-y-2 border-t border-violet-100 pt-4">
          {group.shifts.map((shift) => (
            <div key={String(shift.shift_id)} className="rounded-lg bg-white px-3 py-2 text-sm">
              <div className="font-semibold text-slate-900">
                {shift.shift_start_time.slice(0, 5)}-{shift.shift_end_time.slice(0, 5)}
                <span className="ml-2 text-violet-800">{shift.service_code}</span>
              </div>
              <div className="mt-0.5 text-xs text-slate-600">{shift.client_name || "利用者名未登録"} 様</div>
            </div>
          ))}
        </div>

        {group.invalidReason ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
            {group.invalidReason}。管理者へ確認してください。
          </p>
        ) : null}

        <div className="mt-auto border-t border-violet-100 pt-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-violet-700 text-white hover:bg-violet-800" disabled={Boolean(group.invalidReason)}>
                まとめて希望する
              </Button>
            </DialogTrigger>
            <DialogContent className="z-[100] w-[calc(100vw-32px)] sm:max-w-[500px]">
              <DialogTitle>複数サービスをまとめて希望</DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-4 text-sm text-slate-700">
                  <p>{group.title}</p>
                  <p className="font-semibold">{formatDate(group.date)} {group.startTime}-{group.endTime}</p>
                  <p>構成する{group.shifts.length}件すべてへ、一括で希望を送信します。</p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={attendRequest}
                      onChange={(event) => setAttendRequest(event.target.checked)}
                    />
                    同行を希望する
                  </label>
                  <label className="block">
                    <span className="font-medium">希望の時間調整（任意）</span>
                    <textarea
                      value={timeAdjustNote}
                      onChange={(event) => setTimeAdjustNote(event.target.value)}
                      placeholder="例）開始を15分後ろにできれば可"
                      className="mt-1 w-full rounded-lg border p-2"
                    />
                  </label>
                </div>
              </DialogDescription>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
                <Button
                  disabled={creatingRequest}
                  onClick={() => {
                    onRequest(attendRequest, timeAdjustNote.trim() || undefined);
                    setOpen(false);
                  }}
                >
                  {creatingRequest ? "送信中..." : "まとめて送信"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
