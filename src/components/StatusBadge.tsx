import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { deliveryLabels, paymentLabels } from "@/lib/format";

const paymentStyles: Record<string, string> = {
  aguardando_sinal:
    "bg-warning/15 text-warning border-warning/40 shadow-[0_0_12px_-3px_rgba(234,179,8,0.4)]",
  sem_sinal:
    "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/40 shadow-[0_0_12px_-3px_rgba(59,130,246,0.4)]",
  pagar_na_chegada:
    "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/40 shadow-[0_0_12px_-3px_rgba(168,85,247,0.4)]",
  sinal_pago:
    "bg-primary/15 text-primary border-primary/40 shadow-[0_0_12px_-3px_rgba(249,115,22,0.4)]",
  quitado:
    "bg-success/15 text-success border-success/40 shadow-[0_0_12px_-3px_rgba(34,197,94,0.4)]",
  cancelado:
    "bg-destructive/15 text-destructive border-destructive/40 shadow-[0_0_12px_-3px_rgba(239,68,68,0.4)]",
};

export function PaymentBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border text-[11px] font-bold tracking-wide", paymentStyles[status])}
    >
      {paymentLabels[status] ?? status}
    </Badge>
  );
}

export function DeliveryBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="border-border/30 text-muted-foreground text-[11px]">
      {deliveryLabels[status] ?? status}
    </Badge>
  );
}
