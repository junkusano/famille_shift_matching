"use client";

import ShiftSumBizStats from "@/components/biz-stats/ShiftSum";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DefectSum from "@/components/biz-stats/DefectSum";


export default function DashboardPage() {
  return (
    <div className="p-4 space-y-6">
      {/* ===== ダッシュボード全体の表題 ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">ダッシュボード</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">
            経営統計。各チームのサービス時間・不備率等の実績、
            その他経営としてトラッキング（追跡）する指標が確認できます。
          </p>
        </CardContent>
      </Card>

      {/* ===== 個別ウィジェット ===== */}
      <ShiftSumBizStats />
      <DefectSum />
    </div>
  );
}
