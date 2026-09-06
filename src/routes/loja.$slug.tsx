import type { Product } from "@/lib/cart";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, Check, Copy, Package, Search, Sparkles, Store as StoreIcon, X, ShoppingCart, LayoutGrid, List, ChevronLeft, ChevronRight, ListFilter, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { createServerFn } from "@tanstack/react-start";
import { AppHeader } from "@/components/AppHeader";
import { updateAppFavicon } from "@/lib/favicon";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Badge } from "@/components/ui/badge";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { brl, getProductSignalAmount, hasNoSignalRequirement } from "@/lib/format";
import { formatStockRemaining } from "@/lib/stock";
import { useSession } from "@/lib/session";
import { useCartStore } from "@/lib/cart";
import { saveCustomerToCache } from "@/lib/customerCache";
import { getStoreBanner, getProductBadge } from "@/lib/storeCustomizations";
import { StoreReviewsSection } from "@/components/StoreReviewsSection";
import { getSubdomain, getStoreFullUrl, getProductUrl } from "@/lib/subdomain";

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
      {isProductPage ? <Outlet /> : <StoreView />}
    </ErrorBoundary>
  );
}

export function StoreView({ slug: slugProp }: { slug?: string } = {}) {
  let paramsFromRoute: { slug?: string } = {};
  try {
    paramsFromRoute = Route.useParams();
  } catch {}
  const slug = slugProp || paramsFromRoute?.slug || "";
  const { user } = useSession();
  const cart = useCartStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined" || !slug) return;
    const currentSub = getSubdomain();
    if (currentSub && currentSub !== slug) {
      window.location.href = getStoreFullUrl(slug);
    } else if (currentSub && currentSub === slug && window.location.pathname.startsWith("/loja/")) {
      window.history.replaceState(null, "", "/");
    }
  }, [slug]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<"all" | "pre" | "pronta">("all");
  const [selectedScale, setSelectedScale] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "recent" | "price_asc" | "price_desc">("recent");
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim().slice(0, 200)), 250); return () => clearTimeout(timer); }, [searchQuery]);

  const storeQuery = useQuery({
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
      return { store };
    },
  });

  const catalogQuery = useQuery({
    queryKey: ["catalog", storeQuery.data?.store.id, debouncedSearch, selectedBrand, selectedScale, selectedType, onlyInStock, sortBy, currentPage, itemsPerPage],
    enabled: !!storeQuery.data?.store.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("catalog_page", {
        _store_id: storeQuery.data!.store.id, _search: debouncedSearch, _brand: selectedBrand,
        _scale: selectedScale, _type: selectedType, _in_stock: onlyInStock, _sort: sortBy,
        _page: currentPage, _page_size: itemsPerPage,
      });
      if (error) throw error;
      return data as unknown as { products: Product[]; total: number; brands: string[] };
    },
  });
  const data = storeQuery.data ? { store: storeQuery.data.store, products: catalogQuery.data?.products ?? [] } : null;
  const isLoading = storeQuery.isLoading;
  const isError = storeQuery.isError;
  const refetch = storeQuery.refetch;

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

  // Vincular automaticamente o visitante logado à loja ao acessar a URL da loja
  useEffect(() => {
    async function autoLinkCustomerOnVisit() {
      if (!user || !data?.store?.id) return;
      if (data.store.owner_id === user.id) return; // Não vincular o próprio lojista à sua loja

      try {
        const { error } = await supabase.from("customer_store_link").upsert(
          { user_id: user.id, store_id: data.store.id },
          { onConflict: "user_id,store_id" }
        );

        if (!error) {
          queryClient.invalidateQueries({ queryKey: ["is-following-store", user.id, data.store.id] });
          queryClient.invalidateQueries({ queryKey: ["customer-store-links", data.store.id] });
        }
      } catch (e) {
        console.error("Erro ao vincular cliente à loja:", e);
      }
    }

    autoLinkCustomerOnVisit();
  }, [user?.id, data?.store?.id]);


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
    setSelectedType("all");
    setSelectedScale("all");
    setSortBy("recent");
    setOnlyInStock(false);
  }

    const handleQuickAdd = (e: React.MouseEvent, p: any) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!p.is_open || p.stock <= 0) {
      toast.info("Esgotado! Entre no produto para fila de espera.");
      return;
    }
    
    const signal = getProductSignalAmount(p, 1).amount;
    const hasNoSignal = hasNoSignalRequirement(p);
    const downPaymentToPay = hasNoSignal ? 0 : signal;
    
    try { cart.addItem({
      productId: p.id,
      pricingProduct: p,
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
    } catch { toast.error("Não foi possível adicionar. Confira a quantidade (máximo de 100 unidades)."); }
  };

  const store = data?.store;
  const products = data?.products ?? [];
  const isOwner = !!(user && store?.owner_id === user.id);
  const storeStatus = (store as any)?.status || "active";

  useEffect(() => { setCurrentPage(1); }, [selectedBrand, selectedScale, selectedType, debouncedSearch, onlyInStock, sortBy, itemsPerPage]);
  const productCount = catalogQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(productCount / itemsPerPage));
  const paginatedProducts = products;

  // Agrupamento por marca da página atual
  const brandsMap = useMemo(() => {
    const map: Record<string, typeof products> = {};
    for (const p of paginatedProducts) {
      const brandName = (p.brand || "Outros").trim();
      if (!map[brandName]) map[brandName] = [];
      map[brandName].push(p);
    }
    return map;
  }, [paginatedProducts]);

  const allAvailableBrands = catalogQuery.data?.brands ?? [];

  const brandList = Object.keys(brandsMap).sort((a, b) => a.localeCompare(b));
  const filteredBrands = useMemo(
    () => (selectedBrand === "all" ? brandList : brandList.filter((b) => b === selectedBrand)),
    [brandList, selectedBrand]
  );

  const hasActiveFilters = searchQuery.trim() !== "" || selectedBrand !== "all" || selectedScale !== "all" || selectedType !== "all" || onlyInStock || sortBy !== "recent";

  if (isError) return <div className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold">Não foi possível carregar a loja</h1><p className="my-4 text-muted-foreground">Verifique sua conexão e tente novamente.</p><Button onClick={() => refetch()}>Tentar novamente</Button></div>;

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

  const isPubliclyAvailable = storeStatus === "active" || storeStatus === "subscriber" || storeStatus === "trial" || storeStatus.startsWith("trial:");

  if (!isPubliclyAvailable && !isOwner) {
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
            <div className="flex items-center gap-2 flex-1">
              {/* Live Search Input */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por produto"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-10 text-sm bg-card/60 rounded-lg"
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
              
              {/* Mobile Filter Toggle */}
              <Button 
                variant="outline" 
                onClick={() => setShowFilters(!showFilters)}
                className="sm:hidden h-10 px-3 flex items-center gap-2 bg-card/60"
              >
                <ListFilter className="size-4" /> Filtros {showFilters ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </Button>
            </div>

            {/* Selects Row */}
            <div className={`sm:flex flex-wrap items-center gap-2 ${showFilters ? "grid grid-cols-2 mt-2 sm:mt-0" : "hidden"}`}>
              <Select value={selectedType} onValueChange={(v: any) => setSelectedType(v)}>
                <SelectTrigger className="h-10 text-xs sm:text-sm w-full sm:w-36 bg-card/60" style={selectedType !== "all" ? { borderColor: store.primary_color } : undefined}>
                  <SelectValue placeholder="Tipo">{selectedType === "all" ? "Tipo" : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pre">Pré-venda</SelectItem>
                  <SelectItem value="pronta">Pronta entrega</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedBrand} onValueChange={(v: any) => setSelectedBrand(v)}>
                <SelectTrigger className="h-10 text-xs sm:text-sm w-full sm:w-36 bg-card/60" style={selectedBrand !== "all" ? { borderColor: store.primary_color } : undefined}>
                  <SelectValue placeholder="Marca">{selectedBrand === "all" ? "Marca" : undefined}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {allAvailableBrands.map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="h-10 text-xs sm:text-sm w-full sm:w-48 bg-card/60 col-span-2 sm:col-span-1">
                  <SelectValue placeholder="Ordenação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais novo ao mais antigo</SelectItem>
                  <SelectItem value="name">Nome (A - Z)</SelectItem>
                  <SelectItem value="price_asc">Menor Preço</SelectItem>
                  <SelectItem value="price_desc">Maior Preço</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Pills Type selection */}
            <div className="flex flex-wrap items-center gap-1 border border-border/20 p-1 rounded-full bg-card/30 w-fit">
               <button
                  type="button"
                  onClick={() => setSelectedType("all")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                    selectedType === "all"
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={selectedType === "all" ? { backgroundColor: store.primary_color } : undefined}
                >
                  Todos
               </button>
               <button
                  type="button"
                  onClick={() => setSelectedType("pre")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                    selectedType === "pre"
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={selectedType === "pre" ? { backgroundColor: store.primary_color } : undefined}
                >
                  Pré-venda
               </button>
               <button
                  type="button"
                  onClick={() => setSelectedType("pronta")}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                    selectedType === "pronta"
                      ? "text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={selectedType === "pronta" ? { backgroundColor: store.primary_color } : undefined}
                >
                  Pronta entrega
               </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
               <Button
                variant={onlyInStock ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs px-3 gap-1.5 rounded-full"
                onClick={() => setOnlyInStock(!onlyInStock)}
                style={onlyInStock ? { backgroundColor: store.primary_color, color: "#fff" } : undefined}
              >
                <span>Somente em estoque</span>
              </Button>

              <div className="flex items-center rounded-full border border-border/40 p-0.5 bg-card/60">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`flex items-center justify-center p-1.5 rounded-full transition-all ${
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Visualização em Grade"
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={`flex items-center justify-center p-1.5 rounded-full transition-all ${
                    viewMode === "list"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Visualização em Lista Compacta"
                >
                  <List className="size-3.5" />
                </button>
              </div>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9 text-xs text-muted-foreground hover:text-foreground px-2"
                  title="Limpar todos os filtros"
                >
                  <X className="size-3 mr-1" /> Limpar
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Resumo de Resultados & Itens por Página */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Exibindo{" "}
            <strong>
              {productCount > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}
            </strong>{" "}
            a{" "}
            <strong>
              {Math.min(currentPage * itemsPerPage, productCount)}
            </strong>{" "}
            de <strong>{productCount}</strong> {productCount === 1 ? "miniatura" : "miniaturas"}
            {totalPages > 1 && ` (Página ${currentPage} de ${totalPages})`}
            {searchQuery && ` para "${searchQuery}"`}
          </span>

          {productCount > 12 && (
            <div className="flex items-center gap-2">
              <span>Exibir por página:</span>
              <div className="flex items-center gap-1">
                {[12, 24, 48, 96].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setItemsPerPage(num)}
                    className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                      itemsPerPage === num
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/40 hover:bg-muted text-muted-foreground"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mensagem de Vazio quando não há miniaturas */}
        {catalogQuery.isError ? <div role="alert" className="rounded-xl border p-6 text-center"><p>Não foi possível carregar os produtos.</p><Button variant="outline" className="mt-3" onClick={() => catalogQuery.refetch()}>Tentar novamente</Button></div> : catalogQuery.isFetching ? <div className="grid grid-cols-2 gap-4 lg:grid-cols-3" aria-label="Carregando produtos">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)}</div> : productCount === 0 ? (
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

                  {viewMode === "list" ? (
                    <div className="space-y-2.5">
                      {brandProducts.map((p) => {
                        const signal = getProductSignalAmount(p);
                        const customBadge = getProductBadge(p.id);
                        return (
                          <a
                            key={p.id}
                            href={getProductUrl(slug ?? "loja", p.slug || p.id)}
                            className="group block"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/30 bg-card/60 hover:bg-card hover:border-primary/40 transition-all shadow-sm">
                              {/* Foto + Informações da Miniatura */}
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative size-16 sm:size-20 shrink-0 rounded-lg overflow-hidden bg-muted border border-border/20">
                                  {p.image_url ? (
                                    <img
                                      src={p.image_url}
                                      alt={p.model}
                                      loading="lazy"
                                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-muted-foreground">
                                      <Package className="size-6" />
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                                      {p.brand} · {p.scale}
                                    </span>
                                    {customBadge && (
                                      <span className="rounded px-1.5 py-0.2 text-[9px] font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600">
                                        {customBadge}
                                      </span>
                                    )}
                                    {p.stock > 0 && p.stock <= 2 && (
                                      <span className="rounded px-1.5 py-0.2 text-[9px] font-bold text-white bg-rose-600">
                                        Últimas {p.stock} un.
                                      </span>
                                    )}
                                  </div>

                                  <h4 className="font-semibold text-sm line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                                    {p.model}
                                  </h4>

                                  <div className="flex items-center gap-2 pt-0.5 flex-wrap text-xs">
                                    <Badge variant={p.is_open ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                                      {formatStockRemaining(p)}
                                    </Badge>

                                    {signal.isSemSinal ? (
                                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                        Sem sinal (Pagar na chegada)
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-muted-foreground">
                                        Sinal: <strong className="text-primary">{brl(signal.amount)}</strong>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Preço & Botões de Ação */}
                              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/20">
                                <div className="text-left sm:text-right">
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                                    À vista
                                  </span>
                                  <span className="font-display text-base sm:text-lg font-bold" style={{ color: store.primary_color }}>
                                    {brl(Number(p.price))}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={(e) => handleQuickAdd(e, p)}
                                    className="p-2 rounded-lg text-white shadow-sm hover:scale-105 transition-transform"
                                    style={{ backgroundColor: store.primary_color }}
                                    title="Adicionar ao carrinho"
                                  >
                                    <ShoppingCart className="size-4" />
                                  </button>
                                  <Button
                                    size="sm"
                                    className="font-semibold text-xs h-9 px-3 gap-1"
                                    style={p.is_open && p.stock > 0 ? { backgroundColor: store.primary_color, color: "#fff" } : undefined}
                                    variant={p.is_open && p.stock > 0 ? "default" : "outline"}
                                  >
                                    <BookmarkCheck className="size-3.5" />
                                    <span>Reservar</span>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 lg:grid-cols-3">
                      {brandProducts.map(p => <StoreProductCard key={p.id} product={p} storeSlug={slug ?? "loja"} onAdd={handleQuickAdd} />)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {/* BARRA DE PAGINAÇÃO DE PRODUTOS */}
        {totalPages > 1 && (
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl border border-border/30 bg-card/60 shadow-sm backdrop-blur-sm">
            <div className="text-xs text-muted-foreground">
              Página <strong className="text-foreground">{currentPage}</strong> de{" "}
              <strong className="text-foreground">{totalPages}</strong>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 text-xs gap-1"
                disabled={currentPage <= 1}
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 400, behavior: "smooth" });
                }}
              >
                <ChevronLeft className="size-4" />
                <span>Anterior</span>
              </Button>

              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                if (
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                ) {
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => {
                        setCurrentPage(pageNum);
                        window.scrollTo({ top: 400, behavior: "smooth" });
                      }}
                      className={`size-9 rounded-lg text-xs font-bold transition-all border ${
                        currentPage === pageNum
                          ? "text-white border-transparent shadow-md scale-105"
                          : "bg-muted/30 border-border/30 text-muted-foreground hover:bg-muted"
                      }`}
                      style={currentPage === pageNum ? { backgroundColor: store.primary_color } : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                }
                if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                  return <span key={pageNum} className="text-xs text-muted-foreground px-1">...</span>;
                }
                return null;
              })}

              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 text-xs gap-1"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 400, behavior: "smooth" });
                }}
              >
                <span>Próxima</span>
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Seção de Avaliações dos Clientes */}
        <StoreReviewsSection storeId={store.id} storeName={store.name} primaryColor={store.primary_color} />
      </main>
      <AppFooter storeInfo={data?.store || undefined} />
    </div>
  );
}
