// components/shift/ShiftCard.tsx
"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ShiftData } from "@/types/shift";

// 表示モード（申請 or 断り）
type Mode = "request" | "reject";

// Props 定義
type Props = {
  shift: ShiftData;
  mode: Mode;
  onRequest?: (attendRequest: boolean, timeAdjustNote?: string) => void; // 希望送信時のコールバック
  creatingRequest?: boolean; // 送信中フラグ
  onReject?: (reason: string) => void; // 断り理由の送信
  extraActions?: React.ReactNode; // 右側に並べる追加ボタン群
  timeAdjustable?: boolean; // true でピンク背景 & バッジ
  /**
   * 時間調整の内容テキスト（任意）。未指定時は shift 内の timeAdjustNote / time_adjust_note を自動参照し、
   * それも無ければ "時間調整が可能です" を表示します。
   */
  timeAdjustText?: string;
};

// ===== ヘルパ（any禁止・安全アクセス） =====
type UnknownRecord = Record<string, unknown>;

function pickBoolean(obj: unknown, keys: readonly string[]): boolean | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as UnknownRecord;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

function pickString(obj: unknown, keys: readonly string[]): string | undefined {
  if (typeof obj !== "object" || obj === null) return undefined;
  const rec = obj as UnknownRecord;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return undefined;
}

/** 1件のシフト表示＋モーダル操作を共通化 */
export default function ShiftCard({
  shift,
  mode,
  onRequest,
  creatingRequest,
  onReject,
  extraActions,
  timeAdjustable,
  timeAdjustText,
}: Props) {
  // ===== ローカル状態 =====
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [reason, setReason] = useState("");
  const [timeAdjustNote, setTimeAdjustNote] = useState("");

  // ===== ユーティリティ =====
  const openDialog = () => setOpen(true);
  const closeDialog = () => setOpen(false);

  // ▼ props か shift の値から時間調整可/テキストを導出（呼び出し側の修正なしで動く）
  const derivedTimeAdjustable: boolean =
    typeof timeAdjustable === "boolean"
      ? timeAdjustable
      : (pickBoolean(shift, [
          "time_adjustable",
          "timeAdjustable",
          "time_adjust",
          "timeAdjust",
        ]) ?? Boolean(pickString(shift, ["timeAdjustNote", "time_adjust_note"])));

  const derivedTimeAdjustText: string =
    timeAdjustText ??
    pickString(shift, ["timeAdjustNote", "time_adjust_note"]) ??
    "時間調整が可能です";

  // ===== サブ表示（通学/備考） =====
  const MiniInfo = () => (
    <>
      <div className="text-sm">
        利用者名: {shift.client_name} 様
        {shift.commuting_flg && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-2 text-xs text-blue-500 underline">通所・通学</button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
              <div className="text-sm">
                <strong>通所経路等</strong>
                <p>
                  {[shift.standard_route, shift.standard_trans_ways, shift.standard_purpose]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
      <div
        className="text-sm"
        style={{
          color:
            shift.gender_request_name === "男性希望"
              ? "blue"
              : shift.gender_request_name === "女性希望"
              ? "red"
              : "black",
        }}
      >
        性別希望: {shift.gender_request_name}
        {shift.biko && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-2 text-xs text-blue-500 underline">詳細情報</button>
            </DialogTrigger>
            <DialogContent className="max-w-[480px]">
              <div className="text-sm">
                <strong>備考</strong>
                <p>{shift.biko}</p>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </>
  );

  return (
    <Card
      className={`shadow ${
        derivedTimeAdjustable ? "bg-pink-50 border-pink-300 ring-1 ring-pink-200" : ""
      }`}
    >
      <CardContent className="p-4">
        {/* ヘッダ行 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold">
            {shift.shift_start_date} {shift.shift_start_time?.slice(0, 5)}～
            {shift.shift_end_time?.slice(0, 5)}
          </div>

          {derivedTimeAdjustable && (
            <span
              className="text-[11px] px-2 py-0.5 rounded bg-pink-100 border border-pink-300"
              title={derivedTimeAdjustText}
            >
              {derivedTimeAdjustText}
            </span>
          )}
        </div>

        {/* 基本情報 */}
        <div className="text-sm mt-1">種別: {shift.service_code}</div>
        <div className="text-sm">郵便番号: {shift.address}</div>
        <div className="text-sm">エリア: {shift.district}</div>
        <MiniInfo />

        {/* アクション行 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              {mode === "request" ? (
                <Button onClick={openDialog}>このシフトを希望する</Button>
              ) : (
                <Button className="bg-red-500 text-white" onClick={openDialog}>
                  このシフトに入れない
                </Button>
              )}
            </DialogTrigger>

            {/* モーダル中身 */}
            <DialogContent className="max-w-[480px]">
              {mode === "request" ? (
                <>
                  <DialogTitle>このシフトを希望しますか？</DialogTitle>
                  <DialogDescription>
                    希望を送信すると、シフトコーディネート申請が開始されます。
                    <div className="mt-2 text-sm text-gray-500">
                      利用者: {shift.client_name} / 日付: {shift.shift_start_date} / サービス: {shift.service_code}
                    </div>
                    <label className="flex items-center mt-4 gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={attendRequest}
                        onChange={(e) => setAttendRequest(e.target.checked)}
                      />
                      同行を希望する
                    </label>
                    {/* 任意の時間調整希望 */}
                    <div className="mt-4">
                      <label className="text-sm font-medium">希望の時間調整（任意）</label>
                      <textarea
                        value={timeAdjustNote}
                        onChange={(e) => setTimeAdjustNote(e.target.value)}
                        placeholder="例）開始を15分後ろに出来れば可 など"
                        className="w-full mt-1 p-2 border rounded"
                      />
                    </div>
                  </DialogDescription>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={closeDialog}>
                      キャンセル
                    </Button>
                    <Button
                      onClick={() => {
                        onRequest?.(attendRequest, timeAdjustNote || undefined);
                        setOpen(false);
                      }}
                      disabled={!!creatingRequest}
                    >
                      {creatingRequest ? "送信中..." : "希望を送信"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <DialogTitle>シフトに入れない</DialogTitle>
                  <DialogDescription>
                    {shift.client_name} 様のシフトを外します。理由を入力してください。
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="シフトに入れない理由"
                      className="w-full mt-2 p-2 border"
                    />
                  </DialogDescription>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={closeDialog}>
                      キャンセル
                    </Button>
                    <Button
                      disabled={!reason}
                      onClick={() => {
                        onReject?.(reason);
                        closeDialog();
                      }}
                    >
                      処理実行を確定
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* 右側に並ぶ追加アクション */}
          {extraActions}
        </div>
      </CardContent>
    </Card>
  );
}
