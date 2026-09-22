import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Users,
  Search,
  MessageCircle,
  BookmarkCheck,
  Trash2,
  Copy,
  Layers,
  List,
  Flame,
  Car,
  Calendar,
  AlertTriangle,
  Check,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { getStoreFullUrl } from "@/lib/subdomain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;

export interface WaitlistRow {
  id: string;
  created_at: string;
  product_id: string;
  store_id: string;
  user_id: string;
  products: Product | null;
  profiles: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

interface WaitlistManagerProps {
  store: {
    id: string;
    name: string;
    slug: string;
    primary_color?: string | null;
    whatsapp_number?: string | null;
  };
  waitlist: WaitlistRow[];
  products: Product[];
  isLoading?: boolean;
  onRefresh?: () => void;
  onOpenManualReservation?: (
    product: Product,
    user: { id: string; name?: string | null; phone?: string | null }
  ) => void;
}

function formatPhoneBR(rawPhone?: string | null) {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 13 && cleaned.startsWith("55")) {
    const ddd = cleaned.slice(2, 4);
    const num = cleaned.slice(4);
    return `+55 (${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  }
  return rawPhone;
}

function buildWhatsAppUrl(
  phone: string | null | undefined,
  customerName: string | null | undefined,
  product: Product | null,
  storeName: string
) {
  if (!phone) return "";
  const cleanDigits = phone.replace(/\D/g, "");
  const targetPhone = cleanDigits.startsWith("55")
    ? cleanDigits
    : cleanDigits.length >= 10
      ? `55${cleanDigits}`
      : cleanDigits;

  const greeting = customerName ? `Olá, ${customerName.trim().split(" ")[0]}!` : "Olá!";
  const productLabel = product ? `${product.brand} ${product.model}` : "sua miniatura";
  const message = `${greeting} Tudo bem? Vi que você está na fila de espera da miniatura *${productLabel}* aqui na *${storeName}*.\n\nTemos atualizações sobre a disponibilidade deste item! Gostaria de confirmar seu interesse para garantirmos a sua unidade?`;

  return `https://api.whatsapp.com/send?phone=${targetPhone}&text=${encodeURIComponent(message)}`;
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return "Agora há pouco";
  if (diffMinutes < 60) return `Há ${diffMinutes} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `Há ${diffDays} dias`;

  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function WaitlistManager({
  store,
  waitlist,
  products,
  isLoading,
  onRefresh,
  onOpenManualReservation,
}: WaitlistManagerProps) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [itemToRemove, setItemToRemove] = useState<WaitlistRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedMiniatureId, setCopiedMiniatureId] = useState<string | null>(null);

  // Group waitlist entries by product
  const waitlistByProduct = useMemo(() => {
    const map = new Map<string, WaitlistRow[]>();

    for (const item of waitlist) {
      const prodId = item.product_id;
      if (!map.has(prodId)) {
        map.set(prodId, []);
      }
      map.get(prodId)!.push(item);
    }

    // Ensure items in each product are sorted chronologically (1º, 2º, 3º...)
    map.forEach((items) => {
      items.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    return map;
  }, [waitlist]);

  // Map each waitlist item id to its 1-based queue position in its product
  const positionMap = useMemo(() => {
    const pos = new Map<string, number>();
    waitlistByProduct.forEach((items) => {
      items.forEach((item, index) => {
        pos.set(item.id, index + 1);
      });
    });
    return pos;
  }, [waitlistByProduct]);

  // Overall metrics
  const metrics = useMemo<{
    totalPeople: number;
    uniqueProductsCount: number;
    topProduct: { product: Product | null; count: number } | null;
  }>(() => {
    const totalPeople = waitlist.length;
    const uniqueProductsCount = waitlistByProduct.size;

    let topProduct: { product: Product | null; count: number } | null = null;
    waitlistByProduct.forEach((items) => {
      if (!topProduct || items.length > topProduct.count) {
        topProduct = {
          product: items[0]?.products ?? null,
          count: items.length,
        };
      }
    });

    return {
      totalPeople,
      uniqueProductsCount,
      topProduct,
    };
  }, [waitlist, waitlistByProduct]);

  // Filtered waitlist based on search query and selected product
  const filteredWaitlist = useMemo(() => {
    let result = waitlist;

    if (selectedProductId !== "all") {
      result = result.filter((w) => w.product_id === selectedProductId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((w) => {
        const prod = w.products;
        const brandMatch = (prod?.brand || "").toLowerCase().includes(q);
        const modelMatch = (prod?.model || "").toLowerCase().includes(q);
        const nameMatch = (w.profiles?.name || "").toLowerCase().includes(q);
        const emailMatch = (w.profiles?.email || "").toLowerCase().includes(q);
        const phoneMatch = (w.profiles?.phone || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
        return brandMatch || modelMatch || nameMatch || emailMatch || phoneMatch;
      });
    }

    return result;
  }, [waitlist, selectedProductId, searchQuery]);

  // Grouped products based on filtered waitlist
  const filteredGroupedProducts = useMemo(() => {
    const map = new Map<string, { product: Product; items: WaitlistRow[] }>();

    for (const item of filteredWaitlist) {
      const prodId = item.product_id;
      if (!map.has(prodId)) {
        const prod = item.products || products.find((p) => p.id === prodId);
        if (prod) {
          map.set(prodId, { product: prod, items: [] });
        }
      }
      if (map.has(prodId)) {
        map.get(prodId)!.items.push(item);
      }
    }

    // Sort items within each product by created_at
    map.forEach(({ items }) => {
      items.sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

    // Return as array sorted by largest waitlist first
    return Array.from(map.values()).sort((a, b) => b.items.length - a.items.length);
  }, [filteredWaitlist, products]);

  // Available miniature options for the dropdown
  const productOptions = useMemo(() => {
    const list: { id: string; label: string; count: number }[] = [];
    waitlistByProduct.forEach((items, prodId) => {
      const prod = items[0]?.products || products.find((p) => p.id === prodId);
      const label = prod ? `${prod.brand} ${prod.model}` : "Miniatura";
      list.push({ id: prodId, label, count: items.length });
    });
    return list.sort((a, b) => b.count - a.count);
  }, [waitlistByProduct, products]);

  async function handleConfirmDelete() {
    if (!itemToRemove) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("waitlist").delete().eq("id", itemToRemove.id);
      if (error) throw error;

      toast.success("Cliente removido da fila de espera.");
      await queryClient.invalidateQueries({ queryKey: ["store-waitlist", store.id] });
      await queryClient.invalidateQueries({ queryKey: ["store-waitlist-product-ids", store.id] });
      await queryClient.invalidateQueries({ queryKey: ["store-alert-counts", store.id] });
      await queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      onRefresh?.();
    } catch (err: any) {
      toast.error("Não foi possível remover da fila: " + (err?.message || "erro desconhecido"));
    } finally {
      setIsDeleting(false);
      setItemToRemove(null);
    }
  }

  function handleCopyPhonesForProduct(prodId: string, items: WaitlistRow[]) {
    const phones = items
      .map((w) => w.profiles?.phone?.trim())
      .filter((p): p is string => Boolean(p));

    if (phones.length === 0) {
      toast.info("Nenhum telefone/WhatsApp cadastrado para os clientes desta fila.");
      return;
    }

    const textToCopy = phones.join("\n");
    navigator.clipboard.writeText(textToCopy);
    setCopiedMiniatureId(prodId);
    toast.success(`${phones.length} ${phones.length === 1 ? "contato copiado" : "contatos copiados"} para a área de transferência!`);
    setTimeout(() => setCopiedMiniatureId(null), 2500);
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Loader2 className="size-6 animate-spin text-amber-500" />
        <span className="text-sm font-medium">Carregando fila de espera da loja...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards de Métricas Principais */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/60 bg-gradient-to-br from-card to-amber-500/5 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Clientes na Fila
            </CardTitle>
            <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Users className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {metrics.totalPeople}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {metrics.totalPeople === 1
                ? "Pessoa aguardando liberação"
                : "Pessoas aguardando liberação"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-blue-500/5 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Miniaturas Solicitadas
            </CardTitle>
            <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Car className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {metrics.uniqueProductsCount}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {metrics.uniqueProductsCount === 1
                ? "Miniatura possui fila ativa"
                : "Miniaturas possuem fila ativa"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-rose-500/5 shadow-xs">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Maior Fila
            </CardTitle>
            <div className="size-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
              <Flame className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {metrics.topProduct && metrics.topProduct.product ? (
              <div>
                <div className="text-sm font-bold truncate text-foreground" title={`${metrics.topProduct.product.brand} ${metrics.topProduct.product.model}`}>
                  {metrics.topProduct.product.brand} {metrics.topProduct.product.model}
                </div>
                <p className="text-xs text-rose-500 font-medium mt-0.5">
                  {metrics.topProduct.count} {metrics.topProduct.count === 1 ? "interessado" : "interessados"} aguardando
                </p>
              </div>
            ) : (
              <div>
                <div className="text-sm font-semibold text-muted-foreground">Nenhuma fila ativa</div>
                <p className="text-xs text-muted-foreground mt-0.5">Estoque sob controle</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 bg-muted/20 border border-border/50 rounded-2xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
          {/* Campo de Busca */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, e-mail, WhatsApp ou miniatura..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-xs sm:text-sm bg-background border-border/60"
            />
          </div>

          {/* Filtro por miniatura */}
          {productOptions.length > 0 && (
            <div className="w-full sm:w-[240px]">
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="h-10 text-xs sm:text-sm bg-background border-border/60">
                  <SelectValue placeholder="Todas as miniaturas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as miniaturas ({waitlist.length})</SelectItem>
                  {productOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      <span className="truncate">{opt.label}</span> ({opt.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Alternador de Modo de Visualização */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto bg-background/60 border border-border/60 p-1 rounded-xl">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "grouped" ? "secondary" : "ghost"}
            onClick={() => setViewMode("grouped")}
            className="h-8 text-xs gap-1.5 font-medium"
            title="Visualizar agrupado por miniatura"
          >
            <Layers className="size-3.5" />
            <span>Por Miniatura</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "flat" ? "secondary" : "ghost"}
            onClick={() => setViewMode("flat")}
            className="h-8 text-xs gap-1.5 font-medium"
            title="Visualizar lista geral corrida"
          >
            <List className="size-3.5" />
            <span>Lista Geral</span>
          </Button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      {waitlist.length === 0 ? (
        <Card className="border-dashed border-2 border-border/70 p-8 text-center bg-card/40 rounded-2xl">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-3">
            <Clock className="size-7" />
          </div>
          <h3 className="font-bold text-lg text-foreground">Nenhum cliente na fila de espera</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1">
            Quando as unidades de uma miniatura esgotarem no seu catálogo, os clientes interessados
            poderão entrar na fila de espera diretamente pela página do item.
          </p>
        </Card>
      ) : filteredWaitlist.length === 0 ? (
        <Card className="border-border/60 p-8 text-center bg-card/40 rounded-2xl">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground mb-3">
            <Search className="size-6" />
          </div>
          <h3 className="font-bold text-base text-foreground">Nenhum resultado encontrado</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum cliente ou miniatura corresponde aos critérios da busca.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setSelectedProductId("all");
            }}
            className="mt-4 text-xs"
          >
            Limpar filtros
          </Button>
        </Card>
      ) : viewMode === "grouped" ? (
        /* VISÃO POR MINIATURA (AGRUPADA) */
        <div className="space-y-6">
          {filteredGroupedProducts.map(({ product, items }) => {
            const hasStock = product.stock > 0;
            const fullUrl = `${getStoreFullUrl(store.slug).replace(/\/$/, "")}/${product.slug || product.id}`;

            return (
              <Card
                key={product.id}
                className="overflow-hidden border-border/70 bg-card/80 shadow-xs rounded-2xl transition-all"
              >
                {/* Header da Miniatura */}
                <div className="p-4 sm:p-5 border-b border-border/50 bg-muted/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {product.image_url ? (
                      <ProductThumbnail
                        src={product.image_url}
                        alt={`${product.brand} ${product.model}`}
                        className="size-14 sm:size-16 rounded-xl object-cover border border-border/60 shrink-0 bg-background"
                      />
                    ) : (
                      <div className="size-14 sm:size-16 rounded-xl bg-muted/40 border border-border/60 flex items-center justify-center shrink-0 text-muted-foreground">
                        <Car className="size-6" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          {product.brand}
                        </span>
                        {product.scale && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {product.scale}
                          </Badge>
                        )}
                        {hasStock ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] h-4">
                            Estoque: {product.stock} un
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px] h-4">
                            Esgotado
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-bold text-base sm:text-lg tracking-tight truncate text-foreground mt-0.5">
                        {product.model}
                      </h4>
                      <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                        Preço: <span className="text-foreground">{brl(Number(product.price))}</span>
                      </p>
                    </div>
                  </div>

                  {/* Ações da Miniatura */}
                  <div className="flex items-center gap-2 self-start sm:self-center shrink-0 flex-wrap">
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-semibold px-2.5 py-1 text-xs gap-1.5">
                      <Clock className="size-3.5" />
                      <span>{items.length} {items.length === 1 ? "na fila" : "na fila"}</span>
                    </Badge>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyPhonesForProduct(product.id, items)}
                      className="h-8 text-xs gap-1.5 border-border/60 hover:bg-muted"
                      title="Copiar lista de telefones desta fila"
                    >
                      {copiedMiniatureId === product.id ? (
                        <>
                          <Check className="size-3.5 text-emerald-500" />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" />
                          <span>Copiar Contatos</span>
                        </>
                      )}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      asChild
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      title="Abrir miniatura na vitrine da loja"
                    >
                      <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>

                {/* Tabela de Clientes da Fila */}
                <div className="divide-y divide-border/40">
                  {items.map((item) => {
                    const position = positionMap.get(item.id) || 1;
                    const profile = item.profiles;
                    const waUrl = buildWhatsAppUrl(
                      profile?.phone,
                      profile?.name,
                      product,
                      store.name
                    );

                    return (
                      <div
                        key={item.id}
                        className="p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/10 transition-colors"
                      >
                        {/* Posição e Dados do Cliente */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex size-8 shrink-0 items-center justify-center rounded-xl font-bold text-xs ${
                              position === 1
                                ? "bg-amber-500 text-amber-950 shadow-xs"
                                : position === 2
                                  ? "bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                  : position === 3
                                    ? "bg-amber-700/60 text-amber-100"
                                    : "bg-muted text-muted-foreground"
                            }`}
                            title={`Posição ${position} na fila`}
                          >
                            {position}º
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-foreground truncate">
                                {profile?.name || "Cliente Colecionador"}
                              </span>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                                <Calendar className="size-3" />
                                {formatRelativeTime(item.created_at)}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                              {profile?.email && (
                                <span className="truncate" title={profile.email}>
                                  {profile.email}
                                </span>
                              )}
                              {profile?.phone && (
                                <span className="font-mono text-foreground/80 font-medium">
                                  {formatPhoneBR(profile.phone)}
                                </span>
                              )}
                              {!profile?.email && !profile?.phone && (
                                <span className="italic text-muted-foreground/80">
                                  Contato pendente de confirmação
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Botões de Ação para o Cliente */}
                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                          {/* Botão WhatsApp */}
                          {waUrl ? (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="h-8 text-xs gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold"
                            >
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir conversa no WhatsApp com mensagem pronta"
                              >
                                <MessageCircle className="size-3.5 fill-current" />
                                <span>Chamar no WhatsApp</span>
                              </a>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled
                              className="h-8 text-xs gap-1.5 opacity-50"
                              title="Sem WhatsApp cadastrado"
                            >
                              <MessageCircle className="size-3.5" />
                              <span>Sem WhatsApp</span>
                            </Button>
                          )}

                          {/* Botão Reservar para o Cliente */}
                          {onOpenManualReservation && (
                            <Button
                              size="sm"
                              onClick={() => {
                                onOpenManualReservation(product, {
                                  id: item.user_id,
                                  name: profile?.name,
                                  phone: profile?.phone,
                                });
                              }}
                              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                              title="Criar reserva desta unidade para este cliente"
                            >
                              <BookmarkCheck className="size-3.5" />
                              <span>Reservar</span>
                            </Button>
                          )}

                          {/* Botão Remover da Fila */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setItemToRemove(item)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Remover cliente da fila"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* VISÃO LISTA GERAL (TABELA COMPLETA) */
        <Card className="border-border/70 overflow-hidden rounded-2xl bg-card/80 shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-muted/30 border-b border-border/60 text-muted-foreground font-semibold uppercase text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Posição</th>
                  <th className="py-3 px-4">Cliente</th>
                  <th className="py-3 px-4">Miniatura Solicitada</th>
                  <th className="py-3 px-4">Estoque Atual</th>
                  <th className="py-3 px-4">Entrou na Fila</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredWaitlist.map((item) => {
                  const product = item.products;
                  const position = positionMap.get(item.id) || 1;
                  const profile = item.profiles;
                  const waUrl = buildWhatsAppUrl(
                    profile?.phone,
                    profile?.name,
                    product,
                    store.name
                  );

                  return (
                    <tr key={item.id} className="hover:bg-muted/15 transition-colors">
                      {/* Posição */}
                      <td className="py-3.5 px-4 font-bold">
                        <span
                          className={`inline-flex items-center justify-center size-7 rounded-lg text-xs ${
                            position === 1
                              ? "bg-amber-500 text-amber-950 font-bold"
                              : "bg-muted text-muted-foreground font-semibold"
                          }`}
                        >
                          {position}º
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-foreground">
                          {profile?.name || "Cliente Colecionador"}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          {profile?.phone && (
                            <span className="font-mono">{formatPhoneBR(profile.phone)}</span>
                          )}
                          {profile?.email && <span className="truncate">{profile.email}</span>}
                        </div>
                      </td>

                      {/* Miniatura */}
                      <td className="py-3.5 px-4">
                        {product ? (
                          <div className="flex items-center gap-2.5">
                            {product.image_url ? (
                              <ProductThumbnail
                                src={product.image_url}
                                alt={product.model}
                                className="size-9 rounded-lg object-cover border border-border/50 shrink-0"
                              />
                            ) : (
                              <div className="size-9 rounded-lg bg-muted/40 border border-border/50 flex items-center justify-center shrink-0">
                                <Car className="size-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                                {product.brand}
                              </span>
                              <span className="font-semibold text-foreground text-xs sm:text-sm truncate block">
                                {product.model}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground italic">Miniatura não encontrada</span>
                        )}
                      </td>

                      {/* Estoque Atual */}
                      <td className="py-3.5 px-4">
                        {product ? (
                          product.stock > 0 ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-xs">
                              {product.stock} un disponíveis
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Esgotado
                            </Badge>
                          )
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Data de Entrada */}
                      <td className="py-3.5 px-4 text-xs text-muted-foreground font-mono">
                        {formatRelativeTime(item.created_at)}
                      </td>

                      {/* Ações */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {waUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              asChild
                              className="h-8 px-2.5 text-xs gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                            >
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Conversar no WhatsApp"
                              >
                                <MessageCircle className="size-3.5 fill-current" />
                                <span className="hidden lg:inline">WhatsApp</span>
                              </a>
                            </Button>
                          )}

                          {onOpenManualReservation && product && (
                            <Button
                              size="sm"
                              onClick={() => {
                                onOpenManualReservation(product, {
                                  id: item.user_id,
                                  name: profile?.name,
                                  phone: profile?.phone,
                                });
                              }}
                              className="h-8 px-2.5 text-xs gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                              title="Reservar unidade para este cliente"
                            >
                              <BookmarkCheck className="size-3.5" />
                              <span className="hidden lg:inline">Reservar</span>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setItemToRemove(item)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Remover da fila"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal de Confirmação para Remover da Fila */}
      <AlertDialog open={!!itemToRemove} onOpenChange={(open) => !open && setItemToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Remover cliente da fila de espera?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {itemToRemove && (
                <span>
                  Tem certeza que deseja remover{" "}
                  <strong>{itemToRemove.profiles?.name || "este cliente"}</strong> da fila de
                  espera da miniatura{" "}
                  <strong>
                    {itemToRemove.products?.brand} {itemToRemove.products?.model}
                  </strong>
                  ? Os clientes seguintes subirão uma posição na fila.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removendo..." : "Confirmar Remoção"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
