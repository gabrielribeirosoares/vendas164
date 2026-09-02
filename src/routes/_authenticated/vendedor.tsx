import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  Loader2,
  Package,
  Palette,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
  Sparkles,
  Settings,
  Crown,
  Calendar,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { getStoreFullUrl, getStoreDisplayDomain, redirectToMainIfOnSubdomain } from "@/lib/subdomain";
import { PhoneInput } from "@/components/PhoneInput";
import { getCustomerFromCache } from "@/lib/customerCache";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { brl, slugify } from "@/lib/format";
import { useSession } from "@/lib/session";
import { OrdersTab, type OrderRow } from "@/components/vendedor/OrderManager";
import { BrandingTab } from "@/components/vendedor/StoreSettings";
import { ClientsTab } from "@/components/vendedor/ClientsManager";
import { SmartNotifications } from "@/components/vendedor/SmartNotifications";
import { ProductsTab } from "@/components/vendedor/ProductManager";
import { SellerOverview } from "@/components/vendedor/SellerOverview";
import { InstallmentsManager } from "@/components/vendedor/InstallmentsManager";
import { TrackingIntegration } from "@/components/vendedor/TrackingIntegration";
import { RefreshCw } from "lucide-react";

export function parseStoreSubscription(store: any) {
  const status = store?.status;

  // Assinante ativo permanente (definido pelo admin ou status 'active')
  if (status === "subscriber" || status === "active" || status === "active_subscriber") {
    return {
      type: "subscriber" as const,
      isSubscriber: true,
      isTrial: false,
      isRejected: false,
      isPending: false,
      daysRemaining: 0,
      expiredDays: 0,
      label: "Assinante Ativo",
      badgeColor: "emerald",
    };
  }

  if (status === "rejected" || status === "suspended") {
    return {
      type: "rejected" as const,
      isSubscriber: false,
      isTrial: false,
      isRejected: true,
      isPending: false,
      daysRemaining: 0,
      expiredDays: 0,
      label: "Suspenso / Bloqueado",
      badgeColor: "destructive",
    };
  }

  if (status === "pending") {
    return {
      type: "pending" as const,
      isSubscriber: false,
      isTrial: false,
      isRejected: false,
      isPending: true,
      daysRemaining: 0,
      expiredDays: 0,
      label: "Aguardando Aprovação",
      badgeColor: "amber",
    };
  }

  // Se for trial com data personalizada (ex: "trial:2026-09-30") ou "trial"
  let expiryTime: number;
  if (typeof status === "string" && status.startsWith("trial:")) {
    const dateStr = status.replace("trial:", "");
    expiryTime = new Date(`${dateStr}T23:59:59`).getTime();
  } else {
    // Trial padrão de 14 dias a partir de created_at
    const createdTime = store?.created_at ? new Date(store.created_at).getTime() : Date.now();
    expiryTime = createdTime + 14 * 24 * 60 * 60 * 1000;
  }

  const now = Date.now();
  const diffDays = (expiryTime - now) / (1000 * 60 * 60 * 24);
  const remaining = Math.max(0, Math.ceil(diffDays));

  if (remaining > 0) {
    return {
      type: "trial" as const,
      isSubscriber: false,
      isTrial: true,
      isRejected: false,
      isPending: false,
      daysRemaining: remaining,
      expiredDays: 0,
      label: `Trial: ${remaining}d restantes`,
      badgeColor: "emerald",
    };
  }

  const expiredAgo = Math.max(1, Math.ceil(-diffDays));
  return {
    type: "expired" as const,
    isSubscriber: false,
    isTrial: false,
    isRejected: false,
    isPending: false,
    daysRemaining: 0,
    expiredDays: expiredAgo,
    label: `Trial Expirado (+${expiredAgo}d)`,
    badgeColor: "amber",
  };
}

