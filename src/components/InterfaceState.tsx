import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleCheck, PackageOpen } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type FeedbackVariant = "empty" | "error" | "success";

const appearances: Record<
  FeedbackVariant,
  { icon: LucideIcon; iconClassName: string; containerClassName: string }
> = {
  empty: {
    icon: PackageOpen,
    iconClassName: "bg-muted text-muted-foreground",
    containerClassName: "border-border/60 bg-card/40",
  },
  error: {
    icon: CircleAlert,
    iconClassName: "bg-destructive/10 text-destructive",
    containerClassName: "border-destructive/30 bg-destructive/5",
  },
  success: {
    icon: CircleCheck,
    iconClassName: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    containerClassName: "border-emerald-500/30 bg-emerald-500/5",
  },
};

export function InterfaceState({
  title,
  description,
  action,
  variant = "empty",
  icon,
  compact = false,
  className,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  variant?: FeedbackVariant;
  icon?: LucideIcon;
  compact?: boolean;
  className?: string;
}) {
  const appearance = appearances[variant];
  const Icon = icon ?? appearance.icon;

  return (
    <section
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed text-center",
        compact ? "gap-2 p-5" : "gap-3 px-5 py-9 sm:px-8",
        appearance.containerClassName,
        className,
      )}
    >
      <div
        className={cn(
          "flex size-11 items-center justify-center rounded-2xl",
          appearance.iconClassName,
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div className="max-w-md">
        <h3 className="text-sm font-semibold text-foreground sm:text-base">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {description}
        </p>
      </div>
      {action && <div className="flex flex-wrap justify-center gap-2 pt-1">{action}</div>}
    </section>
  );
}
