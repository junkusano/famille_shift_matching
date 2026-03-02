// =============================================================
// src/components/cm-components/local-fax-phonebook/KaipokePopover.tsx
// ローカルFAX電話帳 - カイポケ連携ポップオーバー
// =============================================================

'use client';

import React, { useRef, useEffect } from 'react';
import { Link2 } from 'lucide-react';
import type { CmKaipokeOfficeInfo } from '@/types/cm/localFaxPhonebook';

export function KaipokePopover({
  offices,
  isOpen,
  onToggle,
}: {
  offices: CmKaipokeOfficeInfo[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onToggle();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle]);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded text-xs font-semibold hover:bg-green-200 transition-colors"
      >
        <Link2 className="w-3 h-3" />
        {offices.length}件
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[300px]">
          <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-l border-t border-slate-200 rotate-45" />
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 rounded-t-lg">
            <h4 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-green-600" />
              カイポケ登録済み（{offices.length}件）
            </h4>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {offices.map((office, index) => (
              <div
                key={office.id}
                className={`px-4 py-2 ${index !== offices.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="text-sm font-medium text-slate-800">
                  {office.office_name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {office.service_type || '-'} / {office.office_number || '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
