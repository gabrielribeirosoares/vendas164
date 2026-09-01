import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, Car, CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, Package, Search, Store as StoreIcon, Truck, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PhoneInput } from "@/components/PhoneInput";
import { Countdown } from "@/components/Countdown";
import { DeliveryBadge, PaymentBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderInstallmentsDialog } from "@/components/vendedor/OrderInstallmentsDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { brl, getProductSignalAmount, isProntaEntrega, whatsappLink } from "@/lib/format";
import { formatStockRemaining } from "@/lib/stock";
import { useSession } from "@/lib/session";
import { getStoreFullUrl, getStoreDisplayDomain, redirectToMainIfOnSubdomain } from "@/lib/subdomain";

export const Route = createFileRoute("/_authenticated/painel")({
  head: () => ({
    meta: [
      { title: "Minhas reservas" },
      {
        name: "description",
        content: "Acompanhe suas reservas de miniaturas, sinais pagos, saldo devedor e prazos.",
      },
      { property: "og:title", content: "Minhas reservas" },
      { property: "og:description", content: "Painel do colecionador." },
    ],
  }),
  component: CustomerDashboard,
});

const PAGE_SIZE = 10;

function CustomerDashboard() {
  return (
    <ErrorBoundary>
      <CustomerDashboardContent />
    </ErrorBoundary>
  );
}

