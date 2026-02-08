import { useState, useEffect, useRef, useCallback } from 'react'
import {
  PlayCircle,
  Copy,
  Check,
  ArrowDownToLine,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWebSocket, type UseWebSocketOptions } from '@/lib/websocket/client'
import type { Story } from './StoryCard'

interface LogLine {
  content: string
  logType: 'stdout' | 'stderr'
  timestamp: number
}

interface RunnerLogModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  story: Story | null
}

export function RunnerLogModal({
  isOpen,
  onClose,
  projectId,
  story,
}: RunnerLogModalProps) {
  const [logs, setLogs] = useState<LogLine[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const isSubscribedRef = useRef(false)

  // Log handler callback - stored in ref to avoid dependency on subscribe
  const handleLog = useCallback<NonNullable<UseWebSocketOptions['onLog']>>((log) => {
    // Only add logs for this project/story
    if (log.projectId === String(projectId)) {
      // Filter by story if specified
      if (!story || log.storyId === story.id || !log.storyId) {
        setLogs((prev) => [
          ...prev,
          {
            content: log.content,
            logType: log.logType,
            timestamp: log.timestamp,
          },
        ])
      }
    }
  }, [projectId, story])

  // WebSocket connection for live logs
  const { isConnected, isReconnecting, subscribe, unsubscribe } = useWebSocket({
    onLog: handleLog,
  })

  // Subscribe to project logs when modal opens and connected
  useEffect(() => {
    if (isOpen && isConnected && !isSubscribedRef.current) {
      subscribe(String(projectId))
      isSubscribedRef.current = true
    }

    return () => {
      if (isSubscribedRef.current) {
        unsubscribe(String(projectId))
        isSubscribedRef.current = false
      }
    }
  }, [isOpen, isConnected, projectId, subscribe, unsubscribe])

  // Clear logs when story changes or modal closes
  useEffect(() => {
    if (!isOpen) {
      // Small delay to allow for exit animation
      const timer = setTimeout(() => {
        setLogs([])
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Handle scroll - disable auto-scroll if user scrolls up
  const handleScroll = useCallback(() => {
    if (!logContainerRef.current) return

    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

    if (!isAtBottom && autoScroll) {
      setAutoScroll(false)
    }
  }, [autoScroll])

  // Copy all logs to clipboard
  const handleCopyLogs = useCallback(async () => {
    const logText = logs.map((log) => log.content).join('\n')
    try {
      await navigator.clipboard.writeText(logText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy logs:', error)
    }
  }, [logs])

  // Enable auto-scroll and scroll to bottom
  const handleScrollToBottom = useCallback(() => {
    setAutoScroll(true)
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [])

  // Format timestamp
  const formatTimestamp = useCallback((timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }, [])

  if (!story) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-4xl h-[80vh] overflow-hidden flex flex-col bg-zinc-900 border-zinc-700"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="flex-shrink-0 pb-3 border-b border-zinc-700 bg-zinc-800/50 -mx-6 -mt-6 px-4 pt-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 text-blue-400">
                <PlayCircle className="w-5 h-5" />
                <span className="text-sm font-medium">Running</span>
              </div>
              <div className="h-4 w-px bg-zinc-600" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-zinc-400 shrink-0">
                  {story.id}
                </span>
                <DialogTitle className="text-sm font-medium text-zinc-200 truncate">
                  {story.title}
                </DialogTitle>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Connection status */}
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
                  isConnected
                    ? 'text-emerald-400'
                    : isReconnecting
                      ? 'text-amber-400'
                      : 'text-zinc-500',
                )}
                data-testid="connection-status"
              >
                {isConnected ? (
                  <>
                    <Wifi className="w-3.5 h-3.5" />
                    <span>Connected</span>
                  </>
                ) : isReconnecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Reconnecting</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5" />
                    <span>Disconnected</span>
                  </>
                )}
              </div>

              {/* Copy button */}
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                className="bg-zinc-700 text-zinc-200 hover:bg-zinc-600 border-0"
                data-testid="copy-button"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </Button>

              {/* Auto-scroll toggle */}
              <Button
                variant={autoScroll ? 'default' : 'secondary'}
                size="sm"
                onClick={handleScrollToBottom}
                className={cn(
                  autoScroll
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600',
                  'border-0'
                )}
                data-testid="autoscroll-button"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>Auto-scroll</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Terminal content */}
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className={cn(
            'flex-1 overflow-y-auto p-4 font-mono text-sm',
            'bg-zinc-950 -mx-6',
          )}
          data-testid="log-container"
        >
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-4" />
              <p className="text-sm">Waiting for logs...</p>
              <p className="text-xs mt-1">
                {isConnected
                  ? 'Subscribed to project logs'
                  : 'Connecting to WebSocket server'}
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {logs.map((log, index) => (
                <div
                  key={`${log.timestamp}-${index}`}
                  className="flex items-start gap-3 group hover:bg-zinc-900/50 px-2 py-0.5 -mx-2 rounded"
                  data-testid={`log-line-${index}`}
                >
                  <span className="text-zinc-600 text-xs shrink-0 pt-0.5 tabular-nums">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span
                    className={cn(
                      'flex-1 whitespace-pre-wrap break-all',
                      log.logType === 'stderr'
                        ? 'text-red-400'
                        : 'text-zinc-200',
                    )}
                  >
                    {log.content}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer with log count */}
        <div className="flex items-center justify-between px-4 py-2 -mx-6 -mb-6 border-t border-zinc-700 bg-zinc-800/50 text-xs text-zinc-500">
          <span>{logs.length} lines</span>
          {!autoScroll && logs.length > 0 && (
            <button
              type="button"
              onClick={handleScrollToBottom}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Jump to latest
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default RunnerLogModal
