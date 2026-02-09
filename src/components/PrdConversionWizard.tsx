import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  X,
  FileJson,
  Loader2,
  AlertCircle,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Check,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { trpc } from '@/lib/trpc/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { ConversionMapping, FieldMapping, StoryStatus } from '@/lib/schemas/prdSchema'

interface PrdConversionWizardProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  projectPath: string
  projectName: string
}

type WizardStep = 'detect' | 'map' | 'preview' | 'apply'

const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'detect', label: 'Detect Issues' },
  { id: 'map', label: 'Configure Mappings' },
  { id: 'preview', label: 'Preview' },
  { id: 'apply', label: 'Apply' },
]

export function PrdConversionWizard({
  isOpen,
  onClose,
  onSuccess,
  projectPath,
  projectName,
}: PrdConversionWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('detect')
  const [mappings, setMappings] = useState<ConversionMapping | null>(null)
  const [originalJson, setOriginalJson] = useState<Record<string, unknown> | null>(null)
  const [createBackup, setCreateBackup] = useState(true)
  const utils = trpc.useUtils()

  // Validate PRD query
  const {
    data: validationData,
    isLoading: isValidating,
    error: validationError,
  } = trpc.prd.validate.useQuery(
    { projectPath },
    {
      enabled: isOpen,
      retry: false,
    }
  )

  // Suggest mappings mutation
  const suggestMappings = trpc.prd.suggestMapping.useMutation({
    onSuccess: (data) => {
      setMappings(data.mappings)
    },
  })

  // Preview mutation
  const previewMutation = trpc.prd.preview.useMutation()

  // Convert mutation
  const convertMutation = trpc.prd.convert.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        utils.projects.discover.invalidate()
        onSuccess?.()
      }
    },
  })

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('detect')
      setMappings(null)
      setOriginalJson(null)
      setCreateBackup(true)
    }
  }, [isOpen])

  // Auto-suggest mappings when validation completes
  useEffect(() => {
    if (validationData && !validationData.isValid && !mappings) {
      setOriginalJson(validationData.originalJson)
      suggestMappings.mutate({ originalJson: validationData.originalJson })
    }
  }, [validationData])

  const handleClose = useCallback(() => {
    if (!convertMutation.isPending) {
      onClose()
    }
  }, [convertMutation.isPending, onClose])

  const handleNextStep = () => {
    const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep)
    if (currentIndex < WIZARD_STEPS.length - 1) {
      const nextStep = WIZARD_STEPS[currentIndex + 1].id
      setCurrentStep(nextStep)

      // Trigger preview when entering preview step
      if (nextStep === 'preview' && originalJson && mappings) {
        previewMutation.mutate({ originalJson, mappings })
      }
    }
  }

  const handlePreviousStep = () => {
    const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep)
    if (currentIndex > 0) {
      setCurrentStep(WIZARD_STEPS[currentIndex - 1].id)
    }
  }

  const handleApply = () => {
    if (mappings) {
      convertMutation.mutate({
        projectPath,
        mappings,
        createBackup,
      })
    }
  }

  const handleMappingChange = (
    type: 'root' | 'story',
    index: number,
    field: keyof FieldMapping,
    value: string
  ) => {
    if (!mappings) return

    setMappings((prev) => {
      if (!prev) return prev
      const key = type === 'root' ? 'rootMappings' : 'storyMappings'
      const updated = [...prev[key]]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, [key]: updated }
    })
  }

  const handleAddMapping = (type: 'root' | 'story') => {
    if (!mappings) return

    setMappings((prev) => {
      if (!prev) return prev
      const key = type === 'root' ? 'rootMappings' : 'storyMappings'
      return {
        ...prev,
        [key]: [...prev[key], { sourceField: '', targetField: '', transform: 'rename' as const }],
      }
    })
  }

  const handleRemoveMapping = (type: 'root' | 'story', index: number) => {
    if (!mappings) return

    setMappings((prev) => {
      if (!prev) return prev
      const key = type === 'root' ? 'rootMappings' : 'storyMappings'
      return {
        ...prev,
        [key]: prev[key].filter((_, i) => i !== index),
      }
    })
  }

  const handleStatusMapChange = (originalStatus: string, newStatus: StoryStatus) => {
    if (!mappings) return

    setMappings((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        statusValueMap: {
          ...prev.statusValueMap,
          [originalStatus]: newStatus,
        },
      }
    })
  }

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 'detect':
        return validationData && !validationData.isValid && mappings !== null
      case 'map':
        return mappings !== null
      case 'preview':
        return previewMutation.data && previewMutation.data.isValid
      case 'apply':
        return convertMutation.data?.success
      default:
        return false
    }
  }, [currentStep, validationData, mappings, previewMutation.data, convertMutation.data])

  const isLoading = isValidating || suggestMappings.isPending || convertMutation.isPending

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" showCloseButton={false}>
        {/* Header */}
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <FileJson className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle>PRD Format Conversion</DialogTitle>
              <p className="text-xs text-muted-foreground">{projectName}</p>
            </div>
          </div>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="py-3 border-y border-border bg-muted/30 -mx-6 px-6">
          <div className="flex items-center justify-between">
            {WIZARD_STEPS.map((step, index) => {
              const isActive = step.id === currentStep
              const isPast = WIZARD_STEPS.findIndex((s) => s.id === currentStep) > index
              const isComplete = step.id === 'apply' && convertMutation.data?.success

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                        isComplete && 'bg-green-500 text-white',
                        isActive && !isComplete && 'bg-primary text-primary-foreground',
                        isPast && !isComplete && 'bg-primary/20 text-primary',
                        !isActive && !isPast && !isComplete && 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isComplete ? <Check className="w-4 h-4" /> : index + 1}
                    </div>
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <ChevronRight className="w-5 h-5 mx-3 text-muted-foreground/50" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4">
          {/* Step 1: Detect Issues */}
          {currentStep === 'detect' && (
            <div className="space-y-4">
              {isValidating && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Validating prd.json...</p>
                </div>
              )}

              {validationError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation Error</AlertTitle>
                  <AlertDescription>{validationError.message}</AlertDescription>
                </Alert>
              )}

              {validationData && !validationData.isValid && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-5 h-5 text-amber-500" />
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        Schema Validation Failed
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      The prd.json file doesn&apos;t match Ralph&apos;s expected format. The wizard will help you
                      convert it.
                    </p>
                  </div>

                  {/* Validation Errors */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-foreground">Validation Errors</h3>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {validationData.errors.map((error, index) => (
                        <div
                          key={index}
                          className="p-2 rounded bg-muted text-sm font-mono"
                        >
                          <span className="text-destructive">{error.path}</span>
                          <span className="text-muted-foreground">: </span>
                          <span className="text-foreground">{error.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Warnings/Suggestions */}
                  {validationData.warnings.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-foreground">Suggestions</h3>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {validationData.warnings.map((warning, index) => (
                          <div
                            key={index}
                            className="p-2 rounded bg-amber-500/10 text-sm"
                          >
                            <span className="text-amber-700 dark:text-amber-400">
                              {warning.suggestion}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Mappings */}
                  {suggestMappings.isPending && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Detecting field mappings...</span>
                    </div>
                  )}

                  {mappings && (
                    <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Check className="w-5 h-5 text-green-500" />
                        <span className="font-medium text-green-700 dark:text-green-400">
                          Mappings Detected
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {mappings.rootMappings.length + mappings.storyMappings.length} field
                        mappings and{' '}
                        {Object.keys(mappings.statusValueMap || {}).length} status value
                        mappings detected. Click &quot;Next&quot; to review and customize.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {validationData?.isValid && (
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="w-5 h-5 text-green-500" />
                    <span className="font-medium text-green-700 dark:text-green-400">
                      Valid Format
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This prd.json already conforms to Ralph&apos;s schema. No conversion needed.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Configure Mappings */}
          {currentStep === 'map' && mappings && (
            <div className="space-y-6">
              {/* Root Level Mappings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Root Level Mappings</h3>
                  <button
                    type="button"
                    onClick={() => handleAddMapping('root')}
                    className="text-xs text-primary hover:text-primary/80"
                  >
                    + Add Mapping
                  </button>
                </div>
                {mappings.rootMappings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No root level mappings needed.</p>
                ) : (
                  <div className="space-y-2">
                    {mappings.rootMappings.map((mapping, index) => (
                      <MappingRow
                        key={index}
                        mapping={mapping}
                        onChange={(field, value) => handleMappingChange('root', index, field, value)}
                        onRemove={() => handleRemoveMapping('root', index)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Story Level Mappings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-foreground">Story Level Mappings</h3>
                  <button
                    type="button"
                    onClick={() => handleAddMapping('story')}
                    className="text-xs text-primary hover:text-primary/80"
                  >
                    + Add Mapping
                  </button>
                </div>
                {mappings.storyMappings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No story level mappings needed.</p>
                ) : (
                  <div className="space-y-2">
                    {mappings.storyMappings.map((mapping, index) => (
                      <MappingRow
                        key={index}
                        mapping={mapping}
                        onChange={(field, value) => handleMappingChange('story', index, field, value)}
                        onRemove={() => handleRemoveMapping('story', index)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Status Value Mappings */}
              {mappings.statusValueMap && Object.keys(mappings.statusValueMap).length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Status Value Mappings</Label>
                  <div className="space-y-2">
                    {Object.entries(mappings.statusValueMap).map(([original, target]) => (
                      <div key={original} className="flex items-center gap-3 p-2 rounded bg-muted">
                        <span className="font-mono text-sm text-foreground min-w-24">{original}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Select
                          value={target}
                          onValueChange={(value) =>
                            handleStatusMapChange(original, value as StoryStatus)
                          }
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">pending</SelectItem>
                            <SelectItem value="in_progress">in_progress</SelectItem>
                            <SelectItem value="done">done</SelectItem>
                            <SelectItem value="failed">failed</SelectItem>
                            <SelectItem value="backlog">backlog</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Preview */}
          {currentStep === 'preview' && (
            <div className="space-y-4">
              {previewMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Generating preview...</p>
                </div>
              )}

              {previewMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Preview Error</AlertTitle>
                  <AlertDescription>{previewMutation.error.message}</AlertDescription>
                </Alert>
              )}

              {previewMutation.data && (
                <div className="space-y-4">
                  {/* Validation Status */}
                  <div
                    className={cn(
                      'p-4 rounded-lg border',
                      previewMutation.data.isValid
                        ? 'bg-green-500/10 border-green-500/20'
                        : 'bg-destructive/10 border-destructive/20'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {previewMutation.data.isValid ? (
                        <>
                          <Check className="w-5 h-5 text-green-500" />
                          <span className="font-medium text-green-700 dark:text-green-400">
                            Conversion Valid
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-destructive" />
                          <span className="font-medium text-destructive">Conversion Invalid</span>
                        </>
                      )}
                    </div>
                    {previewMutation.data.errors.length > 0 && (
                      <div className="space-y-1">
                        {previewMutation.data.errors.map((error, index) => (
                          <p key={index} className="text-sm text-destructive">
                            {error}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Side by Side Preview */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Original */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-foreground">Original</h3>
                      <pre className="p-3 rounded-lg bg-muted overflow-auto max-h-80 text-xs font-mono">
                        {JSON.stringify(originalJson, null, 2)}
                      </pre>
                    </div>

                    {/* Converted */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-foreground">Converted</h3>
                      <pre className="p-3 rounded-lg bg-muted overflow-auto max-h-80 text-xs font-mono">
                        {JSON.stringify(previewMutation.data.preview, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* Backup Option */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                    <Checkbox
                      id="create-backup"
                      checked={createBackup}
                      onCheckedChange={(checked) => setCreateBackup(checked === true)}
                    />
                    <Label htmlFor="create-backup" className="text-sm cursor-pointer">
                      Create backup before conversion (recommended)
                    </Label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Apply */}
          {currentStep === 'apply' && (
            <div className="space-y-4">
              {convertMutation.isPending && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Applying conversion...</p>
                </div>
              )}

              {convertMutation.error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Conversion Failed</AlertTitle>
                  <AlertDescription>{convertMutation.error.message}</AlertDescription>
                </Alert>
              )}

              {convertMutation.data && !convertMutation.data.success && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Conversion Failed</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1">
                      {convertMutation.data.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {convertMutation.data?.success && (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-5 h-5 text-green-500" />
                      <span className="font-medium text-green-700 dark:text-green-400">
                        Conversion Successful
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The prd.json file has been successfully converted to Ralph&apos;s format.
                    </p>
                    {convertMutation.data.backup?.created && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Backup created at: <span className="font-mono">{convertMutation.data.backup.path}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex justify-center">
                    <Button onClick={handleClose}>
                      Close & Add Project
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 pt-4 border-t border-border bg-muted/30 -mx-6 -mb-6 px-6 pb-6">
          <div className="flex items-center justify-between w-full">
            <Button
              variant="secondary"
              onClick={handlePreviousStep}
              disabled={currentStep === 'detect' || isLoading}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>

            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleClose}
                disabled={isLoading}
              >
                Cancel
              </Button>

              {currentStep !== 'apply' ? (
                <Button
                  onClick={handleNextStep}
                  disabled={!canProceed || isLoading}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                !convertMutation.data?.success && (
                  <Button
                    onClick={handleApply}
                    disabled={isLoading}
                  >
                    {convertMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Apply Conversion
                  </Button>
                )
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Mapping row component
interface MappingRowProps {
  mapping: FieldMapping
  onChange: (field: keyof FieldMapping, value: string) => void
  onRemove: () => void
}

function MappingRow({ mapping, onChange, onRemove }: MappingRowProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded bg-muted">
      <Input
        type="text"
        value={mapping.sourceField}
        onChange={(e) => onChange('sourceField', e.target.value)}
        placeholder="Source field"
        className="flex-1 font-mono"
      />
      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
      <Input
        type="text"
        value={mapping.targetField}
        onChange={(e) => onChange('targetField', e.target.value)}
        placeholder="Target field"
        className="flex-1 font-mono"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        aria-label="Remove mapping"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default PrdConversionWizard
