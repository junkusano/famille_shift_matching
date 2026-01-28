// =============================================================
// src/components/cm-components/plaud/CmPlaudTemplateManager.tsx
// テンプレート管理コンポーネント
// =============================================================

'use client';

import React, { useState } from 'react';
import { Plus, Edit, Trash2, X, Save, ChevronUp, ChevronDown } from 'lucide-react';
import { usePlaudTemplates } from '@/hooks/cm/plaud/usePlaudTemplates';
import {
  CmPlaudProcessTemplate,
  CmPlaudTemplateCreateRequest,
  CmPlaudTemplateUpdateRequest,
} from '@/types/cm/plaud';
import { LoadingSpinner, ErrorMessage, EmptyState } from './CmPlaudCommon';
import styles from '@/styles/cm-styles/plaud/templateManager.module.css';

// =============================================================
// 新規/編集フォームの初期値
// =============================================================

const EMPTY_TEMPLATE: Omit<CmPlaudProcessTemplate, 'id' | 'created_at' | 'updated_at' | 'options' | 'output_format'> = {
  name: '',
  description: '',
  system_prompt: 'あなたは介護支援専門員（ケアマネジャー）のアシスタントです。',
  user_prompt_template: '',
  is_active: true,
  sort_order: 0,
};

// =============================================================
// メインコンポーネント
// =============================================================

