import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "warning" | "critical" | "success";
  hint?: string;
  className?: string;
}

const TONE_STYLES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-primary/10 text-primary-700 dark:text-primary-600",
  warning: "bg-warning/20 text-[hsl(41,96%,32%)] dark:text-warning",
  critical: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
};

export function StatCard({ label, value, icon: Icon, tone = "default", hint, className }: StatCardProps) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground leading-tight">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground truncate">{hint}</p>}
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10", TONE_STYLES[tone])}>
          <Icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
        </div>
      </div>
    </Card>
  );
}
