import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { deliveryLabels, paymentLabels } from "@/lib/format";

const paymentStyles: Record<string, string> = {
  aguardando_sinal: "bg-warning/15 text-warning border-warning/30",
  sem_sinal: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  pagar_na_chegada: "bg-purple-500/15 text-purple-600 border-purple-500/30 dark:text-purple-400",
  sinal_pago: "bg-primary/15 text-primary border-primary/30",
  quitado: "bg-success/15 text-success border-success/30",
  cancelado: "bg-destructive/15 text-destructive border-destructive/30",
};

export function PaymentBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border", paymentStyles[status])}>
      {paymentLabels[status] ?? status}
    </Badge>
  );
}

export function DeliveryBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className="border-border text-muted-foreground">
      {deliveryLabels[status] ?? status}
    </Badge>
  );
}