function CustomerDashboardContent() {
  const { user, loading: sessionLoading } = useSession();
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [garageSearchQuery, setGarageSearchQuery] = useState("");
  const [ordersPage, setOrdersPage] = useState(0);
  const [waitlistPage, setWaitlistPage] = useState(0);

  // Redirect to main domain if accessed from a store subdomain
  useEffect(() => {
    redirectToMainIfOnSubdomain();
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      // A migração de reservas antigas é feita automaticamente em src/lib/session.ts
      // via a RPC migrate_reservations_by_phone (mais eficiente e sem consultas pesadas).

      // Buscar ordens atualizadas do usuário (excluindo canceladas)
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(*), stores(name, slug, whatsapp_number, pix_key, owner_id), order_installments(*)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
        .range(ordersPage * PAGE_SIZE, (ordersPage + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: garageOrders } = useQuery({
    queryKey: ["my-garage", user?.id],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(*), stores(name, slug, whatsapp_number, pix_key, owner_id), order_installments(*)")
        .eq("user_id", user!.id)
        .eq("delivery_status", "entregue")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const storeName = orders?.[0]?.stores?.name;
    if (storeName) {
      document.title = `${storeName} — Minhas reservas`;
    } else {
      document.title = "Minhas reservas";
    }
  }, [orders]);

  const { data: feed } = useQuery({
    queryKey: ["followed-feed", user?.id],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      const { data: links } = await supabase
        .from("customer_store_link")
        .select("store_id, stores(id, name, slug, logo_url, owner_id)")
        .eq("user_id", user!.id);
      const filtered = (links ?? []).filter((l: any) => l.stores && l.stores.owner_id !== user!.id);
      const ids = filtered.map((l: any) => l.store_id);
      if (ids.length === 0) return { links: [], products: [] };
      const { data: products } = await supabase
        .from("products")
        .select("*, stores(name, slug, primary_color)")
        .in("store_id", ids)
        .eq("is_open", true)
        .order("created_at", { ascending: false });
      return { links: filtered, products: products ?? [] };
    },
  });

  const { data: waitlist } = useQuery({
    queryKey: ["my-waitlist", user?.id, waitlistPage],
    enabled: !!user,
    retry: 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("waitlist")
        .select("id, created_at, products(brand, model), stores(name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
        .range(waitlistPage * PAGE_SIZE, (waitlistPage + 1) * PAGE_SIZE - 1);
      return data ?? [];
    },
  });

  // Separar pedidos em andamento vs entregues/na garagem
  const active = useMemo(() => (orders ?? []).filter((o: any) => {
    if (o.payment_status === "cancelado" || o.delivery_status === "cancelado") return false;
    if (o.delivery_status === "entregue") return false;
    return true;
  }), [orders]);
  
  const activeGarage = useMemo(() => (garageOrders ?? []).filter((o: any) => {
    if (o.payment_status === "cancelado" || o.delivery_status === "cancelado") return false;
    return true;
  }), [garageOrders]);

  const pendingOrders = active;

  // Cada pedido é exibido individualmente pois cada um tem suas próprias parcelas
  const groupedPendingOrders = useMemo(() => {
    return pendingOrders.map(o => ({ order: o, quantity: 1 }));
  }, [pendingOrders]);
  const deliveredOrders = activeGarage;

  const filteredDeliveredOrders = useMemo(() => {
    return deliveredOrders.filter((o: any) => {
      if (!garageSearchQuery.trim()) return true;
      const q = garageSearchQuery.toLowerCase().trim();
      const cleanQ = q.replace(/^#/, "");
      // Usar snapshot quando o produto foi deletado
      const prodModel = (o.products?.model || (o as any).product_model || "").toLowerCase();
      const prodBrand = (o.products?.brand || (o as any).product_brand || "").toLowerCase();
      const storeName = (o.stores?.name || "").toLowerCase();
      const orderId = (o.id || "").toLowerCase();
      return (
        prodModel.includes(q) ||
        prodBrand.includes(q) ||
        storeName.includes(q) ||
        orderId.includes(q) ||
        (cleanQ.length > 0 && orderId.includes(cleanQ))
      );
    });
  }, [deliveredOrders, garageSearchQuery]);

  const groupedDeliveredOrders = useMemo(() => {
    const map = new Map<string, { order: (typeof pendingOrders)[0]; quantity: number; ids: string[] }>();
    for (const o of filteredDeliveredOrders) {
      const key = `${o.product_id}_${o.payment_status}_${o.delivery_status}_${o.store_id}`;
      if (map.has(key)) {
        const item = map.get(key)!;
        item.quantity += 1;
        item.ids.push(o.id);
      } else {
        map.set(key, { order: o, quantity: 1, ids: [o.id] });
      }
    }
    return Array.from(map.values());
  }, [filteredDeliveredOrders]);

  const total = useMemo(() => active.reduce((s, o) => s + Number(o.total_price), 0), [active]);
  const paid = useMemo(() => active.reduce((s, o) => {
    const signalPaid = (o.payment_status === "sinal_pago" || o.payment_status === "quitado") ? Number(o.down_payment || 0) : 0;
    const paidInsts = (o.order_installments || []).filter((i: any) => i.status === "paid").reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
    return s + signalPaid + paidInsts;
  }, 0), [active]);

  if (sessionLoading || ordersLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-10">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-border/30 bg-muted/15">
                <CardContent className="p-5">
                  <Skeleton className="h-3 w-24 mb-3" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Sessão não encontrada. Por favor, faça login novamente.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Meu painel</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acompanhe reservas, prazos e saldos com as lojas que você segue.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditProfileOpen(true)}
            className="gap-2 border-border/40 hover:bg-accent/50"
          >
            <User className="size-4 text-primary" />
            <span>Editar meu perfil</span>
          </Button>
        </div>

        <EditProfileDialog
          user={user}
          profile={profile}
          open={editProfileOpen}
          onOpenChange={setEditProfileOpen}
        />

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total reservado" value={brl(total)} />
          <StatCard label="Sinal pago" value={brl(paid)} accent />
          <StatCard label="Saldo devedor" value={brl(total - paid)} />
        </div>

        {feed?.links && feed.links.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-semibold flex items-center gap-2 text-foreground">
              <StoreIcon className="size-4 text-primary" /> Lojas onde sou cliente
            </h2>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {feed.links.map((l) => (
                <a key={l.store_id} href={getStoreFullUrl(l.stores?.slug ?? "")}>
                  <Card className="border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <CardContent className="flex items-center gap-3 p-3 px-4">
                      {l.stores?.logo_url ? (
                        <img
                          src={l.stores.logo_url}
                          alt={l.stores.name}
                          className="size-8 rounded-lg object-cover border border-border/30"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                          {l.stores?.name ? l.stores.name[0].toUpperCase() : "L"}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-foreground">{l.stores?.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{getStoreDisplayDomain(l.stores?.slug ?? "")}</p>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="reservas" className="mt-10">
          <TabsList className="w-full flex overflow-x-auto justify-start sm:justify-center whitespace-nowrap p-1 max-w-full bg-muted/30">
            <TabsTrigger value="reservas" className="text-xs sm:text-sm">Minhas reservas</TabsTrigger>
            <TabsTrigger value="garagem" className="gap-1.5 text-xs sm:text-sm font-semibold">
              <Car className="size-3.5 text-primary" />
              <span>Minha Garagem ({deliveredOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="lojas" className="text-xs sm:text-sm">Lojas seguidas</TabsTrigger>
            <TabsTrigger value="fila" className="text-xs sm:text-sm">Fila de espera</TabsTrigger>
          </TabsList>

          <TabsContent value="reservas" className="mt-5 space-y-3 overflow-x-hidden">
            {groupedPendingOrders.map(({ order: o, quantity: qty }) => (
              <Card key={o.id} className="border-border/30 bg-card/60 overflow-hidden">
                <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="size-10 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-12">
                      {o.products?.image_url ? (
                        <img
                          src={o.products.image_url}
                          alt={o.products.model}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <Package className="size-4 sm:size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground flex flex-wrap items-center gap-1.5">
                        <span>{o.products?.brand} · {o.stores?.name}</span>
                        {qty > 1 && (
                          <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {qty}x unidades acumuladas
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-base flex flex-wrap items-center gap-2">
                        {o.products?.model}
                        {qty > 1 && (
                          <span className="text-xs font-normal text-muted-foreground font-mono">({qty} unidades)</span>
                        )}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(() => {
                          const currentPaymentStatus = o.payment_status;
                          return (
                            <>
                              <PaymentBadge status={currentPaymentStatus} />
                              <DeliveryBadge status={o.delivery_status} />
                              {currentPaymentStatus === "aguardando_sinal" && o.reservation_expires_at ? (
                                <Countdown expiresAt={o.reservation_expires_at} />
                              ) : (currentPaymentStatus === "sem_sinal" || currentPaymentStatus === "pagar_na_chegada") && (o.products as any)?.release_date ? (
                                <span className="text-xs text-muted-foreground font-mono">
                                  Pagar na chegada ({new Date((o.products as any).release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })})
                                </span>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {(() => {
                      const signalInfo = getProductSignalAmount(o.products, qty);
                      const expectedSignal = signalInfo.amount;
                      const isPronta = o.payment_status === "pronta_entrega" || isProntaEntrega(o.products);
                      const isAguardando = o.payment_status === "aguardando_sinal";
                      const isSinalPago = o.payment_status === "sinal_pago";
                      const isQuitado = o.payment_status === "quitado";
                      const isSemSinal = o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada";

                      return (
                        <div className="text-sm lg:text-right space-y-0.5">
                          <p className="text-xs text-muted-foreground">Total: <span className="font-medium text-foreground">{brl(Number(o.total_price) * qty)} {o.installment_count && o.installment_count > 1 ? `(${o.installment_count}x)` : ""}</span></p>
                          <div className="mt-1 mb-3 flex flex-col gap-3">
                              {(() => {
                                const installments = o.order_installments || [];
                                const paidInsts = installments.filter((i: any) => i.status === "paid");
                                const totalPaidInsts = paidInsts.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
                                const signalPaid = (o.payment_status === "sinal_pago" || o.payment_status === "quitado") ? Number(o.down_payment || 0) : 0;
                                const totalPaid = totalPaidInsts + signalPaid;
                                const totalOrder = Number(o.total_price) * qty;
                                const progress = totalOrder > 0 ? Math.min(100, Math.round((totalPaid / totalOrder) * 100)) : 0;
                                
                                return (
                                  <div className="text-left space-y-1.5 p-3 bg-muted/40 rounded-xl border border-border/50">
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className="font-semibold text-foreground/80">Progresso do Pagamento</span>
                                      <span className="font-bold text-primary">{progress}%</span>
                                    </div>
                                    <div className="w-full bg-muted/80 rounded-full h-2 overflow-hidden border border-border/30">
                                      <div className="bg-primary h-full rounded-full transition-all duration-700 ease-in-out" style={{ width: `${progress}%` }} />
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-2">
                                      Você já pagou <strong className="text-foreground">{brl(totalPaid)}</strong> de {brl(totalOrder)}
                                    </p>
                                  </div>
                                );
                              })()}
                              
                              <div className="flex justify-start lg:justify-end">
                                <OrderInstallmentsDialog
                                  orderId={o.id}
                                  totalPrice={o.total_price * qty}
                                  installmentCount={o.installment_count}
                                  customerName={profile?.name || "Você"}
                                  productName={`${o.products?.brand || ''} ${o.products?.model || ''}`}
                                  isCustomer={true}
                                />
                              </div>
                            </div>
                          {isAguardando ? (
                            <>
                              <p className="text-sm font-bold text-primary">
                                Sinal a pagar: {brl(expectedSignal)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Saldo na chegada: {brl(Math.max(0, (Number(o.total_price) * qty) - expectedSignal))}
                              </p>
                            </>
                          ) : isSinalPago ? (
                            <>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                Sinal pago: {brl(Number(o.down_payment) * qty)}
                              </p>
                              <p className="text-sm font-bold text-primary">
                                Saldo restante: {brl(Number(o.remaining_balance) * qty)}
                              </p>
                            </>
                          ) : isQuitado ? (
                            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                              Totalmente Quitado
                            </p>
                          ) : o.payment_status === "pronta_entrega" || isPronta ? (
                            <>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                Pronta Entrega
                              </p>
                              <p className="text-sm font-bold text-foreground">
                                Total a pagar: {brl(Number(o.total_price) * qty)}
                              </p>
                            </>
                          ) : isSemSinal ? (
                            <>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                                Sem sinal
                              </p>
                              <p className="text-sm font-bold text-foreground">
                                Pagar na chegada: {brl(Number(o.total_price) * qty)}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted-foreground">Cancelado</p>
                          )}
                        </div>
                      );
                    })()}

                    {o.stores?.whatsapp_number && o.payment_status !== "cancelado" && (() => {
                      const isAguardando = o.payment_status === "aguardando_sinal";
                      const signalInfo = getProductSignalAmount(o.products, qty);
                      const expectedSignal = signalInfo.amount;
                      const isPronta = o.payment_status === "pronta_entrega" || isProntaEntrega(o.products);
                      const msg = o.payment_status === "pronta_entrega" || isPronta
                        ? `Olá, gostaria de combinar o pagamento/envio da minha compra a pronta entrega de ${qty}x ${o.products?.brand} ${o.products?.model}.`
                        : o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada"
                          ? `Olá, gostaria de acompanhar minha reserva de ${qty}x ${o.products?.brand} ${o.products?.model}.`
                          : isAguardando
                            ? `Olá, segue o comprovante do sinal de ${brl(expectedSignal)} da reserva de ${qty}x ${o.products?.brand} ${o.products?.model}.`
                            : `Olá, segue o comprovante da reserva de ${qty}x ${o.products?.brand} ${o.products?.model}.`;

                      return (
                        <Button asChild variant="secondary" size="sm" className="w-full lg:w-auto">
                          <a
                            href={whatsappLink(o.stores.whatsapp_number, msg)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle className="size-4" />
                            {o.payment_status === "pronta_entrega" || isPronta ? "Falar com a loja" : o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada" ? "Falar com a loja" : "Comprovante"}
                          </a>
                        </Button>
                      );
                    })()}
                  </div>

                  {/* BLOCO DA CHAVE PIX DA LOJA */}
                  {o.payment_status !== "quitado" && o.payment_status !== "cancelado" && (() => {
                    const pixKey = o.pix_key || o.stores?.pix_key || o.stores?.whatsapp_number;
                    if (!pixKey) return null;
                    const isAguardando = o.payment_status === "aguardando_sinal";
                    const signalInfo = getProductSignalAmount(o.products, qty);
                    const expectedSignal = signalInfo.amount;
                    const pixAmount = isAguardando ? expectedSignal : (Number(o.remaining_balance) * qty);

                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-primary/5 p-3.5 text-xs border border-primary/10">
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <Wallet className="size-4 text-primary shrink-0" />
                          <span className="font-semibold text-foreground">Chave PIX da loja:</span>
                          <code className="bg-background/80 px-2.5 py-1 rounded-lg font-mono text-primary font-bold border border-border/30 select-all">
                            {pixKey}
                          </code>
                          {pixAmount > 0 && (
                            <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                              {isAguardando ? `Valor do sinal: ${brl(pixAmount)}` : `Valor a transferir: ${brl(pixAmount)}`}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 px-3 text-[11px] font-semibold gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(pixKey);
                            toast.success("Chave PIX copiada para a área de transferência!");
                          }}
                        >
                          <Copy className="size-3" /> Copiar PIX
                        </Button>
                      </div>
                    );
                  })()}

                  {/* BLOCO DO CÓDIGO DE RASTREIO DOS CORREIOS */}
                  {o.tracking_code && (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-muted/20 p-3.5 text-xs border border-border/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck className="size-4 text-primary shrink-0" />
                        <span className="font-semibold text-foreground">Rastreio:</span>
                        <code className="bg-background/80 px-2.5 py-1 rounded-lg font-mono text-primary font-bold border border-border/30 select-all">
                          {o.tracking_code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            navigator.clipboard.writeText(o.tracking_code!);
                            toast.success("Código de rastreio copiado!");
                          }}
                        >
                          <Copy className="size-3" /> Copiar
                        </Button>
                      </div>
                      <a
                        href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(o.tracking_code)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Rastrear nos Correios <ExternalLink className="size-3" />
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {!ordersLoading && groupedPendingOrders.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Você não possui reservas em andamento no momento.</p>
            )}
            {(orders ?? []).length >= PAGE_SIZE && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm" onClick={() => setOrdersPage((p) => p + 1)}>
                  Carregar mais reservas
                </Button>
              </div>
            )}
          </TabsContent>

          {/* ABA GARAGEM (COLEÇÃO ENTREGUE) */}
          <TabsContent value="garagem" className="mt-5 space-y-4">
            {deliveredOrders.length > 0 && (
              <div className="relative mb-5">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar na garagem por modelo, marca, loja ou #id..."
                  value={garageSearchQuery}
                  onChange={(e) => setGarageSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm w-full md:max-w-md bg-muted/20 border-border/30"
                />
              </div>
            )}
            
            {groupedDeliveredOrders.length === 0 ? (
              <Card className="border-border/30 bg-muted/15 mt-4">
                <CardContent className="p-8 text-center space-y-3">
                  <Car className="mx-auto size-10 text-muted-foreground/60" />
                  <h3 className="font-bold text-base text-foreground">
                    {deliveredOrders.length > 0 ? "Nenhuma miniatura encontrada" : "Sua garagem está vazia"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                    {deliveredOrders.length > 0 
                      ? "Tente buscar por outro termo."
                      : "Assim que suas reservas forem quitadas ou entregues pelo lojista, as miniaturas aparecerão automaticamente aqui na sua Garagem Colecionável!"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {groupedDeliveredOrders.map((item) => {
                  const { order: o, quantity: qty, ids } = item;
                  return (
                    <Card key={ids[0]} className="border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
                      <div className="aspect-video w-full overflow-hidden bg-muted relative">
                        {(o.products?.image_url || (o as any).product_image_url) ? (
                          <img
                            src={o.products?.image_url || (o as any).product_image_url}
                            alt={o.products?.model || (o as any).product_model}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            <Package className="size-10" />
                          </div>
                        )}
                        <div className="absolute top-2.5 right-2.5">
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold text-[10px] gap-1 border border-emerald-500/20 shadow-none">
                            <CheckCircle2 className="size-3" /> Na Garagem
                          </Badge>
                        </div>
                      </div>
                      <CardContent className="p-4 space-y-2">
                        <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                          <span>{o.products?.brand || (o as any).product_brand} · {o.stores?.name}</span>
                          {qty > 1 && (
                            <span className="font-bold text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 bg-emerald-500/10 rounded-full">
                              {qty}x
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-base text-foreground leading-snug">{o.products?.model || (o as any).product_model}</h4>
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2.5 border-t border-border/20">
                          <span>Valor pago: <strong className="text-foreground font-semibold">{brl(Number(o.total_price) * qty)}</strong></span>
                          <span className="font-mono text-[10px] text-muted-foreground">#{ids[0].slice(0, 6)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="lojas" className="mt-5">
            <div className="flex flex-wrap gap-2.5">
              {(feed?.links ?? []).map((l) => (
                <Link key={l.store_id} to="/loja/$slug" params={{ slug: l.stores?.slug ?? "" }}>
                  <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 bg-muted/30 border-border/30 hover:bg-muted/50 transition-colors">
                    <StoreIcon className="size-3.5" /> {l.stores?.name}
                  </Badge>
                </Link>
              ))}
              {feed && feed.links.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Você ainda não segue nenhuma loja. Use o link de convite de uma loja.
                </p>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(feed?.products ?? []).map((p: any) => (
                <Link key={p.id} to="/loja/$slug/$itemSlug" params={{ slug: p.stores?.slug ?? "loja", itemSlug: p.slug || p.id }} className="group">
                  <Card className="flex h-full flex-col overflow-hidden border-border/30 bg-card/60 transition-transform group-hover:-translate-y-1">
                    <div className="relative aspect-video w-full overflow-hidden bg-muted">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={`${p.brand} ${p.model}`}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105 duration-300"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <Package className="size-8" />
                        </div>
                      )}
                      <div
                        className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-transform group-hover:scale-105"
                        style={{ backgroundColor: p.stores?.primary_color || "#e11d48" }}
                      >
                        <BookmarkCheck className="size-3.5" />
                        <span>Reservar</span>
                      </div>
                    </div>

                    <CardContent className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {p.brand} · {p.stores?.name}
                        </p>
                        <h3 className="mt-1 font-semibold">{p.model}</h3>
                      </div>

                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span
                            className="font-display text-lg font-bold"
                            style={{ color: p.stores?.primary_color || "#e11d48" }}
                          >
                            {brl(Number(p.price))}
                          </span>
                          <Badge variant="outline" className="border-border/40 text-xs">
                            {formatStockRemaining(p)}
                          </Badge>
                        </div>

                        <Button
                          size="sm"
                          className="w-full font-semibold gap-1.5"
                          style={{ backgroundColor: p.stores?.primary_color || "#e11d48", color: "#fff" }}
                        >
                          <BookmarkCheck className="size-4 shrink-0" />
                          Reservar unidade
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="fila" className="mt-5 space-y-3">
            {(waitlist ?? []).map((w) => (
              <Card key={w.id} className="border-border/30 bg-card/60">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <h3 className="font-semibold">
                      {w.products?.brand} {w.products?.model}
                    </h3>
                    <p className="text-xs text-muted-foreground">{w.stores?.name}</p>
                  </div>
                  <Badge variant="outline" className="border-border/40 text-muted-foreground">Na fila</Badge>
                </CardContent>
              </Card>
            ))}
            {waitlist && waitlist.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">Você não está em nenhuma fila.</p>
            )}
            {(waitlist ?? []).length >= PAGE_SIZE && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" size="sm" onClick={() => setWaitlistPage((p) => p + 1)}>
                  Carregar mais
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AppFooter />
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="border-border/30 bg-muted/15">
      <CardHeader className="pb-2 pt-5">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`font-display text-2xl font-bold tracking-tight ${accent ? "text-success" : "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EditProfileDialog({
  user,
  profile,
  open,
  onOpenChange,
}: {
  user: any;
  profile: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? "");
      setPhone(profile.phone ?? "");
    } else if (user) {
      setName(user.user_metadata?.name ?? "");
      setPhone(user.user_metadata?.phone ?? "");
    }
  }, [profile, user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Por favor, informe seu nome.");
    setSaving(true);

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      name: name.trim(),
      email: user.email,
      phone: phone.trim() || null,
    });

    setSaving(false);
    if (error) return toast.error("Não foi possível salvar o perfil.");

    queryClient.invalidateQueries();
    toast.success("Perfil atualizado com sucesso!");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md panel border-border/60">
        <DialogHeader>
          <DialogTitle className="text-xl">Editar Perfil Pessoal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="prof-email">E-mail</Label>
            <Input id="prof-email" value={user?.email || ""} disabled className="bg-muted/50 font-mono text-sm" />
            <p className="text-xs text-muted-foreground">O e-mail da sua conta não pode ser alterado.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-name">Nome completo</Label>
            <Input
              id="prof-name"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prof-phone">WhatsApp</Label>
            <PhoneInput id="prof-phone" value={phone} onChange={setPhone} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar Perfil
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
