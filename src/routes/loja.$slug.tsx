import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, Check, Copy, Package, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";
import { AppHeader, updateAppFavicon } from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { brl, getProductInstallmentInfo } from "@/lib/format";
import { useSession } from "@/lib/session";
import { saveCustomerToCache } from "@/lib/customerCache";

export const Route = createFileRoute("/loja/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `Loja ${params.slug} — pré-vendas de miniaturas | MiniPré` },
      {
        name: "description",
        content: `Veja as pré-vendas abertas e reserve sua cota na loja ${params.slug}.`,
      },
      { property: "og:title", content: `Loja ${params.slug} — MiniPré` },
      { property: "og:description", content: "Pré-vendas abertas de miniaturas colecionáveis." },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedScale, setSelectedScale] = useState<string>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["store", slug],
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

      // Garantir que a tabela profiles tem o cadastro do cliente
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

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Carregando loja…</p>
      </div>
    );
  }

  if (!data?.store) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="p-8 text-center text-sm text-muted-foreground">Loja não encontrada.</p>
      </div>
    );
  }

  const { store, products } = data;
  const isOwner = !!(user && store.owner_id === user.id);
  const storeStatus = (store as any).status || "active";

  // Se a loja ainda estiver pendente ou tiver sido recusada (e quem está vendo não é o próprio dono da loja)
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

  // Extração de marcas e escalas disponíveis
  const availableScales = Array.from(
    new Set((products ?? []).map((p) => p.scale).filter(Boolean)),
  ).sort();

  const filteredProducts = (products ?? []).filter((p) => {
    const matchBrand = selectedBrand === "all" || (p.brand || "Outros").trim() === selectedBrand;
    const matchScale = selectedScale === "all" || p.scale === selectedScale;
    return matchBrand && matchScale;
  });

  // Agrupamento por marca
  const brandsMap: Record<string, typeof products> = {};
  for (const p of filteredProducts) {
    const brandName = (p.brand || "Outros").trim();
    if (!brandsMap[brandName]) brandsMap[brandName] = [];
    brandsMap[brandName].push(p);
  }
  const brandList = Object.keys(brandsMap).sort((a, b) => a.localeCompare(b));
  const filteredBrands = selectedBrand === "all" ? brandList : brandList.filter((b) => b === selectedBrand);

  return (
    <div className="min-h-screen">
      <AppHeader store={store} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div
          className="rounded-3xl border border-border/60 p-6 panel"
          style={{ borderTopColor: store.primary_color, borderTopWidth: 4 }}
        >
          <div className="flex flex-wrap items-center gap-4">
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={`Logo ${store.name}`}
                className="size-16 rounded-2xl object-cover"
              />
            ) : (
              <span
                className="flex size-16 items-center justify-center rounded-2xl text-white font-bold text-xl"
                style={{ backgroundColor: store.primary_color }}
              >
                <StoreIcon className="size-7" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold">{store.name}</h1>
              <p className="text-sm text-muted-foreground">
                {store.description ?? "Pré-vendas de miniaturas colecionáveis"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={copyInvite}>
                <Copy className="size-4" /> Link de convite
              </Button>
              {!isOwner && (
                <Button
                  onClick={toggleFollow}
                  variant={isFollowing ? "outline" : "default"}
                  className={
                    isFollowing
                      ? "border-success/80 text-success hover:bg-success/10 font-semibold gap-1.5"
                      : "gap-1.5"
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

        {/* Cabeçalho & Filtro por marcas */}
        <div className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Pré-vendas</h2>
            <p className="text-xs text-muted-foreground">
              {products.length} {products.length === 1 ? "miniatura em catálogo" : "miniaturas em catálogo"}
            </p>
          </div>

          {/* Filtro de Escalas */}
          {availableScales.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Escala:</span>
              <button
                type="button"
                onClick={() => setSelectedScale("all")}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all border ${
                  selectedScale === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted"
                }`}
              >
                Todas escalas
              </button>
              {availableScales.map((scale) => (
                <button
                  type="button"
                  key={scale}
                  onClick={() => setSelectedScale(scale)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all border ${
                    selectedScale === scale
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/40 text-muted-foreground border-border/60 hover:bg-muted"
                  }`}
                >
                  {scale}
                </button>
              ))}
            </div>
          )}

          {/* Filtro de Marcas */}
          {brandList.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-border/40 pb-4">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Marca:</span>
              <button
                type="button"
                onClick={() => setSelectedBrand("all")}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  selectedBrand === "all"
                    ? "text-white shadow-md scale-105"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted"
                }`}
                style={selectedBrand === "all" ? { backgroundColor: store.primary_color } : undefined}
              >
                Todas ({filteredProducts.length})
              </button>
              {brandList.map((brand) => (
                <button
                  type="button"
                  key={brand}
                  onClick={() => setSelectedBrand(brand)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                    selectedBrand === brand
                      ? "text-white shadow-md scale-105"
                      : "bg-muted/70 text-muted-foreground hover:bg-muted"
                  }`}
                  style={selectedBrand === brand ? { backgroundColor: store.primary_color } : undefined}
                >
                  {brand} ({brandsMap[brand].length})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Seções por Marca */}
        <div className="mt-6 space-y-10">
          {filteredBrands.map((brand) => {
            const brandProducts = brandsMap[brand];
            return (
              <section key={brand} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <h3 className="text-lg font-bold tracking-tight">{brand}</h3>
                  <Badge variant="secondary" className="text-xs font-medium">
                    {brandProducts.length} {brandProducts.length === 1 ? "modelo" : "modelos"}
                  </Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {brandProducts.map((p) => (
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
                          {/* Badge flutuante de acionamento na foto */}
                          <div
                            className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-transform group-hover:scale-105"
                            style={{ backgroundColor: store.primary_color }}
                          >
                            <BookmarkCheck className="size-3.5" />
                            <span>Reservar</span>
                          </div>
                        </div>

                        <CardContent className="flex flex-1 flex-col justify-between p-4">
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              {p.brand} · {p.scale}
                            </p>
                            <h3 className="mt-1 font-semibold">{p.model}</h3>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] uppercase font-semibold text-muted-foreground block">À vista</span>
                                  <span className="font-display text-lg font-bold" style={{ color: store.primary_color }}>
                                    {brl(Number(p.price))}
                                  </span>
                                </div>
                                <Badge variant={p.is_open ? "secondary" : "outline"}>
                                  {p.is_open ? `${p.stock} ${p.stock === 1 ? "unidade" : "unidades"}` : "Fechada"}
                                </Badge>
                              </div>
                              {(() => {
                                const inst = getProductInstallmentInfo(p);
                                if (!inst) return null;
                                return (
                                  <p className="text-xs text-muted-foreground">
                                    ou <strong className="text-foreground">{inst.maxInstallments}x de {brl(inst.installmentValue)}</strong> {inst.hasSurcharge ? "" : "sem acréscimo"}
                                  </p>
                                );
                              })()}
                            </div>

                            <Button
                              size="sm"
                              className="w-full font-semibold gap-1.5 shadow-md"
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

          {products.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma pré-venda cadastrada ainda.</p>
          )}
        </div>
      </main>
    </div>
  );
}
