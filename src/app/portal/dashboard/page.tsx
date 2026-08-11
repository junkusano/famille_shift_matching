//portal/dashboard/page.tsx
"use client";

import ShiftSumBizStats from "@/components/biz-stats/ShiftSum";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DefectSum from "@/components/biz-stats/DefectSum";
import EntrySumBizStats from "@/components/biz-stats/EntrySum";
import TableViewer, {
  formatHours2,
  getNextYearMonth,
} from "@/components/TableViewer";

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
            { key: "month_start", label: "月初日", filterMode: "exact" },
            { key: "year_month", label: "年月", filterMode: "exact" },
            {
              key: "this_month_hours",
              label: "当月時間",
              format: (value) => formatHours2(value),
            },
            {
              key: "prev_month_hours",
              label: "前月時間",
              format: (value) => formatHours2(value),
            },
            {
              key: "diff_hours",
              label: "差分時間",
              format: (value) => formatHours2(value),
            },
          ]}
          defaultSort={{ column: "diff_hours", ascending: true }}
          pageSize={50}
          initialColumnFilters={{
            year_month: getNextYearMonth(),
          }}
        />
      <TableViewer
        title="サ責資格者サービス時間比率（月次サマリー）"
        tableName="dashboard_service_time_qualification_monthly_view"
        columns={[
          { key: "year_month", label: "月", filterMode: "exact" },
          { key: "total_service_hours", label: "総サービス時間", format: (value) => `${formatHours2(value)}h` },
          { key: "qualified_service_hours", label: "サ責資格者時間", format: (value) => `${formatHours2(value)}h` },
          { key: "qualified_ratio", label: "合計サ責資格者割合", format: (value) => `${Number(value ?? 0).toFixed(1)}%` },
          {
            key: "threshold_status",
            label: "50%基準",
            format: (value) => (
              <span className={value === "基準クリア" ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                {String(value ?? "要確認")}
              </span>
            ),
          },
        ]}
        defaultSort={{ column: "year_month", ascending: false }}
        pageSize={500}
        exactCount={false}
      />
      <TableViewer
        title="サービス区分別・サ責資格者サービス時間比率"
        tableName="dashboard_service_time_qualification_breakdown_view"
        columns={[
          { key: "year_month", label: "月", filterMode: "exact" },
          { key: "service_category", label: "区分" },
          { key: "total_service_hours", label: "総サービス時間", format: (value) => `${formatHours2(value)}h` },
          { key: "qualified_service_hours", label: "サ責資格者時間", format: (value) => `${formatHours2(value)}h` },
          { key: "qualified_ratio", label: "サ責資格者割合", format: (value) => `${Number(value ?? 0).toFixed(1)}%` },
          {
            key: "threshold_status",
            label: "50%基準",
            format: (value) => (
              <span className={value === "基準クリア" ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>
                {String(value ?? "要確認")}
              </span>
            ),
          },
        ]}
        defaultSort={{ column: "year_month", ascending: false }}
        pageSize={500}
        exactCount={false}
      />
      <TableViewer
        title="スタッフ別・サ責資格と担当サービス時間"
        tableName="dashboard_service_time_qualification_staff_detail_view"
        columns={[
          { key: "year_month", label: "月", filterMode: "exact" },
          { key: "service_category", label: "区分" },
          { key: "staff_name", label: "スタッフ" },
          { key: "staff_user_id", label: "ユーザーID", filterMode: "exact" },
          { key: "qualifications", label: "サ責資格（取得日）" },
          {
            key: "qualification_status",
            label: "判定",
            format: (value) => String(value ?? "").replace("資格者", "サ責資格者"),
          },
          { key: "total_service_hours", label: "担当時間", format: (value) => `${formatHours2(value)}h` },
          { key: "qualified_service_hours", label: "サ責資格者時間", format: (value) => `${formatHours2(value)}h` },
          { key: "qualified_ratio", label: "サ責資格者割合", format: (value) => `${Number(value ?? 0).toFixed(1)}%` },
        ]}
        defaultSort={{ column: "year_month", ascending: false }}
        initialColumnFilters={{
          year_month: getNextYearMonth(),
          service_category: "訪問介護",
        }}
        pageSize={500}
        exactCount={false}
      />
    </div>
  );
}
