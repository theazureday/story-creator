import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'bg-gray-900/50 border border-gray-800/50 rounded-xl',
        className
      )}
      {...props}
    />
  )
);
Card.displayName = 'Card';
