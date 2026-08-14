import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, BookmarkCheck, Check, Copy, Package, Search, Sparkles, Store as StoreIcon, X, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { AppHeader, updateAppFavicon } from "@/components/AppHeader";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { brl, getProductInstallmentInfo, getProductSignalAmount, hasNoSignalRequirement } from "@/lib/format";
import { formatStockRemaining } from "@/lib/stock";
import { useSession } from "@/lib/session";
import { useCartStore } from "@/lib/cart";
import { saveCustomerToCache } from "@/lib/customerCache";
import { getStoreBanner, getProductBadge } from "@/lib/storeCustomizations";

const fetchStoreBySlug = createServerFn({ method: "GET" })
  .validator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const { data: store } = await supabase
      .from("stores")
      .select("id, name, slug, logo_url, favicon_url, description, primary_color, whatsapp_number, contact_email, contact_instagram")
      .eq("slug", data.slug)
      .maybeSingle();
    return store;
  });

export const Route = createFileRoute("/loja/$slug")({
  loader: async ({ params }) => {
    const store = await fetchStoreBySlug({ data: { slug: params.slug } });
    return { store };
  },
  head: ({ loaderData, params }) => {
    const store = loaderData?.store;
    const title = store?.name ? `${store.name} — Pré-vendas de Miniaturas 1:64` : `Loja ${params.slug} — Vendas 1:64`;
    const desc = store?.description || `Veja as pré-vendas abertas e reserve suas miniaturas na loja ${store?.name || params.slug}.`;
    const img = store?.logo_url || store?.favicon_url || "https://vendas164.com.br/og-image.png";
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
      links: [
        ...(favicon ? [{ rel: "icon", href: favicon }] : []),
        { rel: "canonical", href: `https://vendas164.com.br/loja/${params.slug}` },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            "name": store?.name || params.slug,
            "url": `https://vendas164.com.br/loja/${params.slug}`,
            "description": desc,
            ...(img ? { "image": img } : {}),
          })
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              {
                "@type": "ListItem",
                "position": 1,
                "name": "Início",
                "item": "https://vendas164.com.br/"
              },
              {
                "@type": "ListItem",
                "position": 2,
                "name": store?.name || params.slug,
                "item": `https://vendas164.com.br/loja/${params.slug}`
              }
            ]
          })
        }
      ],
    };
  },
  component: StorePage,
});

function StorePage() {
  const matchRoute = useMatchRoute();
  const isProductPage = matchRoute({ to: "/loja/$slug/$itemSlug", fuzzy: true });

  return (
    <ErrorBoundary>
      {isProductPage ? <Outlet /> : <StorePageContent />}
    </ErrorBoundary>
  );
}

