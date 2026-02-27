import { JobCardStatus, STATUS_CONFIG } from '@/types';
import { cn } from '@/lib/utils';

interface StatusPillProps {
  status: JobCardStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusPill({ status, size = 'sm', className }: StatusPillProps) {
  const config = STATUS_CONFIG[status];
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
