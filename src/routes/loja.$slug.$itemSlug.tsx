import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Package, Share2, ArrowLeft, Store as StoreIcon, CreditCard, ShoppingBag, Zap } from "lucide-react";
import { toast } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppFooter } from "@/components/AppFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { brl, formatDeadlineHours, getInstallmentOptions, getProductInstallmentInfo, getProductSignalAmount, hasNoSignalRequirement, isProntaEntrega } from "@/lib/format";
import { formatStockRemaining } from "@/lib/stock";
import { useSession } from "@/lib/session";
import { joinWaitlist, reservationErrorMessage } from "@/lib/reservations";
import { useCartStore } from "@/lib/cart";
import { getSubdomain, getStoreFullUrl } from "@/lib/subdomain";

const fetchProductBySlugs = createServerFn({ method: "GET" })
  .validator((d: { slug: string; itemSlug: string }) => d)
  .handler(async ({ data }) => {
    let { data: product } = await supabase
      .from("products")
      .select("*, stores!inner(id, owner_id, name, slug, primary_color, whatsapp_number, contact_email, contact_instagram, logo_url, favicon_url)")
      .eq("slug", data.itemSlug)
      .eq("stores.slug", data.slug)
      .maybeSingle();

    if (!product) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.itemSlug);
      if (isUuid) {
        const { data: fallbackProduct } = await supabase
          .from("products")
          .select("*, stores(id, owner_id, name, slug, primary_color, whatsapp_number, contact_email, contact_instagram, logo_url, favicon_url)")
          .eq("id", data.itemSlug)
          .maybeSingle();
        product = fallbackProduct;
      }
    }
    return product;
  });

