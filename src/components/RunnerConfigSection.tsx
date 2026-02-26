import { useState, useEffect } from 'react'
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Check,
  Server,
  Cpu,
} from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { RunnerProvider, RalphConfig } from '@/lib/schemas/ralphConfigSchema'

// Provider display info
const PROVIDERS: { id: RunnerProvider; label: string; hasModels: boolean }[] = [
  { id: 'claude', label: 'Claude', hasModels: true },
  { id: 'ollama', label: 'Ollama', hasModels: true },
  { id: 'gemini', label: 'Gemini', hasModels: false },
  { id: 'codex', label: 'Codex', hasModels: false },
]

// Claude model options (using 'default' instead of empty string for Radix Select compatibility)
const CLAUDE_MODELS = [
  { id: 'default', label: 'Default (determined by Claude)' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
  { id: 'haiku', label: 'Haiku' },
]

interface RunnerConfigSectionProps {
  projectId: number
}

export function RunnerConfigSection({ projectId }: RunnerConfigSectionProps) {
  const utils = trpc.useUtils()

  // Local form state
  const [provider, setProvider] = useState<RunnerProvider>('claude')
  const [model, setModel] = useState<string>('default')
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [isDirty, setIsDirty] = useState(false)

  // Fetch current config
  const {
    data: config,
    isLoading: isLoadingConfig,
  } = trpc.projects.getRalphConfig.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  )

  // Fetch Ollama availability
  const {
    data: isOllamaAvailable,
    isLoading: isCheckingOllama,
  } = trpc.ollama.isAvailable.useQuery(undefined, {
    enabled: provider === 'ollama',
    refetchInterval: provider === 'ollama' ? 30000 : false, // Refresh every 30s when Ollama selected
  })

  // Fetch Ollama models
  const {
    data: ollamaModels = [],
    isLoading: isLoadingOllamaModels,
    refetch: refetchOllamaModels,
    isFetching: isRefetchingOllamaModels,
  } = trpc.ollama.getModels.useQuery(undefined, {
    enabled: provider === 'ollama' && isOllamaAvailable === true,
  })

  // Update config mutation
  const updateConfig = trpc.projects.updateRalphConfig.useMutation({
    onSuccess: () => {
      toast.success('Runner configuratie opgeslagen')
      setIsDirty(false)
      utils.projects.getRalphConfig.invalidate({ projectId })
    },
    onError: (error) => {
      toast.error('Kon configuratie niet opslaan', {
        description: error.message,
      })
    },
  })

  // Sync form state with fetched config
  useEffect(() => {
    if (config) {
      setProvider(config.runner?.provider ?? 'claude')
      // Map empty model to 'default' for the UI
      setModel(config.runner?.model || 'default')
      setBaseUrl(config.runner?.baseUrl ?? '')
      setIsDirty(false)
    }
  }, [config])

  // Handle provider change
  const handleProviderChange = (newProvider: RunnerProvider) => {
    setProvider(newProvider)
    // Reset model when switching providers (use 'default' for Claude)
    setModel(newProvider === 'claude' ? 'default' : '')
    setIsDirty(true)
  }

  // Handle model change
  const handleModelChange = (newModel: string) => {
    setModel(newModel)
    setIsDirty(true)
  }

  // Handle base URL change
  const handleBaseUrlChange = (newBaseUrl: string) => {
    setBaseUrl(newBaseUrl)
    setIsDirty(true)
  }

  // Handle save
  const handleSave = () => {
    // Convert 'default' back to empty/undefined for storage
    const actualModel = model === 'default' ? undefined : model
    const newConfig: RalphConfig = {
      runner: {
        provider,
        ...(actualModel && { model: actualModel }),
        ...(baseUrl && { baseUrl }),
      },
    }
    updateConfig.mutate({ projectId, config: newConfig })
  }

  // Handle refresh Ollama models
  const handleRefreshOllamaModels = () => {
    refetchOllamaModels()
  }

  // Loading state
  if (isLoadingConfig) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const showOllamaWarning = provider === 'ollama' && isOllamaAvailable === false && !isCheckingOllama
  const isOllamaModelsLoading = isLoadingOllamaModels || isRefetchingOllamaModels

  return (
    <div className="space-y-4">
      {/* Provider Selection */}
      <div className="space-y-2">
        <Label htmlFor="provider-select">Provider</Label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger id="provider-select" className="w-full" data-testid="provider-select">
            <SelectValue placeholder="Selecteer provider" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id} data-testid={`provider-option-${p.id}`}>
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  {p.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Ollama Warning */}
      {showOllamaWarning && (
        <Alert variant="destructive" data-testid="ollama-warning">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            Ollama is niet bereikbaar. Zorg ervoor dat Ollama draait met{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">ollama serve</code>
          </AlertDescription>
        </Alert>
      )}

      {/* Model Selection - Claude */}
      {provider === 'claude' && (
        <div className="space-y-2">
          <Label htmlFor="claude-model-select">Model (optioneel)</Label>
          <Select value={model} onValueChange={handleModelChange}>
            <SelectTrigger id="claude-model-select" className="w-full" data-testid="claude-model-select">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              {CLAUDE_MODELS.map((m) => (
                <SelectItem key={m.id || 'default'} value={m.id} data-testid={`claude-model-${m.id || 'default'}`}>
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-muted-foreground" />
                    {m.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Laat leeg om Claude zelf het model te laten bepalen
          </p>
        </div>
      )}

      {/* Model Selection - Ollama */}
      {provider === 'ollama' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ollama-model-select">Model</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshOllamaModels}
              disabled={isOllamaModelsLoading || !isOllamaAvailable}
              className="h-7 px-2"
              data-testid="refresh-ollama-models"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isOllamaModelsLoading && 'animate-spin')} />
              <span className="ml-1 text-xs">Vernieuwen</span>
            </Button>
          </div>
          {isOllamaAvailable ? (
            <Select value={model} onValueChange={handleModelChange} disabled={ollamaModels.length === 0}>
              <SelectTrigger id="ollama-model-select" className="w-full" data-testid="ollama-model-select">
                <SelectValue placeholder={ollamaModels.length === 0 ? 'Geen modellen gevonden' : 'Selecteer model'} />
              </SelectTrigger>
              <SelectContent>
                {ollamaModels.map((m) => (
                  <SelectItem key={m.name} value={m.name} data-testid={`ollama-model-${m.name}`}>
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-muted-foreground" />
                      <span>{m.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{m.size}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id="ollama-model-input"
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder="bijv. llama2, codellama"
              data-testid="ollama-model-input"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {isOllamaAvailable
              ? `${ollamaModels.length} model${ollamaModels.length === 1 ? '' : 'len'} beschikbaar`
              : 'Voer handmatig een model naam in'}
          </p>

          {/* Base URL for Ollama */}
          <div className="mt-4 space-y-2">
            <Label htmlFor="ollama-base-url">Base URL (optioneel)</Label>
            <Input
              id="ollama-base-url"
              value={baseUrl}
              onChange={(e) => handleBaseUrlChange(e.target.value)}
              placeholder="http://localhost:11434"
              data-testid="ollama-base-url"
            />
            <p className="text-xs text-muted-foreground">
              Standaard: http://localhost:11434
            </p>
          </div>
        </div>
      )}

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={!isDirty || updateConfig.isPending}
          data-testid="save-runner-config"
        >
          {updateConfig.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Opslaan...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Opslaan
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
