import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => (
    <label htmlFor={id} className="flex items-center gap-2 cursor-pointer">
      <input
        ref={ref}
        type="checkbox"
        id={id}
        className={cn(
          'w-4 h-4 rounded border-gray-600 bg-gray-800 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 focus:ring-1',
          className
        )}
        {...props}
      />
      {label && <span className="text-sm text-gray-300">{label}</span>}
    </label>
  )
);
Checkbox.displayName = 'Checkbox';
