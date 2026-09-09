// =============================================================
// src/components/cm-components/fax/CmFaxToast.tsx
// FAX詳細 - トースト通知
// =============================================================

'use client';

import React, { useEffect, useState } from 'react';
import { Check, X, AlertCircle, Info } from 'lucide-react';
import type { CmToastState } from '@/types/cm/faxDetail';

type Props = {
  toast: CmToastState;
  onClose: () => void;
  duration?: number;
};

const ICON_MAP = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

const STYLE_MAP = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-500 bg-green-100',
    text: 'text-green-800',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500 bg-red-100',
    text: 'text-red-800',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500 bg-blue-100',
    text: 'text-blue-800',
  },
};

export function CmFaxToast({ toast, onClose, duration = 3000 }: Props) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const handleClose = () => {
    setIsLeaving(true);
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (toast.show) {
      setIsLeaving(false);
      requestAnimationFrame(() => {
        setIsVisible(true);
      });

      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [toast.show, duration]);

  if (!toast.show && !isLeaving) return null;

  const Icon = ICON_MAP[toast.type];
  const styles = STYLE_MAP[toast.type];

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-200 ease-out ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
      }`}
    >
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${styles.bg} ${styles.border}`}
      >
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${styles.icon}`}
        >
          <Icon className="w-4 h-4" />
        </div>

        <p className={`text-sm font-medium ${styles.text}`}>{toast.message}</p>

        <button
          onClick={handleClose}
          className={`flex-shrink-0 p-1 rounded-full hover:bg-black/5 transition-colors ${styles.text}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// =============================================================
// useToast フック
// =============================================================

export function useToast() {
  const [toast, setToast] = useState<CmToastState>({
    show: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: CmToastState['type'] = 'info') => {
    setToast({ show: true, message, type });
  };

  const hideToast = () => {
    setToast((prev) => ({ ...prev, show: false }));
  };

  const success = (message: string) => showToast(message, 'success');
  const error = (message: string) => showToast(message, 'error');
  const info = (message: string) => showToast(message, 'info');

  return {
    toast,
    showToast,
    hideToast,
    success,
    error,
    info,
  };
}