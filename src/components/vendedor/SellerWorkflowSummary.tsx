import { Clock, CreditCard, Package, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SellerWorkflow =
  "todas" | "cobrar-sinal" | "saldo-pendente" | "preparar-envio" | "em-transito";
export function SellerWorkflowSummary({
  workflowView,
  onChange,
}: {
  workflowView: SellerWorkflow | "personalizado";
  onChange: (view: SellerWorkflow) => void;
}) {
  return (
    <details className="border-b border-border/50 bg-muted/15 px-3 py-3 sm:px-4">
      <summary className="min-h-10 cursor-pointer text-sm font-semibold leading-10">
        Atendimento por etapa
        {workflowView !== "todas" && (
          <span className="ml-2 text-xs font-normal text-primary">Filtro ativo</span>
        )}
      </summary>
      <div className="pt-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Atendimento por etapa</p>
            <p className="text-xs text-muted-foreground">
              Escolha a próxima ação. Os filtros de busca, período e modalidade continuam valendo.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant={workflowView === "todas" ? "default" : "outline"}
            onClick={() => onChange("todas")}
          >
            Todas as reservas
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {(
            [
              {
                view: "cobrar-sinal",
                title: "Aguardando sinal",
                description: "Confirmar o primeiro pagamento",
                icon: Clock,
              },
              {
                view: "saldo-pendente",
                title: "Saldo após sinal",
                description: "Reservas com sinal já pago",
                icon: CreditCard,
              },
              {
                view: "preparar-envio",
                title: "Preparar envio",
                description: "Quitadas com envio pendente",
                icon: Package,
              },
              {
                view: "em-transito",
                title: "Em trânsito",
                description: "Acompanhar a entrega ao cliente",
                icon: Truck,
              },
            ] as const
          ).map(({ view, title, description, icon: Icon }) => (
            <Button
              key={view}
              type="button"
              aria-pressed={workflowView === view}
              variant={workflowView === view ? "default" : "outline"}
              onClick={() => onChange(view)}
              className="h-auto min-h-16 min-w-0 items-start justify-start gap-2 whitespace-normal rounded-xl p-3 text-left"
            >
              <Icon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-snug">{title}</span>
                <span
                  className={`mt-1 block text-xs font-normal leading-snug ${workflowView === view ? "opacity-85" : "text-muted-foreground"}`}
                >
                  {description}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </details>
  );
}
