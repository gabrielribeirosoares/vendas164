import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, CheckCircle2, Loader2, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { groupCustomerPackages, loadPackingOrders, type PackingPage } from "@/lib/customerPacking";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function CustomerPackingDialog({
  open,
  onOpenChange,
  storeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
}) {
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const {
    data: orders = [],
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["customer-packing", storeId],
    enabled: open,
    staleTime: 0,
    queryFn: () =>
      loadPackingOrders(async (page) => {
        const { data, error } = await supabase.rpc("seller_orders_page", {
          _store_id: storeId,
          _payment: "quitado",
          _focus: "envios",
          _page: page,
          _page_size: 100,
        });
        if (error) throw error;
        return data as unknown as PackingPage;
      }),
  });
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const packages = useMemo(() => groupCustomerPackages(orders, today), [orders, today]);
  const visible = packages.filter((customer) =>
    `${customer.name} ${customer.phone || ""} ${customer.email || ""} ${customer.lines.map((line) => `${line.brand} ${line.productName} ${line.variantName || ""} ${line.sku || ""}`).join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const toggle = (ids: string[]) =>
    setChecked((previous) => {
      const next = new Set(previous);
      const remove = ids.every((id) => next.has(id));
      for (const id of ids)
        if (remove) next.delete(id);
        else next.add(id);
      return next;
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="space-y-2 border-b p-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5 text-primary" />
            Separação por cliente
          </DialogTitle>
          <DialogDescription>
            Pedidos quitados, disponíveis para envio e ainda não despachados. Confira os itens
            enquanto monta cada pacote.
          </DialogDescription>
        </div>
        <div className="space-y-2 border-b p-4">
          <div className="flex min-w-0 gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Buscar na lista de separação"
                className="pl-9"
                placeholder="Cliente, produto, variação ou SKU"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Atualizar lista de separação"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {visible.length} cliente(s) ·{" "}
            {visible.reduce((sum, customer) => sum + customer.quantity, 0)} unidade(s) · Conferência
            temporária nesta sessão
          </p>
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          {isFetching && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Atualizando pedidos…
            </p>
          )}
          {isError ? (
            <div className="space-y-2 text-sm">
              <p>Não foi possível carregar a lista completa.</p>
              <Button variant="outline" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : !isFetching && visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search
                ? "Nenhum cliente ou item encontrado."
                : "Nenhum pedido pago disponível para separar. Pré-vendas com chegada futura aparecerão após a data prevista."}
            </p>
          ) : (
            visible.map((customer) => {
              const ids = customer.lines.flatMap((line) => line.orderIds);
              const checkedCount = ids.filter((id) => checked.has(id)).length;
              const ready = checkedCount === ids.length;
              return (
                <section key={customer.key} className="min-w-0 rounded-xl border">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-muted/20 p-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">{customer.name}</h3>
                      <p className="break-all text-xs text-muted-foreground">
                        {customer.phone || customer.email || "Contato não informado"}
                      </p>
                    </div>
                    <Badge variant={ready ? "default" : "secondary"}>
                      {ready ? (
                        <>
                          <CheckCircle2 className="mr-1 size-3" />
                          Pacote conferido
                        </>
                      ) : (
                        `${checkedCount}/${customer.quantity} conferidas`
                      )}
                    </Badge>
                  </div>
                  <div className="divide-y">
                    {customer.lines.map((line) => {
                      const allChecked = line.orderIds.every((id) => checked.has(id));
                      const label = `${line.brand} ${line.productName}${line.variantName ? ` — ${line.variantName}` : ""}`;
                      return (
                        <label
                          key={line.key}
                          className="flex min-w-0 cursor-pointer items-start gap-3 p-3"
                        >
                          <Checkbox
                            className="mt-3 shrink-0"
                            checked={allChecked}
                            disabled={isFetching}
                            onCheckedChange={() => toggle(line.orderIds)}
                            aria-label={`Conferir ${line.quantity} unidade(s) de ${label} para ${customer.name}`}
                          />
                          {line.imageUrl ? (
                            <ProductThumbnail
                              src={line.imageUrl}
                              alt={label}
                              className="size-14 shrink-0 rounded-lg border object-cover"
                            />
                          ) : (
                            <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-muted">
                              <Package className="size-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium">
                              {line.brand} {line.productName}
                            </p>
                            {line.variantName && (
                              <p className="break-words text-sm font-semibold text-primary">
                                {line.variantName}
                              </p>
                            )}
                            {line.sku && (
                              <p className="break-all text-xs text-muted-foreground">
                                SKU: {line.sku}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-sm font-bold text-primary">
                            {line.quantity}×
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
