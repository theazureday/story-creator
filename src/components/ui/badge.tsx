import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants: Record<string, string> = {
      default: 'bg-gray-800 text-gray-300',
      success: 'bg-green-900/50 text-green-400 border-green-800',
      warning: 'bg-yellow-900/50 text-yellow-400 border-yellow-800',
      destructive: 'bg-red-900/50 text-red-400 border-red-800',
    };
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-transparent',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
