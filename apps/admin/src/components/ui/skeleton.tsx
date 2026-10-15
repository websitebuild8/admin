import { cn } from '@/lib/utils';
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" className={cn('animate-pulse rounded-xl bg-black/5 motion-reduce:animate-none', className)} {...props}/>;
}
