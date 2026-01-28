// =============================================================
// src/components/cm-components/plaud/CmPlaudProcessModal.tsx
// 二次利用（AI生成）モーダル
// =============================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Wand2, Check, Save, Loader2 } from 'lucide-react';
import { usePlaudTemplates } from '@/hooks/cm/plaud/usePlaudTemplates';
import { usePlaudGenerate } from '@/hooks/cm/plaud/usePlaudGenerate';
import { usePlaudHistory } from '@/hooks/cm/plaud/usePlaudHistory';
import { CmPlaudTranscription } from '@/types/cm/plaud';
import { CopyButton } from './CmPlaudCommon';
import styles from '@/styles/cm-styles/plaud/processModal.module.css';

// =============================================================
// 型定義
// =============================================================

type CmPlaudProcessModalProps = {
  isOpen: boolean;
  item: CmPlaudTranscription | null;
  onClose: () => void;
};

// =============================================================
// コンポーネント
// =============================================================

export const CmPlaudProcessModal: React.FC<CmPlaudProcessModalProps> = ({
  isOpen,
  item,
  onClose,
}) => {
  const { templates, isLoading: templatesLoading } = usePlaudTemplates(true);
  const { results, isGenerating, error, generate, clearResults } = usePlaudGenerate();
  const { create: createHistory } = usePlaudHistory();

  // 選択中のテンプレートID
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 保存済みの履歴ID
  const [savedIds, setSavedIds] = useState<number[]>([]);

  // モーダルが開いたときにリセット
  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
      setSavedIds([]);
      clearResults();
    }
  }, [isOpen, clearResults]);

  // テンプレート選択トグル
  const toggleSelection = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // 全選択/全解除
  const toggleAll = () => {
    if (selectedIds.length === templates.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(templates.map((t) => t.id));
    }
  };

  // 生成実行
  const handleGenerate = async () => {
    if (!item?.transcript || selectedIds.length === 0) return;
    await generate(item.transcript, selectedIds);
  };

  // 履歴保存
  const handleSave = async (templateId: number) => {
    if (!item || !results[templateId]) return;

    const history = await createHistory({
      transcription_id: item.id,
      template_id: templateId,
      kaipoke_cs_id: item.kaipoke_cs_id,
      input_text: item.transcript,
      output_text: results[templateId],
    });

    if (history) {
      setSavedIds((prev) => [...prev, templateId]);
    }
  };

  // 全件保存
  const handleSaveAll = async () => {
    const unsavedIds = Object.keys(results)
      .map(Number)
      .filter((id) => !savedIds.includes(id));

    for (const templateId of unsavedIds) {
      await handleSave(templateId);
    }
  };

  // 結果があるか
  const hasResults = Object.keys(results).length > 0;

  // 未保存の結果があるか
  const hasUnsavedResults = Object.keys(results).some(
    (id) => !savedIds.includes(Number(id))
  );

  if (!isOpen || !item) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Wand2 size={20} />
            <h2 className={styles.title}>二次利用</h2>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* 対象情報 */}
        <div className={styles.targetInfo}>
          <div className={styles.targetTitle}>{item.title}</div>
          {item.client_name && (
            <div className={styles.targetClient}>
              紐付け利用者: {item.client_name}
            </div>
          )}
        </div>

        {/* メインコンテンツ */}
        <div className={styles.content}>
          {/* 左: テンプレート選択 */}
          <div className={styles.templateSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>テンプレート選択</span>
              <button className={styles.selectAllButton} onClick={toggleAll}>
                {selectedIds.length === templates.length ? '全解除' : '全選択'}
              </button>
            </div>

            {templatesLoading ? (
              <div className={styles.loadingState}>
                <Loader2 size={20} className={styles.spinner} />
                読み込み中...
              </div>
            ) : templates.length === 0 ? (
              <div className={styles.emptyState}>
                テンプレートがありません
              </div>
            ) : (
              <div className={styles.templateList}>
                {templates.map((template) => (
                  <label key={template.id} className={styles.templateCheckbox}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(template.id)}
                      onChange={() => toggleSelection(template.id)}
                    />
                    <span className={styles.templateIcon}>📋</span>
                    <span className={styles.templateName}>{template.name}</span>
                  </label>
                ))}
              </div>
            )}

            {/* 生成ボタン */}
            <button
              className={styles.generateButton}
              onClick={handleGenerate}
              disabled={isGenerating || selectedIds.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 size={16} className={styles.spinner} />
                  生成中...
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  生成する ({selectedIds.length}件)
                </>
              )}
            </button>

            {error && <div className={styles.errorMessage}>{error}</div>}
          </div>

          {/* 右: 生成結果 */}
          <div className={styles.resultSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>生成結果</span>
              {hasUnsavedResults && (
                <button className={styles.saveAllButton} onClick={handleSaveAll}>
                  <Save size={14} />
                  全て保存
                </button>
              )}
            </div>

            {!hasResults ? (
              <div className={styles.emptyState}>
                テンプレートを選択して「生成する」をクリックしてください
              </div>
            ) : (
              <div className={styles.resultList}>
                {Object.entries(results).map(([templateIdStr, outputText]) => {
                  const templateId = Number(templateIdStr);
                  const template = templates.find((t) => t.id === templateId);
                  const isSaved = savedIds.includes(templateId);

                  return (
                    <div
                      key={templateId}
                      className={`${styles.resultCard} ${
                        isSaved ? styles.resultCardSaved : ''
                      }`}
                    >
                      <div className={styles.resultHeader}>
                        <div className={styles.resultTitle}>
                          <span className={styles.templateIcon}>
                            📋
                          </span>
                          <span>{template?.name || '不明なテンプレート'}</span>
                          {isSaved && (
                            <span className={styles.savedBadge}>
                              <Check size={12} />
                              保存済み
                            </span>
                          )}
                        </div>
                        {!isSaved && (
                          <button
                            className={styles.saveButton}
                            onClick={() => handleSave(templateId)}
                          >
                            <Save size={14} />
                            保存
                          </button>
                        )}
                      </div>
                      <div className={styles.resultBody}>
                        <pre className={styles.resultText}>{outputText}</pre>
                        <div className={styles.resultActions}>
                          <CopyButton text={outputText} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};