import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Search, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { groupProductBuyers, loadBuyerPages, type BuyerOrder } from "@/lib/productBuyers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
export function ProductBuyersDialog({
  open,
  onOpenChange,
  storeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
}) {
  const [productId, setProductId] = useState("");
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const {
    data: products = [],
    isError: productsError,
    isFetching: loadingProducts,
    refetch: reloadProducts,
  } = useQuery({
    queryKey: ["product-buyers-products", storeId],
    enabled: open,
    queryFn: () =>
      loadBuyerPages(async (offset) => {
        const { data, error } = await supabase
          .from("products")
          .select("id,brand,model,sku")
          .eq("store_id", storeId)
          .order("brand")
          .order("model")
          .order("id")
          .range(offset, offset + 99);
        if (error) throw error;
        return data || [];
      }),
  });
  const {
    data: orders = [],
    isFetching,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["product-buyers", storeId, productId],
    enabled: open && !!productId,
    staleTime: 0,
    queryFn: async () => {
      const rows = await loadBuyerPages(async (offset) => {
        const { data, error } = await supabase
          .from("orders")
          .select("*,products(*),order_installments(*)")
          .eq("store_id", storeId)
          .eq("product_id", productId)
          .neq("payment_status", "cancelado")
          .neq("delivery_status", "cancelado")
          .order("created_at")
          .order("id")
          .range(offset, offset + 99);
        if (error) throw error;
        return data || [];
      });
      const users = [...new Set(rows.map((row) => row.user_id))];
      const people = new Map<
        string,
        { name: string | null; email: string | null; phone: string | null }
      >();
      for (let start = 0; start < users.length; start += 100) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id,name,email,phone")
          .in("id", users.slice(start, start + 100));
        if (error) throw error;
        for (const person of data || []) people.set(person.id, person);
      }
      return rows.map((row) => ({
        ...row,
        profiles: people.get(row.user_id) || null,
      })) as BuyerOrder[];
    },
  });
  const buyers = useMemo(() => groupProductBuyers(orders, productId), [orders, productId]);
  const visible = buyers.filter((b) =>
    `${b.name} ${b.phone || ""} ${b.email || ""} ${b.variants.map((v) => v.name).join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase().trim()),
  );
  const options = products.filter(
    (p) =>
      p.id === productId ||
      `${p.brand} ${p.model} ${p.sku || ""}`
        .toLowerCase()
        .includes(productSearch.trim().toLowerCase()),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="space-y-2 border-b p-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5 text-primary" />
            Compradores por produto
          </DialogTitle>
          <DialogDescription>
            Confira as reservas de um modelo, com quantidades, pagamentos, variações e andamento do
            envio.
          </DialogDescription>
        </div>
        <div className="space-y-3 border-b p-4">
          {productsError ? (
            <Button variant="outline" onClick={() => void reloadProducts()}>
              Tentar carregar produtos novamente
            </Button>
          ) : (
            <>
              <Input
                aria-label="Buscar produto na lista de compradores"
                placeholder="Buscar modelo, marca ou SKU"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              <Select
                value={productId}
                onValueChange={(id) => {
                  setProductId(id);
                  setSearch("");
                }}
              >
                <SelectTrigger aria-label="Escolher produto" className="min-w-0">
                  <SelectValue
                    placeholder={loadingProducts ? "Carregando produtos…" : "Escolha um produto"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {options.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.brand} {p.model}
                      {p.sku ? ` · ${p.sku}` : ""}
                    </SelectItem>
                  ))}
                  {!options.length && !loadingProducts && (
                    <p className="p-3 text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                  )}
                </SelectContent>
              </Select>
            </>
          )}
          {productId && (
            <div className="flex min-w-0 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  aria-label="Buscar comprador"
                  className="pl-9"
                  placeholder="Buscar cliente, telefone ou variação"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Atualizar compradores"
                disabled={isFetching}
                onClick={() => void refetch()}
              >
                <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          )}
        </div>
        <div className="min-h-0 space-y-3 overflow-y-auto p-4">
          {isFetching ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Carregando todas as reservas do produto…
            </p>
          ) : isError ? (
            <div>
              <p className="text-sm">Não foi possível carregar a lista completa.</p>
              <Button variant="outline" onClick={() => void refetch()}>
                Tentar novamente
              </Button>
            </div>
          ) : !productId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Escolha um modelo para ver seus compradores.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[
                  ["Compradores", visible.length],
                  ["Unidades", visible.reduce((s, b) => s + b.quantity, 0)],
                  ["Recebido", brl(visible.reduce((s, b) => s + b.summary.received, 0))],
                  ["Saldo pendente", brl(visible.reduce((s, b) => s + b.summary.balance, 0))],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="break-words font-semibold">{value}</p>
                  </div>
                ))}
              </div>
              {!visible.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {search
                    ? "Nenhum comprador encontrado."
                    : "Este produto não tem reservas ativas."}
                </p>
              )}
              {visible.map((b) => (
                <section key={b.key} className="min-w-0 space-y-3 rounded-xl border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">{b.name}</h3>
                      <p className="break-all text-xs text-muted-foreground">
                        {b.phone || b.email || "Contato não informado"}
                      </p>
                    </div>
                    <Badge variant="secondary">{b.quantity} unidade(s)</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {b.awaitingSignal > 0 && (
                      <Badge variant="outline">{b.awaitingSignal} aguardando sinal</Badge>
                    )}
                    {b.pendingPayments > 0 && (
                      <Badge variant="outline">{b.pendingPayments} com saldo</Badge>
                    )}
                    {b.pendingShipping > 0 && (
                      <Badge variant="outline">{b.pendingShipping} pendentes de envio</Badge>
                    )}
                    {b.paid > 0 && <Badge variant="outline">{b.paid} quitadas</Badge>}
                    {b.sent > 0 && <Badge variant="outline">{b.sent} enviadas/em trânsito</Badge>}
                    {b.delivered > 0 && <Badge variant="outline">{b.delivered} entregues</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <p>
                      Recebido: <strong>{brl(b.summary.received)}</strong>
                    </p>
                    <p>
                      Saldo: <strong>{brl(b.summary.balance)}</strong>
                    </p>
                  </div>
                  <div className="space-y-2">
                    {b.variants.map((v) => (
                      <div
                        key={v.key}
                        className="flex min-w-0 items-center gap-3 rounded-lg bg-muted/20 p-2"
                      >
                        {v.imageUrl && (
                          <ProductThumbnail
                            src={v.imageUrl}
                            alt={v.name}
                            className="size-10 shrink-0 rounded object-cover"
                          />
                        )}
                        <p className="min-w-0 flex-1 break-words text-sm">{v.name}</p>
                        <strong className="shrink-0 text-sm">{v.quantity}×</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
