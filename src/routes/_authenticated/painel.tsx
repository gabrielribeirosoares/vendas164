import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, Package, Store as StoreIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Countdown } from "@/components/Countdown";
import { DeliveryBadge, PaymentBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function CustomerDashboard() {
  const { user, loading: sessionLoading } = useSession();

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(brand, model, image_url), stores(name, slug, whatsapp_number)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
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
        .select("*, stores(name, slug)")
        .in("store_id", ids)
        .eq("is_open", true)
        .order("created_at", { ascending: false });
      return { links: filtered, products: products ?? [] };
    },
  });

  const { data: waitlist } = useQuery({
    queryKey: ["my-waitlist", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("waitlist")
        .select("id, created_at, products(brand, model), stores(name)")
        .eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const active = (orders ?? []).filter((o) => o.payment_status !== "cancelado");
  const total = active.reduce((s, o) => s + Number(o.total_price), 0);
  const paid = active.reduce((s, o) => s + Number(o.down_payment), 0);

  if (sessionLoading || ordersLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando…</p>
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
        <h1 className="text-2xl font-bold">Meu painel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe reservas, prazos e saldos com as lojas que você segue.
        </p>

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
          <TabsList>
            <TabsTrigger value="reservas">Minhas reservas</TabsTrigger>
            <TabsTrigger value="lojas">Lojas seguidas</TabsTrigger>
            <TabsTrigger value="fila">Fila de espera</TabsTrigger>
          </TabsList>

          <TabsContent value="reservas" className="mt-4 space-y-3">
            {(orders ?? []).map((o) => (
              <Card key={o.id} className="border-border/60 panel">
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
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
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {o.products?.brand} · {o.stores?.name}
                    </p>
                    <h3 className="font-semibold">{o.products?.model}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PaymentBadge status={o.payment_status} />
                      <DeliveryBadge status={o.delivery_status} />
                      {o.payment_status === "aguardando_sinal" && o.reservation_expires_at && (
                        <Countdown expiresAt={o.reservation_expires_at} />
                      )}
                    </div>
                  </div>
                  <div className="text-sm sm:text-right">
                    <p className="text-muted-foreground">Total {brl(Number(o.total_price))}</p>
                    <p className="text-muted-foreground">Sinal {brl(Number(o.down_payment))}</p>
                    <p className="font-semibold text-primary">
                      Saldo {brl(Number(o.remaining_balance))}
                    </p>
                  </div>
                  {o.stores?.whatsapp_number && o.payment_status !== "cancelado" && (
                    <Button asChild variant="secondary" size="sm">
                      <a
                        href={whatsappLink(
                          o.stores.whatsapp_number,
                          `Olá, segue o comprovante do pedido #${o.id.slice(0, 8)} da miniatura ${o.products?.brand} ${o.products?.model}.`,
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <MessageCircle className="size-4" /> Comprovante
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {orders && orders.length === 0 && (
              <p className="text-sm text-muted-foreground">Você ainda não tem reservas.</p>
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
              {(feed?.products ?? []).map((p) => (
                <Link key={p.id} to="/produto/$id" params={{ id: p.id }} className="group">
                  <Card className="h-full border-border/60 panel transition-transform group-hover:-translate-y-1">
                    <CardContent className="p-4">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {p.brand} · {p.stores?.name}
                      </p>
                      <h3 className="mt-1 font-semibold">{p.model}</h3>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-display font-bold text-primary">
                          {brl(Number(p.price))}
                        </span>
                        <Badge variant="outline">{p.stock} cotas</Badge>
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
          </TabsContent>
        </Tabs>
      </main>
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
