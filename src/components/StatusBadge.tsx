import type { LucideIcon } from "lucide-react";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock3,
  PackageCheck,
  Truck,
  WalletCards,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { deliveryLabels, paymentLabels } from "@/lib/format";

type StatusAppearance = {
  icon: LucideIcon;
  className: string;
};

const paymentStyles: Record<string, StatusAppearance> = {
  aguardando_sinal: {
    icon: Clock3,
    className: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  sem_sinal: {
    icon: Clock3,
    className: "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  pagar_na_chegada: {
    icon: Clock3,
    className: "border-violet-500/35 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  pronta_entrega: {
    icon: WalletCards,
    className: "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  sinal_pago: {
    icon: WalletCards,
    className: "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  quitado: {
    icon: CircleCheck,
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  cancelado: {
    icon: CircleX,
    className: "border-destructive/35 bg-destructive/10 text-destructive",
  },
};

const deliveryStyles: Record<string, StatusAppearance> = {
  pendente: {
    icon: CircleDashed,
    className: "border-slate-400/35 bg-slate-500/10 text-slate-600 dark:text-slate-300",
  },
  enviado: {
    icon: Truck,
    className: "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  em_transito: {
    icon: Truck,
    className: "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  entregue: {
    icon: PackageCheck,
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  cancelado: {
    icon: CircleX,
    className: "border-destructive/35 bg-destructive/10 text-destructive",
  },
};

const fallbackStyle: StatusAppearance = {
  icon: CircleDashed,
  className: "border-border/60 bg-muted/50 text-muted-foreground",
};

function StatusBadge({
  label,
  appearance,
}: {
  label: string;
  appearance?: StatusAppearance;
}) {
  const resolved = appearance ?? fallbackStyle;
  const Icon = resolved.icon;

  return (
    <Badge
      variant="outline"
      aria-label={`Status: ${label}`}
      className={cn(
        "inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-tight shadow-none",
        resolved.className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="whitespace-normal">{label}</span>
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      label={paymentLabels[status] ?? status}
      appearance={paymentStyles[status]}
    />
  );
}

export function DeliveryBadge({ status }: { status: string }) {
  return (
    <StatusBadge
      label={deliveryLabels[status] ?? status}
      appearance={deliveryStyles[status]}
    />
  );
}
