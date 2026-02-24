import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type RunnerStatus = 'idle' | 'running' | 'stopping'
export type RunnerProvider = 'claude' | 'codex' | 'gemini'

interface RunnerStatusIndicatorProps {
  status: RunnerStatus
  provider?: RunnerProvider | null
  className?: string
  showTooltip?: boolean
}

const statusConfig = {
  idle: {
    color: 'bg-gray-400',
    label: 'Idle',
  },
  running: {
    color: 'bg-green-500',
    label: 'Running',
  },
  stopping: {
    color: 'bg-yellow-500',
    label: 'Stopping',
  },
} as const

const providerLabels: Record<RunnerProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
}

export function RunnerStatusIndicator({
  status,
  provider,
  className,
  showTooltip = true,
}: RunnerStatusIndicatorProps) {
  const config = statusConfig[status]

  const dot = (
    <span
      className={cn(
        'w-2 h-2 rounded-full shrink-0',
        config.color,
        status === 'running' && 'animate-pulse',
        className
      )}
      aria-label={`Runner status: ${config.label}`}
    />
  )

  if (!showTooltip) {
    return dot
  }

  const tooltipText = provider
    ? `${providerLabels[provider]} - ${config.label}`
    : config.label

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          {dot}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default RunnerStatusIndicator
