'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ children, ...props }, ref) => (
  <label className="flex items-center gap-2">
    <CheckboxPrimitive.Root ref={ref} {...props} className="w-4 h-4 border border-gray-400 rounded" />
    {children}
  </label>
));
Checkbox.displayName = 'Checkbox';
