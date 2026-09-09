// src/components/ui/select.tsx
import * as React from "react";

type SelectProps = {
  value: string;
  onValueChange: (val: string) => void;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean; // ✅追加（後方互換）
};

export function Select({
  value,
  onValueChange,
  children,
  className,
  placeholder = "--選択--",
  disabled,
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
      className={`border px-2 py-1 rounded w-full ${className ?? ""}`}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

export function SelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <option value={value}>{children}</option>;
}

/**
 * 互換用のダミー（props を受け取れるようにする）
 * ※実体は <select> なので Trigger/Content は layout 上意味を持たないが、
 *   型エラー回避のため受け取れるようにしておく。
 */
export function SelectTrigger({
  children,
  className,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  // 使わないが未使用警告を避ける
  void className;
  void disabled;
  return <>{children}</>;
}

export function SelectContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  void className;
  return <>{children}</>;
}

export function SelectValue({ placeholder }: { placeholder: string }) {
  // もともと Select 側で placeholder option を出してるので noop にするのが安全
  void placeholder;
  return null;
}