export const CmPlaudTemplateManager: React.FC = () => {
  const {
    templates,
    isLoading,
    create,
    update,
    remove,
  } = usePlaudTemplates();

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<typeof EMPTY_TEMPLATE & { id?: number } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 新規作成モーダルを開く
  const openCreateModal = () => {
    setEditingTemplate({ ...EMPTY_TEMPLATE, sort_order: templates.length + 1 });
    setIsModalOpen(true);
  };

  // 編集モーダルを開く
  const openEditModal = (template: CmPlaudProcessTemplate) => {
    setEditingTemplate({
      id: template.id,
      name: template.name,
      description: template.description || '',
      system_prompt: template.system_prompt || '',
      user_prompt_template: template.user_prompt_template,
      is_active: template.is_active,
      sort_order: template.sort_order,
    });
    setIsModalOpen(true);
  };

  // モーダルを閉じる
  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
  };

  // フィールド更新
  const updateField = <K extends keyof typeof EMPTY_TEMPLATE>(
    field: K,
    value: (typeof EMPTY_TEMPLATE)[K]
  ) => {
    if (editingTemplate) {
      setEditingTemplate({ ...editingTemplate, [field]: value });
    }
  };

  // 保存処理
  const handleSave = async () => {
    if (!editingTemplate || !editingTemplate.name.trim() || !editingTemplate.user_prompt_template.trim()) {
      alert('テンプレート名とユーザープロンプトは必須です');
      return;
    }

    setIsSaving(true);

    if (editingTemplate.id) {
      // 更新
      const updateData: CmPlaudTemplateUpdateRequest = {
        name: editingTemplate.name.trim(),
        description: editingTemplate.description?.trim() || null,
        system_prompt: editingTemplate.system_prompt?.trim() || null,
        user_prompt_template: editingTemplate.user_prompt_template,
        is_active: editingTemplate.is_active,
        sort_order: editingTemplate.sort_order,
      };
      await update(editingTemplate.id, updateData);
    } else {
      // 新規作成
      const createData: CmPlaudTemplateCreateRequest = {
        name: editingTemplate.name.trim(),
        description: editingTemplate.description?.trim() || null,
        system_prompt: editingTemplate.system_prompt?.trim() || null,
        user_prompt_template: editingTemplate.user_prompt_template,
        is_active: editingTemplate.is_active,
        sort_order: editingTemplate.sort_order,
      };
      await create(createData);
    }

    setIsSaving(false);
    closeModal();
  };

  // 削除
  const handleDelete = async (template: CmPlaudProcessTemplate) => {
    if (window.confirm(`「${template.name}」を削除してもよろしいですか？\n\n※ このテンプレートを使用した処理履歴は残りますが、テンプレート名は「（削除済み）」と表示されます。`)) {
      await remove(template.id);
    }
  };

  // 有効/無効トグル
  const handleToggleActive = async (template: CmPlaudProcessTemplate) => {
    await update(template.id, { is_active: !template.is_active });
  };

  return (
    <div className={styles.container}>
      {/* ヘッダー */}
      <div className={styles.header}>
        <h3 className={styles.title}>テンプレート管理</h3>
        <button className={styles.createButton} onClick={openCreateModal}>
          <Plus size={16} />
          新規作成
        </button>
      </div>

      {/* コンテンツ */}
      <div className={styles.content}>
        {isLoading ? (
          <LoadingSpinner message="読み込み中..." />
        ) : templates.length === 0 ? (
          <EmptyState
            message="テンプレートがありません。新規作成してください。"
            icon={<Plus size={48} />}
          />
        ) : (
          <div className={styles.templateList}>
            {templates.map((template) => (
              <div key={template.id} className={styles.templateCard}>
                <div className={styles.templateHeader}>
                  <div className={styles.templateTitle}>
                    <span className={styles.templateIcon}>📋</span>
                    <span className={styles.templateName}>{template.name}</span>
                    <span
                      className={`${styles.statusBadge} ${
                        template.is_active
                          ? styles.statusBadgeActive
                          : styles.statusBadgeInactive
                      }`}
                    >
                      {template.is_active ? '有効' : '無効'}
                    </span>
                  </div>
                  <div className={styles.templateActions}>
                    <button
                      className={styles.editButton}
                      onClick={() => openEditModal(template)}
                      title="編集"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      className={styles.deleteButton}
                      onClick={() => handleDelete(template)}
                      title="削除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {template.description && (
                  <div className={styles.templateDescription}>
                    {template.description}
                  </div>
                )}
                <div className={styles.templateMeta}>
                  <span>表示順: {template.sort_order}</span>
                  <button
                    className={styles.toggleButton}
                    onClick={() => handleToggleActive(template)}
                  >
                    {template.is_active ? '無効にする' : '有効にする'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 編集モーダル */}
      {isModalOpen && editingTemplate && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            {/* モーダルヘッダー */}
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingTemplate.id ? 'テンプレート編集' : '新規テンプレート'}
              </h3>
              <button className={styles.modalCloseButton} onClick={closeModal}>
                <X size={20} />
              </button>
            </div>

            {/* モーダルボディ */}
            <div className={styles.modalBody}>
              {/* 名前 */}
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>テンプレート名</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={editingTemplate.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="例: 支援経過記録"
                  />
                </div>
              </div>

              {/* 説明 */}
              <div className={styles.formField}>
                <label className={styles.formLabel}>説明（任意）</label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={editingTemplate.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="例: 面談・電話内容を支援経過記録の形式で出力します"
                />
              </div>

              {/* システムプロンプト */}
              <div className={styles.formField}>
                <label className={styles.formLabel}>システムプロンプト</label>
                <textarea
                  className={styles.formTextarea}
                  value={editingTemplate.system_prompt || ''}
                  onChange={(e) => updateField('system_prompt', e.target.value)}
                  placeholder="AIの役割を設定します"
                  rows={3}
                />
              </div>

              {/* ユーザープロンプト */}
              <div className={styles.formField}>
                <label className={styles.formLabel}>
                  ユーザープロンプトテンプレート
                  <span className={styles.formHint}>
                    ※ {'{{transcript}}'} で文字起こしが挿入されます
                  </span>
                </label>
                <textarea
                  className={styles.formTextarea}
                  value={editingTemplate.user_prompt_template}
                  onChange={(e) => updateField('user_prompt_template', e.target.value)}
                  placeholder={`例:\n以下の面談記録を支援経過記録として整形してください。\n\n【文字起こしデータ】\n{{transcript}}\n\n【出力形式】\n■ 日時：\n■ 場所：\n■ 内容：`}
                  rows={10}
                />
              </div>

              {/* オプション */}
              <div className={styles.formRow}>
                <div className={styles.formFieldSmall}>
                  <label className={styles.formLabel}>表示順</label>
                  <input
                    type="number"
                    className={styles.formInput}
                    value={editingTemplate.sort_order}
                    onChange={(e) => updateField('sort_order', parseInt(e.target.value, 10) || 0)}
                    min={0}
                  />
                </div>
                <div className={styles.formFieldSmall}>
                  <label className={styles.formLabel}>ステータス</label>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={editingTemplate.is_active}
                      onChange={(e) => updateField('is_active', e.target.checked)}
                    />
                    有効
                  </label>
                </div>
              </div>
            </div>

            {/* モーダルフッター */}
            <div className={styles.modalFooter}>
              <button className={styles.cancelButton} onClick={closeModal}>
                キャンセル
              </button>
              <button
                className={styles.saveButton}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  '保存中...'
                ) : (
                  <>
                    <Save size={14} />
                    保存
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};