function StorePageContent() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const cart = useCartStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedScale, setSelectedScale] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "price_asc" | "price_desc" | "name">("recent");
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);

  const { data, isLoading } = useQuery({
    queryKey: ["store", slug],
    retry: 2,
    queryFn: async () => {
      const { data: store, error } = await supabase
        .from("stores")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      if (!store) return null;
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });
      return { store, products: products ?? [] };
    },
  });

  const { data: isFollowing } = useQuery({
    queryKey: ["is-following-store", user?.id, data?.store?.id],
    enabled: !!user && !!data?.store?.id,
    retry: 2,
    queryFn: async () => {
      const { data: link } = await supabase
        .from("customer_store_link")
        .select("user_id")
        .eq("user_id", user!.id)
        .eq("store_id", data!.store.id)
        .maybeSingle();
      return !!link;
    },
  });

  useEffect(() => {
    const iconUrl = data?.store?.favicon_url || data?.store?.logo_url;
    if (iconUrl) {
      updateAppFavicon(iconUrl);
    }
  }, [data?.store]);

  async function toggleFollow() {
    if (!data?.store) return;
    if (!user) {
      navigate({ to: "/auth", search: { loja: data.store.id, next: `/loja/${slug}` } });
      return;
    }
    if (data.store.owner_id === user.id) {
      toast.info("Esta é a sua própria loja.");
      return;
    }

    if (isFollowing) {
      await supabase
        .from("customer_store_link")
        .delete()
        .eq("user_id", user.id)
        .eq("store_id", data.store.id);
      queryClient.invalidateQueries();
      toast.success("Você deixou de seguir esta loja.");
    } else {
      await supabase
        .from("customer_store_link")
        .upsert(
          { user_id: user.id, store_id: data.store.id },
          { onConflict: "user_id,store_id" }
        );

      const { data: existingProf } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (!existingProf) {
        await supabase.from("profiles").upsert({
          id: user.id,
          name: user.user_metadata?.name || user.email?.split("@")[0] || "Cliente",
          email: user.email,
          phone: user.user_metadata?.phone || null,
        });
      }

      saveCustomerToCache({
        id: user.id,
        name: user.user_metadata?.name || user.email?.split("@")[0] || "Cliente",
        email: user.email,
        phone: user.user_metadata?.phone || null,
      });

      queryClient.invalidateQueries();
      toast.success("Você agora está seguindo esta loja!");
    }
  }

  function copyInvite() {
    if (!data?.store) return;
    const url = `${window.location.origin}/auth?loja=${data.store.id}&next=/loja/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link de convite copiado!");
  }

  function resetFilters() {
    setSearchQuery("");
    setSelectedBrand("all");
    setSelectedScale("all");
    setSortBy("recent");
    setOnlyInStock(false);
  }

    const handleQuickAdd = (e: React.MouseEvent, p: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (p.stock <= 0) {
      toast.info("Esgotado! Entre no produto para fila de espera.");
      return;
    }
    
    const signal = getProductSignalAmount(p, 1).amount;
    const hasNoSignal = hasNoSignalRequirement(p);
    const downPaymentToPay = hasNoSignal ? 0 : signal;
    
    cart.addItem({
      productId: p.id,
      storeId: p.store_id,
      storeName: store?.name,
      quantity: 1,
      selectedInstallment: 1,
      unitPriceForChosenOption: p.price,
      totalPrice: p.price,
      downPaymentToPay,
      remainingBalance: p.price - downPaymentToPay,
      hasNoSignal,
      productSnapshot: {
        model: p.model,
        brand: p.brand,
        image_url: p.image_url,
        scale: p.scale,
      }
    });
    toast.success("Adicionado ao carrinho!");
  };

  const store = data?.store;
  const products = data?.products ?? [];
  const isOwner = !!(user && store?.owner_id === user.id);
  const storeStatus = (store as any)?.status || "active";

  // Extração de marcas e escalas disponíveis
  const availableScales = useMemo(
    () => Array.from(new Set(products.map((p) => p.scale).filter(Boolean))).sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.is_open) return false;
      if (onlyInStock && p.stock <= 0) return false;

      const matchBrand = selectedBrand === "all" || (p.brand || "Outros").trim() === selectedBrand;
      const matchScale = selectedScale === "all" || p.scale === selectedScale;

      if (!matchBrand || !matchScale) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const modelMatch = (p.model || "").toLowerCase().includes(q);
        const brandMatch = (p.brand || "").toLowerCase().includes(q);
        const descMatch = ((p as any).description || "").toLowerCase().includes(q);
        if (!modelMatch && !brandMatch && !descMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === "price_asc") return Number(a.price) - Number(b.price);
      if (sortBy === "price_desc") return Number(b.price) - Number(a.price);
      if (sortBy === "name") return (a.model || "").localeCompare(b.model || "");
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [products, selectedBrand, selectedScale, searchQuery, onlyInStock, sortBy]);

  // Agrupamento por marca
  const brandsMap = useMemo(() => {
    const map: Record<string, typeof products> = {};
    for (const p of filteredProducts) {
      const brandName = (p.brand || "Outros").trim();
      if (!map[brandName]) map[brandName] = [];
      map[brandName].push(p);
    }
    return map;
  }, [filteredProducts]);

  const allAvailableBrands = useMemo(() => {
    const set = new Set(products.filter((p) => p.is_open).map((p) => (p.brand || "Outros").trim()));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const brandList = useMemo(() => Object.keys(brandsMap).sort((a, b) => a.localeCompare(b)), [brandsMap]);
  const filteredBrands = useMemo(
    () => (selectedBrand === "all" ? brandList : brandList.filter((b) => b === selectedBrand)),
    [brandList, selectedBrand]
  );

  const hasActiveFilters = searchQuery.trim() !== "" || selectedBrand !== "all" || selectedScale !== "all" || onlyInStock || sortBy !== "recent";

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-6xl px-4 py-10">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="border-border/60 panel">
                <CardContent className="p-4">
                  <Skeleton className="h-40 w-full rounded-xl" />
                  <Skeleton className="mt-3 h-4 w-3/4" />
                  <Skeleton className="mt-2 h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Loja não encontrada.</p>
      </div>
    );
  }

  if (storeStatus !== "active" && !isOwner) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center space-y-4">
          <div className="rounded-2xl border border-border/60 panel p-8">
            <h1 className="text-xl font-bold text-foreground">Loja Indisponível</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Esta loja está em processo de análise e autorização pelo administrador do site e ainda não possui catálogo público liberado.
            </p>
            <div className="pt-4">
              <Button asChild variant="outline">
                <Link to="/">Voltar ao início</Link>
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      <AppHeader store={store} />
      {getStoreBanner(store.id) && (
        <div 
          className="w-full text-white text-xs sm:text-sm font-semibold py-2.5 px-4 text-center flex items-center justify-center gap-2 shadow-sm"
          style={{ backgroundColor: store.primary_color || "#e11d48" }}
        >
          <Sparkles className="size-4 shrink-0 animate-pulse text-amber-300" />
          <span>{getStoreBanner(store.id)}</span>
          <Sparkles className="size-4 shrink-0 animate-pulse text-amber-300" />
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        {/* Banner / Card da Loja */}
        <div
          className="rounded-3xl border border-border/30 p-6 sm:p-8 bg-card/60 shadow-sm backdrop-blur-sm"
          style={{ borderTopColor: store.primary_color, borderTopWidth: 3 }}
        >
          <div className="flex flex-wrap items-center gap-5">
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={`Logo ${store.name}`}
                className="size-16 rounded-2xl object-cover border border-border/30 shadow-sm"
                loading="lazy"
              />
            ) : (
              <span
                className="flex size-16 items-center justify-center rounded-2xl text-white font-bold text-xl shadow-sm"
                style={{ backgroundColor: store.primary_color }}
              >
                <StoreIcon className="size-7" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
                <Badge variant="outline" className="text-xs border-border/50">
                  <Sparkles className="size-3 mr-1 text-amber-500" /> Loja Oficial
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {store.description ?? "Pré-vendas de miniaturas colecionáveis"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button variant="secondary" onClick={copyInvite} className="border-border/30 text-xs sm:text-sm">
                <Copy className="size-4" /> Link de convite
              </Button>
              {!isOwner && (
                <Button
                  onClick={toggleFollow}
                  variant={isFollowing ? "outline" : "default"}
                  className={
                    isFollowing
                      ? "border-success/30 text-success hover:bg-success/10 font-semibold gap-1.5 text-xs sm:text-sm"
                      : "gap-1.5 text-xs sm:text-sm"
                  }
                  style={!isFollowing ? { backgroundColor: store.primary_color, color: "#fff" } : undefined}
                >
                  {isFollowing ? (
                    <>
                      <Check className="size-4" />
                      <span>Seguindo</span>
                    </>
                  ) : (
                    <span>Seguir loja</span>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* BARRA DE PESQUISA & FILTROS INTELIGENTES */}
        <div className="mt-8 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Live Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por modelo, marca ou detalhe..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-10 text-sm bg-card/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  title="Limpar busca"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Ordenação e Filtro de Estoque */}
            <div className="flex items-center gap-2 shrink-0">
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="h-10 text-xs sm:text-sm w-44 bg-card/60">
                  <ArrowUpDown className="size-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Ordenar por..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais Recentes</SelectItem>
                  <SelectItem value="price_asc">Menor Preço</SelectItem>
                  <SelectItem value="price_desc">Maior Preço</SelectItem>
                  <SelectItem value="name">Nome (A - Z)</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={onlyInStock ? "default" : "outline"}
                size="sm"
                className="h-10 text-xs px-3 gap-1.5"
                onClick={() => setOnlyInStock(!onlyInStock)}
                style={onlyInStock ? { backgroundColor: store.primary_color, color: "#fff" } : undefined}
              >
                <span>Em estoque</span>
              </Button>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-10 text-xs text-muted-foreground hover:text-foreground px-2"
                  title="Limpar todos os filtros"
                >
                  <X className="size-3.5 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Filtro de Escalas */}
          {availableScales.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Escala:</span>
              <button
                type="button"
                onClick={() => setSelectedScale("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all border ${
                  selectedScale === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50"
                }`}
              >
                Todas escalas
              </button>
              {availableScales.map((scale) => (
                <button
                  type="button"
                  key={scale}
                  onClick={() => setSelectedScale(scale)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all border ${
                    selectedScale === scale
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/30 text-muted-foreground border-border/30 hover:bg-muted/50"
                  }`}
                >
                  {scale}
                </button>
              ))}
            </div>
          )}

          {/* Filtro de Marcas */}
          {allAvailableBrands.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border/20 pb-4">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Marca:</span>
              <button
                type="button"
                onClick={() => setSelectedBrand("all")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  selectedBrand === "all"
                    ? "text-white shadow-md scale-105"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted/70 border border-transparent"
                }`}
                style={selectedBrand === "all" ? { backgroundColor: store.primary_color } : undefined}
              >
                Todas ({products.filter((p) => p.is_open).length})
              </button>
              {allAvailableBrands.map((brand) => {
                const count = products.filter((p) => p.is_open && (p.brand || "Outros").trim() === brand).length;
                return (
                  <button
                    type="button"
                    key={brand}
                    onClick={() => setSelectedBrand(brand)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      selectedBrand === brand
                        ? "text-white shadow-md scale-105"
                        : "bg-muted/50 text-muted-foreground hover:bg-muted/70 border border-transparent"
                    }`}
                    style={selectedBrand === brand ? { backgroundColor: store.primary_color } : undefined}
                  >
                    {brand} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Resumo de Resultados */}
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Exibindo <strong>{filteredProducts.length}</strong> {filteredProducts.length === 1 ? "miniatura" : "miniaturas"}
            {searchQuery && ` para "${searchQuery}"`}
          </span>
        </div>

        {/* Mensagem de Vazio quando não há miniaturas */}
        {filteredProducts.length === 0 ? (
          <div className="mt-12 rounded-3xl border border-dashed border-border/60 p-12 text-center space-y-3 bg-card/20">
            <Package className="mx-auto size-12 text-muted-foreground/40" />
            <h3 className="text-base font-semibold text-foreground">Nenhuma miniatura encontrada</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {searchQuery
                ? `Não encontramos nenhum modelo compatível com "${searchQuery}". Tente pesquisar por outros termos.`
                : "Não há miniaturas disponíveis com os filtros selecionados no momento."}
            </p>
            {hasActiveFilters && (
              <div className="pt-2">
                <Button size="sm" variant="outline" onClick={resetFilters}>
                  Limpar todos os filtros
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* Seções por Marca */
          <div className="mt-6 space-y-10">
            {filteredBrands.map((brand) => {
              const brandProducts = brandsMap[brand];
              if (!brandProducts || brandProducts.length === 0) return null;

              return (
                <section key={brand} className="space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-border/20 pb-2.5">
                    <h3 className="text-lg font-bold tracking-tight">{brand}</h3>
                    <span className="text-xs text-muted-foreground font-medium">
                      {brandProducts.length} {brandProducts.length === 1 ? "modelo" : "modelos"}
                    </span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {brandProducts.map((p) => (
                      <Link
                        key={p.id}
                        to="/loja/$slug/$itemSlug"
                        params={{ slug: slug ?? "loja", itemSlug: p.slug || p.id }}
                        className="group"
                      >
                        <Card className="flex h-full flex-col overflow-hidden border-border/30 bg-card/60 transition-transform group-hover:-translate-y-1 shadow-sm">
                          <div className="relative aspect-video w-full overflow-hidden bg-muted">
                            {/* Badges Flutuantes no Canto Superior Esquerdo */}
                            <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10 items-start pointer-events-none">
                              {getProductBadge(p.id) && (
                                <span className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white shadow-md bg-gradient-to-r from-amber-500 to-orange-600 border border-amber-400/30">
                                  {getProductBadge(p.id)}
                                </span>
                              )}
                              {p.stock > 0 && p.stock <= 2 && (
                                <span className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white shadow-md bg-rose-600/90 border border-rose-400/30">
                                  Últimas {p.stock} un.
                                </span>
                              )}
                              {hasNoSignalRequirement(p) && (
                                <span className="rounded-md px-2 py-0.5 text-[10px] font-bold text-white shadow-md bg-emerald-600/90 border border-emerald-400/30">
                                  Sem Sinal
                                </span>
                              )}
                            </div>
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
                            {/* Badge flutuante de acionamento na foto */}
                            <button
                              onClick={(e) => handleQuickAdd(e, p)}
                              className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-transform hover:scale-105 z-10"
                              style={{ backgroundColor: store.primary_color }}
                            >
                              <ShoppingCart className="size-3.5" />
                              <span>+ Carrinho</span>
                            </button>
                          </div>

                          <CardContent className="flex flex-1 flex-col justify-between p-4">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                {p.brand} · {p.scale}
                              </p>
                              <h3 className="mt-1 font-semibold line-clamp-1">{p.model}</h3>
                            </div>

                            <div className="mt-4 space-y-3">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                      À vista
                                    </span>
                                    <span
                                      className="font-display text-lg font-bold"
                                      style={{ color: store.primary_color }}
                                    >
                                      {brl(Number(p.price))}
                                    </span>
                                  </div>
                                  <Badge variant={p.is_open ? "secondary" : "outline"} className="border-border/30 text-xs">
                                    {formatStockRemaining(p)}
                                  </Badge>
                                </div>

                                {(() => {
                                  const signal = getProductSignalAmount(p);
                                  if (signal.isSemSinal) {
                                    return (
                                      <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                                        <span>Sem sinal (Pagar na chegada)</span>
                                      </div>
                                    );
                                  }
                                  return (
                                    <div className="flex items-center justify-between text-xs rounded-md bg-muted/30 px-2 py-1 border border-border/20">
                                      <span className="text-muted-foreground">Sinal para reservar:</span>
                                      <strong className="text-primary font-semibold">{brl(signal.amount)}</strong>
                                    </div>
                                  );
                                })()}

                                {(() => {
                                  const inst = getProductInstallmentInfo(p);
                                  if (!inst) return null;
                                  return (
                                    <p className="text-[11px] text-muted-foreground">
                                      ou <strong className="text-foreground">{inst.maxInstallments}x de {brl(inst.installmentValue)}</strong>{" "}
                                      {inst.hasSurcharge ? "" : "sem acréscimo"}
                                    </p>
                                  );
                                })()}
                              </div>

                              <Button
                                size="sm"
                                className="w-full font-semibold gap-1.5"
                                style={
                                  p.is_open && p.stock > 0
                                    ? { backgroundColor: store.primary_color, color: "#fff" }
                                    : undefined
                                }
                                variant={p.is_open && p.stock > 0 ? "default" : "outline"}
                              >
                                <BookmarkCheck className="size-4 shrink-0" />
                                {!p.is_open
                                  ? "Pré-venda fechada"
                                  : p.stock > 0
                                    ? "Reservar unidade"
                                    : "Entrar na fila"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
      <AppFooter storeInfo={data?.store || undefined} />
    </div>
  );
}
