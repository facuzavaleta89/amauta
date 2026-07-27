'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Checkbox nativo estilizado con los tokens del sistema. Se usa un <input type="checkbox">
// real (accesible, sin JS extra) en lugar de @radix-ui/react-checkbox, para no sumar
// dependencias. `accent-primary` tiñe el control con el verde de marca (--color-primary).
type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border border-input accent-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
