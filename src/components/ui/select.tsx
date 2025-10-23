// Select.tsx
import * as React from 'react';

type SelectProps = {
  value: string;
  onValueChange: (val: string) => void;
  children: React.ReactNode;
  className?: string; // ← 追加
  placeholder?: string; // ← お好みで
};

export function Select({
  value,
  onValueChange,
  children,
  className,
  placeholder = '--選択--',
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={`border px-2 py-1 rounded w-full ${className ?? ''}`} // ← 反映
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

export function SelectItem({ value, children }: {
  value: string;
  children: React.ReactNode;
}) {
  return <option value={value}>{children}</option>;
}

// もう使わないなら消してOK（残すなら className 受けても意味はない）
export function SelectTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function SelectValue({ placeholder }: { placeholder: string }) {
  return <option disabled hidden value="">{placeholder}</option>;
}
