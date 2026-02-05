// =============================================================
// src/components/cm-components/contracts/CmTemplateEditor.tsx
// テンプレートエディタ（HTMLエディタ + プレビュー）
// =============================================================

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCmUserContext } from '@/context/cm/CmUserContext';
import { updateTemplate } from '@/lib/cm/contracts/templateActions';
import {
  CM_DIGISIGNER_TAGS,
  CM_TAG_CATEGORY_LABELS,
  getTagsByCategory,
} from '@/types/cm/contractTemplate';
import type { CmContractTemplate, CmContractTemplateCode } from '@/types/cm/contractTemplate';

// =============================================================
// Types
// =============================================================

type Props = {
  template: CmContractTemplate;
};

// サンプルデータ（プレビュー用）
const SAMPLE_DATA: Record<string, string> = {
  '{{利用者氏名}}': '山田 太郎',
  '{{利用者住所}}': '愛知県春日井市白山町1丁目62番地6',
  '{{利用者電話}}': '0568-12-3456',
  '{{家族氏名}}': '山田 花子',
  '{{家族続柄}}': '長女',
  '{{契約日}}': '2026年2月3日',
  '{{担当者氏名}}': '田中 一郎',
  '{{事業所名}}': 'ファミーユ ケアプランセンター 高蔵寺',
  '{{事業所住所}}': '〒487-0034 愛知県春日井市白山町1丁目62番地6',
  '{{事業所電話}}': '0568-37-4366',
  '{{代表者名}}': '増田 志乃',
};

// =============================================================
// Component
// =============================================================

