import { Loader2, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import type { TestFlow } from "@/lib/schemas/testScenarioSchema";

export interface FlowCardProps {
  flow: TestFlow;
  onToggle: (flowId: string, checked: boolean) => void;
  isUpdating: boolean;
}

export function FlowCard({ flow, onToggle, isUpdating }: FlowCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 transition-colors",
        flow.checked && "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800",
        isUpdating && "opacity-60"
      )}
      data-testid={`flow-card-${flow.id}`}
    >
      {/* Flow header with checkbox */}
      <div className="flex items-start gap-3 mb-3">
        <Checkbox
          id={`flow-checkbox-${flow.id}`}
          checked={flow.checked}
          onCheckedChange={(checked) => {
            if (typeof checked === "boolean") {
              onToggle(flow.id, checked);
            }
          }}
          disabled={isUpdating}
          className="mt-1"
          data-testid={`flow-checkbox-${flow.id}`}
        />
        <label
          htmlFor={`flow-checkbox-${flow.id}`}
          className={cn(
            "text-base font-semibold cursor-pointer flex-1",
            flow.checked && "text-emerald-700 dark:text-emerald-400"
          )}
        >
          {flow.name}
        </label>
        {isUpdating && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Numbered steps */}
      <ol className="space-y-2 pl-7">
        {flow.steps.map((step, index) => (
          <li
            key={index}
            className={cn(
              "flex items-start gap-2 text-sm",
              flow.checked && "text-muted-foreground"
            )}
          >
            <span className={cn(
              "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium",
              flow.checked
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            )}>
              {index + 1}
            </span>
            <span className={cn(
              "leading-relaxed",
              flow.checked && "line-through"
            )}>
              {step}
            </span>
          </li>
        ))}
      </ol>

      {/* Status indicator */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
        {flow.checked ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Flow completed
            </span>
          </>
        ) : (
          <>
            <Circle className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {flow.steps.length} steps to verify
            </span>
          </>
        )}
      </div>
    </div>
  );
}
