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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCustomerFromCache } from "@/lib/customerCache";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { brl, whatsappLink } from "@/lib/format";
import { useSession } from "@/lib/session";

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
      // 1. Tentar auto-migrar reservas pendentes por telefone (tanto via profiles quanto via meta)
      if (user) {
        try {
          const { data: currentProf } = await supabase
            .from("profiles")
            .select("phone, name, email")
            .eq("id", user.id)
            .maybeSingle();

          const userEmail = (currentProf?.email || user.email || "").toLowerCase().trim();
          const userPhone = currentProf?.phone || user.user_metadata?.phone || profile?.phone || "";
          const userName = currentProf?.name || user.user_metadata?.name || profile?.name || "";
          const rawPhoneDigits = userPhone ? userPhone.replace(/\D/g, "") : "";
          const lowerName = userName.toLowerCase().trim();

          let migratedCount = 0;

          // 1A. Procurar perfis duplicados no Supabase com o mesmo número de telefone
          if (rawPhoneDigits.length >= 8) {
            const { data: allProfiles } = await supabase.from("profiles").select("id, phone").neq("id", user.id);
            if (allProfiles && allProfiles.length > 0) {
              const duplicateUserIds: string[] = [];
              for (const pItem of allProfiles) {
                if (pItem.phone) {
                  const pDigits = String(pItem.phone).replace(/\D/g, "");
                  if (pDigits.length >= 8 && (rawPhoneDigits.slice(-8) === pDigits.slice(-8) || rawPhoneDigits === pDigits)) {
                    duplicateUserIds.push(pItem.id);
                  }
                }
              }

              if (duplicateUserIds.length > 0) {
                const { data: ordersToMigrate } = await supabase.from("orders").select("id, store_id").in("user_id", duplicateUserIds);
                if (ordersToMigrate && ordersToMigrate.length > 0) {
                  const { error: migErr } = await supabase.from("orders").update({ user_id: user.id }).in("user_id", duplicateUserIds);
                  if (!migErr) {
                    migratedCount += ordersToMigrate.length;
                    for (const oItem of ordersToMigrate) {
                      if (oItem.store_id) {
                        await supabase.from("customer_store_link").upsert({ user_id: user.id, store_id: oItem.store_id }, { onConflict: "user_id,store_id" });
                      }
                    }
                  }
                }
              }
            }
          }

          // 1B. Buscar pedidos com metadados ou cache local
          const { data: candidateOrders } = await supabase
            .from("orders")
            .select("id, pix_key, store_id, user_id")
            .neq("user_id", user.id);

          if (candidateOrders && candidateOrders.length > 0) {
            const { getCustomerFromCache } = await import("@/lib/customerCache");

            for (const orderItem of candidateOrders) {
              let meta: any = null;

              if (orderItem.pix_key && typeof orderItem.pix_key === "string") {
                try {
                  if (orderItem.pix_key.startsWith("GUEST:")) {
                    meta = JSON.parse(orderItem.pix_key.replace(/^GUEST:/, ""));
                  } else if (orderItem.pix_key.startsWith('{"manual_guest":true')) {
                    meta = JSON.parse(orderItem.pix_key);
                  }
                } catch {}
              }

              // Fallback pelo customerCache
              if (!meta) {
                const cached = getCustomerFromCache(orderItem.id) || getCustomerFromCache(orderItem.user_id);
                if (cached) {
                  meta = { name: cached.name, phone: cached.phone, email: cached.email };
                }
              }

              if (meta) {
                const customPixKey = meta.pix || meta.custom_pix || null;
                const metaPhoneDigits = meta.phone ? String(meta.phone).replace(/\D/g, "") : "";
                const metaEmail = (meta.email || "").toLowerCase().trim();
                const metaName = (meta.name || "").toLowerCase().trim();

                const phoneMatch = Boolean(
                  rawPhoneDigits && metaPhoneDigits && (
                    (rawPhoneDigits.length >= 8 && metaPhoneDigits.length >= 8 && rawPhoneDigits.slice(-8) === metaPhoneDigits.slice(-8)) ||
                    rawPhoneDigits === metaPhoneDigits
                  )
                );
                const emailMatch = Boolean(userEmail && metaEmail && userEmail === metaEmail);
                const nameMatch = Boolean(lowerName && metaName && lowerName.length > 2 && lowerName === metaName);

                if (phoneMatch || emailMatch || nameMatch) {
                  const { error: updateErr } = await supabase
                    .from("orders")
                    .update({ user_id: user.id, pix_key: customPixKey })
                    .eq("id", orderItem.id);

                  if (!updateErr) {
                    migratedCount++;
                    if (orderItem.store_id) {
                      await supabase
                        .from("customer_store_link")
                        .upsert({ user_id: user.id, store_id: orderItem.store_id }, { onConflict: "user_id,store_id" })
                        .then(() => undefined)
                        .then(() => undefined);
                    }
                  }
                }
              }
            }
          }

          if (migratedCount > 0) {
            const { toast } = await import("sonner");
            toast.success(`${migratedCount} ${migratedCount === 1 ? "reserva vinculada" : "reservas vinculadas"} à sua conta!`);
          }
        } catch (err) {
          console.error("Erro na auto-migração do painel:", err);
        }
      }

      // 2. Buscar ordens atualizadas do usuário
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(brand, model, image_url, release_date), stores(name, slug, whatsapp_number, pix_key)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE)
        .range(ordersPage * PAGE_SIZE, (ordersPage + 1) * PAGE_SIZE - 1);
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
  const active = useMemo(() => (orders ?? []).filter((o) => {
    if (o.payment_status === "cancelado") return false;
    if (o.pix_key && typeof o.pix_key === "string" && (o.pix_key.startsWith("GUEST:") || o.pix_key.startsWith('{"manual_guest":true'))) {
      return false;
    }
    const cachedGuest = getCustomerFromCache(o.id);
    if (cachedGuest && cachedGuest.phone) return false;
    return true;
  }), [orders]);
  const pendingOrders = useMemo(() => active.filter((o) => o.delivery_status !== "entregue"), [active]);

  // Agrupamento de pedidos por produto e status para exibição consolidada
  const groupedPendingOrders = useMemo(() => {
    const map = new Map<string, { order: (typeof pendingOrders)[0]; quantity: number }>();
    for (const o of pendingOrders) {
      const key = `${o.product_id}_${o.payment_status}_${o.delivery_status}`;
      if (map.has(key)) {
        const item = map.get(key)!;
        item.quantity += 1;
      } else {
        map.set(key, { order: o, quantity: 1 });
      }
    }
    return Array.from(map.values());
  }, [pendingOrders]);
  const deliveredOrders = useMemo(() => active.filter((o) => o.delivery_status === "entregue"), [active]);

  const filteredDeliveredOrders = useMemo(() => {
    return deliveredOrders.filter((o) => {
      if (!garageSearchQuery.trim()) return true;
      const q = garageSearchQuery.toLowerCase().trim();
      const cleanQ = q.replace(/^#/, "");
      
      const prodModel = (o.products?.model || "").toLowerCase();
      const prodBrand = (o.products?.brand || "").toLowerCase();
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
  const paid = useMemo(() => active.reduce((s, o) => s + Number(o.down_payment), 0), [active]);

  if (sessionLoading || ordersLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-border/60 panel">
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
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
        <p className="p-8 text-center text-sm text-muted-foreground">
          Sessão não encontrada. Por favor, faça login novamente.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Meu painel</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Acompanhe reservas, prazos e saldos com as lojas que você segue.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditProfileOpen(true)}
            className="gap-2 border-border/80 hover:bg-accent"
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

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Total reservado" value={brl(total)} />
          <StatCard label="Sinal pago" value={brl(paid)} accent />
          <StatCard label="Saldo devedor" value={brl(total - paid)} />
        </div>

        {feed?.links && feed.links.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <StoreIcon className="size-4 text-primary" /> Lojas onde sou cliente
            </h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {feed.links.map((l) => (
                <Link key={l.store_id} to="/loja/$slug" params={{ slug: l.stores?.slug ?? "" }}>
                  <Card className="panel border-border/60 hover:border-primary/50 transition-colors">
                    <CardContent className="flex items-center gap-3 p-3 px-4">
                      {l.stores?.logo_url ? (
                        <img
                          src={l.stores.logo_url}
                          alt={l.stores.name}
                          className="size-8 rounded-lg object-cover border border-border/40"
                          loading="lazy"
                        />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                          {l.stores?.name ? l.stores.name[0].toUpperCase() : "L"}
                        </span>
                      )}
                      <div>
                        <p className="text-sm font-semibold">{l.stores?.name}</p>
                        <p className="text-xs text-muted-foreground">/loja/{l.stores?.slug}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <Tabs defaultValue="reservas" className="mt-8">
          <TabsList className="w-full flex overflow-x-auto justify-start sm:justify-center whitespace-nowrap p-1 max-w-full">
            <TabsTrigger value="reservas" className="text-xs sm:text-sm">Minhas reservas</TabsTrigger>
            <TabsTrigger value="garagem" className="gap-1.5 text-xs sm:text-sm font-semibold">
              <Car className="size-3.5 text-primary" />
              <span>Minha Garagem ({deliveredOrders.length})</span>
            </TabsTrigger>
            <TabsTrigger value="lojas" className="text-xs sm:text-sm">Lojas seguidas</TabsTrigger>
            <TabsTrigger value="fila" className="text-xs sm:text-sm">Fila de espera</TabsTrigger>
          </TabsList>

          <TabsContent value="reservas" className="mt-4 space-y-3">
            {groupedPendingOrders.map(({ order: o, quantity: qty }) => (
              <Card key={o.id} className="border-border/60 panel">
                <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {o.products?.image_url ? (
                        <img
                          src={o.products.image_url}
                          alt={o.products.model}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <Package className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <span>{o.products?.brand} · {o.stores?.name}</span>
                        {qty > 1 && (
                          <Badge variant="secondary" className="bg-primary/10 text-primary font-bold text-[11px] px-2 py-0 border-primary/20">
                            {qty}x unidades acumuladas
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        {o.products?.model}
                        {qty > 1 && (
                          <span className="text-xs font-normal text-muted-foreground font-mono">({qty} unidades)</span>
                        )}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(() => {
                          const isNoSignalOrder = o.payment_status === "sem_sinal" || (!o.reservation_expires_at && Number(o.down_payment) === 0);
                          const currentPaymentStatus = isNoSignalOrder && o.payment_status === "aguardando_sinal" ? "sem_sinal" : o.payment_status;
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
                    <div className="text-sm sm:text-right">
                      <p className="text-muted-foreground">Total {brl(Number(o.total_price) * qty)}</p>
                      <p className="text-muted-foreground">Sinal {brl(Number(o.down_payment) * qty)}</p>
                      <p className="font-semibold text-primary">
                        Saldo {brl(Number(o.remaining_balance) * qty)}
                      </p>
                    </div>
                    {o.stores?.whatsapp_number && o.payment_status !== "cancelado" && (
                      <Button asChild variant="secondary" size="sm">
                        <a
                          href={whatsappLink(
                            o.stores.whatsapp_number,
                            o.payment_status === "sem_sinal"
                              ? `Olá, gostaria de acompanhar minha reserva de ${qty}x ${o.products?.brand} ${o.products?.model}.`
                              : `Olá, segue o comprovante da reserva de ${qty}x ${o.products?.brand} ${o.products?.model}.`,
                          )}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MessageCircle className="size-4" />
                          {o.payment_status === "sem_sinal" ? "Falar com a loja" : "Comprovante"}
                        </a>
                      </Button>
                    )}
                  </div>

                  {/* BLOCO DA CHAVE PIX DA LOJA */}
                  {o.payment_status !== "quitado" && o.payment_status !== "cancelado" && (() => {
                    const pixKey = o.pix_key || o.stores?.pix_key || o.stores?.whatsapp_number;
                    if (!pixKey) return null;
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-primary/10 p-3 text-xs border border-primary/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <Wallet className="size-4 text-primary shrink-0" />
                          <span className="font-semibold text-foreground">Chave PIX da loja:</span>
                          <code className="bg-background px-2.5 py-1 rounded-lg font-mono text-primary font-bold border border-border/60 select-all">
                            {pixKey}
                          </code>
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
                    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl bg-muted/40 p-3 text-xs border border-border/50">
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck className="size-4 text-primary shrink-0" />
                        <span className="font-semibold text-foreground">Rastreio:</span>
                        <code className="bg-background px-2.5 py-1 rounded-lg font-mono text-primary font-bold border border-border/60 select-all">
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
            {pendingOrders.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-xl">
                Você não possui reservas em andamento no momento.
              </p>
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
          <TabsContent value="garagem" className="mt-4 space-y-4">
            {deliveredOrders.length > 0 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar na garagem por modelo, marca, loja ou #id..."
                  value={garageSearchQuery}
                  onChange={(e) => setGarageSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm w-full md:max-w-md bg-card border-border/60"
                />
              </div>
            )}
            
            {groupedDeliveredOrders.length === 0 ? (
              <Card className="panel border-dashed border-border/60 mt-4">
                <CardContent className="p-8 text-center space-y-2">
                  <Car className="mx-auto size-10 text-muted-foreground/40" />
                  <h3 className="font-bold text-base">
                    {deliveredOrders.length > 0 ? "Nenhuma miniatura encontrada" : "Sua garagem está vazia"}
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
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
                    <Card key={ids[0]} className="panel border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
                      <div className="aspect-video w-full overflow-hidden bg-muted relative">
                        {o.products?.image_url ? (
                          <img
                            src={o.products.image_url}
                            alt={o.products.model}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            <Package className="size-10" />
                          </div>
                        )}
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-emerald-600 text-white font-semibold text-[10px] gap-1 shadow-sm">
                            <CheckCircle2 className="size-3" /> Na Garagem
                          </Badge>
                        </div>
                      </div>
                      <CardContent className="p-4 space-y-1.5">
                        <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5">
                          <span>{o.products?.brand} · {o.stores?.name}</span>
                          {qty > 1 && (
                            <Badge className="bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-bold text-[9px] px-1.5 py-0 border-emerald-500/30 shadow-none">
                              {qty}x
                            </Badge>
                          )}
                        </div>
                        <h4 className="font-bold text-base text-foreground leading-snug flex items-center gap-1">
                          {o.products?.model}
                        </h4>
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40">
                          <span>Valor pago: <strong>{brl(Number(o.total_price) * qty)}</strong></span>
                          <span className="font-mono text-[10px]">#{ids[0].slice(0, 6)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="lojas" className="mt-4">
            <div className="flex flex-wrap gap-2">
              {(feed?.links ?? []).map((l) => (
                <Link key={l.store_id} to="/loja/$slug" params={{ slug: l.stores?.slug ?? "" }}>
                  <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
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
                  <Card className="flex h-full flex-col overflow-hidden border-border/60 panel transition-transform group-hover:-translate-y-1">
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
                          <Badge variant="outline">{p.stock} {p.stock === 1 ? "unidade" : "unidades"}</Badge>
                        </div>

                        <Button
                          size="sm"
                          className="w-full font-semibold gap-1.5 shadow-md"
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

          <TabsContent value="fila" className="mt-4 space-y-3">
            {(waitlist ?? []).map((w) => (
              <Card key={w.id} className="border-border/60 panel">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <h3 className="font-semibold">
                      {w.products?.brand} {w.products?.model}
                    </h3>
                    <p className="text-xs text-muted-foreground">{w.stores?.name}</p>
                  </div>
                  <Badge variant="outline">Na fila</Badge>
                </CardContent>
              </Card>
            ))}
            {waitlist && waitlist.length === 0 && (
              <p className="text-sm text-muted-foreground">Você não está em nenhuma fila.</p>
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
    <Card className="border-border/60 panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`font-display text-2xl font-bold ${accent ? "text-success" : ""}`}>{value}</p>
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
