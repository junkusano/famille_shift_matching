// =============================================================
// src/app/cm-portal/master/contract-templates/page.tsx
// 契約書テンプレート 一覧ページ
// =============================================================

import Link from 'next/link';
import { FileText, Edit, CheckCircle2, XCircle } from 'lucide-react';
import { getTemplateList } from '@/lib/cm/contracts/templateActions';

export default async function ContractTemplatesPage() {
  const result = await getTemplateList();

  if (result.ok === false) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {result.error}
        </div>
      </div>
    );
  }

  const templates = result.data ?? [];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">契約書テンプレート</h1>
          <p className="text-sm text-slate-500 mt-1">
            契約書類のHTMLテンプレートを編集できます
          </p>
        </div>
      </div>

      {/* 一覧カード */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-800">テンプレート一覧</h2>
        </div>
        
        <div className="divide-y divide-slate-100">
          {templates.map((template) => (
            <div
              key={template.id}
              className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{template.name}</span>
                    {template.is_active ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        有効
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <XCircle className="w-3 h-3" />
                        無効
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    コード: {template.code} ・ 最終更新: {formatDate(template.updated_at)}
                    {template.updated_by_name && (
                      <span> ・ 更新者: {template.updated_by_name}</span>
                    )}
                  </p>
                </div>
              </div>
              
              <Link
                href={`/cm-portal/master/contract-templates/${template.code}/edit`}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit className="w-4 h-4" />
                編集
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* 説明 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">テンプレートについて</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>・HTMLで記述します。見出し、段落、表などが使用できます。</li>
          <li>・<code className="bg-blue-100 px-1 rounded">{`{{利用者氏名}}`}</code> のようなタグは契約作成時に自動で置換されます。</li>
          <li>・<code className="bg-blue-100 px-1 rounded">[s:signer]</code> のようなタグはDigiSignerの署名欄になります。</li>
        </ul>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}