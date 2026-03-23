//portal/dashboard/page.tsx
"use client";

import ShiftSumBizStats from "@/components/biz-stats/ShiftSum";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DefectSum from "@/components/biz-stats/DefectSum";
import EntrySumBizStats from "@/components/biz-stats/EntrySum"; 
import TableViewer from "@/components/TableViewer";

export default function DashboardPage() {
  return (
    <div className="p-4 space-y-6">
      {/* ===== ダッシュボード全体の表題 ===== */}
      <Card>
        <CardHeader>biz
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
      <EntrySumBizStats />
      <TableViewer
        title="月次CSサービス時間サマリー"
        tableName="shift_summary_monthly_cs_view"
        columns={[
          { key: "kaipoke_cs_id", label: "Kaipoke CS ID" },
          { key: "cs_name", label: "利用者名" },
          { key: "month_start", label: "月初日" },
          { key: "year_month", label: "年月" },
          { key: "this_month_hours", label: "当月時間" },
          { key: "prev_month_hours", label: "前月時間" },
          { key: "diff_hours", label: "差分時間" },
        ]}
        defaultSort={{ column: "month_start", ascending: false }}
        pageSize={30}
      />
    </div>
  );
}
