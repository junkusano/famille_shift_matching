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

type Mode = "request" | "reject";

type Props = {
  shift: ShiftData;
  mode: Mode;
  // /portal/shift-coordinate 側: 希望送信
  onRequest?: (attendRequest: boolean) => void;
  creatingRequest?: boolean; // 送信中表示
  // /portal/shift 側: 外し（理由必須）
  onReject?: (reason: string) => void;
  // 右横に並べたい追加ボタン（例: GroupAddButton）
  extraActions?: React.ReactNode;
};

/** 1件のシフト表示＋モーダル操作を共通化 */
export default function ShiftCard({
  shift,
  mode,
  onRequest,
  creatingRequest,
  onReject,
  extraActions,
}: Props) {
  const [open, setOpen] = useState(false);
  const [attendRequest, setAttendRequest] = useState(false);
  const [reason, setReason] = useState("");

  const openDialog = () => setOpen(true);
  const closeDialog = () => setOpen(false);

  // 共通のミニダイアログ（通学/備考）
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
    <Card className="shadow">
      <CardContent className="p-4">
        <div className="text-sm font-semibold">
          {shift.shift_start_date} {shift.shift_start_time?.slice(0, 5)}～{shift.shift_end_time?.slice(0, 5)}
        </div>
        <div className="text-sm">種別: {shift.service_code}</div>
        <div className="text-sm">郵便番号: {shift.address}</div>
        <div className="text-sm">エリア: {shift.district}</div>
        <MiniInfo />

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-4">
          {/* アクションボタン（モードで出し分け） */}
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
                  </DialogDescription>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={closeDialog}>
                      キャンセル
                    </Button>
                    <Button
                      onClick={() => {
                        onRequest?.(attendRequest);
                        closeDialog();
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