export const Route = createFileRoute("/_authenticated/vendedor")({
  validateSearch: (search) => {
    return {
      tab: search.tab,
    };
  },
  head: () => ({
    meta: [
      { title: "Painel do lojista" },
      {
        name: "description",
        content:
          "Gerencie pré-vendas, pronta entrega, unidades, sinais recebidos, saldo a receber e a identidade da sua loja.",
      },
      { property: "og:title", content: "Painel do lojista" },
      { property: "og:description", content: "Gestão completa de pré-vendas e pronta entrega de miniaturas." },
    ],
  }),
  component: SellerDashboard,
});

function SellerDashboard() {
  const { user, loading: sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const search = Route.useSearch() as { tab?: string };
  const activeTab = search.tab || "produtos";
  const setActiveTab = (tab: string) => navigate({ search: { tab }, replace: true });
  const [trialDismissed, setTrialDismissed] = useState(false);

  // If accessed from a store subdomain (e.g. teste.localhost:8080/vendedor),
  // redirect back to the main platform domain.
  useEffect(() => {
    redirectToMainIfOnSubdomain();
  }, []);

  const { data: store, isLoading } = useQuery({
    queryKey: ["my-store", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("owner_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const subInfo = useMemo(() => {
    return parseStoreSubscription(store);
  }, [store]);

  const showTrialBanner = subInfo.isTrial && !trialDismissed && !localStorage.getItem(`dismiss_trial_${store?.id}`);

  const handleDismissTrial = () => {
    if (store?.id) {
      localStorage.setItem(`dismiss_trial_${store.id}`, "true");
    }
    setTrialDismissed(true);
  };

  useEffect(() => {
    if (store?.name) {
      if (activeTab === "reservas") {
        document.title = `${store.name} — Reservas`;
      } else if (activeTab === "loja") {
        document.title = `${store.name} — Personalização`;
      } else if (activeTab === "pronta_entrega") {
        document.title = `${store.name} — Pronta Entrega`;
       } else if (activeTab === "clientes") {
        document.title = `${store.name} — Clientes`;
      } else if (activeTab === "rastreamento") {
        document.title = `${store.name} — Rastreamento`;
      } else {
        document.title = `${store.name} — Pré-vendas`;
      }
    }
  }, [store?.name, activeTab]);


  const { data: profile } = useQuery({
    queryKey: ["my-profile-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  // Verificar se o usuário atual é SuperAdmin (gabrielribeirosoares@hotmail.com)
  const isAdmin =
    (profile as any)?.is_admin === true ||
    user?.id === "5fb17599-28a0-4c1c-92cf-38176f7d57a2" ||
    user?.email?.toLowerCase() === "gabrielribeirosoares@hotmail.com" ||
    user?.email?.includes("triade");

  const { data: products } = useQuery({
    queryKey: ["store-products", store?.id],
    enabled: !!store,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["store-orders", store?.id],
    enabled: !!store,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, products(*), order_installments(*)")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = data ?? [];
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      const { data: people } = userIds.length
        ? await supabase.from("profiles").select("id, name, email, phone").in("id", userIds)
        : { data: [] };
      const byId = new Map((people ?? []).map((p) => [p.id, p]));
      return rows.map((r) => {
        const p = byId.get(r.user_id);
        const cached = getCustomerFromCache(r.user_id);
        const name = p?.name || cached?.name || null;
        const email = p?.email || cached?.email || null;
        const phone = p?.phone || cached?.phone || null;

        const profileData = (p || cached)
          ? {
              name,
              email,
              phone,
            }
          : null;

        return { ...r, profiles: profileData };
      });
    },
  });

  const totals = useMemo(() => {
    const active = (orders ?? []).filter((o) => o.payment_status !== "cancelado");
    const projected = active.reduce((s, o) => s + Number(o.total_price), 0);
    const received = active.reduce((s, o) => {
      const totalPrice = Number(o.total_price || 0);
      const signalPaid = (o.payment_status === "sinal_pago" || o.payment_status === "quitado") ? Number(o.down_payment || 0) : 0;
      const paidInsts = (o.order_installments || []).filter((i: any) => i.status === "paid").reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
      const orderReceived = Math.min(totalPrice, signalPaid + paidInsts);
      return s + orderReceived;
    }, 0);
    const pending = Math.max(0, projected - received);
    const avgTicket = active.length > 0 ? projected / active.length : 0;
    const paidInFull = active.filter(o => o.payment_status === "quitado").length;
    return {
      projected,
      received,
      pending,
      activeCount: active.length,
      avgTicket,
      paidInFull,
    };
  }, [orders]);

  const brandData = useMemo(() => {
    const counts: Record<string, number> = {};
    (orders || []).forEach(o => {
      if (o.payment_status === "cancelado" || (o as any).delivery_status === "cancelado") return;
      const b = o.products?.brand || "Outros";
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [orders]);

  if (sessionLoading || isLoading) {
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

  if (!store) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <CreateStore onCreated={() => queryClient.invalidateQueries()} userId={user.id} userEmail={user.email} />
      </div>
    );
  }

  if (subInfo.isRejected) {
    return (
      <div className="min-h-screen">
        <AppHeader store={store} />
        <main className="mx-auto max-w-xl px-4 py-12">
          <Card className="panel border-destructive/30 bg-destructive/5">
            <CardHeader className="text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
                <ShieldAlert className="size-8" />
              </div>
              <CardTitle className="text-2xl font-bold text-destructive">Loja Suspensa / Não Aprovada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-muted-foreground text-sm">
                A loja <strong>{store.name}</strong> está suspensa ou desativada pelo administrador.
              </p>
              {(store as any).rejection_reason && (
                <div className="rounded-xl border border-destructive/20 bg-background/60 p-4 text-left">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Observação do Administrador:</p>
                  <p className="text-sm text-foreground">{(store as any).rejection_reason}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Entre em contato com o suporte do site se precisar de mais detalhes ou para regularizar sua conta.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader store={store} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* Banner de Boas-Vindas / Trial Liberado (Apenas se estiver em Trial) */}
        {showTrialBanner && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-background to-primary/10 p-4 shadow-sm relative">
            <div className="flex items-center gap-3 pr-6 sm:pr-0">
              <div className="size-10 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-foreground">Período de Teste Gratuito ({subInfo.daysRemaining} {subInfo.daysRemaining === 1 ? "dia restante" : "dias restantes"})</span>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-[10px]">
                    Acesso Total Liberado
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cadastre seus lançamentos e pronta entrega, compartilhe o link com colecionadores e receba pagamentos via PIX sem taxas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismissTrial}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/40 transition-colors"
              title="Fechar aviso"
            >
              <XCircle className="size-4" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
              {subInfo.isSubscriber && (
                <Badge className="bg-emerald-600 text-white gap-1 text-[11px] font-semibold">
                  <Crown className="size-3" /> Assinante Pro
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-mono">{getStoreDisplayDomain(store.slug)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {isAdmin && (
              <Button
                variant={activeTab === "admin_moderation" ? "default" : "outline"}
                className="gap-2 border-amber-500/30 text-amber-600 hover:text-amber-500 text-xs"
                onClick={() => setActiveTab("admin_moderation")}
              >
                <ShieldCheck className="size-4" /> Moderação ({activeTab === "admin_moderation" ? "Aberta" : "Admin"})
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              asChild
            >
              <a href={getStoreFullUrl(store.slug)} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" /> Ver minha loja
              </a>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => {
                navigator.clipboard.writeText(
                  getStoreFullUrl(store.slug),
                );
                toast.success("Link da loja copiado!");
              }}
            >
              <Copy className="size-3.5 mr-1" /> Copiar link da loja
            </Button>
          </div>
        </div>

        <SmartNotifications products={products ?? []} orders={orders ?? []} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-10">
          <TabsList className="hidden md:flex w-full overflow-x-auto justify-start sm:justify-center whitespace-nowrap p-1 max-w-full bg-muted/30">
            <TabsTrigger value="produtos" className="gap-1.5 text-xs sm:text-sm">
              <Package className="size-3.5" /> Pré-vendas
            </TabsTrigger>
            <TabsTrigger value="pronta_entrega" className="gap-1.5 text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
              <Zap className="size-3.5 fill-emerald-500 text-emerald-500" /> Pronta Entrega
            </TabsTrigger>
            <TabsTrigger value="reservas" className="text-xs sm:text-sm">Reservas</TabsTrigger>
            <TabsTrigger value="cobrancas" className="gap-1.5 text-xs sm:text-sm">
              <Calendar className="size-3.5" /> Cobranças
            </TabsTrigger>
            <TabsTrigger value="clientes" className="text-xs sm:text-sm">Clientes</TabsTrigger>
            <TabsTrigger value="rastreamento" className="text-xs sm:text-sm text-blue-600 dark:text-blue-400">
              <RefreshCw className="size-3.5" /> Rastreamento
            </TabsTrigger>
            <TabsTrigger value="loja" className="gap-1.5 text-xs sm:text-sm">
              <Palette className="size-3.5" /> Personalização
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="admin_moderation" className="gap-1.5 text-xs sm:text-sm text-amber-600">
                <ShieldCheck className="size-3.5" /> Moderação
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="produtos" className="mt-5">
            <ProductsTab mode="pre_venda" store={store} products={products ?? []} userId={user!.id} onSelectTab={setActiveTab} />
          </TabsContent>

          <TabsContent value="pronta_entrega" className="mt-5">
            <ProductsTab mode="pronta_entrega" store={store} products={products ?? []} userId={user!.id} onSelectTab={setActiveTab} />
          </TabsContent>

          <TabsContent value="reservas" className="mt-5 space-y-6">
            <SellerOverview totals={totals} brandData={brandData} />
            <OrdersTab storeId={store.id} storeColor={store.primary_color} products={products ?? []} orders={orders ?? []} />
          </TabsContent>

          <TabsContent value="cobrancas" className="mt-5">
            <InstallmentsManager storeId={store.id} />
          </TabsContent>

           <TabsContent value="clientes" className="mt-5">
            <ClientsTab orders={orders ?? []} storeId={store?.id} />
          </TabsContent>

          <TabsContent value="rastreamento" className="mt-5 space-y-6">
            <TrackingIntegration storeId={store.id} />
          </TabsContent>

          <TabsContent value="loja" className="mt-5">
            <BrandingTab store={store} userId={user!.id} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="admin_moderation" className="mt-5">
              <AdminModerationPanel />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}

function CreateStore({ userId, userEmail, onCreated }: { userId: string; userEmail?: string; onCreated: () => void; isAdmin?: boolean }) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [contactEmail, setContactEmail] = useState(userEmail || "");
  const [contactInstagram, setContactInstagram] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanSlug = slugify(cleanName);
    if (!cleanSlug) return toast.error("Por favor, insira um nome válido para a loja.");

    setSaving(true);

    const { data: existing } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (existing) {
      setSaving(false);
      return toast.error("Já existe uma loja cadastrada com este nome. Por favor, escolha outro nome para sua loja.");
    }

    // Calcula 14 dias a partir de hoje para o trial
    const targetDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const initialStatus = `trial:${targetDate}`;

    const formattedInstagram = contactInstagram.trim()
      ? (contactInstagram.trim().startsWith("@") ? contactInstagram.trim() : `@${contactInstagram.trim()}`)
      : null;

    const insertPayload: any = {
      owner_id: userId,
      name: cleanName,
      slug: cleanSlug,
      whatsapp_number: whatsapp.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_instagram: formattedInstagram,
      description: description.trim() || null,
      status: initialStatus,
    };

    let { error } = await supabase.from("stores").insert(insertPayload);

    if (error && (error.code === "PGRST204" || error.message?.includes("status"))) {
      delete insertPayload.status;
      const retry = await supabase.from("stores").insert(insertPayload);
      error = retry.error;
    }

    setSaving(false);
    if (error) return toast.error("Não foi possível criar a loja.");
    
    toast.success("🎉 Loja criada com sucesso! Período de teste de 14 dias liberado.");
    onCreated();
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <Card className="panel border-border/60">
        <CardHeader>
          <CardTitle className="text-2xl">Abrir minha loja</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="store-name">Nome da loja</Label>
              <Input
                id="store-name"
                required
                maxLength={60}
                placeholder="Ex: Garagem Diecast 1:64"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-whats">WhatsApp de Atendimento</Label>
              <PhoneInput
                id="store-whats"
                required
                value={whatsapp}
                onChange={setWhatsapp}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="store-email">E-mail de Contato</Label>
                <Input
                  id="store-email"
                  type="email"
                  placeholder="contato@sualoja.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="store-insta">Perfil do Instagram</Label>
                <Input
                  id="store-insta"
                  placeholder="@sualoja"
                  value={contactInstagram}
                  onChange={(e) => setContactInstagram(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-desc">Descrição</Label>
              <Textarea
                id="store-desc"
                maxLength={280}
                placeholder="Conte um pouco sobre sua loja e quais marcas você comercializa..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full font-bold" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Criar loja
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function AdminModerationPanel() {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Estado do Modal de Gerenciamento de Assinatura e Dias de Teste
  const [managingStore, setManagingStore] = useState<any>(null);
  const [selectedPlanType, setSelectedPlanType] = useState<"subscriber" | "trial" | "rejected">("subscriber");
  const [customDays, setCustomDays] = useState<number>(14);
  const [customExpiryDate, setCustomExpiryDate] = useState<string>("");
  const [adminNote, setAdminNote] = useState<string>("");

  const { data: allStores, isLoading } = useQuery({
    queryKey: ["admin-all-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ownerIds = [...new Set((data ?? []).map((s) => s.owner_id))];
      const { data: profiles } = ownerIds.length
        ? await supabase.from("profiles").select("id, name, email, phone").in("id", ownerIds)
        : { data: [] };
        
      const storeIds = (data ?? []).map(s => s.id);
      const { data: orders } = storeIds.length
        ? await supabase.from("orders").select("store_id, total_price, payment_status, products(*)").in("store_id", storeIds)
        : { data: [] };
      
      const salesMap = new Map();
      orders?.forEach(order => {
         if (order.payment_status === "cancelado" || (order as any).delivery_status === "cancelado") return;
         const current = salesMap.get(order.store_id) || { total_amount: 0, total_orders: 0, total_profit: 0, has_cost: false };
         current.total_orders += 1;
         current.total_amount += order.total_price || 0;
         
         const cost = (order.products as any)?.cost_price;
         if (cost != null && Number(cost) > 0) {
           current.has_cost = true;
           current.total_profit += (order.total_price || 0) - Number(cost);
         }
         
         salesMap.set(order.store_id, current);
      });
      
      const profilesMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((s) => ({
        ...s,
        owner: profilesMap.get(s.owner_id) ?? null,
        sales: salesMap.get(s.id) ?? { total_amount: 0, total_orders: 0 }
      }));
    },
  });

  const openManageModal = (st: any) => {
    setManagingStore(st);
    const sub = parseStoreSubscription(st);
    if (sub.isSubscriber) {
      setSelectedPlanType("subscriber");
    } else if (sub.isRejected) {
      setSelectedPlanType("rejected");
    } else {
      setSelectedPlanType("trial");
    }
    setCustomDays(14);
    const targetDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    setCustomExpiryDate(targetDate);
    setAdminNote(st.rejection_reason || "");
  };

  const handleAddDays = (days: number) => {
    setCustomDays(days);
    const targetDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    setCustomExpiryDate(targetDate);
  };

  async function saveStoreSubscription() {
    if (!managingStore) return;
    setSubmitting(true);

    let newStatus = "active";
    if (selectedPlanType === "subscriber") {
      newStatus = "active"; // Assinante Ativo permanente
    } else if (selectedPlanType === "rejected") {
      newStatus = "rejected";
    } else if (selectedPlanType === "trial") {
      const dateToSave = customExpiryDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      newStatus = `trial:${dateToSave}`;
    }

    const updatePayload: any = { status: newStatus };
    if (adminNote.trim()) {
      updatePayload.rejection_reason = adminNote.trim();
    }

    let { error, data } = await supabase
      .from("stores")
      .update(updatePayload)
      .eq("id", managingStore.id)
      .select();

    if (error && (error.code === "PGRST204" || error.message?.includes("rejection_reason"))) {
      delete updatePayload.rejection_reason;
      const retry = await supabase.from("stores").update(updatePayload).eq("id", managingStore.id).select();
      error = retry.error;
      data = retry.data;
    }

    setSubmitting(false);

    if (error) {
      toast.error(`Erro ao atualizar assinatura: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      toast.error("Alteração bloqueada pelo Supabase.");
      return;
    }

    toast.success(`Loja "${managingStore.name}" atualizada com sucesso!`);
    setManagingStore(null);
    queryClient.invalidateQueries();
  }

  const allStoresList = allStores ?? [];
  const rejectedStores = allStoresList.filter((s: any) => parseStoreSubscription(s).isRejected);
  const activeAndTrialStores = allStoresList.filter((s: any) => !parseStoreSubscription(s).isRejected);

  const subscribersCount = allStoresList.filter((s: any) => parseStoreSubscription(s).isSubscriber).length;
  const trialActiveCount = allStoresList.filter((s: any) => parseStoreSubscription(s).isTrial).length;
  const trialExpiredCount = allStoresList.filter((s: any) => parseStoreSubscription(s).type === "expired").length;

  if (isLoading) {
    return (
      <Card className="panel border-border/60">
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto size-6 animate-spin mb-2" /> Carregando solicitações de lojas…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* METRICAS GLOBAIS DA PLATAFORMA */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="panel border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Total de Lojas</p>
          <p className="text-2xl font-bold text-foreground mt-1">{allStoresList.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {subscribersCount} assinantes · {trialActiveCount} em teste
          </p>
        </Card>
        <Card className="panel border-emerald-500/40 bg-emerald-500/10 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Assinantes Pagantes</p>
            <Crown className="size-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{subscribersCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Mensalidade ativa</p>
        </Card>
        <Card className="panel border-cyan-500/30 bg-cyan-500/5 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Em Período de Teste</p>
          <p className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">{trialActiveCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Dias de teste liberados</p>
        </Card>
        <Card className="panel border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Trial Expirado (+14d)</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{trialExpiredCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Prontas para fechar plano</p>
        </Card>
      </div>

      {/* PAINEL PRINCIPAL DE LOJAS */}
      <Card className="panel border-border/60">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Gerenciamento de Lojas & Assinaturas ({activeAndTrialStores.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Defina lojas como <strong>Assinantes Ativos</strong>, adicione mais <strong>dias de teste</strong> ou suspenda contas.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-emerald-600 text-white text-xs gap-1">
                <Crown className="size-3" /> {subscribersCount} Assinantes
              </Badge>
              <Badge variant="outline" className="border-cyan-500/40 text-cyan-600 bg-cyan-500/10 text-xs">
                {trialActiveCount} em Teste
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeAndTrialStores.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-xl">
              Nenhuma loja cadastrada no momento.
            </p>
          ) : (
            <div className="space-y-3">
              {activeAndTrialStores.map((st: any) => {
                const sub = parseStoreSubscription(st);
                const cleanPhone = (st.whatsapp_number || st.owner?.phone || "").replace(/\D/g, "");
                const waMessage = encodeURIComponent(
                  sub.isSubscriber
                    ? `Olá ${st.owner?.name || "Lojista"}! Sou do Vendas 164. Passando para conferir como estão suas vendas da loja ${st.name}.`
                    : `Olá ${st.owner?.name || "Lojista"}! Vi que sua loja ${st.name} está no período de teste do Vendas 164 (${sub.label}). Gostaria de tirar alguma dúvida ou fechar a assinatura mensal?`
                );

                return (
                  <div
                    key={st.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                      sub.isSubscriber
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : sub.isTrial
                        ? "border-cyan-500/30 bg-cyan-500/5"
                        : "border-amber-500/30 bg-amber-500/5"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{st.name}</span>
                        <span className="text-muted-foreground font-mono text-[11px]">(/loja/{st.slug})</span>
                        
                        {sub.isSubscriber && (
                          <Badge className="bg-emerald-600 text-white gap-1 text-[10px] py-0 font-bold">
                            <Crown className="size-3" /> Assinante Ativo
                          </Badge>
                        )}
                        {sub.isTrial && (
                          <Badge variant="outline" className="border-cyan-500/40 text-cyan-600 bg-cyan-500/10 text-[10px] py-0 font-medium">
                            🟢 {sub.label}
                          </Badge>
                        )}
                        {sub.type === "expired" && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10 text-[10px] py-0 font-medium">
                            🟡 {sub.label}
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Dono: <strong>{st.owner?.name || "N/A"}</strong> ({st.owner?.email || "Sem e-mail"})
                        {(st.whatsapp_number || st.owner?.phone) && (
                          <span className="ml-2 text-emerald-600 font-medium">
                            📱 {st.whatsapp_number || st.owner?.phone}
                          </span>
                        )}
                        <span className="ml-2 text-muted-foreground/80">
                          · Cadastro: {new Date(st.created_at).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {st.sales?.total_orders || 0} pedidos
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] py-0 text-emerald-600">
                          {st.sales?.has_cost ? `Lucro: ${brl(st.sales.total_profit)}` : `Vendas: ${brl(st.sales?.total_amount || 0)}`}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                        onClick={() => openManageModal(st)}
                      >
                        <Settings className="size-3.5" /> Gerenciar Assinatura / Dias
                      </Button>

                      {cleanPhone && (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                        >
                          <a
                            href={`https://wa.me/55${cleanPhone.replace(/^55/, "")}?text=${waMessage}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📱 WhatsApp
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* LOJAS SUSPENSAS OU RECUSADAS */}
      {rejectedStores.length > 0 && (
        <Card className="panel border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
              <XCircle className="size-5" /> Lojas Suspensas / Bloqueadas ({rejectedStores.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rejectedStores.map((st: any) => (
                <div key={st.id} className="flex items-center justify-between border-b border-border/40 pb-2 pt-1 text-xs">
                  <div>
                    <span className="font-bold text-foreground">{st.name}</span>{" "}
                    <span className="text-muted-foreground">(/loja/{st.slug})</span>
                    <div className="text-muted-foreground">Dono: {st.owner?.name || "N/A"} ({st.owner?.email})</div>
                    {st.rejection_reason && (
                      <p className="text-[11px] text-destructive mt-0.5">Motivo: {st.rejection_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="text-xs gap-1.5"
                      variant="outline"
                      onClick={() => openManageModal(st)}
                    >
                      <Settings className="size-3.5" /> Reativar / Alterar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* MODAL DE GERENCIAMENTO DE ASSINATURA E DIAS DE TESTE */}
      <Dialog open={!!managingStore} onOpenChange={(open) => !open && setManagingStore(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Crown className="size-5 text-primary" /> Gerenciar Assinatura & Período de Teste
            </DialogTitle>
          </DialogHeader>

          {managingStore && (
            <div className="space-y-5 py-2 overflow-y-auto pr-1">
              <div className="rounded-xl border border-border/60 bg-muted/40 p-3.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-foreground">{managingStore.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">/loja/{managingStore.slug}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Dono: <strong>{managingStore.owner?.name || "Não informado"}</strong> ({managingStore.owner?.email})
                </div>
                <div className="text-xs text-muted-foreground">
                  Status Atual: <strong className="text-foreground">{parseStoreSubscription(managingStore).label}</strong>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Escolha o Status da Conta
                </Label>

                <div className="grid gap-2.5">
                  {/* Opção 1: Assinante Ativo */}
                  <div
                    onClick={() => setSelectedPlanType("subscriber")}
                    className={`cursor-pointer rounded-xl border p-3 flex items-start gap-3 transition-all ${
                      selectedPlanType === "subscriber"
                        ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500"
                        : "border-border/60 hover:bg-muted/30"
                    }`}
                  >
                    <div className="size-8 rounded-lg bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Crown className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-sm text-foreground">⭐ Cliente Assinante Ativo</strong>
                        <Badge className="bg-emerald-600 text-white text-[10px] py-0">Ilimitado</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Mensalidade paga. Acesso total permanente liberado sem avisos ou bloqueios de trial.
                      </p>
                    </div>
                  </div>

                  {/* Opção 2: Período de Teste (Adicionar Dias) */}
                  <div
                    onClick={() => setSelectedPlanType("trial")}
                    className={`cursor-pointer rounded-xl border p-3 flex items-start gap-3 transition-all ${
                      selectedPlanType === "trial"
                        ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500"
                        : "border-border/60 hover:bg-muted/30"
                    }`}
                  >
                    <div className="size-8 rounded-lg bg-cyan-500/20 text-cyan-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Calendar className="size-4" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <div>
                        <strong className="text-sm text-foreground">🟢 Em Período de Teste (Trial)</strong>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Adicione mais dias ou defina a data limite para o lojista testar o sistema.
                        </p>
                      </div>

                      {selectedPlanType === "trial" && (
                        <div className="pt-2 space-y-2.5 border-t border-border/40">
                          <span className="text-xs font-semibold text-foreground block">Adicionar dias a partir de hoje:</span>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { label: "+7 Dias", days: 7 },
                              { label: "+14 Dias", days: 14 },
                              { label: "+30 Dias (1 Mês)", days: 30 },
                              { label: "+60 Dias", days: 60 },
                            ].map((btn) => (
                              <Button
                                key={btn.days}
                                type="button"
                                size="sm"
                                variant={customDays === btn.days ? "default" : "outline"}
                                className="text-xs gap-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddDays(btn.days);
                                }}
                              >
                                <Plus className="size-3" /> {btn.label}
                              </Button>
                            ))}
                          </div>

                          <div className="pt-1 space-y-1">
                            <Label htmlFor="custom-date" className="text-xs text-muted-foreground">
                              Data limite de expiração do teste:
                            </Label>
                            <Input
                              id="custom-date"
                              type="date"
                              value={customExpiryDate}
                              onChange={(e) => setCustomExpiryDate(e.target.value)}
                              className="text-xs bg-background"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Opção 3: Suspender Loja */}
                  <div
                    onClick={() => setSelectedPlanType("rejected")}
                    className={`cursor-pointer rounded-xl border p-3 flex items-start gap-3 transition-all ${
                      selectedPlanType === "rejected"
                        ? "border-destructive bg-destructive/10 ring-1 ring-destructive"
                        : "border-border/60 hover:bg-muted/30"
                    }`}
                  >
                    <div className="size-8 rounded-lg bg-destructive/20 text-destructive flex items-center justify-center shrink-0 mt-0.5">
                      <XCircle className="size-4" />
                    </div>
                    <div>
                      <strong className="text-sm text-foreground">🔴 Suspender / Desativar Loja</strong>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Bloqueia o acesso da loja temporariamente por falta de pagamento ou moderação.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="admin-note" className="text-xs">Observação / Anotação Interna (opcional):</Label>
                <Input
                  id="admin-note"
                  placeholder="Ex: Mensalidade paga no PIX em 30/08, plano até 100 clientes..."
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                <Button variant="outline" onClick={() => setManagingStore(null)} disabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  onClick={saveStoreSubscription}
                  disabled={submitting}
                  className="gap-1.5 bg-primary text-primary-foreground font-bold"
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Salvar Alterações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}