import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Package, Share2, Store as StoreIcon, CreditCard, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { brl, formatDeadlineHours, getInstallmentOptions, getProductInstallmentInfo, hasNoSignalRequirement } from "@/lib/format";
import { useSession } from "@/lib/session";
import { joinWaitlist, reservationErrorMessage, reserveQuota } from "@/lib/reservations";

export const Route = createFileRoute("/produto/$id")({
  head: () => ({
    meta: [
      { title: "Pré-venda de miniatura — Vendas 1:64" },
      {
        name: "description",
        content: "Detalhes da pré-venda: preço, unidades disponíveis, prazo do sinal e reserva.",
      },
      { property: "og:title", content: "Pré-venda de miniatura — Vendas 1:64" },
      { property: "og:description", content: "Reserve sua unidade desta miniatura colecionável." },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  return (
    <ErrorBoundary>
      <ProductPageContent />
    </ErrorBoundary>
  );
}

function ProductPageContent() {
  const { id } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [quantity, setQuantity] = useState<number>(1);
  const [selectedInstallment, setSelectedInstallment] = useState<number>(1);
  const [reserving, setReserving] = useState<boolean>(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    retry: 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, stores(id, owner_id, name, slug, primary_color, whatsapp_number)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: waitlistData } = useQuery({
    queryKey: ["waitlist", id],
    retry: 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("waitlist")
        .select("user_id")
        .eq("product_id", id)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  const waitlistCount = waitlistData?.length || 0;
  const userWaitlistIndex = user && waitlistData ? waitlistData.findIndex(w => w.user_id === user.id) : -1;
  const isOnWaitlist = userWaitlistIndex !== -1;
  
  const isEligibleToBuyWaitlist = 
    (product && product.stock > waitlistCount) || 
    (isOnWaitlist && product && userWaitlistIndex < product.stock);

  async function handleReserve() {
    if (!product) return;
    if (!user) {
      navigate({ to: "/auth", search: { produto: id, loja: product.store_id } });
      return;
    }
    if (product.stores?.owner_id === user.id) {
      toast.info("Você é o dono desta loja e não pode reservar unidades na sua própria pré-venda.");
      return;
    }
    setReserving(true);
    try {
      if (product.stock > 0) {
        const qtyToReserve = Math.min(quantity, product.stock);
        const orderIds: string[] = [];

        for (let i = 0; i < qtyToReserve; i++) {
          const orderId = await reserveQuota(product.id);
          orderIds.push(orderId);
        }

const hasNoSignal = hasNoSignalRequirement(product);
        
        // Atualizar pedidos com número de parcelas escolhido e status se sem sinal
        if (orderIds.length > 0) {
          const updatePayload: any = {
            total_price: unitPriceForChosenOption
          };
          if (selectedInstallment > 1) {
            updatePayload.installment_count = selectedInstallment;
          }
          if (hasNoSignal) {
            updatePayload.payment_status = "sem_sinal";
            updatePayload.reservation_expires_at = null;
          }

          if (Object.keys(updatePayload).length > 0) {
            await supabase
              .from("orders")
              .update(updatePayload)
              .in("id", orderIds);
          }

          if (isOnWaitlist) {
            await supabase
              .from("waitlist")
              .delete()
              .eq("product_id", product.id)
              .eq("user_id", user.id);
          }
        }

        if (hasNoSignal) {
          toast.success(qtyToReserve > 1 ? `${qtyToReserve} unidades reservadas com sucesso! (Sem sinal)` : "Unidade reservada com sucesso! (Sem sinal)");
        } else {
          toast.success(qtyToReserve > 1 ? `${qtyToReserve} unidades reservadas! Envie o sinal dentro do prazo.` : "Unidade reservada! Envie o sinal dentro do prazo.");
        }
      } else {
        await joinWaitlist(user.id, product.id, product.store_id);
        toast.success("Você entrou na fila de espera.");
      }
      queryClient.invalidateQueries();
      navigate({ to: "/painel" });
    } catch (error) {
      toast.error(reservationErrorMessage(error));
    } finally {
      setReserving(false);
    }
  }

  function share() {
    navigator.clipboard.writeText(`${window.location.origin}/produto/${id}`);
    toast.success("Link do produto copiado!");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-4 py-10">
<div className="grid gap-4 md:gap-8 md:grid-cols-2">
            <div className="aspect-square w-full rounded-3xl bg-muted">
              <Skeleton className="h-full w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Produto não encontrado.</p>
      </div>
    );
  }

  useEffect(() => {
    document.title = `${product.model} — ${product.brand} | Vendas 1:64`;
    const metaDescription = document.querySelector('meta[name="description"]');
if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        `Pré-venda de ${product.brand} ${product.model} — ${product.stock} unidades disponíveis. ${product.is_open ? "Pré-venda aberta." : "Pré-venda fechada."}`,
      );
    }
  }, [product]);

  const hasNoSignal = hasNoSignalRequirement(product);

  // Cálculo de parcelamento e total com base no produto e quantidade selecionada
  const installmentOptions = getInstallmentOptions(product, quantity);
  const chosenInstallmentObj = installmentOptions.find((o) => o.value === selectedInstallment) ?? installmentOptions[0];
  const totalPriceCalculated = chosenInstallmentObj.totalPrice;
  const unitPriceForChosenOption = totalPriceCalculated / quantity;
  const installmentValCalculated = selectedInstallment > 1 ? totalPriceCalculated / selectedInstallment : totalPriceCalculated;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="overflow-hidden rounded-3xl border border-border/60 panel">
            <div className="aspect-square w-full bg-muted">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={`${product.brand} ${product.model}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Package className="size-12" />
                </div>
              )}
            </div>
          </div>

          <div>
            <Link
              to="/loja/$slug"
              params={{ slug: product.stores?.slug ?? "" }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <StoreIcon className="size-4" /> {product.stores?.name}
            </Link>
            <h1 className="mt-2 text-3xl font-bold">{product.model}</h1>
            <p className="text-sm uppercase tracking-wide text-muted-foreground">
              {product.brand} · escala {product.scale}
            </p>

            <div className="mt-6 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">À vista:</span>
                <span className="font-display text-4xl font-bold text-primary">
                  {brl(installmentOptions[0].totalPrice)}
                </span>
                {quantity > 1 && (
                  <span className="text-xs text-muted-foreground">({quantity}x {brl(installmentOptions[0].totalPrice / quantity)})</span>
                )}
              </div>
              {(() => {
                const inst = getProductInstallmentInfo(product, quantity);
                if (!inst) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground">
                    <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-semibold">
                      Ou em até {inst.maxInstallments}x de {brl(inst.installmentValue * quantity)}
                    </Badge>
                    <span>{inst.hasSurcharge ? `(Total parcelado: ${brl(inst.totalPrice * quantity)})` : "(sem acréscimo)"}</span>
                  </div>
                );
              })()}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant={product.is_open ? "secondary" : "outline"}>
                {product.is_open ? "Pré-venda aberta" : "Pré-venda fechada"}
              </Badge>
              <Badge variant="outline">
                {product.stock > 0 ? `${product.stock} ${product.stock === 1 ? "unidade disponível" : "unidades disponíveis"}` : "Unidades esgotadas"}
              </Badge>
              {hasNoSignal && (
                <Badge variant="secondary" className="bg-blue-500/15 text-blue-600 border-blue-500/30">
                  Sem sinal
                </Badge>
              )}
            </div>

            {/* Controles de Quantidade e Parcelamento */}
            {product.is_open && product.stock > 0 && isEligibleToBuyWaitlist && (
              <Card className="mt-6 border-border/60 panel bg-muted/20">
                <CardContent className="space-y-4 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Seletor de Quantidade */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <ShoppingBag className="size-3.5 text-primary" /> Quantidade
                      </Label>
                      <Select
                        value={String(quantity)}
                        onValueChange={(val) => setQuantity(Number(val))}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: Math.min(product.stock, 10) }, (_, i) => i + 1).map((qty) => (
                            <SelectItem key={qty} value={String(qty)}>
                              {qty} {qty === 1 ? "unidade" : "unidades"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(product as any).bulk_discount_threshold > 0 && quantity < (product as any).bulk_discount_threshold && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold pt-1">
                          Desconto a partir de {(product as any).bulk_discount_threshold} unidades!
                        </p>
                      )}
                      {(product as any).bulk_discount_threshold > 0 && quantity >= (product as any).bulk_discount_threshold && (
                        <p className="text-[11px] text-green-600 dark:text-green-500 font-semibold pt-1">
                          Desconto de atacado aplicado!
                        </p>
                      )}
                    </div>

                    {/* Seletor de Parcelamento */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <CreditCard className="size-3.5 text-primary" /> Forma de Pagamento
                      </Label>
                      <Select
                        value={String(selectedInstallment)}
                        onValueChange={(val) => setSelectedInstallment(Number(val))}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {installmentOptions.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.value === 1
                                ? `À vista — ${brl(opt.totalPrice)}`
                                : `${opt.value}x de ${brl(opt.totalPrice / opt.value)}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Resumo Atualizado do Pedido */}
                  <div className="rounded-lg bg-background/80 p-3 border border-border/40 text-xs space-y-1">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Total da reserva ({quantity} {quantity === 1 ? "unidade" : "unidades"}):</span>
                      <span className="font-semibold text-foreground text-sm">{brl(totalPriceCalculated)}</span>
                    </div>
                    {selectedInstallment > 1 && (
                      <div className="flex justify-between items-center text-primary font-medium">
                        <span>Plano escolhido:</span>
                        <span>{selectedInstallment}x de {brl(installmentValCalculated)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mt-6 border-border/60 panel">
              <CardContent className="space-y-3 p-5 text-sm">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-4 text-primary" />
                  {hasNoSignal ? (
                    <span className="font-semibold text-foreground">Sem necessidade de sinal (reserva garantida)</span>
                  ) : (product as any).payment_deadline_date ? (
                    <span>Data limite para pagar o sinal: <strong>{new Date((product as any).payment_deadline_date + "T00:00:00").toLocaleDateString("pt-BR")}</strong></span>
                  ) : (
                    <span>Prazo para pagar o sinal: {formatDeadlineHours(product.payment_deadline_hours)} após a reserva</span>
                  )}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="size-4 text-primary" />
                  Previsão de chegada:{" "}
                  {product.release_date
                    ? new Date(product.release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
                    : "a definir"}
                </p>
              </CardContent>
            </Card>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="flex-1 glow"
                onClick={handleReserve}
                disabled={
                  !product.is_open || 
                  reserving || 
                  (product.stock > 0 && !isEligibleToBuyWaitlist) || 
                  (product.stock === 0 && isOnWaitlist)
                }
              >
                {!product.is_open
                  ? "Pré-venda fechada"
                  : product.stock > 0
                    ? isEligibleToBuyWaitlist
                      ? quantity > 1 ? `Reservar ${quantity} unidades` : "Reservar unidade"
                      : "Estoque reservado p/ fila"
                    : isOnWaitlist
                      ? `Você é o ${userWaitlistIndex + 1}º na fila`
                      : "Entrar na fila de espera"}
              </Button>
              <Button size="lg" variant="secondary" onClick={share}>
                <Share2 className="size-4" /> Compartilhar
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
