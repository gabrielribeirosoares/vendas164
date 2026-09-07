import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock, Package, Share2, ArrowLeft, Store as StoreIcon, CreditCard, ShoppingBag, Zap, Minus, Plus, Info } from "lucide-react";
import { toast } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/AppHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppFooter } from "@/components/AppFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-sm text-muted-foreground">
                {product.brand} · escala {product.scale}
              </span>
              {(product as any).sku && (
                <span className="font-mono text-xs bg-muted text-foreground px-2 py-0.5 rounded-md border border-border/40 font-semibold">
                  SKU: {(product as any).sku}
                </span>
              )}
            </div>

            {/* Badges de Status (Limpos e Sem Repetição) */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isPronta ? (
                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium text-xs gap-1.5 py-1 px-2.5">
                  <Zap className="size-3.5 fill-current" /> Pronta Entrega — Envio Imediato
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20 font-medium text-xs gap-1.5 py-1 px-2.5">
                  <Package className="size-3.5" /> Pré-venda
                </Badge>
              )}

              {product.stock === 1 ? (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium text-xs py-1 px-2.5">
                  Última unidade restante
                </Badge>
              ) : product.stock > 1 ? (
                <Badge variant="outline" className="border-border/40 text-muted-foreground font-medium text-xs py-1 px-2.5">
                  {formatStockRemaining(product)}
                </Badge>
              ) : (
                <Badge variant="destructive" className="font-medium text-xs py-1 px-2.5">
                  Esgotado
                </Badge>
              )}

              {!product.is_open && (
                <Badge variant="destructive" className="font-medium text-xs py-1 px-2.5">
                  Fechado
                </Badge>
              )}
            </div>

            {/* Preço e Parcelamento */}
            <div className="mt-5 space-y-2">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="font-display text-3xl sm:text-4xl font-extrabold text-primary">
                  {brl(unitPriceForChosenOption * quantity)}
                </span>
                {quantity > 1 && (
                  <span className="text-xs text-muted-foreground">
                    ({quantity}x {brl(unitPriceForChosenOption)})
                  </span>
                )}
                {selectedInstallment === 1 && installmentOptions.length > 1 && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    À vista
                  </span>
                )}
              </div>

              {(() => {
                const inst = getProductInstallmentInfo(product, quantity);
                if (!inst) return null;
                return (
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Ou em até <strong className="text-foreground font-medium">{inst.maxInstallments}x de {brl(inst.installmentValue * quantity)}</strong>{" "}
                    {inst.hasSurcharge ? (
                      <span className="text-muted-foreground/80">({brl(inst.totalPrice * quantity)} total parcelado)</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">(sem acréscimo)</span>
                    )}
                  </p>
                );
              })()}

              {/* Destaque exclusivo para Pré-venda (Sinal, Saldo e Prazos) */}
              {!isPronta && (
                <div className="mt-3 pt-3 border-t border-border/20">
                  {!hasNoSignal ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Sinal para garantir:</span>
                        <span className="text-base sm:text-lg font-bold text-primary mt-0.5 block">{brl(downPaymentToPay)}</span>
                        {(product as any).payment_deadline_date ? (
                          <span className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="size-3 text-primary shrink-0" />
                            Até {new Date((product as any).payment_deadline_date + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        ) : product.payment_deadline_hours ? (
                          <span className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Clock className="size-3 text-primary shrink-0" />
                            Prazo: {formatDeadlineHours(product.payment_deadline_hours)}
                          </span>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-border/30 bg-muted/20 p-3">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">Saldo na chegada:</span>
                        <span className="text-base sm:text-lg font-bold text-foreground mt-0.5 block">{brl(remainingBalanceCalculated)}</span>
                        {product.release_date && (
                          <span className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                            <CalendarDays className="size-3 text-primary shrink-0" />
                            Previsão: {new Date(product.release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                        <span>Sem sinal prévio · Pagamento integral na chegada da miniatura</span>
                      </div>
                      {product.release_date && (
                        <span className="text-[11px] text-muted-foreground">
                          Previsão: {new Date(product.release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Observações da Miniatura (Clean & Inline) */}
            {(product as any).observation && (
              <div className="mt-4 rounded-xl border border-border/40 bg-muted/20 px-3.5 py-2.5 flex items-start gap-2.5 text-xs sm:text-sm">
                <Info className="size-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold text-foreground">Observações:</span>{" "}
                  <span className="text-muted-foreground whitespace-pre-line">{(product as any).observation}</span>
                </div>
              </div>
            )}

            {/* Ações de Compra e Quantidade */}
            {product.is_open && product.stock > 0 && isEligibleToBuyWaitlist ? (
              <div className="mt-6 space-y-4 pt-4 border-t border-border/30">
                {/* Controles inline de Quantidade e Forma de Pagamento */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Seletor de Quantidade compacto */}
                  {product.stock > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">Qtd:</span>
                      <div className="flex items-center border border-border/40 rounded-xl bg-muted/20 p-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          disabled={quantity <= 1}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-8 text-center font-bold text-xs sm:text-sm">{quantity}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          onClick={() => setQuantity(Math.min(product.stock, 10, quantity + 1))}
                          disabled={quantity >= Math.min(product.stock, 10)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Opção de Parcelamento (se houver opções) */}
                  {installmentOptions.length > 1 && (
                    <div className="flex-1 min-w-[200px]">
                      <Select
                        value={String(selectedInstallment)}
                        onValueChange={(val) => setSelectedInstallment(Number(val))}
                      >
                        <SelectTrigger className="h-9 rounded-xl bg-muted/20 border-border/40 text-xs">
                          <CreditCard className="size-3.5 text-muted-foreground mr-1.5 shrink-0" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {installmentOptions.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)} className="text-xs">
                              {opt.value === 1
                                ? `À vista — ${brl(opt.totalPrice)}`
                                : `${opt.value}x de ${brl(opt.totalPrice / opt.value)} (Total: ${brl(opt.totalPrice)})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Resumo compacto apenas se quantity > 1 ou se parcelado */}
                {(quantity > 1 || selectedInstallment > 1) && (
                  <div className="rounded-lg bg-muted/20 px-3 py-2 border border-border/20 text-xs flex justify-between items-center text-muted-foreground">
                    <span>Subtotal ({quantity} {quantity === 1 ? "unidade" : "unidades"}):</span>
                    <span className="font-bold text-foreground">
                      {selectedInstallment > 1 ? `${selectedInstallment}x de ${brl(installmentValCalculated)} (${brl(totalPriceCalculated)})` : brl(totalPriceCalculated)}
                    </span>
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <Button
                    size="lg"
                    className="flex-1 h-11 font-bold shadow-md rounded-xl text-white transition-all text-sm"
                    onClick={handleReserve}
                    style={{ backgroundColor: product.stores?.primary_color }}
                    disabled={reserving}
                  >
                    <ShoppingBag className="size-4 mr-2" />
                    {isPronta
                      ? quantity > 1 ? `Comprar ${quantity} unidades` : "Adicionar ao Carrinho"
                      : quantity > 1 ? `Reservar ${quantity} unidades` : "Adicionar ao Carrinho"}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={share}
                    className="h-11 rounded-xl border-border/40 text-muted-foreground hover:text-foreground text-sm"
                  >
                    <Share2 className="size-4 mr-1.5" /> Compartilhar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col sm:flex-row gap-2.5 pt-4 border-t border-border/30">
                <Button
                  size="lg"
                  className="flex-1 h-11 font-bold shadow-md rounded-xl text-white transition-all text-sm"
                  onClick={handleReserve}
                  disabled={
                    !product.is_open ||
                    reserving ||
                    (product.stock > 0 && !isEligibleToBuyWaitlist) ||
                    (product.stock === 0 && isOnWaitlist)
                  }
                  style={product.is_open && product.stock > 0 ? { backgroundColor: product.stores?.primary_color } : undefined}
                >
                  {!product.is_open
                    ? isPronta ? "Item indisponível" : "Pré-venda fechada"
                    : product.stock > 0
                      ? "Estoque reservado p/ fila"
                      : isOnWaitlist
                        ? `Você é o ${userWaitlistIndex + 1}º na fila`
                        : "Entrar na fila de espera"}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={share}
                  className="h-11 rounded-xl border-border/40 text-muted-foreground hover:text-foreground text-sm"
                >
                  <Share2 className="size-4 mr-1.5" /> Compartilhar
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
      <AppFooter storeInfo={product?.stores || undefined} />
    </div>
  );
}
