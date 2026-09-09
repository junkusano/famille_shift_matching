// =============================================================
// src/components/cm-components/other-offices/FaxProxyEditCell.tsx
// 他社事業所一覧 - FAX代行番号インライン編集セル
// =============================================================

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import type { CmOtherOffice } from '@/types/cm/otherOffices';

export function FaxProxyEditCell({
  office,
  isUpdating,
  onUpdate,
}: {
  office: CmOtherOffice;
  isUpdating: boolean;
  onUpdate: (faxProxy: string | null) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(office.fax_proxy || '');
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(office.fax_proxy || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    const newValue = editValue.trim() || null;
    if (newValue === office.fax_proxy) {
      setIsEditing(false);
      return;
    }
    const success = await onUpdate(newValue);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditValue(office.fax_proxy || '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isUpdating) {
    return (
      <div className="flex items-center gap-2 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">保存中...</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-36 px-2 py-1 text-sm border border-blue-400 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="FAX代行番号"
        />
        <button
          onClick={handleSave}
          className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
          title="保存 (Enter)"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 text-slate-500 hover:bg-slate-100 rounded transition-colors"
          title="キャンセル (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 cursor-pointer min-h-[28px]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleStartEdit}
    >
      <span className={`text-sm font-mono ${office.fax_proxy ? 'text-slate-800' : 'text-slate-400'}`}>
        {office.fax_proxy || '-'}
      </span>
      {isHovered && (
        <button className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all">
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
