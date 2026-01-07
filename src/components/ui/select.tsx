// src/components/ui/select.tsx
import * as React from "react";

type SelectProps = {
  value: string;
  onValueChange: (val: string) => void;
  children: React.ReactNode;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
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
 * shadcn 風 API 互換のダミー。
 * props を受け取るが、DOMに載せる先がないので、
 * aria 属性だけは children の wrapper(span) に付与しておく。
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
  return (
    <span
      className={className}
      aria-disabled={disabled ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
    >
      {children}
    </span>
  );
}

export function SelectContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={className}>{children}</span>;
}

export function SelectValue({ placeholder }: { placeholder: string }) {
  // placeholder は Select 側で出しているので、ここは noop
  void placeholder;
  return null;
}
