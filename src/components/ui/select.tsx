// Select.tsx - 共通UIコンポーネント（shadcn/uiなどが未導入の場合）

import * as React from 'react';

export function Select({ value, onValueChange, children }: {
  value: string;
  onValueChange: (val: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className="border px-2 py-1 rounded w-full"
    >
      <option value="">--選択--</option>
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

export function SelectTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectContent({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function SelectValue({ placeholder }: { placeholder: string }) {
  return <option disabled hidden value="">{placeholder}</option>;
}
