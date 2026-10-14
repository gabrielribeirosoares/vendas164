import { Button } from "@/components/ui/button";

export type ReservationDetailSection = "payment" | "delivery";

export function ReservationNextAction({
  hideDetails = true,
  releaseDate,
  paymentStatus,
  deliveryStatus,
  onOpenDetails,
}: {
  hideDetails?: boolean;
  releaseDate?: string | null;
  paymentStatus: string;
  deliveryStatus: string;
  onOpenDetails: (section?: ReservationDetailSection) => void;
}) {
  let action: { label: string; section: ReservationDetailSection } | null = null;
  if (paymentStatus !== "cancelado" && deliveryStatus !== "cancelado") {
    if (paymentStatus === "aguardando_sinal") {
      action = { label: "Confirmar sinal", section: "payment" };
    } else if (
      ["sinal_pago", "sem_sinal", "pagar_na_chegada", "pronta_entrega", "pendente"].includes(
        paymentStatus,
      )
    ) {
      action = { label: "Receber saldo", section: "payment" };
    } else if (paymentStatus === "quitado" && deliveryStatus === "pendente") {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      action = {
        label:
          releaseDate && releaseDate.slice(0, 10) > today
            ? "Ver previsão de chegada"
            : "Preparar envio",
        section: "delivery",
      };
    } else if (paymentStatus === "quitado" && ["enviado", "em_transito"].includes(deliveryStatus)) {
      action = { label: "Acompanhar envio", section: "delivery" };
    }
  }
  return (
    <div className="mt-2 grid min-w-0 gap-1.5 no-print">
      {action && (
        <Button
          type="button"
          size="sm"
          className="h-auto min-h-10 whitespace-normal px-2 text-xs"
          onClick={() => onOpenDetails(action.section)}
        >
          {action.label}
        </Button>
      )}
      {(!hideDetails || !action) && (
        <Button
          type="button"
          size="sm"
          variant={action ? "ghost" : "outline"}
          className="h-auto min-h-9 whitespace-normal px-2 text-xs"
          onClick={() => onOpenDetails()}
        >
          Ver detalhes
        </Button>
      )}
    </div>
  );
}
