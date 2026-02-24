import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ReviewBadgeProps {
  count: number
  className?: string
  showTooltip?: boolean
}

export function ReviewBadge({
  count,
  className,
  showTooltip = true,
}: ReviewBadgeProps) {
  // Don't render if count is 0
  if (count === 0) {
    return null
  }

  const badge = (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'min-w-[1.25rem] h-5 px-1.5',
        'text-xs font-medium',
        'rounded-full',
        'bg-amber-500 text-white',
        'shrink-0',
        className
      )}
      aria-label={`${count} ${count === 1 ? 'story' : 'stories'} in review`}
    >
      {count}
    </span>
  )

  if (!showTooltip) {
    return badge
  }

  const tooltipText = `${count} ${count === 1 ? 'story' : 'stories'} in review`

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default ReviewBadge