export const Route = createFileRoute("/loja/$slug/$itemSlug")({
  loader: async ({ params }) => {
    const product = await fetchProductBySlugs({ data: { slug: params.slug, itemSlug: params.itemSlug } });
    return { product };
  },
  head: ({ loaderData, params }) => {
    const product = loaderData?.product;
    const store = (product as any)?.stores;
    const title = product ? `${product.model} (${product.brand}) — ${store?.name || "Vendas 1:64"}` : "Pré-venda de miniatura — Vendas 1:64";
    const desc = product
      ? `Pré-venda de ${product.brand} ${product.model} por ${brl(product.price)}. Garanta sua unidade na loja ${store?.name || params.slug}!`
      : "Detalhes da pré-venda: preço, unidades disponíveis, prazo do sinal e reserva.";
    const img = product?.image_url || store?.logo_url || store?.favicon_url || "https://vendas164.com.br/og-image.png";
    const favicon = store?.favicon_url || store?.logo_url || undefined;

    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:image", content: img },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: img },
      ],
      links: favicon ? [{ rel: "icon", href: favicon }] : [],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  return (
    <ErrorBoundary>
      <ProductView />
    </ErrorBoundary>
  );
}

export function ProductView({ slug: slugProp, itemSlug: itemSlugProp }: { slug?: string; itemSlug?: string } = {}) {
  let paramsFromRoute: { slug?: string; itemSlug?: string; id?: string } = {};
  try {
    paramsFromRoute = Route.useParams();
  } catch {}

  const currentSubdomain = getSubdomain();
  const slug = slugProp || paramsFromRoute?.slug || currentSubdomain || "";
  const itemSlug = itemSlugProp || paramsFromRoute?.itemSlug || paramsFromRoute?.id || "";
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [quantity, setQuantity] = useState<number>(1);
  const [selectedInstallment, setSelectedInstallment] = useState<number>(1);
  const [reserving, setReserving] = useState<boolean>(false);
  const cart = useCartStore();

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", slug, itemSlug],
    retry: 2,
    queryFn: async () => {
      // Tenta buscar por slug primeiro.
      let query = supabase
        .from("products")
        .select("*, stores!inner(id, owner_id, name, slug, primary_color, whatsapp_number, contact_email, contact_instagram)")
        .eq("slug", itemSlug);

      if (slug) {
        query = query.eq("stores.slug", slug);
      }

      let { data, error } = await query.maybeSingle();

      if (!data) {
         const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemSlug);
         if (isUuid) {
           const { data: fallbackData } = await supabase
            .from("products")
            .select("*, stores(id, owner_id, name, slug, primary_color, whatsapp_number, contact_email, contact_instagram)")
            .eq("id", itemSlug)
            .maybeSingle();
           data = fallbackData;
         }
      }
      
      if (error && !data) throw error;
      return data;
    },
  });

  const { data: waitlistData } = useQuery({
    queryKey: ["waitlist", product?.id],
    retry: 2,
    enabled: !!product?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("waitlist")
        .select("user_id")
        .eq("product_id", product!.id)
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

  const isPronta = isProntaEntrega(product);
  const hasNoSignal = hasNoSignalRequirement(product);
  const signalInfo = getProductSignalAmount(product, quantity);

  // Cálculo de parcelamento e total com base no produto e quantidade selecionada
  const installmentOptions = getInstallmentOptions(product, quantity);
  const chosenInstallmentObj = installmentOptions.find((o) => o.value === selectedInstallment) ?? installmentOptions[0];
  const totalPriceCalculated = chosenInstallmentObj.totalPrice;
  const unitPriceForChosenOption = totalPriceCalculated / Math.max(1, quantity);
  const downPaymentToPay = hasNoSignal ? 0 : signalInfo.amount;
  const remainingBalanceCalculated = Math.max(0, totalPriceCalculated - downPaymentToPay);
  const installmentValCalculated = selectedInstallment > 1 ? totalPriceCalculated / selectedInstallment : totalPriceCalculated;

  async function handleReserve() {
    if (!product) return;
    if (!user) {
      navigate({ to: "/auth", search: { produto: product?.id, loja: product.store_id } });
      return;
    }
    if (product.stores?.owner_id === user.id) {
      toast.info("Você é o dono desta loja e não pode comprar na sua própria loja.");
      return;
    }
    if (product.stock > 0) {
      cart.addItem({
        productId: product.id,
        storeId: product.store_id,
        storeName: product.stores?.name,
        quantity: quantity,
        selectedInstallment,
        unitPriceForChosenOption,
        totalPrice: totalPriceCalculated,
        downPaymentToPay: downPaymentToPay,
        remainingBalance: remainingBalanceCalculated,
        hasNoSignal,
        isProntaEntrega: isProntaEntrega(product),
        productSnapshot: {
          model: product.model,
          brand: product.brand,
          image_url: product.image_url,
          scale: product.scale,
        }
      });
      toast.success(quantity > 1 ? `${quantity} unidades adicionadas ao carrinho!` : "Unidade adicionada ao carrinho!");
    } else {
      setReserving(true);
      try {
        await joinWaitlist(user.id, product.id, product.store_id);
        toast.success("Você entrou na fila de espera.");
        await queryClient.invalidateQueries();
      } catch (err) {
        toast.error(reservationErrorMessage(err));
      } finally {
        setReserving(false);
      }
    }
  }

  function share() {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link do produto copiado!");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-5xl px-4 py-10">
          <Skeleton className="h-6 w-32" />
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-12 w-full" />
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
        <main className="mx-auto max-w-5xl px-4 py-10 text-center">
          <h1 className="text-xl font-bold">Produto não encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O item que você procura não está disponível ou o link está incorreto.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <a href={getStoreFullUrl(slug)}>
              Ir para a página da loja
            </a>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild className="-ml-3 text-muted-foreground hover:text-foreground">
            <a href={getStoreFullUrl(product?.stores?.slug || slug)}>
              <ArrowLeft className="size-4 mr-1.5" />
              Voltar para {product?.stores?.name}
            </a>
          </Button>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="overflow-hidden rounded-3xl border border-border/30 bg-card/60">
            <div className="aspect-square w-full bg-muted relative">
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
              {isPronta && (
                <div className="absolute top-4 left-4 z-10">
                  <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold text-white shadow-lg bg-emerald-600 border border-emerald-400/40 backdrop-blur-md">
                    <Zap className="size-3.5 fill-current" /> Pronta Entrega
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <Link
              to="/loja/$slug"
              params={{ slug: product?.stores?.slug ?? "" }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <StoreIcon className="size-4" /> {product?.stores?.name}
            </Link>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{product.model}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {product.brand} · escala {product.scale}
            </p>

            <div className="mt-6 space-y-2">
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
                  <div className="flex flex-wrap items-center gap-2 pt-0.5 text-sm text-muted-foreground">
                    <span className="text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">
                      Ou em até {inst.maxInstallments}x de {brl(inst.installmentValue * quantity)}
                    </span>
                    <span>{inst.hasSurcharge ? `(Total parcelado: ${brl(inst.totalPrice * quantity)})` : "(sem acréscimo)"}</span>
                  </div>
                );
              })()}

              {/* Destaque das condições de Sinal e Saldo */}
              {isPronta ? (
                <div className="pt-2">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Zap className="size-4 fill-current" />
                    <span>Pronta Entrega — Envio imediato após confirmação do pagamento</span>
                  </div>
                </div>
              ) : !hasNoSignal ? (
                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Sinal para garantir:</span>
                    <span className="text-lg font-bold text-primary">{brl(downPaymentToPay)}</span>
                    {quantity > 1 && <span className="text-[11px] text-muted-foreground ml-1 font-normal">({quantity}x {brl(downPaymentToPay / quantity)})</span>}
                  </div>
                  <div className="rounded-xl border border-border/30 bg-muted/20 px-3.5 py-2">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Saldo na chegada:</span>
                    <span className="text-lg font-bold text-foreground">{brl(remainingBalanceCalculated)}</span>
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span>Sem sinal — Pagamento total na chegada da miniatura</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant={product.is_open ? "secondary" : "outline"} className="border-border/30">
                {isPronta
                  ? product.is_open ? "Disponível para compra" : "Indisponível"
                  : product.is_open ? "Pré-venda aberta" : "Pré-venda fechada"}
              </Badge>
              <Badge variant="outline" className="border-border/30">
                {formatStockRemaining(product)}
              </Badge>
              {isPronta ? (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  ⚡ Envio Imediato
                </Badge>
              ) : hasNoSignal ? (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  Sem sinal
                </Badge>
              ) : null}
            </div>

            {/* Controles de Quantidade e Parcelamento */}
            {product.is_open && product.stock > 0 && isEligibleToBuyWaitlist && (
              <Card className="mt-6 border-border/30 bg-muted/15">
                <CardContent className="space-y-4 p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Seletor de Quantidade */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                        <ShoppingBag className="size-3.5 text-primary" /> Quantidade
                      </Label>
                      <Select
                        value={String(quantity)}
                        onValueChange={(val) => setQuantity(Number(val))}
                      >
                        <SelectTrigger className="bg-background border-border/30">
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
                    </div>

                    {/* Seletor de Parcelamento */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                        <CreditCard className="size-3.5 text-primary" /> Forma de Pagamento
                      </Label>
                      <Select
                        value={String(selectedInstallment)}
                        onValueChange={(val) => setSelectedInstallment(Number(val))}
                      >
                        <SelectTrigger className="bg-background border-border/30">
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
                  <div className="rounded-lg bg-background/80 p-4 border border-border/20 text-xs space-y-2">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>Total ({quantity} {quantity === 1 ? "unidade" : "unidades"}):</span>
                      <span className="font-semibold text-foreground text-sm">{brl(totalPriceCalculated)}</span>
                    </div>
                    {selectedInstallment > 1 && (
                      <div className="flex justify-between items-center text-muted-foreground">
                        <span>Plano escolhido:</span>
                        <span className="font-medium text-foreground">{selectedInstallment}x de {brl(installmentValCalculated)}</span>
                      </div>
                    )}
                    <div className="border-t border-border/20 pt-2 flex justify-between items-center">
                      {isPronta ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Pagamento total direto no carrinho
                        </span>
                      ) : hasNoSignal ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Sem sinal agora (Pague na chegada)
                        </span>
                      ) : (
                        <>
                          <span className="font-semibold text-primary">Sinal a pagar agora:</span>
                          <span className="font-bold text-primary text-sm">{brl(downPaymentToPay)}</span>
                        </>
                      )}
                    </div>
                    {!isPronta && !hasNoSignal && (
                      <div className="flex justify-between items-center text-muted-foreground text-[11px]">
                        <span>Saldo a pagar na chegada:</span>
                        <span className="font-medium text-foreground">{brl(remainingBalanceCalculated)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {isPronta ? (
              <Card className="mt-6 border-emerald-500/20 bg-emerald-500/5">
                <CardContent className="space-y-3 p-5 text-sm">
                  <p className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <Zap className="size-4 fill-current" />
                    Item a Pronta Entrega — Disponível em estoque físico para envio imediato.
                  </p>
                  <p className="flex items-center gap-2.5 text-muted-foreground text-xs">
                    <Package className="size-4 text-primary" />
                    Pagamento integral direto sem necessidade de sinal prévio ou espera de lançamento.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card className="mt-6 border-border/30 bg-muted/10">
                <CardContent className="space-y-3 p-5 text-sm">
                  <p className="flex items-center gap-2.5 text-muted-foreground">
                    <Clock className="size-4 text-primary" />
                    {hasNoSignal ? (
                      <span className="font-semibold text-foreground">Sem necessidade de sinal (reserva garantida)</span>
                    ) : (product as any).payment_deadline_date ? (
                      <span>Data limite para pagar o sinal: <strong className="text-foreground">{new Date((product as any).payment_deadline_date + "T00:00:00").toLocaleDateString("pt-BR")}</strong></span>
                    ) : (
                      <span>Prazo para pagar o sinal: {formatDeadlineHours(product.payment_deadline_hours)} após a reserva</span>
                    )}
                  </p>
                  <p className="flex items-center gap-2.5 text-muted-foreground">
                    <CalendarDays className="size-4 text-primary" />
                    Previsão de chegada:{" "}
                    {product.release_date
                      ? new Date(product.release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })
                      : "a definir"}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="flex-1 font-bold shadow-md transition-all text-white"
                onClick={handleReserve}
                style={product.stock > 0 && product.is_open && isEligibleToBuyWaitlist ? { backgroundColor: product.stores?.primary_color } : undefined}
                disabled={
                  !product.is_open || 
                  reserving || 
                  (product.stock > 0 && !isEligibleToBuyWaitlist) || 
                  (product.stock === 0 && isOnWaitlist)
                }
              >
                {!product.is_open
                  ? isPronta ? "Item indisponível" : "Pré-venda fechada"
                  : product.stock > 0
                    ? isEligibleToBuyWaitlist
                      ? (
                          <div className="flex items-center justify-center gap-2">
                            <ShoppingBag className="size-5" />
                            {isPronta
                              ? quantity > 1 ? `Comprar ${quantity} un. (Carrinho)` : "Adicionar ao Carrinho"
                              : quantity > 1 ? `Adicionar ${quantity} ao Carrinho` : "Adicionar ao Carrinho"}
                          </div>
                        )
                      : "Estoque reservado p/ fila"
                    : isOnWaitlist
                      ? `Você é o ${userWaitlistIndex + 1}º na fila`
                      : "Entrar na fila de espera"}
              </Button>
              <Button size="lg" variant="secondary" onClick={share} className="border-border/30">
                <Share2 className="size-4" /> Compartilhar
              </Button>
            </div>
          </div>
        </div>
      </main>
      <AppFooter storeInfo={product?.stores || undefined} />
    </div>
  );
}
