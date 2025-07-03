// components/ui/label.tsx
import * as React from "react"
import { LabelHTMLAttributes } from "react"
import { cn } from "@/lib/utils" // ユーティリティ関数があれば使用

const Label = React.forwardRef<
  HTMLLabelElement,
  LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("text-sm font-medium leading-none", className)}
    {...props}
  />
))
Label.displayName = "Label"

export { Label }
