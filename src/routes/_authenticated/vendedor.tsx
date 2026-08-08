import { useEffect, useMemo, useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, CheckCircle2, Clock, Copy, Download, Filter, Loader2, MessageCircle, Package, Palette, Pencil, Plus, Search, Share2, ShieldAlert, ShieldCheck, Trash2, Truck, XCircle, Users, Trophy, Star, AlertTriangle, LayoutGrid, List, ChevronDown, CopyPlus, ExternalLink, DollarSign, Wallet, TrendingUp, Sparkles, Crown } from "lucide-react";
import { toast } from "sonner";
import { AppHeader, updateAppFavicon } from "@/components/AppHeader";
import { PhoneInput } from "@/components/PhoneInput";
import { getCustomerFromCache, saveCustomerToCache } from "@/lib/customerCache";
import { PaymentBadge } from "@/components/StatusBadge";
import { Countdown } from "@/components/Countdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { brl, formatDeadlineHours, getInstallmentOptions, getProductInstallmentInfo, hasNoSignalRequirement, slugify, whatsappLink } from "@/lib/format";
import { useSession } from "@/lib/session";
import { uploadImage } from "@/lib/upload";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DEFAULT_PRESET_BRANDS, getStoreBrands, saveStoreBrands } from "@/lib/brands";
import { getProductTotalStock } from "@/lib/stock";
import type { Tables } from "@/integrations/supabase/types";
import { SalesChart } from "@/components/vendedor/SalesChart";
export const Route = createFileRoute("/_authenticated/vendedor")({
  head: () => ({
    meta: [
      { title: "Painel do lojista" },
      {
        name: "description",
        content:
          "Gerencie pré-vendas, unidades, sinais recebidos, saldo a receber e a identidade da sua loja.",
      },
      { property: "og:title", content: "Painel do lojista" },
      { property: "og:description", content: "Gestão completa de pré-vendas de miniaturas." },
    ],
  }),
  component: SellerDashboard,
});

type Store = Tables<"stores">;
type Product = Tables<"products">;

type OrderRow = Tables<"orders"> & {
  products: Tables<"products"> | null;
  profiles: { name: string | null; email: string | null; phone: string | null } | null;
};