export function CmTemplateEditor({ template }: Props) {
  const { user } = useCmUserContext();
  const [htmlContent, setHtmlContent] = useState(template.html_content);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // ---------------------------------------------------------
  // タグ挿入
  // ---------------------------------------------------------
  const insertTag = useCallback((tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;

    // DigiSignerの署名タグの場合、上に2行スペースを追加
    // （署名時に上方向に拡張されるため）
    let insertText = tag;
    if (tag.startsWith('[s:')) {
      insertText = '<p>&nbsp;</p>\n<p>&nbsp;</p>\n' + tag;
    }

    const newText = text.substring(0, start) + insertText + text.substring(end);
    setHtmlContent(newText);

    // カーソル位置を更新
    setTimeout(() => {
      editor.focus();
      editor.selectionStart = editor.selectionEnd = start + insertText.length;
    }, 0);
  }, []);

  // ---------------------------------------------------------
  // プレビュー生成
  // ---------------------------------------------------------
  const generatePreviewHtml = useCallback((html: string): string => {
    let result = html;

    // システムタグを置換
    for (const [tag, value] of Object.entries(SAMPLE_DATA)) {
      result = result.replaceAll(tag, `<span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;">${value}</span>`);
    }

    // DigiSignerタグを視覚化
    result = result.replace(
      /\[s:(\w+)\s+\]/g,
      '<div style="border:2px dashed #3b82f6;background:#eff6ff;padding:20px;text-align:center;color:#3b82f6;margin:10px 0;">✍ 署名欄 [$1]</div>'
    );
    result = result.replace(
      /\[d:(\w+)\s+\]/g,
      '<span style="border:2px dashed #f59e0b;background:#fefce8;padding:8px 16px;display:inline-block;color:#b45309;margin:5px 0;">📅 日付欄 [$1]</span>'
    );
    result = result.replace(
      /\[c:(\w+)\]/g,
      '<span style="background:#fef3c7;color:#92400e;padding:2px 4px;border-radius:4px;">☐</span>'
    );

    return result;
  }, []);

  // ---------------------------------------------------------
  // 保存
  // ---------------------------------------------------------
  const handleSave = async () => {
    if (!user?.userId) {
      setSaveResult('error');
      return;
    }

    try {
      setSaving(true);
      setSaveResult(null);

      const result = await updateTemplate(
        template.code as CmContractTemplateCode,
        htmlContent,
        user.userId
      );

      if (result.ok) {
        setSaveResult('success');
        setTimeout(() => setSaveResult(null), 3000);
      } else {
        setSaveResult('error');
      }
    } catch {
      setSaveResult('error');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------
  // タグをカテゴリ別にグループ化
  // ---------------------------------------------------------
  const groupedTags = getTagsByCategory();

  // ---------------------------------------------------------
  // レンダリング
  // ---------------------------------------------------------
  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">{template.name}</h1>
            <p className="text-sm text-slate-500 mt-1">
              HTMLテンプレートを編集します。左のタグをクリックで挿入できます。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveResult === 'success' && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                保存しました
              </span>
            )}
            {saveResult === 'error' && (
              <span className="flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="w-4 h-4" />
                保存に失敗しました
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              保存
            </button>
          </div>
        </div>
      </div>

      {/* エディタエリア */}
      <div className="grid grid-cols-[220px_1fr_1fr] gap-4" style={{ height: 'calc(100vh - 280px)' }}>
        {/* サイドバー: タグ挿入 */}
        <div className="bg-white rounded-xl shadow-sm border p-4 overflow-y-auto">
          {/* 差し込みタグ */}
          {Object.entries(groupedTags).map(([category, tags]) => (
            <div key={category} className="mb-4">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">
                {CM_TAG_CATEGORY_LABELS[category as keyof typeof CM_TAG_CATEGORY_LABELS]}
              </h3>
              <div className="space-y-1">
                {tags.map((tag) => (
                  <button
                    key={tag.tag}
                    onClick={() => insertTag(tag.tag)}
                    className="w-full text-left px-2 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                  >
                    {tag.tag}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* DigiSignerタグ */}
          <div className="mb-4 pt-3 border-t">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">
              DigiSignerタグ
            </h3>
            <div className="space-y-1">
              {CM_DIGISIGNER_TAGS.map((tag) => (
                <button
                  key={tag.tag}
                  onClick={() => insertTag(tag.tag)}
                  className="w-full text-left px-2 py-1.5 text-xs bg-amber-50 text-amber-700 rounded hover:bg-amber-100 transition-colors"
                >
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {/* HTML書式 */}
          <div className="pt-3 border-t">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">
              HTML書式
            </h3>
            <div className="space-y-1">
              <button
                onClick={() => insertTag('<h1></h1>')}
                className="w-full text-left px-2 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
              >
                見出し1
              </button>
              <button
                onClick={() => insertTag('<h2></h2>')}
                className="w-full text-left px-2 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
              >
                見出し2
              </button>
              <button
                onClick={() => insertTag('<p></p>')}
                className="w-full text-left px-2 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
              >
                段落
              </button>
              <button
                onClick={() => insertTag('<hr>')}
                className="w-full text-left px-2 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
              >
                区切り線
              </button>
              <button
                onClick={() => insertTag('<table>\n<tr><th>項目</th><th>内容</th></tr>\n<tr><td></td><td></td></tr>\n</table>')}
                className="w-full text-left px-2 py-1.5 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
              >
                表
              </button>
            </div>
          </div>
        </div>

        {/* HTMLエディタ */}
        <div className="bg-white rounded-xl shadow-sm border flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">HTMLエディタ</span>
          </div>
          <textarea
            ref={editorRef}
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            className="flex-1 p-4 font-mono text-sm leading-relaxed resize-none focus:outline-none"
            spellCheck={false}
          />
        </div>

        {/* プレビュー */}
        <div className="bg-white rounded-xl shadow-sm border flex flex-col overflow-hidden">
          <div className="px-4 py-2 border-b bg-slate-50 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">プレビュー</span>
            <span className="text-xs text-green-600">● リアルタイム更新</span>
          </div>
          <div
            className="flex-1 p-6 overflow-y-auto prose prose-sm max-w-none"
            style={{
              fontFamily: '"Yu Mincho", "游明朝", serif',
              fontSize: '12px',
              lineHeight: '1.8',
            }}
            dangerouslySetInnerHTML={{ __html: generatePreviewHtml(htmlContent) }}
          />
        </div>
      </div>
    </div>
  );
}