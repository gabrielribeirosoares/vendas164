import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, Copy, ExternalLink, Loader2, MessageCircle, Package, Store as StoreIcon, Truck, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PhoneInput } from "@/components/PhoneInput";
import { Countdown } from "@/components/Countdown";
import { DeliveryBadge, PaymentBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(brand, model, image_url), stores(name, slug, whatsapp_number, pix_key)")
        .eq("user_id", user!.id)
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
            <TabsTrigger value="lojas" className="text-xs sm:text-sm">Lojas seguidas</TabsTrigger>
            <TabsTrigger value="fila" className="text-xs sm:text-sm">Fila de espera</TabsTrigger>
          </TabsList>

          <TabsContent value="reservas" className="mt-4 space-y-3">
            {(orders ?? []).map((o) => (
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
              {(feed?.products ?? []).map((p: any) => (
                <Link key={p.id} to="/produto/$id" params={{ id: p.id }} className="group">
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
                          <Badge variant="outline">{p.stock} cotas</Badge>
                        </div>

                        <Button
                          size="sm"
                          className="w-full font-semibold gap-1.5 shadow-md"
                          style={{ backgroundColor: p.stores?.primary_color || "#e11d48", color: "#fff" }}
                        >
                          <BookmarkCheck className="size-4 shrink-0" />
                          Reservar cota
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
