import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Copy, Loader2, Package, Palette, ShieldAlert, ShieldCheck, XCircle, Zap, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PhoneInput } from "@/components/PhoneInput";
import { getCustomerFromCache } from "@/lib/customerCache";
import { QuickStartModal } from "@/components/vendedor/QuickStartModal";
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
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [trialDismissed, setTrialDismissed] = useState(false);

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

  const { isTrialActive, daysRemaining } = useMemo(() => {
    if (!store?.created_at) return { isTrialActive: false, daysRemaining: 0 };
    const createdTime = new Date(store.created_at).getTime();
    const now = Date.now();
    const diffDays = (now - createdTime) / (1000 * 60 * 60 * 24);
    const remaining = Math.max(0, Math.ceil(14 - diffDays));
    return {
      isTrialActive: diffDays <= 14,
      daysRemaining: remaining,
    };
  }, [store?.created_at]);

  const showTrialBanner = isTrialActive && !trialDismissed && !localStorage.getItem(`dismiss_trial_${store?.id}`);

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
        .select("*, products(*)")
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
    const received = active.reduce((s, o) => s + Number(o.down_payment), 0);
    const pending = projected - received;
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

  useEffect(() => {
    if (products && products.length === 0 && store?.id) {
      const key = `qs_auto_opened_${store.id}`;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "true");
        setQuickStartOpen(true);
      }
    }
  }, [products, store?.id]);

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
        <CreateStore onCreated={() => queryClient.invalidateQueries()} userId={user.id} />
      </div>
    );
  }

  const storeStatus = (store as any).status ?? "active";

  if (storeStatus === "rejected") {
    return (
      <div className="min-h-screen">
        <AppHeader store={store} />
        <main className="mx-auto max-w-xl px-4 py-12">
          <Card className="panel border-destructive/30 bg-destructive/5">
            <CardHeader className="text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
                <ShieldAlert className="size-8" />
              </div>
              <CardTitle className="text-2xl font-bold text-destructive">Solicitação Não Aprovada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-muted-foreground text-sm">
                Infelizmente a solicitação de abertura da loja <strong>{store.name}</strong> não foi aprovada pelo administrador.
              </p>
              {(store as any).rejection_reason && (
                <div className="rounded-xl border border-destructive/20 bg-background/60 p-4 text-left">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wider mb-1">Motivo da recusa:</p>
                  <p className="text-sm text-foreground">{(store as any).rejection_reason}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Entre em contato com o suporte do site se precisar de mais detalhes ou para solicitar um novo envio.
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
        {/* Banner de Boas-Vindas / Trial Liberado (Apenas nos primeiros 14 dias para novas lojas) */}
        {showTrialBanner && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-background to-primary/10 p-4 shadow-sm relative">
            <div className="flex items-center gap-3 pr-6 sm:pr-0">
              <div className="size-10 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center shrink-0">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-foreground">Período de Teste Gratuito ({daysRemaining} {daysRemaining === 1 ? "dia restante" : "dias restantes"})</span>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10 text-[10px]">
                    Acesso Total Liberado
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cadastre seus lançamentos e pronta entrega, compartilhe o link com colecionadores e receba pagamentos via PIX sem taxas.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="glow font-semibold gap-1.5 shrink-0 bg-primary text-primary-foreground text-xs"
                onClick={() => setQuickStartOpen(true)}
              >
                <Zap className="size-3.5" /> Cadastro Rápido (60s)
              </Button>
              <button
                type="button"
                onClick={handleDismissTrial}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted/40 transition-colors"
                title="Fechar aviso"
              >
                <XCircle className="size-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">/loja/{store.slug}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setQuickStartOpen(true)}
            >
              <Zap className="size-3.5 text-amber-500" /> + Miniatura Rápida
            </Button>
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
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/auth?loja=${store.id}&next=/loja/${store.slug}`,
                );
                toast.success("Link de convite da loja copiado!");
              }}
            >
              <Copy className="size-3.5 mr-1" /> Link de convite
            </Button>
          </div>
        </div>

        <QuickStartModal
          open={quickStartOpen}
          onOpenChange={setQuickStartOpen}
          store={store}
          onSuccess={() => queryClient.invalidateQueries()}
        />

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
            <TabsTrigger value="clientes" className="text-xs sm:text-sm">Clientes</TabsTrigger>
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

          <TabsContent value="clientes" className="mt-5">
            <ClientsTab orders={orders ?? []} />
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

function CreateStore({ userId, onCreated }: { userId: string; onCreated: () => void; isAdmin?: boolean }) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
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

    const initialStatus = "active";

    const insertPayload: any = {
      owner_id: userId,
      name: cleanName,
      slug: cleanSlug,
      whatsapp_number: whatsapp.trim(),
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
    
    toast.success("🎉 Loja criada com sucesso! Período de teste liberado.");
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
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-whats">WhatsApp da loja</Label>
              <PhoneInput
                id="store-whats"
                required
                value={whatsapp}
                onChange={setWhatsapp}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="store-desc">Descrição</Label>
              <Textarea
                id="store-desc"
                maxLength={280}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
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
  const [rejectingStore, setRejectingStore] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  async function updateStoreStatus(storeId: string, status: "active" | "rejected", rejectionReason?: string) {
    setSubmitting(true);

    const updatePayload: any = { status };
    if (rejectionReason) {
      updatePayload.rejection_reason = rejectionReason;
    }

    let { error, data } = await supabase
      .from("stores")
      .update(updatePayload)
      .eq("id", storeId)
      .select();

    if (error && (error.code === "PGRST204" || error.message?.includes("rejection_reason"))) {
      delete updatePayload.rejection_reason;
      const retry = await supabase
        .from("stores")
        .update(updatePayload)
        .eq("id", storeId)
        .select();
      error = retry.error;
      data = retry.data;
    }

    setSubmitting(false);

    if (error) {
      console.error("Erro detalhado do Supabase:", error);
      toast.error(`Não foi possível atualizar a loja: ${error.message || "Erro de permissão no Supabase"}`);
      return;
    }

    if (!data || data.length === 0) {
      toast.error("A alteração foi bloqueada pelas políticas de segurança (RLS) do Supabase.");
      return;
    }

    toast.success(status === "active" ? "Loja APROVADA com sucesso!" : "Solicitação RECUSADA.");
    setRejectingStore(null);
    setReason("");
    queryClient.invalidateQueries();
  }

  const pendingStores = (allStores ?? []).filter((s: any) => s.status === "pending" || !s.status);
  const activeStores = (allStores ?? []).filter((s: any) => s.status === "active");
  const rejectedStores = (allStores ?? []).filter((s: any) => s.status === "rejected");

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
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="panel border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Total de Lojas</p>
          <p className="text-2xl font-bold text-foreground mt-1">{(allStores ?? []).length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {activeStores.length} ativas · {pendingStores.length} pendentes · {rejectedStores.length} suspensas
          </p>
        </Card>
        <Card className="panel border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Lojas Ativas</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{activeStores.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Visíveis e com catálogo liberado</p>
        </Card>
        <Card className="panel border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Solicitações Pendentes</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{pendingStores.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Aguardando autorização</p>
        </Card>
      </div>

      <Card className="panel border-amber-500/40 bg-amber-500/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="size-5 text-amber-500" /> Painel de Moderação SuperAdmin
            </CardTitle>
            <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10">
              {pendingStores.length} {pendingStores.length === 1 ? "pendente" : "pendentes"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Aqui você controla os pedidos de autorização para novas lojas. Apenas lojas <strong>Aprovadas (Ativas)</strong> ficam visíveis ao público.
          </p>

          {/* LOJAS PENDENTES */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="size-4 text-amber-500" /> Solicitações Pendentes ({pendingStores.length})
            </h3>

            {pendingStores.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-xl">
                Nenhuma solicitação de nova loja pendente no momento.
              </p>
            ) : (
              <div className="grid gap-3">
                {pendingStores.map((st: any) => (
                  <div
                    key={st.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-background p-4 shadow-sm"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-base text-foreground">{st.name}</h4>
                        <span className="font-mono text-xs text-muted-foreground">/loja/{st.slug}</span>
                      </div>
                      {st.description && <p className="text-xs text-muted-foreground line-clamp-1">{st.description}</p>}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1">
                        <span>👤 Dono: <strong>{st.owner?.name || "Não informado"}</strong></span>
                        <span>📧 {st.owner?.email || "Sem e-mail"}</span>
                        {st.whatsapp_number && <span>📱 Whats: {st.whatsapp_number}</span>}
                        <span>📅 {new Date(st.created_at).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                        disabled={submitting}
                        onClick={() => updateStoreStatus(st.id, "active")}
                      >
                        <CheckCircle2 className="size-4" /> Aprovar Loja
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={submitting}
                        onClick={() => setRejectingStore(st)}
                        className="gap-1.5"
                      >
                        <XCircle className="size-4" /> Recusar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* LOJAS ATIVAS */}
      <Card className="panel border-border/60">
        <CardHeader>
          <CardTitle className="text-lg font-bold">Lojas Ativas e Aprovadas ({activeStores.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {activeStores.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-xl">
              Nenhuma loja ativa no momento.
            </p>
          ) : (
            <div className="space-y-2">
              {activeStores.map((st: any) => (
                <div key={st.id} className="flex items-center justify-between border-b border-border/40 pb-2 pt-1 text-xs">
                  <div>
                    <span className="font-bold text-foreground">{st.name}</span>{" "}
                    <span className="text-muted-foreground">(/loja/{st.slug})</span>
                    <div className="text-muted-foreground mt-0.5">
                      Dono: {st.owner?.name || "N/A"} ({st.owner?.email || "Sem e-mail"})
                      {st.owner?.phone && <span className="ml-2 text-emerald-600 font-medium">📱 Whats: {st.owner.phone}</span>}
                    </div>
                    <div className="text-muted-foreground mt-0.5 mb-1 flex flex-col gap-1">
                      <span className="font-mono text-[10px] break-all">ID Dono: {st.owner_id}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {st.sales?.total_orders || 0} negociações
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] py-0 text-emerald-600">
                        {st.sales?.has_cost ? `Lucro: ${brl(st.sales.total_profit)}` : `Vendas: ${brl(st.sales?.total_amount || 0)}`}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                      Ativa
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => updateStoreStatus(st.id, "rejected", "Loja suspensa pelo administrador.")}
                    >
                      Suspender
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* LOJAS SUSPENSAS OU RECUSADAS */}
      <Card className="panel border-destructive/40 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-destructive">
            <XCircle className="size-5" /> Lojas Suspensas / Recusadas ({rejectedStores.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rejectedStores.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-xl">
              Nenhuma loja suspensa ou recusada.
            </p>
          ) : (
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
                    <Badge variant="outline" className="border-destructive/40 text-destructive bg-destructive/10">
                      Suspensa
                    </Badge>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
                      disabled={submitting}
                      onClick={() => updateStoreStatus(st.id, "active")}
                    >
                      <CheckCircle2 className="size-3.5" /> Reativar Loja
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIÁLOGO DE RECUSA COM MOTIVO */}
      <Dialog open={!!rejectingStore} onOpenChange={(open) => !open && setRejectingStore(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar Solicitação de Loja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Você está recusando a solicitação da loja <strong>{rejectingStore?.name}</strong>.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="rej-reason">Motivo da recusa (opcional)</Label>
              <Textarea
                id="rej-reason"
                placeholder="Ex: Dados cadastrais incompletos ou nome indisponível..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setRejectingStore(null)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={submitting}
                onClick={() => updateStoreStatus(rejectingStore.id, "rejected", reason)}
              >
                {submitting && <Loader2 className="size-4 animate-spin mr-1" />} Confirmar Recusa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}