function SmartNotifications({ products, orders }: { products: Product[]; orders: OrderRow[] }) {
  const outOfStock = products.filter(p => p.stock === 0 && p.is_open);
  
  const now = new Date();
  const lateOrders = orders.filter(o => {
    if (o.payment_status !== "aguardando_sinal") return false;
    if (!o.reservation_expires_at) return false;
    return new Date(o.reservation_expires_at) < now;
  });

  const pendingShipping = orders.filter(o => o.payment_status === "quitado" && o.delivery_status !== "enviado" && o.delivery_status !== "cancelado" && o.delivery_status !== "entregue");

  if (outOfStock.length === 0 && lateOrders.length === 0 && pendingShipping.length === 0) return null;

  return (
    <div className="mb-8 grid gap-3 sm:grid-cols-3">
      {lateOrders.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <ShieldAlert className="size-5 shrink-0 mt-0.5 text-destructive/80" />
          <div>
            <h4 className="font-semibold text-sm text-foreground">Sinais Atrasados</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{lateOrders.length} {lateOrders.length === 1 ? "reserva passou" : "reservas passaram"} do prazo.</p>
          </div>
        </div>
      )}
      {outOfStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="size-5 shrink-0 mt-0.5 text-amber-500/80" />
          <div>
            <h4 className="font-semibold text-sm text-foreground">Estoque Esgotado</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{outOfStock.length} {outOfStock.length === 1 ? "miniatura zerou" : "miniaturas zeraram"}.</p>
          </div>
        </div>
      )}
      {pendingShipping.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <Package className="size-5 shrink-0 mt-0.5 text-blue-500/80" />
          <div>
            <h4 className="font-semibold text-sm text-foreground">Envios Pendentes</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{pendingShipping.length} {pendingShipping.length === 1 ? "pedido aguarda" : "pedidos aguardam"} envio.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function getOrderSummaryMessage(o: OrderRow, quantity: number, displayName: string) {
  const modelName = `${o.products?.brand || ''} ${o.products?.model || 'Miniatura'}`.trim();
  const total = Number(o.total_price) * quantity;
  const customSignal = Number((o.products as any)?.down_payment_amount || 0);
  const expectedSignal = (customSignal > 0 ? customSignal : Math.round(Number(o.total_price) * 0.2 * 100) / 100) * quantity;
  const isSemSinal = o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada";

  let msg = `Olá ${displayName},\n\nAqui é o resumo da sua reserva:\n- Miniatura: *${modelName}*\n`;
  if (quantity > 1) msg += `- Quantidade: ${quantity}x\n`;
  msg += `- Valor Total: *${brl(total)}*\n`;
  
  if (o.payment_status === "aguardando_sinal") {
    msg += `- Sinal a pagar: *${brl(expectedSignal)}*\n`;
  } else if (o.payment_status === "sinal_pago") {
    msg += `- Sinal pago: *${brl(Number(o.down_payment) * quantity)}*\n- Saldo restante: *${brl(Number(o.remaining_balance) * quantity)}*\n`;
  } else if (o.payment_status === "quitado") {
    msg += `- Status: *Totalmente Quitado*\n`;
  } else if (isSemSinal) {
    msg += `- Pagamento na chegada do produto.\n`;
  }
  
  msg += `\nAgradecemos a preferência!`;
  return msg;
}

function getWhatsAppTemplates(o: OrderRow, quantity: number, displayName: string, storePixKey?: string) {
  const modelName = `${o.products?.brand || ''} ${o.products?.model || 'Miniatura'}`.trim();
  const customSignal = Number((o.products as any)?.down_payment_amount || 0);
  const expectedSignal = (customSignal > 0 ? customSignal : Math.round(Number(o.total_price) * 0.2 * 100) / 100) * quantity;
  const signal = Number(o.down_payment) > 0 ? Number(o.down_payment) * quantity : expectedSignal;
  const remaining = Number(o.remaining_balance) * quantity;
  const tracking = o.tracking_code?.trim();
  const trackingLink = tracking ? `https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(tracking)}` : '';
  const pixInfo = storePixKey ? `\n\n🔑 *Chave PIX da loja:* ${storePixKey}` : '';

  const summary = getOrderSummaryMessage(o, quantity, displayName);

  const signalReminder = `Olá ${displayName}!\n\nPassando para lembrar da sua reserva da miniatura *${modelName}*${quantity > 1 ? ` (${quantity}x)` : ''}.\n\n📌 *Valor do Sinal:* ${brl(signal)}${o.reservation_expires_at ? `\n⏳ *Prazo de Validade:* ${new Date(o.reservation_expires_at).toLocaleDateString("pt-BR")}` : ''}${pixInfo}\n\nAssim que efetuar o pagamento do sinal, nos envie o comprovante para confirmarmos sua cota! Muito obrigado!`;

  const arrived = `Olá ${displayName}, ótimas notícias! 📦🎉\n\nA sua miniatura *${modelName}*${quantity > 1 ? ` (${quantity}x)` : ''} acabou de chegar em nosso estoque!\n\n💰 *Saldo restante a pagar:* ${brl(remaining)}${pixInfo}\n\nPor favor, nos envie o comprovante e confirme seu endereço de entrega para realizarmos o despacho!`;

  const shipped = `Olá ${displayName}! 🚚💨\n\nSeu pedido da miniatura *${modelName}* foi postado e já está a caminho!\n\n📦 *Código de Rastreio:* ${tracking || 'Em processamento'}${trackingLink ? `\n🔗 *Acompanhe pelo link:* ${trackingLink}` : ''}\n\nQualquer dúvida estamos à disposição!`;

  return {
    summary,
    signalReminder,
    arrived,
    shipped,
  };
}

interface OrderWhatsAppDropdownProps {
  order: OrderRow;
  quantity: number;
  displayName: string;
  phone?: string | null;
  pixKey?: string | null;
  variant?: "badge" | "button" | "icon";
}

function OrderWhatsAppDropdown({
  order,
  quantity,
  displayName,
  phone,
  pixKey,
  variant = "badge",
}: OrderWhatsAppDropdownProps) {
  if (!phone) {
    return <span className="text-xs text-muted-foreground/60 italic">Sem WhatsApp</span>;
  }

  const templates = getWhatsAppTemplates(order, quantity, displayName, pixKey || undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "badge" ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium font-mono border border-emerald-500/30 transition-all cursor-pointer shadow-sm hover:scale-105"
            title="Opções de mensagem do WhatsApp"
          >
            <MessageCircle className="size-3.5" />
            <span>WhatsApp</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        ) : variant === "icon" ? (
          <Button size="icon" variant="ghost" className="size-7 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-full" title="Opções WhatsApp">
            <MessageCircle className="size-4" />
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs">
            <MessageCircle className="size-3.5" />
            <span>WhatsApp</span>
            <ChevronDown className="size-3 opacity-60" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Templates Rápidos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.summary)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <MessageCircle className="size-4 text-emerald-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Resumo do Pedido</span>
              <span className="text-[10px] text-muted-foreground">Itens, valor total e sinal</span>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.signalReminder)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <Clock className="size-4 text-amber-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Lembrete de Sinal</span>
              <span className="text-[10px] text-muted-foreground">Cobrança com PIX e prazo</span>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.arrived)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <Package className="size-4 text-purple-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Miniatura Chegou!</span>
              <span className="text-[10px] text-muted-foreground">Aviso de saldo a quitar</span>
            </div>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href={whatsappLink(phone, templates.shipped)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 cursor-pointer text-xs py-2"
          >
            <Truck className="size-4 text-blue-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-semibold">Envio com Rastreio</span>
              <span className="text-[10px] text-muted-foreground">Link oficial dos Correios</span>
            </div>
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SellerDashboard() {
  const { user, loading: sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("produtos");

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

  useEffect(() => {
    if (store?.name) {
      if (activeTab === "reservas") {
        document.title = `${store.name} — Reservas`;
      } else if (activeTab === "loja") {
        document.title = `${store.name} — Personalização`;
      } else {
        document.title = `${store.name} — Estoque e pré-vendas`;
      }
    }
  }, [store?.name, activeTab]);




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
        <CreateStore onCreated={() => queryClient.invalidateQueries()} userId={user.id} isAdmin={isAdmin} />
      </div>
    );
  }

  // Se a coluna status ainda não existir no banco, assumimos "pending" se não for admin
  const storeStatus = (store as any).status ?? (isAdmin ? "active" : "pending");

  if (storeStatus === "pending" && !isAdmin) {
    return (
      <div className="min-h-screen">
        <AppHeader store={store} />
        <main className="mx-auto max-w-2xl px-4 py-12">
          <Card className="panel border-amber-500/30 bg-amber-500/5">
            <CardHeader className="text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 mb-2">
                <Clock className="size-8 animate-pulse" />
              </div>
              <CardTitle className="text-2xl font-bold">Solicitação em Análise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <p className="text-muted-foreground text-sm leading-relaxed">
                Sua loja <strong className="text-foreground">{store.name}</strong> foi cadastrada com sucesso e seu pedido de autorização foi enviado para análise do administrador do site.
              </p>
              <div className="rounded-xl border border-border/60 bg-background/50 p-4 text-left space-y-2 text-xs">
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Nome da loja:</span>
                  <span className="font-semibold">{store.name}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Endereço da loja:</span>
                  <span className="font-mono font-semibold">/loja/{store.slug}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status atual:</span>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600 bg-amber-500/10">
                    Aguardando Aprovação
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-2">
                Assim que sua loja for aprovada pelo administrador, seu painel de cadastro de pré-vendas e vendas será liberado automaticamente.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

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
        {isAdmin && storeStatus === "pending" && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-center gap-2.5">
              <Clock className="size-5 shrink-0 animate-pulse text-amber-500" />
              <div className="text-xs sm:text-sm text-foreground">
                <strong>Esta loja está aguardando aprovação!</strong> Usuários comuns verão apenas a mensagem de análise até você aprová-la no painel de moderação.
              </div>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              onClick={() => setActiveTab("admin_moderation")}
            >
              <ShieldCheck className="size-4 mr-1.5" /> Ir para Moderação
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
            <p className="text-sm text-muted-foreground font-mono">/loja/{store.slug}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {isAdmin && (
              <Button
                variant={activeTab === "admin_moderation" ? "default" : "outline"}
                className="gap-2 border-amber-500/30 text-amber-600 hover:text-amber-500"
                onClick={() => setActiveTab("admin_moderation")}
              >
                <ShieldCheck className="size-4" /> Moderação ({activeTab === "admin_moderation" ? "Aberta" : "Admin"})
              </Button>
            )}
            <Button
              variant={activeTab === "loja" ? "default" : "outline"}
              className="gap-2"
              onClick={() => setActiveTab("loja")}
            >
              <Palette className="size-4" /> Personalizar Loja
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/auth?loja=${store.id}&next=/loja/${store.slug}`,
                );
                toast.success("Link de convite da loja copiado!");
              }}
            >
              <Copy className="size-4" /> Link de convite
            </Button>
          </div>
        </div>

        <SmartNotifications products={products ?? []} orders={orders ?? []} />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<TrendingUp className="size-4 text-primary" />}
            label="Total Projetado"
            value={brl(totals.projected)}
            subtext={`${totals.activeCount} reservas ativas`}
          />
          <StatCard
            icon={<Wallet className="size-4 text-emerald-500" />}
            label="Sinais Recebidos"
            value={brl(totals.received)}
            accent="text-emerald-500"
            subtext={`${totals.paidInFull} pedidos quitados`}
          />
          <StatCard
            icon={<Clock className="size-4 text-amber-500" />}
            label="Saldo a Receber"
            value={brl(totals.pending)}
            accent="text-amber-500"
            subtext="A receber na chegada"
          />
          <StatCard
            icon={<DollarSign className="size-4 text-blue-500" />}
            label="Ticket Médio"
            value={brl(totals.avgTicket)}
            accent="text-blue-500"
            subtext="Média por reserva"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-10">
          <TabsList className="w-full flex overflow-x-auto justify-start sm:justify-center whitespace-nowrap p-1 max-w-full bg-muted/30">
            <TabsTrigger value="produtos" className="text-xs sm:text-sm">Estoque e pré-vendas</TabsTrigger>
            <TabsTrigger value="reservas" className="text-xs sm:text-sm">Reservas</TabsTrigger>
            <TabsTrigger value="clientes" className="text-xs sm:text-sm">Clientes</TabsTrigger>
            <TabsTrigger value="loja" className="gap-1.5 text-xs sm:text-sm">
              <Palette className="size-3.5" /> Personalização
            </TabsTrigger>
          </TabsList>

          <TabsContent value="produtos" className="mt-5">
            <ProductsTab store={store} products={products ?? []} userId={user!.id} onSelectTab={setActiveTab} />
          </TabsContent>

          <TabsContent value="reservas" className="mt-5">
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

function StatCard({
  icon,
  label,
  value,
  accent,
  subtext,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
  subtext?: string;
}) {
  return (
    <Card className="border-border/40 bg-card/60 relative overflow-hidden backdrop-blur-sm shadow-sm transition-all hover:border-border/80">
      <CardHeader className="pb-1 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
        {icon && <div className="p-1.5 rounded-lg bg-muted/40 shrink-0">{icon}</div>}
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className={`font-display text-2xl font-bold tracking-tight ${accent ?? ""}`}>{value}</p>
        {subtext && <p className="text-[11px] text-muted-foreground mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function CreateStore({ userId, onCreated, isAdmin }: { userId: string; onCreated: () => void; isAdmin?: boolean }) {
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

    // Verificar se já existe uma loja cadastrada com o mesmo slug
    const { data: existing } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (existing) {
      setSaving(false);
      return toast.error("Já existe uma loja cadastrada com este nome. Por favor, escolha outro nome para sua loja.");
    }

    const initialStatus = isAdmin ? "active" : "pending";

    const insertPayload: any = {
      owner_id: userId,
      name: cleanName,
      slug: cleanSlug,
      whatsapp_number: whatsapp.trim(),
      description: description.trim() || null,
      status: initialStatus,
    };

    let { error } = await supabase.from("stores").insert(insertPayload);

    // Fallback caso a coluna status ainda não tenha sido criada no banco Supabase
    if (error && (error.code === "PGRST204" || error.message?.includes("status"))) {
      delete insertPayload.status;
      const retry = await supabase.from("stores").insert(insertPayload);
      error = retry.error;
    }

    setSaving(false);
    if (error) return toast.error("Não foi possível criar a loja.");
    
    if (initialStatus === "pending") {
      toast.success("Solicitação enviada! Sua loja está aguardando aprovação do administrador.");
    } else {
      toast.success("Loja criada e ativada!");
    }
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

const emptyProduct = {
  brand: "",
  model: "",
  scale: "1:64",
  price: "",
  cost_price: "",
  max_installments: "1",
  has_surcharge: "false",
  installment_price: "",
  down_payment_amount: "",
  release_date: "",
  stock: "1",
  payment_deadline_date: "",
  payment_deadline_hours: "24",
  image_url: "",
  bulk_discount_threshold: "",
  bulk_discount_price: "",
  bulk_has_installment_surcharge: "false",
  bulk_installment_price: "",
};

function ProductsTab({
  store,
  products,
  userId,
  onSelectTab,
}: {
  store: Store;
  products: Product[];
  userId: string;
  onSelectTab?: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ ...emptyProduct });
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualReservationProduct, setManualReservationProduct] = useState<Product | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  const configuredBrands = useMemo(() => getStoreBrands(store.id), [store.id]);
  const availableBrandOptions = useMemo(() => {
    const set = new Set([...configuredBrands]);
    products.forEach((p) => p.brand && set.add(p.brand.trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [configuredBrands, products]);

  const brandsMap: Record<string, Product[]> = {};
  for (const p of products) {
    const brandName = (p.brand || "Outros").trim();
    if (!brandsMap[brandName]) brandsMap[brandName] = [];
    brandsMap[brandName].push(p);
  }
  const brandList = Object.keys(brandsMap).sort((a, b) => a.localeCompare(b));
  const filteredBrands = selectedBrand === "all" ? brandList : brandList.filter((b) => b === selectedBrand);

  function handleReserveUnidade(p: Product) {
    if (!p.is_open) return toast.error("Esta pré-venda está fechada.");
    if (p.stock <= 0) return toast.error("Não há unidades disponíveis para esta miniatura.");

    setManualReservationProduct(p);
    setManualDialogOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.brand.trim()) {
      return toast.error("Por favor, selecione ou informe a marca da miniatura.");
    }

    setSaving(true);
    let computedHours = 24;
    if (form.payment_deadline_date) {
      const targetDate = new Date(form.payment_deadline_date + "T23:59:59");
      computedHours = Math.max(0, Math.round((targetDate.getTime() - Date.now()) / (1000 * 60 * 60)));
    } else if (form.down_payment_amount === "" || Number(form.down_payment_amount || 0) === 0) {
      computedHours = 0;
    }

    const maxInst = Number(form.max_installments || 1);
    const hasSurcharge = maxInst > 1 && form.has_surcharge === "true";
    const instPrice = maxInst > 1 ? (hasSurcharge && form.installment_price ? Number(form.installment_price) : Number(form.price || 0)) : null;

    const payload: any = {
      store_id: store.id,
      brand: form.brand.trim(),
      model: form.model.trim(),
      scale: form.scale,
      price: Number(form.price || 0),
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      max_installments: maxInst,
      has_installment_surcharge: hasSurcharge,
      installment_price: instPrice,
      price_2x: maxInst === 2 ? instPrice : null,
      release_date: form.release_date ? (form.release_date.length === 7 ? form.release_date + "-01" : form.release_date) : null,
      payment_deadline_date: form.payment_deadline_date || null,
      payment_deadline_hours: computedHours,
      stock: Number(form.stock || 0),
      initial_stock: Number(form.stock || 0),
      image_url: form.image_url || null,
      slug: slugify(form.model.trim()),
      bulk_discount_threshold: (form as any).bulk_discount_threshold ? Number((form as any).bulk_discount_threshold) : null,
      bulk_discount_price: (form as any).bulk_discount_price ? Number((form as any).bulk_discount_price) : null,
      bulk_has_installment_surcharge: (form as any).bulk_has_installment_surcharge === "true",
      bulk_installment_price: (form as any).bulk_has_installment_surcharge === "true" && (form as any).bulk_installment_price ? Number((form as any).bulk_installment_price) : null,
    };

    if (form.down_payment_amount !== "") {
      payload.down_payment_amount = Number(form.down_payment_amount || 0);
    }

    let { error } = await supabase.from("products").insert(payload);

    // Fallbacks progressivos para lidar com colunas opcionais ausentes no banco
    if (error && (error.code === "PGRST204" || error.message?.includes("initial_stock") || (error as any).status === 400)) {
      delete (payload as any).initial_stock;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("bulk_discount") || error.message?.includes("bulk_has_installment_surcharge") || error.message?.includes("bulk_installment_price") || (error as any).status === 400)) {
      delete payload.bulk_discount_threshold;
      delete payload.bulk_discount_price;
      delete payload.bulk_has_installment_surcharge;
      delete payload.bulk_installment_price;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("cost_price") || (error as any).status === 400)) {
      delete payload.cost_price;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("max_installments") || error.message?.includes("has_installment_surcharge") || (error as any).status === 400)) {
      delete payload.max_installments;
      delete payload.price_2x;
      delete payload.installment_price;
      delete payload.has_installment_surcharge;
      const retry = await supabase.from("products").insert(payload);
      error = retry.error;
    }

    if (error) {
      delete payload.payment_deadline_date;
      const retry1 = await supabase.from("products").insert(payload);
      error = retry1.error;

      if (error) {
        delete payload.down_payment_amount;
        const retry2 = await supabase.from("products").insert(payload);
        error = retry2.error;
      }
    }

    setSaving(false);
    if (error) return toast.error("Não foi possível salvar a miniatura.");

    // Se adicionou uma marca customizada, salvar na lista da loja
    if (form.brand.trim() && !configuredBrands.includes(form.brand.trim())) {
      saveStoreBrands(store.id, [...configuredBrands, form.brand.trim()]);
    }

    setForm({ ...emptyProduct });
    setIsCustomBrand(false);
    queryClient.invalidateQueries();
    toast.success("Pré-venda cadastrada!");
  }

  async function toggleOpen(product: Product) {
    await supabase.from("products").update({ is_open: !product.is_open }).eq("id", product.id);
    queryClient.invalidateQueries();
  }

  async function handleQuickStock(product: Product, delta: number) {
    const currentStock = product.stock ?? 0;
    const newStock = Math.max(0, currentStock + delta);
    // initial_stock acompanha o delta: se lojista adiciona/remove unidades, o total original muda junto
    const currentInitial = (product as any).initial_stock ?? currentStock;
    const newInitial = Math.max(newStock, currentInitial + delta);

    let { error } = await supabase.from("products").update({
      stock: newStock,
      initial_stock: newInitial,
      is_open: newStock > 0 ? product.is_open : false,
    }).eq("id", product.id);

    // Se a coluna initial_stock ainda não existir no banco, tenta sem ela
    if (error && ((error as any).status === 400 || error.message?.includes("initial_stock"))) {
      const retry = await supabase.from("products").update({
        stock: newStock,
        is_open: newStock > 0 ? product.is_open : false,
      }).eq("id", product.id);
      error = retry.error;
    }

    if (error) return toast.error("Erro ao alterar estoque.");
    queryClient.invalidateQueries();
    toast.success(`Estoque de "${product.model}": ${newStock} un.`);
  }

  function handleDuplicateProduct(p: Product) {
    setForm({
      brand: p.brand || "",
      model: `${p.model} (Nova Edição)`,
      scale: p.scale || "1:64",
      price: String(p.price || ""),
      cost_price: (p as any).cost_price ? String((p as any).cost_price) : "",
      max_installments: String((p as any).max_installments || "1"),
      has_surcharge: (p as any).has_installment_surcharge ? "true" : "false",
      installment_price: (p as any).installment_price ? String((p as any).installment_price) : "",
      down_payment_amount: (p as any).down_payment_amount ? String((p as any).down_payment_amount) : "",
      release_date: p.release_date ? p.release_date.slice(0, 7) : "",
      stock: "1",
      payment_deadline_date: (p as any).payment_deadline_date || "",
      payment_deadline_hours: String((p as any).payment_deadline_hours || "24"),
      image_url: p.image_url || "",
      bulk_discount_threshold: (p as any).bulk_discount_threshold ? String((p as any).bulk_discount_threshold) : "",
      bulk_discount_price: (p as any).bulk_discount_price ? String((p as any).bulk_discount_price) : "",
      bulk_has_installment_surcharge: (p as any).bulk_has_installment_surcharge ? "true" : "false",
      bulk_installment_price: (p as any).bulk_installment_price ? String((p as any).bulk_installment_price) : "",
    } as any);

    if (p.brand && !availableBrandOptions.includes(p.brand)) {
      setIsCustomBrand(true);
    } else {
      setIsCustomBrand(false);
    }

    toast.info(`Dados de "${p.model}" carregados no formulário de cadastro acima!`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(product: Product) {
    await supabase.from("products").delete().eq("id", product.id);
    queryClient.invalidateQueries();
    toast.success("Miniatura removida.");
  }

  async function onFile(file: File) {
    try {
      const url = await uploadImage(userId, file);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Foto enviada!");
    } catch {
      toast.error("Falha ao enviar a foto.");
    }
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit border-border/30 bg-card/60">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Nova pré-venda</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="brand" className="text-xs font-medium text-muted-foreground">Marca</Label>
                  <Select
                    value={
                      isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))
                        ? "__custom"
                        : form.brand
                    }
                    onValueChange={(val) => {
                      if (val === "__custom") {
                        setIsCustomBrand(true);
                        setForm((f) => ({ ...f, brand: "" }));
                      } else {
                        setIsCustomBrand(false);
                        setForm((f) => ({ ...f, brand: val }));
                      }
                    }}
                  >
                    <SelectTrigger id="brand" className="bg-muted/20 border-border/30">
                      <SelectValue placeholder="Selecione a marca" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableBrandOptions.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom" className="font-semibold text-primary">+ Outra marca...</SelectItem>
                    </SelectContent>
                  </Select>
                  {(isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))) && (
                    <Input
                      placeholder="Digite a nova marca..."
                      maxLength={40}
                      required
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      className="text-xs sm:text-sm bg-muted/20 border-border/30"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scale" className="text-xs font-medium text-muted-foreground">Escala</Label>
                  <Input
                    id="scale"
                    maxLength={12}
                    value={form.scale}
                    onChange={(e) => setForm({ ...form, scale: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model" className="text-xs font-medium text-muted-foreground">Modelo</Label>
                <Input
                  id="model"
                  required
                  maxLength={80}
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="bg-muted/20 border-border/30"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cost_price" className="text-xs font-medium text-muted-foreground">Custo (R$) <span className="text-[10px] font-normal opacity-70">(Opcional)</span></Label>
                  <Input
                    id="cost_price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="150"
                    value={form.cost_price}
                    onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="price" className="text-xs font-medium text-muted-foreground">Venda À vista (R$)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    placeholder="240"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="down_payment" className="text-xs font-medium text-muted-foreground">Sinal (R$)</Label>
                  <Input
                    id="down_payment"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 50"
                    value={form.down_payment_amount}
                    onChange={(e) => setForm({ ...form, down_payment_amount: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="stock" className="text-xs font-medium text-muted-foreground">Unidades</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    required
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Desconto por Quantidade (Atacado)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk_threshold" className="text-xs font-medium text-muted-foreground">A partir de (unidades)</Label>
                    <Input
                      id="bulk_threshold"
                      type="number"
                      min="2"
                      placeholder="Ex: 3"
                      value={(form as any).bulk_discount_threshold}
                      onChange={(e) => setForm({ ...form, bulk_discount_threshold: e.target.value } as any)}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk_price" className="text-xs font-medium text-muted-foreground">Novo Valor Unitário (R$)</Label>
                    <Input
                      id="bulk_price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 180"
                      value={(form as any).bulk_discount_price}
                      onChange={(e) => setForm({ ...form, bulk_discount_price: e.target.value } as any)}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                </div>

                {Number(form.max_installments) > 1 && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento (Atacado)</Label>
                        <Select
                          value={(form as any).bulk_has_installment_surcharge}
                          onValueChange={(val) => setForm({ ...form, bulk_has_installment_surcharge: val } as any)}
                        >
                          <SelectTrigger className="bg-muted/20 border-border/30">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                            <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {(form as any).bulk_has_installment_surcharge === "true" && (
                      <div className="space-y-1.5 pt-1 mt-3">
                        <Label htmlFor="bulk_inst_price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado no Atacado (R$)</Label>
                        <Input
                          id="bulk_inst_price"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Ex: 200"
                          value={(form as any).bulk_installment_price}
                          onChange={(e) => setForm({ ...form, bulk_installment_price: e.target.value } as any)}
                          className="bg-muted/20 border-border/30"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-3 rounded-lg border border-border/30 bg-muted/15 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Máximo de parcelas</Label>
                    <Select
                      value={form.max_installments}
                      onValueChange={(val) => setForm({ ...form, max_installments: val })}
                    >
                      <SelectTrigger className="bg-muted/20 border-border/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1x (Apenas à vista)</SelectItem>
                        <SelectItem value="2">Até 2x</SelectItem>
                        <SelectItem value="3">Até 3x</SelectItem>
                        <SelectItem value="4">Até 4x</SelectItem>
                        <SelectItem value="5">Até 5x</SelectItem>
                        <SelectItem value="6">Até 6x</SelectItem>
                        <SelectItem value="10">Até 10x</SelectItem>
                        <SelectItem value="12">Até 12x</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {Number(form.max_installments) > 1 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento</Label>
                      <Select
                        value={form.has_surcharge}
                        onValueChange={(val) => setForm({ ...form, has_surcharge: val })}
                      >
                        <SelectTrigger className="bg-muted/20 border-border/30">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                          <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {Number(form.max_installments) > 1 && (
                  <div>
                    {form.has_surcharge === "true" ? (
                      <div className="space-y-1.5 pt-1">
                        <Label htmlFor="inst_price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado (R$)</Label>
                        <Input
                          id="inst_price"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="Ex: 260"
                          value={form.installment_price}
                          onChange={(e) => setForm({ ...form, installment_price: e.target.value })}
                          className="bg-muted/20 border-border/30"
                        />
                        {Number(form.installment_price) > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.installment_price) / Number(form.max_installments))}</strong> (com acréscimo)
                          </p>
                        )}
                      </div>
                    ) : (
                      Number(form.price) > 0 && (
                        <p className="text-[11px] text-muted-foreground pt-1">
                          Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.price) / Number(form.max_installments))}</strong> sem acréscimo.
                        </p>
                      )
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="release" className="text-xs font-medium text-muted-foreground">Data estimada</Label>
                  <Input
                    id="release"
                    type="month"
                    value={form.release_date}
                    onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signal-deadline" className="text-xs font-medium text-muted-foreground">Data limite para o sinal</Label>
                  <Input
                    id="signal-deadline"
                    type="date"
                    value={form.payment_deadline_date}
                    onChange={(e) => setForm({ ...form, payment_deadline_date: e.target.value })}
                    className="bg-muted/20 border-border/30"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="photo" className="text-xs font-medium text-muted-foreground">Foto da miniatura</Label>
                <Input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                  className="bg-muted/20 border-border/30"
                />
                {form.image_url && <p className="text-xs text-success">Foto pronta para publicar.</p>}
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />} Publicar pré-venda
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Lista de Pré-vendas Agrupadas por Marca */}
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-lg tracking-tight">Catálogo da Loja ({products.length})</h3>
            {brandList.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={selectedBrand === "all" ? "default" : "outline"}
                  onClick={() => setSelectedBrand("all")}
                  className="h-7 px-2.5 text-xs rounded-full"
                >
                  Todas ({products.length})
                </Button>
                {brandList.map((b) => (
                  <Button
                    key={b}
                    type="button"
                    size="sm"
                    variant={selectedBrand === b ? "default" : "outline"}
                    onClick={() => setSelectedBrand(b)}
                    className="h-7 px-2.5 text-xs rounded-full"
                  >
                    {b} ({brandsMap[b].length})
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            {filteredBrands.map((brand) => {
              const brandProducts = brandsMap[brand];
              return (
                <div key={brand} className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-border/20 pb-2">
                    <h4 className="font-bold text-base">{brand}</h4>
                    <span className="text-xs text-muted-foreground font-medium">{brandProducts.length} {brandProducts.length === 1 ? "miniatura" : "miniaturas"}</span>
                  </div>

                  <div className="space-y-2.5">
                    {brandProducts.map((p) => (
                      <Card key={p.id} className="border-border/30 bg-card/50">
                        <CardContent className="flex flex-wrap items-center gap-4 p-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground">
                              {p.brand} · {p.scale} · {
                                (p as any).payment_deadline_date
                                  ? `sinal até ${new Date((p as any).payment_deadline_date + "T00:00:00").toLocaleDateString("pt-BR")}`
                                  : Number(p.payment_deadline_hours) > 0
                                    ? `sinal em ${formatDeadlineHours(p.payment_deadline_hours)}`
                                    : "sem sinal"
                              }
                            </p>
                            <h3 className="font-semibold mt-0.5">{p.model}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                              <span className="text-xs font-semibold text-foreground bg-muted/40 px-2 py-0.5 rounded-md">À vista: {brl(Number(p.price))}</span>
                              {(() => {
                                const inst = getProductInstallmentInfo(p);
                                if (!inst) return null;
                                return (
                                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                    {inst.maxInstallments}x de {brl(inst.installmentValue)} {inst.hasSurcharge ? `(Total ${brl(inst.totalPrice)})` : "sem acréscimo"}
                                  </span>
                                );
                              })()}
                              {Number((p as any).down_payment_amount) > 0 && (
                                <span className="text-xs font-medium text-primary">
                                  Sinal: {brl(Number((p as any).down_payment_amount))}
                                </span>
                              )}
                              {Number((p as any).cost_price) > 0 && (
                                <span className="text-xs font-medium text-success">
                                  Lucro: {brl(Number(p.price) - Number((p as any).cost_price))}
                                </span>
                              )}
                              {/* Ajuste Rápido de Estoque (+/-) */}
                              <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-muted/20 px-1 py-0.5" title="Ajuste rápido de estoque">
                                <button
                                  type="button"
                                  disabled={p.stock <= 0}
                                  onClick={() => handleQuickStock(p, -1)}
                                  className="size-5 flex items-center justify-center rounded hover:bg-muted font-bold text-xs disabled:opacity-30 transition-colors"
                                  title="Diminuir 1 unidade"
                                >
                                  -
                                </button>
                                <span className="text-xs font-semibold px-2 min-w-[36px] text-center font-mono" title={`Estoque total: ${getProductTotalStock(p)} unidades no total`}>
                                  {p.stock} de {getProductTotalStock(p)} un
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleQuickStock(p, 1)}
                                  className="size-5 flex items-center justify-center rounded hover:bg-muted font-bold text-xs transition-colors"
                                  title="Aumentar 1 unidade"
                                >
                                  +
                                </button>
                              </div>

                              {p.stock === 0 ? (
                                <span className="text-xs font-medium text-destructive">Esgotado</span>
                              ) : p.stock <= 2 ? (
                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Últimas unidades!</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              disabled={!p.is_open || p.stock <= 0}
                              onClick={() => handleReserveUnidade(p)}
                              className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
                              title="Fazer reserva para cliente nesta unidade"
                            >
                              <BookmarkCheck className="size-3.5" />
                              <span>Reservar para cliente</span>
                            </Button>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-1">
                              <Switch checked={p.is_open} onCheckedChange={() => toggleOpen(p)} />
                              {p.is_open ? "Aberta" : "Fechada"}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Editar pré-venda"
                              onClick={() => setEditingProduct(p)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Duplicar miniatura"
                              onClick={() => handleDuplicateProduct(p)}
                            >
                              <CopyPlus className="size-4 text-primary" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Copiar link"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/produto/${p.id}`);
                                toast.success("Link do produto copiado!");
                              }}
                            >
                              <Share2 className="size-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => remove(p)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}

            {products.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">Nenhuma miniatura cadastrada ainda.</p>
            )}
          </div>
        </div>
      </div>

      <EditProductDialog
        product={editingProduct}
        storeId={store.id}
        userId={userId}
        onClose={() => setEditingProduct(null)}
      />

      <ManualReservationDialog
        storeId={store.id}
        storeColor={store.primary_color}
        storePixKey={(store as any).pix_key}
        products={products}
        open={manualDialogOpen}
        preSelectedProduct={manualReservationProduct}
        onClose={() => {
          setManualDialogOpen(false);
          setManualReservationProduct(null);
        }}
        onSuccess={() => {
          setManualDialogOpen(false);
          setManualReservationProduct(null);
          onSelectTab?.("reservas");
        }}
      />
    </>
  );
}

