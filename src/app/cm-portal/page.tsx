// src/app/cm-portal/page.tsx
import React from 'react';
import { CmCard } from '@/components/cm-components';
import {
  Users,
  Calendar,
  FileText,
  Bell,
  TrendingUp,
  Clock,
} from 'lucide-react';

// 統計カードコンポーネント
const StatCard = ({
  title,
  value,
  icon: Icon,
  color,
  trend,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  trend?: string;
}) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-cm-card">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-500 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        {trend && (
          <p className="text-xs text-cm-success mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {trend}
          </p>
        )}
      </div>
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}
      >
        <Icon className="w-6 h-6 text-white" />
      </div>
    </div>
  </div>
);

export default function CmPortalHome() {
  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
          ポータルHome
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          システムの概要と本日のタスクを確認できます
        </p>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="利用者数"
          value="422"
          icon={Users}
          color="bg-cm-primary-500"
          trend="+12 今月"
        />
        <StatCard
          title="本日のシフト"
          value="48"
          icon={Calendar}
          color="bg-cm-success"
        />
        <StatCard
          title="未処理エントリー"
          value="5"
          icon={FileText}
          color="bg-cm-warning"
        />
        <StatCard
          title="通知"
          value="3"
          icon={Bell}
          color="bg-cm-danger"
        />
      </div>

      {/* メインコンテンツ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* お知らせ */}
        <div className="lg:col-span-2">
          <CmCard title="お知らせ">
            <div className="space-y-4">
              {[
                {
                  date: '2025/12/09',
                  title: 'システムメンテナンスのお知らせ',
                  type: '重要',
                },
                {
                  date: '2025/12/08',
                  title: '新機能リリース：シフト自動調整機能',
                  type: '新機能',
                },
                {
                  date: '2025/12/05',
                  title: '年末年始の営業について',
                  type: 'お知らせ',
                },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0"
                >
                  <div className="text-xs text-slate-400 w-20 flex-shrink-0">
                    {item.date}
                  </div>
                  <div className="flex-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium mr-2 ${
                        item.type === '重要'
                          ? 'bg-red-100 text-red-700'
                          : item.type === '新機能'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {item.type}
                    </span>
                    <span className="text-sm text-slate-700">{item.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </CmCard>
        </div>

        {/* クイックアクセス */}
        <div>
          <CmCard title="クイックアクセス">
            <div className="space-y-2">
              {[
                { label: '利用者様情報', href: '/cm-portal/users', icon: Users },
                { label: '週間シフト', href: '/cm-portal/shift/weekly', icon: Calendar },
                { label: 'エントリー一覧', href: '/cm-portal/entry-list', icon: FileText },
              ].map((item, index) => (
                <a
                  key={index}
                  href={item.href}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-cm-primary-100 transition-colors">
                    <item.icon className="w-5 h-5 text-slate-500 group-hover:text-cm-primary-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 group-hover:text-cm-primary-600">
                    {item.label}
                  </span>
                </a>
              ))}
            </div>
          </CmCard>
        </div>
      </div>

      {/* 本日のシフト */}
      <CmCard
        title="本日のシフト"
        headerRight={
          <a
            href="/cm-portal/shift/weekly"
            className="text-sm text-cm-primary-600 hover:text-cm-primary-700"
          >
            すべて見る →
          </a>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  時間
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  利用者様
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  担当者
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  サービス
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  ステータス
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                {
                  time: '09:00 - 10:00',
                  user: '加藤 あかり',
                  staff: '油谷 昌子',
                  service: '身体介護',
                  status: '完了',
                },
                {
                  time: '10:30 - 11:30',
                  user: '加藤 綾子',
                  staff: '山田 太郎',
                  service: '生活援助',
                  status: '進行中',
                },
                {
                  time: '13:00 - 14:00',
                  user: '加藤 佳代子',
                  staff: '鈴木 花子',
                  service: '身体介護',
                  status: '予定',
                },
              ].map((row, index) => (
                <tr key={index} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-600">{row.time}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-800 font-medium">
                    {row.user}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {row.staff}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                      {row.service}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        row.status === '完了'
                          ? 'bg-green-100 text-green-700'
                          : row.status === '進行中'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CmCard>

      {/* フッター */}
      <div className="text-center text-xs text-slate-400 py-4">
        新ポータル（β版）- 既存ポータルは引き続き <a href="/portal" className="text-cm-primary-500 hover:underline">/portal</a> からアクセスできます
      </div>
    </div>
  );
}