function EditProductDialog({
  product,
  storeId,
  userId,
  onClose,
}: {
  product: Product | null;
  storeId?: string;
  userId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    brand: "",
    model: "",
    scale: "1:64",
    price: "",
    cost_price: "",
    max_installments: "1",
    has_surcharge: "false",
    installment_price: "",
    down_payment_amount: "",
    release_date: "",
    stock: "1",
    payment_deadline_date: "",
    payment_deadline_hours: "24",
    is_open: true,
    image_url: "",
    bulk_discount_threshold: "",
    bulk_discount_price: "",
    bulk_has_installment_surcharge: "false",
    bulk_installment_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [isCustomBrand, setIsCustomBrand] = useState(false);

  const configuredBrands = useMemo(() => getStoreBrands(product?.store_id || storeId || ""), [product?.store_id, storeId]);
  const availableBrandOptions = useMemo(() => {
    const set = new Set([...configuredBrands]);
    if (product?.brand) set.add(product.brand.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [configuredBrands, product?.brand]);

  useEffect(() => {
    if (product) {
      const rawVal = (product as any).down_payment_amount;
      const rawMaxInst = (product as any).max_installments;
      const rawPrice2x = (product as any).price_2x;
      const rawInstPrice = (product as any).installment_price ?? rawPrice2x;
      const rawHasSurcharge = (product as any).has_installment_surcharge ?? (rawInstPrice != null && Number(rawInstPrice) > Number(product.price));
      const rawDeadlineDate = (product as any).payment_deadline_date;
      setForm({
        brand: product.brand ?? "",
        model: product.model ?? "",
        scale: product.scale ?? "1:64",
        price: product.price != null ? String(product.price) : "",
        cost_price: (product as any).cost_price != null ? String((product as any).cost_price) : "",
        max_installments: rawMaxInst != null ? String(rawMaxInst) : "1",
        has_surcharge: rawHasSurcharge ? "true" : "false",
        installment_price: rawInstPrice != null ? String(rawInstPrice) : "",
        down_payment_amount: rawVal != null ? String(rawVal) : "",
        release_date: product.release_date ? product.release_date.substring(0, 7) : "",
        stock: product.stock != null ? String(product.stock) : "1",
        payment_deadline_date: rawDeadlineDate ?? "",
        payment_deadline_hours: product.payment_deadline_hours != null ? String(product.payment_deadline_hours) : "24",
        is_open: product.is_open ?? true,
        image_url: product.image_url ?? "",
        bulk_discount_threshold: (product as any).bulk_discount_threshold != null ? String((product as any).bulk_discount_threshold) : "",
        bulk_discount_price: (product as any).bulk_discount_price != null ? String((product as any).bulk_discount_price) : "",
        bulk_has_installment_surcharge: (product as any).bulk_has_installment_surcharge ? "true" : "false",
        bulk_installment_price: (product as any).bulk_installment_price != null ? String((product as any).bulk_installment_price) : "",
      });
      setIsCustomBrand(false);
    }
  }, [product]);

  if (!product) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    if (!form.brand.trim()) {
      return toast.error("Por favor, informe a marca da miniatura.");
    }

    setSaving(true);
    let computedHours = 24;
    if (form.payment_deadline_date) {
      const targetDate = new Date(form.payment_deadline_date + "T23:59:59");
      computedHours = Math.max(0, Math.round((targetDate.getTime() - Date.now()) / (1000 * 60 * 60)));
    } else if (form.down_payment_amount === "" || Number(form.down_payment_amount || 0) === 0) {
      computedHours = 0;
    }

    const maxInst = Number(form.max_installments || 1);
    const hasSurcharge = maxInst > 1 && form.has_surcharge === "true";
    const instPrice = maxInst > 1 ? (hasSurcharge && form.installment_price ? Number(form.installment_price) : Number(form.price || 0)) : null;

    const newStock = Number(form.stock || 0);
    const currentStock = product.stock ?? 0;
    const currentInitial = (product as any).initial_stock ?? currentStock;
    const stockDelta = newStock - currentStock;
    const newInitial = Math.max(newStock, currentInitial + stockDelta);

    const payload: any = {
      brand: form.brand.trim(),
      model: form.model.trim(),
      scale: form.scale,
      price: Number(form.price || 0),
      cost_price: form.cost_price ? Number(form.cost_price) : null,
      max_installments: maxInst,
      has_installment_surcharge: hasSurcharge,
      installment_price: instPrice,
      price_2x: maxInst === 2 ? instPrice : null,
      release_date: form.release_date ? (form.release_date.length === 7 ? form.release_date + "-01" : form.release_date) : null,
      payment_deadline_date: form.payment_deadline_date || null,
      payment_deadline_hours: computedHours,
      stock: newStock,
      initial_stock: newInitial,
      is_open: form.is_open,
      image_url: form.image_url || null,
      slug: slugify(form.model.trim()),
      bulk_discount_threshold: (form as any).bulk_discount_threshold ? Number((form as any).bulk_discount_threshold) : null,
      bulk_discount_price: (form as any).bulk_discount_price ? Number((form as any).bulk_discount_price) : null,
      bulk_has_installment_surcharge: (form as any).bulk_has_installment_surcharge === "true",
      bulk_installment_price: (form as any).bulk_has_installment_surcharge === "true" && (form as any).bulk_installment_price ? Number((form as any).bulk_installment_price) : null,
    };

    if (form.down_payment_amount !== "") {
      payload.down_payment_amount = Number(form.down_payment_amount || 0);
    }

    let { error } = await supabase
      .from("products")
      .update(payload)
      .eq("id", product.id);

    // Fallbacks progressivos para lidar com colunas ausentes no banco
    if (error && (error.code === "PGRST204" || error.message?.includes("initial_stock") || (error as any).status === 400)) {
      delete (payload as any).initial_stock;
      const retry = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("bulk_discount") || error.message?.includes("bulk_has_installment_surcharge") || error.message?.includes("bulk_installment_price") || (error as any).status === 400)) {
      delete payload.bulk_discount_threshold;
      delete payload.bulk_discount_price;
      delete payload.bulk_has_installment_surcharge;
      delete payload.bulk_installment_price;
      const retry = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("cost_price") || (error as any).status === 400)) {
      delete payload.cost_price;
      const retry = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("max_installments") || error.message?.includes("has_installment_surcharge") || (error as any).status === 400)) {
      delete payload.max_installments;
      delete payload.price_2x;
      delete payload.installment_price;
      delete payload.has_installment_surcharge;
      const retry1 = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry1.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("payment_deadline_date") || (error as any).status === 400)) {
      delete payload.payment_deadline_date;
      const retry2 = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry2.error;
    }

    if (error && (error.code === "PGRST204" || error.message?.includes("down_payment_amount") || (error as any).status === 400)) {
      delete payload.down_payment_amount;
      const retry3 = await supabase.from("products").update(payload).eq("id", product.id);
      error = retry3.error;
    }

    setSaving(false);
    if (error) {
      console.error("Erro ao editar miniatura:", error);
      return toast.error(`Não foi possível salvar as alterações: ${error.message || "Erro de permissão"}`);
    }
    queryClient.invalidateQueries();
    toast.success("Miniatura atualizada com sucesso!");
    onClose();
  }

  async function onFile(file: File) {
    try {
      const url = await uploadImage(userId, file);
      setForm((f) => ({ ...f, image_url: url }));
      toast.success("Foto da miniatura enviada!");
    } catch {
      toast.error("Falha ao enviar a foto.");
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-border/30 bg-card/90 max-h-[85vh] overflow-y-auto pr-3">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Editar pré-venda</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-brand" className="text-xs font-medium text-muted-foreground">Marca</Label>
              <Select
                value={
                  isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))
                    ? "__custom"
                    : form.brand
                }
                onValueChange={(val) => {
                  if (val === "__custom") {
                    setIsCustomBrand(true);
                    setForm((f) => ({ ...f, brand: "" }));
                  } else {
                    setIsCustomBrand(false);
                    setForm((f) => ({ ...f, brand: val }));
                  }
                }}
              >
                <SelectTrigger id="edit-brand" className="bg-muted/20 border-border/30">
                  <SelectValue placeholder="Selecione a marca" />
                </SelectTrigger>
                <SelectContent>
                  {availableBrandOptions.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom" className="font-semibold text-primary">+ Outra marca...</SelectItem>
                </SelectContent>
              </Select>
              {(isCustomBrand || (form.brand && !availableBrandOptions.includes(form.brand))) && (
                <Input
                  placeholder="Digite a nova marca..."
                  maxLength={40}
                  required
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="mt-1.5 text-xs sm:text-sm bg-muted/20 border-border/30"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-scale" className="text-xs font-medium text-muted-foreground">Escala</Label>
              <Input
                id="edit-scale"
                maxLength={12}
                value={form.scale}
                onChange={(e) => setForm({ ...form, scale: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-model" className="text-xs font-medium text-muted-foreground">Modelo</Label>
            <Input
              id="edit-model"
              required
              maxLength={80}
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="bg-muted/20 border-border/30"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-cost-price" className="text-xs font-medium text-muted-foreground">Custo (R$)</Label>
              <Input
                id="edit-cost-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 150"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-price" className="text-xs font-medium text-muted-foreground">Venda (R$)</Label>
              <Input
                id="edit-price"
                type="number"
                min="0"
                step="0.01"
                required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-down-payment" className="text-xs font-medium text-muted-foreground">Sinal (R$)</Label>
              <Input
                id="edit-down-payment"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex: 50"
                value={form.down_payment_amount}
                onChange={(e) => setForm({ ...form, down_payment_amount: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-stock" className="text-xs font-medium text-muted-foreground">Unidades</Label>
              <Input
                id="edit-stock"
                type="number"
                min="0"
                required
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Desconto por Quantidade (Atacado)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit_bulk_threshold" className="text-xs font-medium text-muted-foreground">A partir de (unidades)</Label>
                <Input
                  id="edit_bulk_threshold"
                  type="number"
                  min="2"
                  placeholder="Ex: 3"
                  value={(form as any).bulk_discount_threshold}
                  onChange={(e) => setForm({ ...form, bulk_discount_threshold: e.target.value } as any)}
                  className="bg-muted/20 border-border/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit_bulk_price" className="text-xs font-medium text-muted-foreground">Novo Valor Unitário (R$)</Label>
                <Input
                  id="edit_bulk_price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 180"
                  value={(form as any).bulk_discount_price}
                  onChange={(e) => setForm({ ...form, bulk_discount_price: e.target.value } as any)}
                  className="bg-muted/20 border-border/30"
                />
              </div>
            </div>

            {Number(form.max_installments) > 1 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento (Atacado)</Label>
                    <Select
                      value={(form as any).bulk_has_installment_surcharge}
                      onValueChange={(val) => setForm({ ...form, bulk_has_installment_surcharge: val } as any)}
                    >
                      <SelectTrigger className="bg-muted/20 border-border/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                        <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(form as any).bulk_has_installment_surcharge === "true" && (
                  <div className="space-y-1.5 pt-1 mt-3">
                    <Label htmlFor="edit_bulk_inst_price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado no Atacado (R$)</Label>
                    <Input
                      id="edit_bulk_inst_price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 200"
                      value={(form as any).bulk_installment_price}
                      onChange={(e) => setForm({ ...form, bulk_installment_price: e.target.value } as any)}
                      className="bg-muted/20 border-border/30"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-3 rounded-lg border border-border/30 bg-muted/15 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Máximo de parcelas</Label>
                <Select
                  value={form.max_installments}
                  onValueChange={(val) => setForm({ ...form, max_installments: val })}
                >
                  <SelectTrigger className="bg-muted/20 border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x (Apenas à vista)</SelectItem>
                    <SelectItem value="2">Até 2x</SelectItem>
                    <SelectItem value="3">Até 3x</SelectItem>
                    <SelectItem value="4">Até 4x</SelectItem>
                    <SelectItem value="5">Até 5x</SelectItem>
                    <SelectItem value="6">Até 6x</SelectItem>
                    <SelectItem value="10">Até 10x</SelectItem>
                    <SelectItem value="12">Até 12x</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {Number(form.max_installments) > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Condição de parcelamento</Label>
                  <Select
                    value={form.has_surcharge}
                    onValueChange={(val) => setForm({ ...form, has_surcharge: val })}
                  >
                    <SelectTrigger className="bg-muted/20 border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Sem acréscimo (Mesmo valor)</SelectItem>
                      <SelectItem value="true">Com acréscimo (Valor customizado)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {Number(form.max_installments) > 1 && (
              <div>
                {form.has_surcharge === "true" ? (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="edit-inst-price" className="text-xs font-medium text-muted-foreground">Valor Total Parcelado (R$)</Label>
                    <Input
                      id="edit-inst-price"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Ex: 260"
                      value={form.installment_price}
                      onChange={(e) => setForm({ ...form, installment_price: e.target.value })}
                      className="bg-muted/20 border-border/30"
                    />
                    {Number(form.installment_price) > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.installment_price) / Number(form.max_installments))}</strong> (com acréscimo)
                      </p>
                    )}
                  </div>
                ) : (
                  Number(form.price) > 0 && (
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Fica <strong className="text-foreground">{form.max_installments}x de {brl(Number(form.price) / Number(form.max_installments))}</strong> sem acréscimo.
                    </p>
                  )
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-release" className="text-xs font-medium text-muted-foreground">Data estimada</Label>
              <Input
                id="edit-release"
                type="month"
                value={form.release_date}
                onChange={(e) => setForm({ ...form, release_date: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-signal-deadline" className="text-xs font-medium text-muted-foreground">Data limite para o sinal</Label>
              <Input
                id="edit-signal-deadline"
                type="date"
                value={form.payment_deadline_date}
                onChange={(e) => setForm({ ...form, payment_deadline_date: e.target.value })}
                className="bg-muted/20 border-border/30"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <Label htmlFor="edit-open" className="text-xs font-medium text-muted-foreground">Status da pré-venda</Label>
            <div className="flex items-center gap-2 text-xs">
              <Switch
                id="edit-open"
                checked={form.is_open}
                onCheckedChange={(checked) => setForm({ ...form, is_open: checked })}
              />
              <span className="text-muted-foreground">{form.is_open ? "Aberta" : "Fechada"}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-photo" className="text-xs font-medium text-muted-foreground">Foto da miniatura</Label>
            <Input
              id="edit-photo"
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
              className="bg-muted/20 border-border/30"
            />
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Foto da miniatura"
                className="mt-2 h-16 w-full rounded-lg object-cover border border-border/30"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar alterações
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ManualReservationDialogProps {
  storeId: string;
  storeColor?: string;
  storePixKey?: string | null;
  products: Product[];
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  preSelectedProduct?: Product | null;
}

function ManualReservationDialog({
  storeId,
  storeColor,
  storePixKey,
  products,
  open,
  onClose,
  onSuccess,
  preSelectedProduct,
}: ManualReservationDialogProps) {
  const themeColor = storeColor || "#e11d48";
  const { user: currentUser } = useSession();
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedClientMode, setSelectedClientMode] = useState<"existing" | "new">("new");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("aguardando_sinal");
  const [installmentCount, setInstallmentCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);


  // Buscar dados da loja para extrair a Chave PIX cadastrada
  const { data: storeInfo } = useQuery({
    queryKey: ["store-pix-info", storeId],
    enabled: open && !!storeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("pix_key, whatsapp_number")
        .eq("id", storeId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (open) {
      const initialPix = storePixKey || storeInfo?.pix_key || storeInfo?.whatsapp_number || "";
      setPixKey(initialPix);
    }
  }, [open, storePixKey, storeInfo]);

  // Buscar lista de clientes que seguem ou reservaram NETA loja (excluindo o próprio lojista)
  const { data: storeCustomers } = useQuery({
    queryKey: ["store-followers-customers", storeId, currentUser?.id],
    enabled: open && !!storeId,
    queryFn: async () => {
      const { data: links } = await supabase
        .from("customer_store_link")
        .select("user_id")
        .eq("store_id", storeId);

      const { data: orders } = await supabase
        .from("orders")
        .select("user_id")
        .eq("store_id", storeId);

      const followerUserIds = Array.from(
        new Set([
          ...(links ?? []).map((l) => l.user_id),
          ...(orders ?? []).map((o) => o.user_id),
        ])
      ).filter((id) => id !== currentUser?.id);

      if (!followerUserIds.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email, phone")
        .in("id", followerUserIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

      return followerUserIds.map((id) => {
        const p = profileMap.get(id);
        const cached = getCustomerFromCache(id);

        const rawName = (p?.name && p.name !== "Cliente" && p.name !== "Cliente cadastrado" ? p.name : cached?.name) || "";
        const email = (p?.email?.trim() || cached?.email) || "";
        const phone = (p?.phone?.trim() || cached?.phone) || "";

        const isGeneric = !rawName || rawName === "Cliente" || rawName === "Cliente cadastrado";
        const displayName = !isGeneric
          ? rawName
          : email
            ? email
            : phone
              ? `Cliente · ${phone}`
              : "Cliente sem nome registrado";

        return {
          id,
          name: displayName,
          rawName: rawName || "",
          email: email || null,
          phone: phone || null,
        };
      });
    },
  });

  const [manualQuantity, setManualQuantity] = useState<number>(1);

  useEffect(() => {
    if (preSelectedProduct) {
      setSelectedProductId(preSelectedProduct.id);
    } else if (products.length > 0 && !selectedProductId) {
      setSelectedProductId(products[0].id);
    }
  }, [preSelectedProduct, products, open]);

  useEffect(() => {
    if (selectedProductId && products.length > 0) {
      const p = products.find((prod) => prod.id === selectedProductId);
      if (p) {
        if (hasNoSignalRequirement(p)) {
          setPaymentStatus("sem_sinal");
        } else {
          setPaymentStatus("aguardando_sinal");
        }
      }
    }
  }, [selectedProductId, products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProductId) return toast.error("Selecione uma pré-venda.");
    if (!clientName.trim()) return toast.error("Informe o nome do cliente.");
    if (!clientPhone.trim()) return toast.error("Informe o WhatsApp do cliente.");

    const cleanPhone = clientPhone.trim();
    const cleanName = clientName.trim();
    let clientId = selectedUserId;

    if (clientId === currentUser?.id) {
      return toast.error("Você é o dono da loja e não pode criar reservas em seu próprio nome. Escolha ou informe os dados de um cliente.");
    }

    // Se o lojista não selecionou da lista, tenta encontrar o cadastro do cliente pelo telefone ou email
    if (!clientId) {
      const cleanPhoneDigits = cleanPhone.replace(/\D/g, "");
      const { data: foundProf } = await supabase
        .from("profiles")
        .select("id, phone")
        .or(`phone.eq.${cleanPhone},phone.eq.55${cleanPhoneDigits},phone.eq.${cleanPhoneDigits}`)
        .maybeSingle();

      if (foundProf) {
        clientId = foundProf.id;
      } else {
        const { data: profilesList } = await supabase
          .from("profiles")
          .select("id, phone")
          .not("phone", "is", null);

        if (profilesList && profilesList.length > 0) {
          const found = profilesList.find((p) => {
            if (!p.phone) return false;
            const pDigits = p.phone.replace(/\D/g, "");
            return cleanPhoneDigits.length >= 8 && pDigits.length >= 8 &&
              (cleanPhoneDigits.slice(-8) === pDigits.slice(-8) || cleanPhoneDigits === pDigits);
          });
          if (found) {
            clientId = found.id;
          }
        }
      }

      // Se ainda não existir perfil cadastrado, insere um perfil convidado temporário na tabela profiles
      if (!clientId) {
        const guestId = crypto.randomUUID();
        const { error: profErr } = await supabase.from("profiles").insert({
          id: guestId,
          name: cleanName,
          phone: cleanPhone,
        });

        if (!profErr) {
          clientId = guestId;
        }
      }
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return toast.error("Pré-venda não encontrada.");
    if (product.stock <= 0) return toast.error("Unidades esgotadas para esta pré-venda.");

    const qtyToCreate = Math.min(manualQuantity, product.stock);
    if (qtyToCreate <= 0) return toast.error("Quantidade inválida.");

    setSaving(true);
    try {
      // 1. Salvar os dados do cliente no cache local da loja
      saveCustomerToCache({ id: clientId, name: cleanName, phone: cleanPhone });



      // 3. Atualizar perfil do cliente no Supabase se existir (sem travar se RLS negar)
      try {
        const { data: existingProf } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", clientId)
          .maybeSingle();

        if (existingProf) {
          await supabase
            .from("profiles")
            .update({ name: cleanName, phone: cleanPhone })
            .eq("id", clientId);
        }
      } catch {
        // Ignora erros de RLS
      }

      // 4. Calcular preços unitários
      const cashPrice = Number(product.price);
      const instOptions = getInstallmentOptions(product);
      const chosenOption = instOptions.find((o) => o.value === installmentCount) ?? instOptions[0];
      const totalPrice = installmentCount > 1 ? chosenOption.totalPrice : cashPrice;
      
      const customSignal = Number((product as any).down_payment_amount || 0);
      let downPayment = 0;

      if (paymentStatus === "sinal_pago") {
        downPayment = customSignal > 0 ? customSignal : Math.round(cashPrice * 0.2 * 100) / 100;
      } else if (paymentStatus === "quitado") {
        downPayment = totalPrice;
      } else if (paymentStatus === "sem_sinal") {
        downPayment = 0;
      } else if (paymentStatus === "aguardando_sinal") {
        downPayment = 0;
      }

      let expiresAt: string | null = null;
      if (paymentStatus === "aguardando_sinal") {
        if ((product as any).payment_deadline_date) {
          expiresAt = new Date((product as any).payment_deadline_date + "T23:59:59").toISOString();
        } else if ((product as any).payment_deadline_hours && Number((product as any).payment_deadline_hours) > 0) {
          expiresAt = new Date(Date.now() + Number((product as any).payment_deadline_hours) * 3600 * 1000).toISOString();
        } else {
          expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        }
      }

      // 5. Inserir as reservas no banco
      const isRegisteredUser = Boolean(clientId && clientId !== currentUser?.id);
      const effectiveUserId = clientId || currentUser!.id;
      const guestKeyString = !isRegisteredUser
        ? `GUEST:${JSON.stringify({ name: cleanName, phone: cleanPhone, pix: pixKey.trim() || null })}`
        : (pixKey.trim() || null);

      for (let i = 0; i < qtyToCreate; i++) {
        const orderPayload: any = {
          store_id: storeId,
          product_id: product.id,
          user_id: effectiveUserId,
          total_price: totalPrice,
          down_payment: downPayment,
          payment_status: paymentStatus,
          reservation_expires_at: expiresAt,
        };

        if (installmentCount > 1) {
          orderPayload.installment_count = installmentCount;
        }
        if (guestKeyString) {
          orderPayload.pix_key = guestKeyString;
        }

        let { data: insertedOrder, error: orderErr } = await supabase
          .from("orders")
          .insert(orderPayload)
          .select("id")
          .single();

        // Fallback se .select().single() não retornar ou se houver erro pontual de coluna
        if (orderErr) {
          if (orderErr.message?.includes("installment_count") || orderErr.code === "PGRST204") {
            delete orderPayload.installment_count;
          }
          const retry = await supabase.from("orders").insert(orderPayload).select("id").maybeSingle();
          orderErr = retry.error;
          if (retry.data?.id) {
            saveCustomerToCache({ id: retry.data.id, name: cleanName, phone: cleanPhone });
          }
        } else if (insertedOrder?.id) {
          saveCustomerToCache({ id: insertedOrder.id, name: cleanName, phone: cleanPhone });
        }

        if (orderErr) throw orderErr;
      }

      // 6. Atualizar estoque e vincular loja ao cliente
      await supabase
        .from("products")
        .update({ stock: Math.max(0, product.stock - qtyToCreate) })
        .eq("id", product.id);

      // O vínculo de cliente com a loja já é garantido pela tabela 'orders' (store_id e user_id)

      queryClient.invalidateQueries();
      toast.success(qtyToCreate > 1 ? `${qtyToCreate} unidades vinculadas ao cliente ${cleanName}!` : `Reserva vinculada ao cliente ${cleanName}!`);
      
      setClientName("");
      setClientPhone("");
      setSelectedUserId("");
      setInstallmentCount(1);
      setManualQuantity(1);
      if (onSuccess) {
        onSuccess();
      } else {
        onClose();
      }
    } catch (err: any) {
      console.error("Erro ao criar reserva manual:", err);
      toast.error("Não foi possível registrar a reserva.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md border-border/30 bg-card/90 p-4 sm:p-6 overflow-hidden rounded-2xl flex flex-col max-h-[90vh]">
        <DialogHeader className="shrink-0 pb-3 border-b border-border/20">
          <DialogTitle className="text-lg sm:text-xl font-semibold">Nova Reserva para Cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4 min-w-0 overflow-y-auto pr-2.5 flex-1">
          <div className="space-y-2 min-w-0">
            <Label className="text-xs font-medium text-muted-foreground">Pré-venda / Miniatura</Label>
            <Select
              value={selectedProductId}
              onValueChange={(id) => {
                setSelectedProductId(id);
                setManualQuantity(1);
              }}
            >
              <SelectTrigger className="w-full text-xs sm:text-sm bg-muted/20 border-border/30">
                <SelectValue placeholder="Selecione a miniatura" className="truncate" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)] max-h-60">
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id} disabled={p.stock <= 0} className="text-xs sm:text-sm">
                    <span className="truncate block">
                      {p.brand} {p.model} ({p.stock} {p.stock === 1 ? "unidade" : "unidades"} em estoque — {brl(Number(p.price))})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantidade e Resumo de Valor */}
          {(() => {
            const selProd = products.find((p) => p.id === selectedProductId);
            if (!selProd) return null;
            const maxStock = Math.min(selProd.stock, 20);
            const unitPrice = Number(selProd.price || 0);
            const totalPrice = unitPrice * manualQuantity;

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-xs">
                <div className="space-y-1">
                  <Label htmlFor="manual-qty" className="text-xs font-semibold text-muted-foreground">Quantidade de Unidades</Label>
                  <Select
                    value={String(manualQuantity)}
                    onValueChange={(v) => setManualQuantity(Number(v))}
                  >
                    <SelectTrigger id="manual-qty" className="h-8 bg-background border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: maxStock }, (_, i) => i + 1).map((q) => (
                        <SelectItem key={q} value={String(q)} className="text-xs">
                          {q} {q === 1 ? "unidade" : "unidades"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col justify-center text-right">
                  <span className="text-[11px] text-muted-foreground">Valor Total da Reserva</span>
                  <span className="text-base font-bold text-primary">{brl(totalPrice)}</span>
                  {manualQuantity > 1 && (
                    <span className="text-[10px] text-muted-foreground font-mono">({manualQuantity}x {brl(unitPrice)})</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Seleção do Cliente (Já cadastrado vs Novo) */}
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <Label className="text-xs font-medium text-muted-foreground">Cliente</Label>
              <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-lg text-xs border border-border/20">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientMode("existing");
                    setSelectedUserId("");
                  }}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    selectedClientMode === "existing"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Cadastrado ({storeCustomers?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClientMode("new");
                    setSelectedUserId("");
                  }}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    selectedClientMode === "new"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Novo cliente
                </button>
              </div>
            </div>

            {selectedClientMode === "existing" && (
              <div className="relative">
                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => { setCustomerDropdownOpen(!customerDropdownOpen); setCustomerSearch(""); }}
                  className="flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-xs sm:text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-[2.5rem]"
                >
                  {selectedUserId && storeCustomers?.find((c) => c.id === selectedUserId) ? (
                    <div className="flex flex-col min-w-0 text-left">
                      <span className="font-semibold text-foreground truncate block">
                        {storeCustomers.find((c) => c.id === selectedUserId)!.name}
                      </span>
                      {storeCustomers.find((c) => c.id === selectedUserId)!.phone && (
                        <span className="text-[11px] font-medium truncate block" style={{ color: themeColor }}>
                          📱 {storeCustomers.find((c) => c.id === selectedUserId)!.phone}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Selecione um cliente cadastrado...</span>
                  )}
                  <Search className="ml-2 size-4 shrink-0 opacity-50" />
                </button>

                {/* Dropdown */}
                {customerDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md animate-in fade-in-0 zoom-in-95">
                    {/* Search input */}
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                      <Search className="size-4 shrink-0 text-muted-foreground" />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Buscar por nome, e-mail ou WhatsApp..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className="flex-1 bg-transparent text-xs sm:text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>

                    {/* Customer list */}
                    <div className="max-h-52 overflow-y-auto">
                      {(() => {
                        const q = customerSearch.toLowerCase().trim();
                        const filtered = (storeCustomers ?? []).filter((c) => {
                          if (!q) return true;
                          return (
                            c.name.toLowerCase().includes(q) ||
                            (c.rawName && c.rawName.toLowerCase().includes(q)) ||
                            (c.email && c.email.toLowerCase().includes(q)) ||
                            (c.phone && c.phone.replace(/\D/g, "").includes(q.replace(/\D/g, "")))
                          );
                        });

                        if (filtered.length === 0) {
                          return (
                            <div className="p-3 text-xs text-muted-foreground text-center">
                              {storeCustomers?.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda nesta loja."}
                            </div>
                          );
                        }

                        return filtered.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setSelectedUserId(c.id);
                              const isGenericOrEmail = !c.rawName || c.rawName === "Cliente" || c.name.includes("@");
                              setClientName(isGenericOrEmail ? (c.email ? c.email.split("@")[0] : "") : c.name);
                              setClientPhone(c.phone || "");
                              setCustomerDropdownOpen(false);
                              setCustomerSearch("");
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/60 transition-colors ${
                              selectedUserId === c.id ? "bg-accent" : ""
                            }`}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="font-semibold text-foreground text-xs sm:text-sm truncate block">
                                {c.name}
                              </span>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-0">
                                {c.email && c.name !== c.email && (
                                  <span className="text-[11px] text-muted-foreground truncate">
                                    {c.email}
                                  </span>
                                )}
                                {c.phone && (
                                  <span className="text-[11px] font-medium truncate" style={{ color: themeColor }}>
                                    📱 {c.phone}
                                  </span>
                                )}
                                {!c.rawName && !c.phone && (
                                  <span className="text-[11px] text-primary font-medium">
                                    Clique para definir Nome e WhatsApp
                                  </span>
                                )}
                              </div>
                            </div>
                            {selectedUserId === c.id && (
                              <span className="text-primary text-sm">✓</span>
                            )}
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}

                {/* Backdrop to close dropdown */}
                {customerDropdownOpen && (
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => { setCustomerDropdownOpen(false); setCustomerSearch(""); }}
                  />
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 min-w-0">
            <Label htmlFor="manual-client-name" className="text-xs font-medium text-muted-foreground">Nome do Cliente</Label>
            <Input
              id="manual-client-name"
              required
              placeholder="Ex: João da Silva"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="text-xs sm:text-sm bg-muted/20 border-border/30"
            />
          </div>

          <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between">
              <Label htmlFor="manual-client-phone" className="text-xs font-medium text-muted-foreground">WhatsApp do Cliente</Label>
              {selectedUserId && clientPhone && (
                <span className="text-[11px] text-success font-medium flex items-center gap-1">
                  ✓ Do cadastro
                </span>
              )}
            </div>
            <PhoneInput id="manual-client-phone" required value={clientPhone} onChange={setClientPhone} />
            {selectedUserId && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Este WhatsApp está vinculado à conta cadastrada do cliente e será sincronizado no perfil dele.
              </p>
            )}
          </div>

          <div className="space-y-2 min-w-0">
            <Label htmlFor="manual-pix-key" className="text-xs font-medium text-muted-foreground">Chave PIX da Loja (opcional)</Label>
            <Input
              id="manual-pix-key"
              placeholder="Ex: CPF, CNPJ, E-mail, Telefone ou Chave Aleatória"
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              className="text-xs sm:text-sm font-mono bg-muted/20 border-border/30"
            />
          </div>

          <div className="space-y-2 min-w-0">
            <Label className="text-xs font-medium text-muted-foreground">Status do Pagamento</Label>
            <Select value={paymentStatus} onValueChange={setPaymentStatus}>
              <SelectTrigger className="w-full text-xs sm:text-sm bg-muted/20 border-border/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-3rem)]">
                <SelectItem value="aguardando_sinal" className="text-xs sm:text-sm">Aguardando Sinal</SelectItem>
                <SelectItem value="sem_sinal" className="text-xs sm:text-sm">Sem sinal / Pagar na chegada</SelectItem>
                <SelectItem value="sinal_pago" className="text-xs sm:text-sm">Sinal Pago</SelectItem>
                <SelectItem value="quitado" className="text-xs sm:text-sm">Pago Total (Quitado)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de Parcelamento */}
          {(() => {
            const selectedProduct = products.find((p) => p.id === selectedProductId);
            const instOptions = selectedProduct ? getInstallmentOptions(selectedProduct, manualQuantity) : [];
            if (instOptions.length <= 1) return null;
            const chosenOption = instOptions.find((o) => o.value === installmentCount) ?? instOptions[0];
            return (
              <div className="space-y-2 min-w-0">
                <Label className="text-xs font-medium text-muted-foreground">Condição de Pagamento</Label>
                <Select
                  value={String(installmentCount)}
                  onValueChange={(v) => setInstallmentCount(Number(v))}
                >
                  <SelectTrigger className="w-full text-xs sm:text-sm bg-muted/20 border-border/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-3rem)]">
                    {instOptions.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)} className="text-xs sm:text-sm">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {installmentCount > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    Total da reserva: <strong className="text-foreground">{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(chosenOption.totalPrice)}</strong>
                  </p>
                )}
              </div>
            );
          })()}


          <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm flex justify-end gap-2 pt-3 pb-1 border-t border-border/20 mt-4 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin mr-1" />} Confirmar Reserva
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



const PAGE_SIZE = 8;

function OrdersTab({
  orders,
  storeId,
  storeColor,
  products = [],
}: {
  orders: OrderRow[];
  storeId?: string;
  storeColor?: string;
  products?: Product[];
}) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<string>("todos");
  const [deliveryFilter, setDeliveryFilter] = useState<string>("todos");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const parentRef = useRef<HTMLDivElement>(null);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [manualDialogOpen, setManualDialogOpen] = useState(false);

  async function handleTrackingSave(ids: string[], code: string) {
    const { error } = await supabase
      .from("orders")
      .update({ tracking_code: code.trim() || null })
      .in("id", ids);

    if (error) {
      console.error("Erro ao salvar rastreio:", error);
      if (error.code === "PGRST204" || error.message?.includes("tracking_code") || error.details?.includes("tracking_code")) {
        return toast.error(
          "A coluna 'tracking_code' precisa ser criada no Supabase! Execute o comando SQL fornecido no Supabase Dashboard.",
          { duration: 7000 }
        );
      }
      return toast.error("Não foi possível salvar o código de rastreio. Verifique se executou a SQL no Supabase.");
    }
    queryClient.invalidateQueries();
    toast.success("Código de rastreio salvo!");
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Ocultar cancelados por padrão caso o usuário não tenha filtrado especificamente por 'cancelado'
      if (paymentFilter === "todos" && deliveryFilter === "todos") {
        if (o.payment_status === "cancelado" || o.delivery_status === "cancelado") {
          return false;
        }
      }

      if (paymentFilter === "atrasado") {
        if (o.payment_status !== "aguardando_sinal" || !o.reservation_expires_at || new Date(o.reservation_expires_at) >= new Date()) {
          return false;
        }
      } else if (paymentFilter !== "todos" && o.payment_status !== paymentFilter) {
        return false;
      }

      if (deliveryFilter !== "todos" && o.delivery_status !== deliveryFilter) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const cleanQ = q.replace(/^#/, "");

      const clientName = (o.profiles?.name || "").toLowerCase();
      const clientEmail = (o.profiles?.email || "").toLowerCase();
      const clientPhone = (o.profiles?.phone || "").toLowerCase();
      const prodModel = (o.products?.model || "").toLowerCase();
      const prodBrand = (o.products?.brand || "").toLowerCase();
      const orderId = (o.id || "").toLowerCase();
      const trackingCode = (o.tracking_code || "").toLowerCase();

      return (
        clientName.includes(q) ||
        clientEmail.includes(q) ||
        clientPhone.includes(q) ||
        prodModel.includes(q) ||
        prodBrand.includes(q) ||
        orderId.includes(q) ||
        (cleanQ.length > 0 && orderId.includes(cleanQ)) ||
        trackingCode.includes(q)
      );
    });
  }, [orders, searchQuery, paymentFilter, deliveryFilter]);

  type GroupedOrderRow = { order: OrderRow; quantity: number; ids: string[] };

  const groupedOrders = useMemo(() => {
    const map = new Map<string, GroupedOrderRow>();
    for (const o of filteredOrders) {
      let guestMeta: any = null;
      if (o.pix_key && typeof o.pix_key === "string") {
        if (o.pix_key.startsWith("GUEST:")) {
          try { guestMeta = JSON.parse(o.pix_key.replace(/^GUEST:/, "")); } catch {}
        } else if (o.pix_key.startsWith('{"manual_guest":true')) {
          try { guestMeta = JSON.parse(o.pix_key); } catch {}
        }
      }

      const clientPhone = guestMeta?.phone || o.profiles?.phone || "";
      const effectiveUserId = o.user_id + "_" + clientPhone;
      const tracking = o.tracking_code || "";

      const key = `${o.product_id}_${effectiveUserId}_${o.payment_status}_${o.delivery_status}_${tracking}`;

      if (map.has(key)) {
        const item = map.get(key)!;
        item.quantity += 1;
        item.ids.push(o.id);
      } else {
        map.set(key, { order: o, quantity: 1, ids: [o.id] });
      }
    }
    return Array.from(map.values());
  }, [filteredOrders]);

  const pages = Math.max(1, Math.ceil(groupedOrders.length / PAGE_SIZE));
  const rows = groupedOrders.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  async function adjustStockOnCancel(productId: string, isCancelling: boolean, quantity: number) {
    if (!productId) return;
    const { data: product } = await supabase
      .from("products")
      .select("stock, is_open")
      .eq("id", productId)
      .maybeSingle();

    if (!product) return;

    if (isCancelling) {
      const newStock = (product.stock ?? 0) + quantity;
      await supabase
        .from("products")
        .update({ stock: newStock, is_open: true })
        .eq("id", productId);
    } else {
      const newStock = Math.max(0, (product.stock ?? 0) - quantity);
      await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", productId);
    }
  }

  async function updateGroup(
    ids: string[],
    patch: Partial<Pick<Tables<"orders">, "down_payment" | "payment_status" | "delivery_status" | "reservation_expires_at">>,
  ) {
    const { error } = await supabase.from("orders").update(patch).in("id", ids);

    if (error) return toast.error("Não foi possível atualizar a reserva.");
    queryClient.invalidateQueries();
  }

  async function handleDeleteGroup(item: GroupedOrderRow) {
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente esta reserva (${item.quantity} unidade(s))?`)) {
      return;
    }
    const { order: o, quantity, ids } = item;
    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    if (!wasCancelled) {
      await adjustStockOnCancel(o.product_id, true, quantity);
    }
    const { error } = await supabase.from("orders").delete().in("id", ids);
    if (error) {
      return toast.error("Não foi possível excluir a reserva.");
    }
    queryClient.invalidateQueries();
    toast.success("Reserva excluída!");
  }

  async function handlePaymentStatusChange(item: GroupedOrderRow, newStatus: string) {
    const { order: o, quantity, ids } = item;
    const groupId = ids[0];
    let downPayment = Number(drafts[groupId] ?? o.down_payment);
    const totalPrice = Number(o.total_price);
    const customSignal = Number((o.products as any)?.down_payment_amount || 0);

    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    const isNowCancelled = newStatus === "cancelado";

    if (!wasCancelled && isNowCancelled) {
      await adjustStockOnCancel(o.product_id, true, quantity);
    } else if (wasCancelled && !isNowCancelled) {
      await adjustStockOnCancel(o.product_id, false, quantity);
    }

    const patch: any = { payment_status: newStatus };

    if (newStatus === "sinal_pago") {
      if (customSignal > 0) {
        downPayment = customSignal;
      } else if (downPayment === 0 && totalPrice > 0) {
        downPayment = Math.round(totalPrice * 0.2 * 100) / 100;
      }
      patch.down_payment = downPayment;
      patch.reservation_expires_at = null;
    } else if (newStatus === "quitado") {
      downPayment = totalPrice;
      patch.down_payment = downPayment;
      patch.reservation_expires_at = null;
    } else if (newStatus === "sem_sinal") {
      downPayment = 0;
      patch.down_payment = 0;
      patch.reservation_expires_at = null;
    } else if (newStatus === "aguardando_sinal") {
      downPayment = 0;
      patch.down_payment = 0;
      if (!o.reservation_expires_at) {
        const prod = o.products as any;
        if (prod?.payment_deadline_date) {
          patch.reservation_expires_at = new Date(prod.payment_deadline_date + "T23:59:59").toISOString();
        } else if (prod?.payment_deadline_hours && Number(prod.payment_deadline_hours) > 0) {
          patch.reservation_expires_at = new Date(Date.now() + Number(prod.payment_deadline_hours) * 3600 * 1000).toISOString();
        } else {
          patch.reservation_expires_at = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
        }
      }
    } else {
      patch.down_payment = downPayment;
    }

    setDrafts((prev) => ({ ...prev, [groupId]: String(downPayment) }));
    await updateGroup(ids, patch);

    if (!wasCancelled && isNowCancelled) {
      toast.success(`Reserva cancelada! +${quantity} unidade(s) devolvida(s) ao estoque.`);
    } else {
      toast.success("Reserva atualizada.");
    }
  }

  async function handleDeliveryStatusChange(item: GroupedOrderRow, newStatus: string) {
    const { order: o, quantity, ids } = item;
    const wasCancelled = o.payment_status === "cancelado" || o.delivery_status === "cancelado";
    const isNowCancelled = newStatus === "cancelado";

    if (!wasCancelled && isNowCancelled) {
      await adjustStockOnCancel(o.product_id, true, quantity);
    } else if (wasCancelled && !isNowCancelled) {
      await adjustStockOnCancel(o.product_id, false, quantity);
    }

    await updateGroup(ids, { delivery_status: newStatus });

    if (!wasCancelled && isNowCancelled) {
      toast.success(`Envio cancelado! +${quantity} unidade(s) devolvida(s) ao estoque.`);
    } else {
      toast.success("Status de envio atualizado.");
    }
  }

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 350,
    overscan: 5,
  });
  
  const brandData = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      if (o.payment_status === "cancelado" || o.delivery_status === "cancelado") {
        return;
      }
      const b = o.products?.brand || "Outros";
      counts[b] = (counts[b] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [orders]);

  const handleDragStart = (e: React.DragEvent, item: GroupedOrderRow) => {
    e.dataTransfer.setData("application/json", JSON.stringify(item.ids));
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    try {
      const ids = JSON.parse(e.dataTransfer.getData("application/json"));
      if (ids && ids.length > 0) {
        // Find the item to get quantity and product ID for stock adjustments
        const item = groupedOrders.find(g => g.ids[0] === ids[0]);
        if (item) {
           await handlePaymentStatusChange(item, newStatus);
        }
      }
    } catch (err) {}
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const kanbanBoard = useMemo(() => {
    const cols = {
      aguardando_sinal: { title: "Aguardando Sinal", items: [] as GroupedOrderRow[] },
      sem_sinal: { title: "Sem Sinal / Chegada", items: [] as GroupedOrderRow[] },
      sinal_pago: { title: "Sinal Pago", items: [] as GroupedOrderRow[] },
      quitado: { title: "Quitado", items: [] as GroupedOrderRow[] },
      entregue: { title: "Entregue / Enviado", items: [] as GroupedOrderRow[] },
      cancelado: { title: "Cancelados", items: [] as GroupedOrderRow[] },
    };

    groupedOrders.forEach(item => {
      const { order: o } = item;

      if (o.payment_status === "cancelado" || o.delivery_status === "cancelado") {
        cols.cancelado.items.push(item);
      } else if (o.delivery_status === "entregue" || o.delivery_status === "enviado") {
        cols.entregue.items.push(item);
      } else if (o.payment_status === "quitado") {
        cols.quitado.items.push(item);
      } else if (o.payment_status === "sinal_pago") {
        cols.sinal_pago.items.push(item);
      } else if (o.payment_status === "sem_sinal" || o.payment_status === "pagar_na_chegada") {
        cols.sem_sinal.items.push(item);
      } else {
        cols.aguardando_sinal.items.push(item);
      }
    });
    return cols;
  }, [groupedOrders]);

  const toggleSelection = (groupId: string) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(groupId)) newSet.delete(groupId);
    else newSet.add(groupId);
    setSelectedOrders(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedOrders.size === rows.length && rows.length > 0) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(rows.map(item => item.ids[0])));
    }
  };

  const handleBulkStatus = async (statusType: "payment" | "delivery", newStatus: string) => {
    if (selectedOrders.size === 0) return;
    const allIds: string[] = [];
    selectedOrders.forEach(groupId => {
      const item = rows.find(r => r.ids[0] === groupId);
      if (item) allIds.push(...item.ids);
    });

    if (statusType === "payment") {
      await updateGroup(allIds, { payment_status: newStatus });
      toast.success(`${selectedOrders.size} reserva(s) atualizada(s)!`);
    } else {
      await updateGroup(allIds, { delivery_status: newStatus });
      toast.success(`${selectedOrders.size} reserva(s) atualizada(s)!`);
    }
    setSelectedOrders(new Set());
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SalesChart brandData={brandData} />
      </div>

    <Card className="border-border/60 panel relative">
      {/* BARRA DE PESQUISA E FILTROS DE CLIENTE / WHATSAPP / STATUS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/60 p-4">
        <div className="relative w-full sm:flex-1 sm:min-w-[240px]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, Nº do pedido (#id), WhatsApp, miniatura..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(0);
            }}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-muted/50 p-0.5 rounded-lg border border-border/60">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("table")}
              title="Visualização em Tabela"
            >
              <List className="size-4" />
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2"
              onClick={() => setViewMode("kanban")}
              title="Visualização em Kanban"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const csvRows = [
                ["ID Pedido", "Cliente", "WhatsApp", "Miniatura", "Marca", "Total (R$)", "Sinal (R$)", "Status Pagamento", "Status Entrega", "Data"].join(";"),
                ...filteredOrders.map((o) => {
                  const name = o.profiles?.name || "Cliente";
                  const phone = o.profiles?.phone || "";
                  const model = o.products?.model || "";
                  const brand = o.products?.brand || "";
                  const date = new Date(o.created_at).toLocaleDateString("pt-BR");
                  return [o.id, `"${name}"`, `"${phone}"`, `"${model}"`, `"${brand}"`, o.total_price, o.down_payment, o.payment_status, o.delivery_status, date].join(";");
                }),
              ];
              const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `pedidos-loja-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Relatório de pedidos exportado com sucesso!");
            }}
            className="h-9 text-xs gap-1.5 border-border/80"
          >
            <Download className="size-3.5 text-primary" />
            <span>Exportar CSV</span>
          </Button>

          {storeId && (
            <Button
              size="sm"
              onClick={() => setManualDialogOpen(true)}
              className="gap-1 bg-primary text-primary-foreground hover:bg-primary/90 h-9 text-xs font-semibold"
            >
              <Plus className="size-4" />
              <span>Nova Reserva</span>
            </Button>
          )}
          <Filter className="size-4 text-muted-foreground" />
          <Select
            value={paymentFilter}
            onValueChange={(v) => {
              setPaymentFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 w-[160px] text-xs">
              <SelectValue placeholder="Pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Qualquer pagamento</SelectItem>
              <SelectItem value="sem_sinal">Sem sinal</SelectItem>
              <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
              <SelectItem value="atrasado">Sinal Atrasado</SelectItem>
              <SelectItem value="sinal_pago">Sinal pago</SelectItem>
              <SelectItem value="quitado">Quitado</SelectItem>
              <SelectItem value="cancelado">Cancelados</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={deliveryFilter}
            onValueChange={(v) => {
              setDeliveryFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 w-[130px] text-xs">
              <SelectValue placeholder="Envio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Qualquer envio</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="enviado">Enviado</SelectItem>
              <SelectItem value="entregue">Entregue</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <CardContent className="p-0">
        {viewMode === "kanban" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 min-h-[500px] p-4 bg-muted/5">
            {Object.entries(kanbanBoard).map(([statusKey, col]) => (
              <div 
                key={statusKey} 
                className="flex flex-col gap-3 w-full bg-muted/20 rounded-xl p-3 border border-border/50"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, statusKey === "entregue" ? "entregue" : statusKey)}
              >
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-semibold text-sm">{col.title}</h3>
                  <Badge variant="secondary" className="text-xs">{col.items.length}</Badge>
                </div>
                <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                  {col.items.map(item => {
                    const { order: o, quantity, ids } = item;
                    const groupId = ids[0];
                    let guestMeta: { name?: string; phone?: string } | null = null;
                    if (o.pix_key && typeof o.pix_key === "string") {
                      if (o.pix_key.startsWith("GUEST:")) {
                        try { guestMeta = JSON.parse(o.pix_key.replace(/^GUEST:/, "")); } catch {}
                      } else if (o.pix_key.startsWith('{"manual_guest":true')) {
                        try { guestMeta = JSON.parse(o.pix_key); } catch {}
                      }
                    }
                    const cached = getCustomerFromCache(o.id) || getCustomerFromCache(o.user_id);
                    const displayName =
                      guestMeta?.name ||
                      (o.profiles?.name && o.profiles.name !== "Cliente" && o.profiles.name !== "Cliente cadastrado"
                        ? o.profiles.name
                        : cached?.name) ||
                      (o.profiles?.email ? o.profiles.email.split("@")[0] : null) ||
                      (guestMeta?.phone || o.profiles?.phone || cached?.phone ? `Cliente (${guestMeta?.phone || o.profiles?.phone || cached?.phone})` : "Cliente sem nome");
                    
                    const clientPhone = guestMeta?.phone || o.profiles?.phone || cached?.phone;

                    return (
                      <div 
                        key={groupId} 
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        className={`bg-card rounded-lg p-3 border shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors ${selectedOrders.has(groupId) ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                      >
                        <div className="flex items-start gap-2 mb-2 relative">
                          <div className="absolute -top-1 -right-1 z-10">
                            <Checkbox checked={selectedOrders.has(groupId)} onCheckedChange={() => toggleSelection(groupId)} />
                          </div>
                          <div className="size-10 shrink-0 rounded bg-muted border border-border overflow-hidden">
                             {o.products?.image_url ? (
                                <img src={o.products.image_url} alt={o.products.model || ""} className="w-full h-full object-cover" />
                             ) : <Package className="size-4 m-auto mt-3 text-muted-foreground" />}
                          </div>
                          <div>
                            <p className="text-xs font-semibold leading-tight line-clamp-2">{o.products?.model || "Miniatura"}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{displayName}</p>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-2 border-t border-border/40 pt-2">
                          <span className="text-xs font-semibold">{brl(Number(o.total_price) * quantity)}</span>
                          <div className="flex items-center gap-1">
                            {quantity > 1 && <Badge variant="outline" className="text-[9px] px-1 h-4">{quantity}x</Badge>}
                            {clientPhone && (
                              <OrderWhatsAppDropdown
                                order={o}
                                quantity={quantity}
                                displayName={displayName}
                                phone={clientPhone}
                                variant="icon"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {col.items.length === 0 && (
                    <div className="h-full flex items-center justify-center border-2 border-dashed border-border/50 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground text-center">Arraste para cá</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
        <>
        {/* VISÃO PARA CELULAR (CARDS INDIVIDUAIS COM ESPAÇAMENTO CLARO) */}
        <div ref={parentRef} className="md:hidden bg-muted/20 h-[65dvh] overflow-y-auto px-4">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize() + 32}px`,
              width: '100%',
              position: 'relative',
              marginTop: '16px'
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = rows[virtualRow.index];
            const { order: o, quantity, ids } = item;
            const groupId = ids[0];
            let guestMeta: { name?: string; phone?: string } | null = null;
            if (o.pix_key && typeof o.pix_key === "string") {
              if (o.pix_key.startsWith("GUEST:")) {
                try { guestMeta = JSON.parse(o.pix_key.replace(/^GUEST:/, "")); } catch {}
              } else if (o.pix_key.startsWith('{"manual_guest":true')) {
                try { guestMeta = JSON.parse(o.pix_key); } catch {}
              }
            }
            const cached = getCustomerFromCache(o.id) || getCustomerFromCache(o.user_id);
            const displayName =
              guestMeta?.name ||
              (o.profiles?.name && o.profiles.name !== "Cliente" && o.profiles.name !== "Cliente cadastrado"
                ? o.profiles.name
                : cached?.name) ||
              (o.profiles?.email ? o.profiles.email.split("@")[0] : null) ||
              (guestMeta?.phone || o.profiles?.phone || cached?.phone ? `Cliente (${guestMeta?.phone || o.profiles?.phone || cached?.phone})` : "Cliente sem nome");

            const clientPhone = guestMeta?.phone || o.profiles?.phone || cached?.phone;

            return (
              <div 
                key={virtualRow.key} 
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="pb-4"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-3.5 shadow-sm">
                {/* Cliente e WhatsApp */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={selectedOrders.has(groupId)} onCheckedChange={() => toggleSelection(groupId)} />
                    <div>
                      <p className="font-semibold text-base">{displayName}</p>
                      {o.profiles?.email && !guestMeta && (
                        <p className="text-xs text-muted-foreground">{o.profiles.email}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">#{groupId.slice(0, 8)}</p>
                    </div>
                  </div>
                  <OrderWhatsAppDropdown
                    order={o}
                    quantity={quantity}
                    displayName={displayName}
                    phone={clientPhone}
                    variant="badge"
                  />
                </div>

                {/* Produto / Miniatura */}
                <div className="flex items-center gap-3 rounded-xl bg-muted/30 p-2.5 border border-border/40">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted border border-border/50">
                    {o.products?.image_url ? (
                      <img
                        src={o.products.image_url}
                        alt={o.products.model || "Miniatura"}
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
                    <div className="text-xs text-muted-foreground uppercase font-semibold tracking-wide flex items-center gap-1.5">
                      <span>{o.products?.brand}</span>
                      {quantity > 1 && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary font-bold text-[10px] px-1.5 py-0 border-primary/20">
                          {quantity}x
                        </Badge>
                      )}
                    </div>
                    <p className="font-semibold text-sm truncate flex items-center gap-1">
                      {o.products?.model || "Miniatura"}
                    </p>
                  </div>
                </div>

                {/* Valores (Total / Sinal / Saldo) */}
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/20 p-2.5 text-center text-xs border border-border/30">
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-semibold text-sm">{brl(Number(o.total_price) * quantity)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sinal (un.)</p>
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <Input
                        className="h-7 w-16 text-center text-xs px-1"
                        type="number"
                        min="0"
                        step="0.01"
                        value={drafts[groupId] ?? String(o.down_payment)}
                        onChange={(e) => setDrafts({ ...drafts, [groupId]: e.target.value })}
                      />
                      <Button
                        size="icon"
                        variant="secondary"
                        className="size-7 text-[10px]"
                        onClick={() => updateGroup(ids, { down_payment: Number(drafts[groupId] ?? o.down_payment) })}
                      >
                        OK
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Saldo</p>
                    <p className="font-bold text-sm text-primary">{brl(Number(o.remaining_balance) * quantity)}</p>
                  </div>
                </div>

                {/* Status e Prazo */}
                {(() => {
                  const currentPaymentStatus = o.payment_status;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <PaymentBadge status={currentPaymentStatus} />
                        <Select
                          value={currentPaymentStatus}
                          onValueChange={(v) => handlePaymentStatusChange(item, v)}
                        >
                          <SelectTrigger className="h-8 text-xs w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sem_sinal">Sem sinal / Pagar na chegada</SelectItem>
                            <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                            <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                            <SelectItem value="quitado">Quitado</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={o.delivery_status}
                          onValueChange={(v) => handleDeliveryStatusChange(item, v)}
                        >
                          <SelectTrigger className="h-8 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pendente">Pendente</SelectItem>
                            <SelectItem value="em_transito">Em trânsito</SelectItem>
                            <SelectItem value="entregue">Entregue</SelectItem>
                            <SelectItem value="cancelado">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Excluir reserva permanentemente"
                          onClick={() => handleDeleteGroup(item)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>

                      {currentPaymentStatus === "aguardando_sinal" && o.reservation_expires_at ? (
                        <div className="text-xs">
                          <Countdown expiresAt={o.reservation_expires_at} />
                        </div>
                      ) : (currentPaymentStatus === "sem_sinal" || currentPaymentStatus === "pagar_na_chegada") && (o.products as any)?.release_date ? (
                        <div className="text-xs text-right">
                          <span className="font-semibold text-purple-600 dark:text-purple-400 block text-[11px]">Pagar na chegada</span>
                          <span className="text-muted-foreground font-mono text-[10px]">
                            {new Date((o.products as any).release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })()}

                {/* Código de Rastreio dos Correios (Mobile) */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                  <Truck className="size-4 text-primary shrink-0" />
                  <Input
                    className="h-8 text-xs font-mono flex-1"
                    placeholder="Cód. Rastreio (Ex: AA123456789BR)"
                    value={trackingDrafts[groupId] ?? o.tracking_code ?? ""}
                    onChange={(e) => setTrackingDrafts({ ...trackingDrafts, [groupId]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3 text-xs font-medium"
                    onClick={() => handleTrackingSave(ids, trackingDrafts[groupId] ?? o.tracking_code ?? "")}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
              </div>
            );
          })}
          </div>

          {rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma reserva encontrada.</p>
          )}
        </div>

        {/* VISÃO PARA DESKTOP (TABELA COMPLETA) */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox 
                    checked={rows.length > 0 && selectedOrders.size === rows.length} 
                    onCheckedChange={toggleAllSelection} 
                  />
                </TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Miniatura</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Sinal (un.)</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead>Status & Rastreio</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const { order: o, quantity, ids } = item;
                const groupId = ids[0];
                let guestMeta: { name?: string; phone?: string } | null = null;
                if (o.pix_key && typeof o.pix_key === "string") {
                  if (o.pix_key.startsWith("GUEST:")) {
                    try { guestMeta = JSON.parse(o.pix_key.replace(/^GUEST:/, "")); } catch {}
                  } else if (o.pix_key.startsWith('{"manual_guest":true')) {
                    try { guestMeta = JSON.parse(o.pix_key); } catch {}
                  }
                }
                const cached = getCustomerFromCache(o.id) || getCustomerFromCache(o.user_id);
                const displayName =
                  guestMeta?.name ||
                  (o.profiles?.name && o.profiles.name !== "Cliente" && o.profiles.name !== "Cliente cadastrado"
                    ? o.profiles.name
                    : cached?.name) ||
                  (o.profiles?.email ? o.profiles.email.split("@")[0] : null) ||
                  (guestMeta?.phone || o.profiles?.phone || cached?.phone ? `Cliente (${guestMeta?.phone || o.profiles?.phone || cached?.phone})` : "Cliente sem nome");

                const clientPhone = guestMeta?.phone || o.profiles?.phone || cached?.phone;
                const currentPaymentStatus = o.payment_status;

                return (
                  <TableRow key={groupId} data-state={selectedOrders.has(groupId) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedOrders.has(groupId)} 
                        onCheckedChange={() => toggleSelection(groupId)} 
                      />
                    </TableCell>
                    <TableCell className="min-w-[150px]">
                      <p className="font-medium">{displayName}</p>
                      {o.profiles?.email && !guestMeta && (
                        <p className="text-[11px] text-muted-foreground">{o.profiles.email}</p>
                      )}
                      <div className="mt-1">
                        <OrderWhatsAppDropdown
                          order={o}
                          quantity={quantity}
                          displayName={displayName}
                          phone={clientPhone}
                          variant="badge"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">#{groupId.slice(0, 8)}</p>
                    </TableCell>
                  <TableCell className="min-w-[250px] max-w-[400px]">
                    <div className="flex items-center gap-3">
                      <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted border border-border/50">
                        {o.products?.image_url ? (
                          <img
                            src={o.products.image_url}
                            alt={o.products.model || "Miniatura"}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-muted-foreground">
                            <Package className="size-5" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-sm flex items-center gap-1">
                          {o.products?.model || "Miniatura"}
                        </p>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                          <span>{o.products?.brand}</span>
                          {quantity > 1 && (
                            <Badge variant="secondary" className="bg-primary/10 text-primary font-bold text-[10px] px-1.5 py-0 border-primary/20">
                              {quantity}x
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {brl(Number(o.total_price) * quantity)}
                    {quantity > 1 && <span className="block text-[10px] text-muted-foreground font-mono">({quantity}x {brl(Number(o.total_price))})</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="h-8 w-24"
                        type="number"
                        min="0"
                        step="0.01"
                        value={drafts[groupId] ?? String(o.down_payment)}
                        onChange={(e) => setDrafts({ ...drafts, [groupId]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          updateGroup(ids, { down_payment: Number(drafts[groupId] ?? o.down_payment) })
                        }
                      >
                        OK
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-primary">
                    {brl(Number(o.remaining_balance) * quantity)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5 min-w-[155px]">
                      <PaymentBadge status={currentPaymentStatus} />
                      <Select
                        value={currentPaymentStatus}
                        onValueChange={(v) => handlePaymentStatusChange(item, v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sem_sinal">Sem sinal / Pagar na chegada</SelectItem>
                          <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                          <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                          <SelectItem value="quitado">Quitado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={o.delivery_status}
                        onValueChange={(v) => handleDeliveryStatusChange(item, v)}
                      >
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pendente">Pendente</SelectItem>
                          <SelectItem value="em_transito">Em trânsito</SelectItem>
                          <SelectItem value="entregue">Entregue</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* Campo de Rastreio integrado */}
                      <div className="flex items-center gap-1 mt-0.5">
                        <Input
                          className="h-7 text-[11px] font-mono px-2 w-28"
                          placeholder="Cód. Rastreio"
                          value={trackingDrafts[groupId] ?? o.tracking_code ?? ""}
                          onChange={(e) => setTrackingDrafts({ ...trackingDrafts, [groupId]: e.target.value })}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[11px] font-semibold"
                          title="Salvar rastreio"
                          onClick={() => handleTrackingSave(ids, trackingDrafts[groupId] ?? o.tracking_code ?? "")}
                        >
                          OK
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                          title="Excluir reserva"
                          onClick={() => handleDeleteGroup(item)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      {o.tracking_code && (
                        <a
                          href={`https://rastreamento.correios.com.br/app/index.php?codigo=${encodeURIComponent(o.tracking_code)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-mono"
                          title="Rastrear nos Correios"
                        >
                          <span>Rastrear Correios</span>
                          <ExternalLink className="size-2.5" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {currentPaymentStatus === "aguardando_sinal" && o.reservation_expires_at ? (
                      <Countdown expiresAt={o.reservation_expires_at} />
                    ) : (currentPaymentStatus === "sem_sinal" || currentPaymentStatus === "pagar_na_chegada") && (o.products as any)?.release_date ? (
                      <div className="flex flex-col text-xs">
                        <span className="font-semibold text-purple-600 dark:text-purple-400">Na chegada</span>
                        <span className="text-muted-foreground font-mono">
                          {new Date((o.products as any).release_date + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma reserva ainda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        </>
        )}
        <div className="flex items-center justify-between border-t border-border/60 p-3 text-sm">
          <span className="text-muted-foreground">
            Página {page + 1} de {pages}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </CardContent>
      {storeId && (
        <ManualReservationDialog
          storeId={storeId}
          storeColor={storeColor}
          products={products}
          open={manualDialogOpen}
          onClose={() => setManualDialogOpen(false)}
        />
      )}

      {/* FLOATING ACTION BAR FOR BULK ACTIONS */}
      {selectedOrders.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="bg-foreground text-background px-4 py-3 rounded-full shadow-2xl border border-border/10 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background/20 text-xs font-bold text-background">
                {selectedOrders.size}
              </span>
              <span className="text-sm font-medium">selecionadas</span>
            </div>
            <div className="w-px h-6 bg-background/20" />
            <div className="flex items-center gap-2">
              <Select onValueChange={(v) => handleBulkStatus("payment", v)}>
                <SelectTrigger className="h-8 w-[140px] bg-background text-foreground border-transparent text-xs">
                  <SelectValue placeholder="Status Pag..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sinal_pago">Sinal pago</SelectItem>
                  <SelectItem value="quitado">Quitado</SelectItem>
                  <SelectItem value="aguardando_sinal">Aguardando sinal</SelectItem>
                </SelectContent>
              </Select>
              <Select onValueChange={(v) => handleBulkStatus("delivery", v)}>
                <SelectTrigger className="h-8 w-[140px] bg-background text-foreground border-transparent text-xs">
                  <SelectValue placeholder="Status Envio..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="em_transito">Em trânsito</SelectItem>
                  <SelectItem value="entregue">Entregue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-background hover:bg-background/20 hover:text-background" onClick={() => setSelectedOrders(new Set())}>
              <XCircle className="size-5" />
            </Button>
          </div>
        </div>
      )}

    </Card>
    </div>
  );
}

const PRESET_COLORS = [
  { name: "Vermelho Hot Wheels", hex: "#e11d48" },
  { name: "Azul Racing", hex: "#2563eb" },
  { name: "Verde Esmeralda", hex: "#059669" },
  { name: "Amarelo Gold", hex: "#d97706" },
  { name: "Roxo Neon", hex: "#9333ea" },
  { name: "Laranja Flame", hex: "#ea580c" },
  { name: "Pink Cyber", hex: "#db2777" },
  { name: "Dark Titanium", hex: "#334155" },
];

function BrandingTab({ store, userId }: { store: Store; userId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: store.name,
    description: store.description ?? "",
    whatsapp_number: store.whatsapp_number ?? "",
    pix_key: (store as any).pix_key ?? "",
    primary_color: store.primary_color || "#e11d48",
    logo_url: store.logo_url ?? "",
    favicon_url: store.logo_url ?? store.favicon_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(() => getStoreBrands(store.id));
  const [newCustomBrand, setNewCustomBrand] = useState("");

  function handleToggleBrand(brand: string) {
    let updated: string[];
    if (selectedBrands.includes(brand)) {
      updated = selectedBrands.filter((b) => b !== brand);
    } else {
      updated = [...selectedBrands, brand];
    }
    setSelectedBrands(updated);
    saveStoreBrands(store.id, updated);
  }

  function handleAddCustomBrand() {
    const trimmed = newCustomBrand.trim();
    if (!trimmed) return;
    if (selectedBrands.map((b) => b.toLowerCase()).includes(trimmed.toLowerCase())) {
      toast.info("Esta marca já está na sua lista.");
      setNewCustomBrand("");
      return;
    }
    const updated = [...selectedBrands, trimmed];
    setSelectedBrands(updated);
    saveStoreBrands(store.id, updated);
    setNewCustomBrand("");
    toast.success(`Marca "${trimmed}" adicionada!`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = form.name.trim();
    const cleanSlug = slugify(cleanName);
    if (!cleanSlug) return toast.error("Por favor, insira um nome válido para a loja.");

    setSaving(true);

    // Salvar marcas comercializadas
    saveStoreBrands(store.id, selectedBrands);

    // Verificar se já existe OUTRA loja cadastrada com o mesmo slug
    const { data: existing } = await supabase
      .from("stores")
      .select("id")
      .eq("slug", cleanSlug)
      .neq("id", store.id)
      .maybeSingle();

    if (existing) {
      setSaving(false);
      return toast.error("Já existe uma loja cadastrada com este nome. Por favor, escolha outro nome para sua loja.");
    }

    const logo = form.logo_url.trim() || null;
    const updatePayload: any = {
      name: cleanName,
      slug: cleanSlug,
      description: form.description.trim() || null,
      whatsapp_number: form.whatsapp_number.trim() || null,
      primary_color: form.primary_color,
      logo_url: logo,
      favicon_url: logo,
    };
    if (form.pix_key.trim()) {
      updatePayload.pix_key = form.pix_key.trim();
    }

    let { error } = await supabase
      .from("stores")
      .update(updatePayload)
      .eq("id", store.id);

    if (error && (error.code === "PGRST204" || error.message?.includes("pix_key") || (error as any).status === 400)) {
      delete updatePayload.pix_key;
      const retry = await supabase.from("stores").update(updatePayload).eq("id", store.id);
      error = retry.error;
    }

    setSaving(false);
    if (error) return toast.error("Não foi possível salvar.");
    updateAppFavicon(logo);
    queryClient.invalidateQueries();
    toast.success("Identidade da loja atualizada!");
  }

  async function onLogoFile(file: File) {
    try {
      const url = await uploadImage(userId, file);
      // Atualiza tanto o logo quanto o favicon automaticamente com a mesma imagem
      setForm((f) => ({ ...f, logo_url: url, favicon_url: url }));
      updateAppFavicon(url);
      toast.success("Logotipo enviado! (definido como favicon)");
    } catch {
      toast.error("Falha ao enviar o logotipo.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="border-border/60 panel">
        <CardHeader>
          <CardTitle className="text-lg">Personalização e Identidade da loja</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">Nome da loja</Label>
              <Input
                id="b-name"
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="b-desc">Descrição / Apresentação</Label>
              <Textarea
                id="b-desc"
                maxLength={280}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* SEÇÃO DE MARCAS COMERCIALIZADAS */}
            <div className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-4">
              <div>
                <Label className="text-base font-semibold">Marcas Comercializadas</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Marque quais marcas de miniaturas você vende na loja. Elas ficarão disponíveis no menu de seleção ao cadastrar pré-vendas.
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-2">
                {DEFAULT_PRESET_BRANDS.map((presetBrand) => {
                  const isSelected = selectedBrands.includes(presetBrand);
                  return (
                    <button
                      key={presetBrand}
                      type="button"
                      onClick={() => handleToggleBrand(presetBrand)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                        isSelected
                          ? "bg-primary text-primary-foreground shadow-sm scale-105"
                          : "bg-background border border-border/60 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {isSelected ? "✓ " : "+ "}
                      {presetBrand}
                    </button>
                  );
                })}

                {/* Exibe marcas customizadas já adicionadas */}
                {selectedBrands
                  .filter((b) => !DEFAULT_PRESET_BRANDS.includes(b))
                  .map((customBrand) => (
                    <button
                      key={customBrand}
                      type="button"
                      onClick={() => handleToggleBrand(customBrand)}
                      className="rounded-full px-3 py-1 text-xs font-semibold bg-primary text-primary-foreground shadow-sm scale-105 flex items-center gap-1"
                    >
                      <span>✓ {customBrand}</span>
                      <span className="opacity-70 hover:opacity-100 ml-0.5">×</span>
                    </button>
                  ))}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="Adicionar marca personalizada..."
                  value={newCustomBrand}
                  onChange={(e) => setNewCustomBrand(e.target.value)}
                  className="text-xs sm:text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomBrand();
                    }
                  }}
                />
                <Button type="button" variant="secondary" size="sm" onClick={handleAddCustomBrand} className="shrink-0">
                  <Plus className="size-4 mr-1" /> Adicionar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="b-whats">WhatsApp de Atendimento</Label>
              <PhoneInput
                id="b-whats"
                value={form.whatsapp_number}
                onChange={(val) => setForm({ ...form, whatsapp_number: val })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="b-pix">Chave PIX da Loja (para o cliente pagar o sinal/saldo)</Label>
              <Input
                id="b-pix"
                placeholder="Ex: CPF/CNPJ, E-mail, Telefone ou Chave Aleatória"
                value={form.pix_key}
                onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                className="font-mono text-xs sm:text-sm"
              />
            </div>

            {/* SEÇÃO DE CORES DA LOJA */}
            <div className="space-y-3 rounded-xl border border-border/50 bg-muted/30 p-4">
              <Label className="text-base font-semibold">Cor de Tema da Loja</Label>
              <p className="text-xs text-muted-foreground">
                Escolha uma das cores rápidas ou defina o código Hex da cor principal da sua marca.
              </p>

              {/* Botões de Cores Rápidas */}
              <div className="flex flex-wrap gap-2 pt-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color.hex}
                    type="button"
                    title={color.name}
                    className={`group relative flex size-9 items-center justify-center rounded-full transition-all hover:scale-110 ${
                      form.primary_color.toLowerCase() === color.hex.toLowerCase()
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                        : ""
                    }`}
                    style={{ backgroundColor: color.hex }}
                    onClick={() => setForm({ ...form, primary_color: color.hex })}
                  >
                    {form.primary_color.toLowerCase() === color.hex.toLowerCase() && (
                      <span className="size-2 rounded-full bg-white shadow-sm" />
                    )}
                  </button>
                ))}
              </div>

              {/* Seletor de cor customizada */}
              <div className="flex items-center gap-3 pt-2">
                <Input
                  id="b-color"
                  type="color"
                  className="h-10 w-14 cursor-pointer p-1"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                />
                <Input
                  type="text"
                  placeholder="#e11d48"
                  className="font-mono text-sm uppercase"
                  maxLength={7}
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                />
              </div>
            </div>

            {/* SEÇÃO DE LOGOTIPO E FAVICON */}
            <div className="space-y-2">
              <Label htmlFor="b-logo">Logotipo da Loja (também usado como Favicon)</Label>
              <p className="text-xs text-muted-foreground">
                A imagem enviada aqui será usada como a foto/logo da sua loja e como ícone (favicon) na aba do navegador.
              </p>
              <Input
                id="b-logo"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && onLogoFile(e.target.files[0])}
              />
              {form.logo_url && (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={form.logo_url}
                    alt="Prévia do logotipo"
                    className="size-14 rounded-xl object-cover border border-border shadow-sm"
                  />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">Logotipo ativo</p>
                    <p>Aplicado automaticamente à loja e como ícone do navegador (favicon).</p>
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving && <Loader2 className="size-4 animate-spin" />} Salvar alterações
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* CARD DE LIVE PREVIEW DA LOJA */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Prévia em tempo real</h3>
        <Card
          className="border-border/60 panel overflow-hidden"
          style={{ borderTopColor: form.primary_color, borderTopWidth: 4 }}
        >
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="Logo"
                  className="size-12 rounded-xl object-cover"
                />
              ) : (
                <div
                  className="flex size-12 items-center justify-center rounded-xl font-bold text-white text-lg"
                  style={{ backgroundColor: form.primary_color }}
                >
                  {form.name ? form.name[0].toUpperCase() : "L"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-base truncate">{form.name || "Sua Loja"}</h4>
                <p className="text-xs text-muted-foreground truncate">
                  {form.description || "Descrição da sua loja de miniaturas"}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-border/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Amostra de Botão e Cores
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span
                  className="font-bold text-lg"
                  style={{ color: form.primary_color }}
                >
                  R$ 149,90
                </span>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm transition-opacity"
                  style={{ backgroundColor: form.primary_color }}
                >
                  Seguir loja
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
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

      // Buscar dados de perfil dos donos das lojas
      const ownerIds = [...new Set((data ?? []).map((s) => s.owner_id))];
      const { data: profiles } = ownerIds.length
        ? await supabase.from("profiles").select("id, name, email, phone").in("id", ownerIds)
        : { data: [] };
        
      // Buscar pedidos para calcular vendas
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

    // Se falhar porque a coluna rejection_reason não existe na tabela stores remota:
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

function getClientTier(totalSpent: number, orderCount: number) {
  if (totalSpent >= 1000 || orderCount >= 5) {
    return {
      name: "VIP Ouro",
      level: "gold",
      color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      icon: Crown,
    };
  }
  if (totalSpent >= 400 || orderCount >= 3) {
    return {
      name: "VIP Prata",
      level: "silver",
      color: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
      icon: Star,
    };
  }
  return {
    name: "Bronze",
    level: "bronze",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    icon: Sparkles,
  };
}

function ClientsTab({ orders }: { orders: OrderRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientNotes, setClientNotes] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("store_client_notes") || localStorage.getItem("crm_client_notes") || "{}");
    } catch {
      return {};
    }
  });
  const [editingNote, setEditingNote] = useState<string>("");

  const [waTemplate, setWaTemplate] = useState(() => {
    return localStorage.getItem("wa_template") || "Olá {{nome}}, tudo bem? Temos novidades em miniaturas colecionáveis na loja!";
  });
  const [configOpen, setConfigOpen] = useState(false);
  const [tempWaTemplate, setTempWaTemplate] = useState(waTemplate);

  function saveWaTemplate() {
    setWaTemplate(tempWaTemplate);
    localStorage.setItem("wa_template", tempWaTemplate);
    setConfigOpen(false);
    toast.success("Mensagem padrão salva!");
  }

  function handleSaveNote(userId: string) {
    const updated = { ...clientNotes, [userId]: editingNote };
    setClientNotes(updated);
    localStorage.setItem("store_client_notes", JSON.stringify(updated));
    toast.success("Anotação do cliente salva!");
  }

  const clientsMap = new Map<string, { profile: any; orders: OrderRow[]; totalSpent: number; firstOrderDate: Date }>();
  const brandCountMap = new Map<string, number>();

  for (const order of orders) {
    const userId = order.user_id;
    const orderDate = new Date(order.created_at);

    if (!clientsMap.has(userId)) {
      clientsMap.set(userId, {
        profile: order.profiles || { name: "Desconhecido", email: "", phone: "" },
        orders: [],
        totalSpent: 0,
        firstOrderDate: orderDate,
      });
    }
    const client = clientsMap.get(userId)!;
    client.orders.push(order);

    if (orderDate < client.firstOrderDate) {
      client.firstOrderDate = orderDate;
    }

    if (order.payment_status !== "cancelado" && order.delivery_status !== "cancelado") {
      client.totalSpent += Number(order.total_price || 0);

      const brand = order.products?.brand;
      if (brand) {
        brandCountMap.set(brand, (brandCountMap.get(brand) || 0) + 1);
      }
    }
  }

  let topBrand = "Nenhuma venda";
  let topBrandCount = 0;
  for (const [brand, count] of brandCountMap.entries()) {
    if (count > topBrandCount) {
      topBrand = brand;
      topBrandCount = count;
    }
  }

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  let newClientsThisMonth = 0;

  const allClients = Array.from(clientsMap.values()).sort((a, b) => b.totalSpent - a.totalSpent);

  for (const client of allClients) {
    if (client.firstOrderDate.getMonth() === currentMonth && client.firstOrderDate.getFullYear() === currentYear) {
      newClientsThisMonth++;
    }
  }

  const clients = allClients.filter((c) => {
    const tier = getClientTier(c.totalSpent, c.orders.length);
    if (selectedTier !== "all" && tier.level !== selectedTier) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (c.profile.name || "").toLowerCase();
    const email = (c.profile.email || "").toLowerCase();
    const phone = (c.profile.phone || "").toLowerCase();
    const note = (clientNotes[c.orders[0]?.user_id] || "").toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q) || note.includes(q);
  });

  return (
    <div className="space-y-4 w-full max-w-full overflow-hidden">
      {/* Cards de Métricas Top */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3 mb-2">
        <Card className="panel border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Trophy className="size-4 text-amber-500 shrink-0" />
              <span>Marca Mais Vendida</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-bold truncate">{topBrand}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {topBrandCount === 0 ? "Nenhuma reserva confirmada" : `${topBrandCount} reservas no total`}
            </p>
          </CardContent>
        </Card>

        <Card className="panel border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="size-4 text-blue-500 shrink-0" />
              <span>Novos Clientes (Mês)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-500">+{newClientsThisMonth}</p>
            <p className="text-xs text-muted-foreground mt-1">cadastros realizados este mês</p>
          </CardContent>
        </Card>

        <Card className="panel border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Star className="size-4 text-yellow-500 shrink-0" />
              <span>Top 3 Clientes</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 mt-1">
            {allClients.slice(0, 3).map((c, i) => {
              const tier = getClientTier(c.totalSpent, c.orders.length);
              const TierIcon = tier.icon;
              return (
                <div key={c.orders[0]?.user_id || i} className="flex justify-between items-center text-xs gap-2 min-w-0">
                  <span className="truncate font-medium flex items-center gap-1 min-w-0">
                    <TierIcon className="size-3 text-amber-500 shrink-0" />
                    <span className="truncate">{i + 1}. {c.profile.name || "Desconhecido"}</span>
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-500 font-semibold shrink-0">{brl(c.totalSpent)}</span>
                </div>
              );
            })}
            {allClients.length === 0 && <p className="text-xs text-muted-foreground">Nenhum cliente ainda</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="panel border-border/60 w-full max-w-full overflow-hidden">
        <CardHeader className="flex flex-col gap-3 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <span>Gestão de Clientes</span>
              <Badge variant="secondary" className="text-xs">{allClients.length}</Badge>
            </CardTitle>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, contato ou nota..."
                  className="pl-9 text-xs sm:text-sm h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const csvRows = [
                      ["Cliente", "WhatsApp", "Email", "Nível Fidelidade", "Qtd Pedidos", "Total Comprado (R$)", "Primeiro Pedido", "Notas"].join(";"),
                      ...clients.map((c) => {
                        const tier = getClientTier(c.totalSpent, c.orders.length);
                        const name = c.profile.name || "Cliente";
                        const phone = c.profile.phone || "";
                        const email = c.profile.email || "";
                        const firstDate = c.firstOrderDate ? new Date(c.firstOrderDate).toLocaleDateString("pt-BR") : "";
                        const note = (clientNotes[c.profile.id || ""] || "").replace(/"/g, '""');
                        return [
                          `"${name}"`,
                          `"${phone}"`,
                          `"${email}"`,
                          `"${tier.name}"`,
                          c.orders.length,
                          c.totalSpent.toFixed(2),
                          firstDate,
                          `"${note}"`,
                        ].join(";");
                      }),
                    ];
                    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `clientes-loja-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Relatório de clientes exportado!");
                  }}
                  title="Exportar clientes para CSV"
                  className="h-9 px-2.5 sm:px-3 gap-1.5 border-border/80 text-xs flex-1 sm:flex-initial"
                >
                  <Download className="size-3.5 text-primary shrink-0" />
                  <span>Exportar CSV</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTempWaTemplate(waTemplate); setConfigOpen(true); }}
                  title="Configurar Mensagem WhatsApp"
                  className="h-9 px-2.5 sm:px-3 gap-1.5 text-xs flex-1 sm:flex-initial"
                >
                  <MessageCircle className="size-3.5 text-emerald-500 shrink-0" />
                  <span>Template Whats</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Filtro por Nível de Fidelidade */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
            <span className="text-xs text-muted-foreground mr-1">Filtro de Fidelidade:</span>
            {[
              { id: "all", label: "Todos" },
              { id: "gold", label: "👑 VIP Ouro" },
              { id: "silver", label: "⭐ VIP Prata" },
              { id: "bronze", label: "🌟 Bronze" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedTier(f.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  selectedTier === f.id
                    ? "bg-primary text-primary-foreground font-semibold border-primary shadow-sm"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/60 border-border/40"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-6 pt-0">
          {clients.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-xs sm:text-sm">
              {searchQuery ? "Nenhum cliente encontrado para essa busca." : "Nenhum cliente encontrado ainda."}
            </div>
          ) : (
            <>
              {/* VISUALIZAÇÃO MOBILE (CARDS OTIMIZADOS) */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {clients.map((c) => {
                  const userId = c.orders[0]?.user_id;
                  const tier = getClientTier(c.totalSpent, c.orders.length);
                  const TierIcon = tier.icon;
                  const note = clientNotes[userId] || "";

                  return (
                    <div
                      key={userId}
                      className="rounded-xl border border-border/60 bg-card/60 p-3.5 space-y-2.5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm truncate">{c.profile.name || "Desconhecido"}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Cliente desde {c.firstOrderDate.toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                        <Badge variant="outline" className={`gap-1 font-semibold shrink-0 text-[11px] ${tier.color}`}>
                          <TierIcon className="size-3" />
                          {tier.name}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/30">
                        <div>
                          <span className="text-muted-foreground text-[11px] block">Total comprado:</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-500 text-sm">
                            {brl(c.totalSpent)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-muted-foreground text-[11px] block">Reservas:</span>
                          <Badge variant="secondary" className="text-xs">{c.orders.length} pedidos</Badge>
                        </div>
                      </div>

                      {c.profile.phone && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 p-2 rounded-lg">
                          <span className="truncate">{c.profile.phone}</span>
                          <a
                            href={whatsappLink(c.profile.phone, waTemplate.replace(/\{\{nome\}\}/g, c.profile.name || "Cliente"))}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 shrink-0 bg-emerald-500/10 px-2 py-1 rounded"
                          >
                            <MessageCircle className="size-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      )}

                      {note && (
                        <p className="text-xs text-muted-foreground italic line-clamp-2 bg-muted/10 p-2 rounded border border-border/30">
                          "{note}"
                        </p>
                      )}

                      <div className="pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs h-8"
                          onClick={() => {
                            setSelectedClient(c);
                            setEditingNote(clientNotes[userId] || "");
                          }}
                        >
                          Ver perfil e histórico
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* VISUALIZAÇÃO DESKTOP (TABELA) */}
              <div className="hidden md:block rounded-xl border border-border/60 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Nível & Fidelidade</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead className="text-center">Reservas</TableHead>
                      <TableHead>Total Gasto</TableHead>
                      <TableHead className="min-w-[150px]">Anotações</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((c) => {
                      const userId = c.orders[0]?.user_id;
                      const tier = getClientTier(c.totalSpent, c.orders.length);
                      const TierIcon = tier.icon;
                      const note = clientNotes[userId] || "";

                      return (
                        <TableRow key={userId}>
                          <TableCell className="font-medium">
                            <p className="font-semibold">{c.profile.name || "Desconhecido"}</p>
                            <p className="text-[10px] text-muted-foreground">
                              Cliente desde {c.firstOrderDate.toLocaleDateString("pt-BR")}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`gap-1 font-semibold ${tier.color}`}>
                              <TierIcon className="size-3" />
                              {tier.name}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col text-xs text-muted-foreground">
                              <span>{c.profile.email || "-"}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span>{c.profile.phone || "-"}</span>
                                {c.profile.phone && (
                                  <a
                                    href={whatsappLink(c.profile.phone, waTemplate.replace(/\{\{nome\}\}/g, c.profile.name || "Cliente"))}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-600 hover:text-emerald-700 hover:scale-110 transition-transform bg-emerald-500/10 p-1 rounded-md flex-shrink-0"
                                    title="Chamar no WhatsApp com mensagem padrão"
                                  >
                                    <MessageCircle className="size-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{c.orders.length}</Badge>
                          </TableCell>
                          <TableCell className="font-semibold text-emerald-600 dark:text-emerald-500">
                            {brl(c.totalSpent)}
                          </TableCell>
                          <TableCell>
                            {note ? (
                              <p className="text-xs text-muted-foreground line-clamp-2 italic" title={note}>
                                "{note}"
                              </p>
                            ) : (
                              <span className="text-xs text-muted-foreground/40 italic">Sem anotações</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedClient(c);
                                setEditingNote(clientNotes[userId] || "");
                              }}
                            >
                              Ver perfil
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* DIALOG DE PERFIL DO CLIENTE */}
      <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <div className="flex items-center gap-2 flex-wrap">
              <DialogTitle className="text-base sm:text-lg">
                Perfil de {selectedClient?.profile?.name || "Desconhecido"}
              </DialogTitle>
              {selectedClient && (() => {
                const tier = getClientTier(selectedClient.totalSpent, selectedClient.orders.length);
                const TierIcon = tier.icon;
                return (
                  <Badge variant="outline" className={`gap-1 font-semibold text-xs ${tier.color}`}>
                    <TierIcon className="size-3" />
                    {tier.name}
                  </Badge>
                );
              })()}
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs sm:text-sm text-muted-foreground bg-muted/30 p-3 sm:p-3.5 rounded-xl border border-border/40">
              <div className="truncate"><strong>Email:</strong> {selectedClient?.profile?.email || "-"}</div>
              <div>
                <strong>WhatsApp:</strong>{" "}
                {selectedClient?.profile?.phone ? (
                  <a
                    href={whatsappLink(selectedClient.profile.phone, waTemplate.replace(/\{\{nome\}\}/g, selectedClient.profile.name || "Cliente"))}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 hover:underline inline-flex items-center gap-1 font-semibold ml-1"
                  >
                    <span>{selectedClient.profile.phone}</span>
                    <MessageCircle className="size-3" />
                  </a>
                ) : (
                  "-"
                )}
              </div>
              <div><strong>Total em compras:</strong> {selectedClient ? brl(selectedClient.totalSpent) : "-"}</div>
            </div>

            {/* SEÇÃO DE ANOTAÇÕES DO CLIENTE */}
            <div className="space-y-2 rounded-xl border border-border/50 bg-background/50 p-3 sm:p-4">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Anotações do Cliente
              </Label>
              <Textarea
                placeholder="Ex: Colecionador focado em JDM e RLC. Paga sempre à vista no Pix..."
                value={editingNote}
                onChange={(e) => setEditingNote(e.target.value)}
                rows={2}
                className="text-xs sm:text-sm"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-7"
                  onClick={() => selectedClient && handleSaveNote(selectedClient.orders[0]?.user_id)}
                >
                  Salvar anotação
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico de Reservas</h4>
              {(() => {
                const grouped = new Map<string, { order: OrderRow; quantity: number }>();
                selectedClient?.orders.forEach((order: OrderRow) => {
                  const key = `${order.product_id}_${order.payment_status}`;
                  if (grouped.has(key)) {
                    grouped.get(key)!.quantity += 1;
                  } else {
                    grouped.set(key, { order, quantity: 1 });
                  }
                });

                return Array.from(grouped.values()).map(({ order, quantity }) => (
                  <div key={`${order.product_id}_${order.payment_status}`} className="border rounded-xl p-3 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-between items-start sm:items-center bg-card/40 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {order.products?.image_url ? (
                        <img src={order.products.image_url} alt="Produto" className="size-12 rounded-lg object-cover border border-border/40 shrink-0" />
                      ) : (
                        <div className="size-12 bg-muted rounded-lg flex items-center justify-center text-muted-foreground shrink-0">
                          <Package className="size-6" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm flex items-center flex-wrap">
                          {quantity > 1 && <Badge variant="secondary" className="mr-2 text-xs py-0 h-5 px-1.5">{quantity}x</Badge>}
                          <span className="truncate">{order.products?.brand || "Desconhecido"} {order.products?.model || "Produto indisponível"}</span>
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-2 items-center mt-1">
                          <span>Reserva: {new Date(order.created_at).toLocaleDateString("pt-BR")}</span>
                          {order.tracking_code && (
                            <span className="font-mono text-primary">📦 {order.tracking_code}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start w-full sm:w-auto gap-1 text-sm pt-2 sm:pt-0 border-t sm:border-t-0 border-border/30">
                      <div className="font-semibold">{brl(Number(order.total_price) * quantity)}</div>
                      <PaymentBadge status={order.payment_status} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="w-[95vw] max-w-lg p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Mensagem Padrão do WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3 sm:py-4">
            <div className="space-y-2">
              <Label>Texto da Mensagem</Label>
              <Textarea 
                value={tempWaTemplate}
                onChange={(e) => setTempWaTemplate(e.target.value)}
                placeholder="Olá {{nome}}, tudo bem?"
                rows={4}
                className="text-xs sm:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use <strong>{`{{nome}}`}</strong> para inserir o nome do cliente automaticamente na mensagem.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={saveWaTemplate}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
