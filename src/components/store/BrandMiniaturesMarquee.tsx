import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl, isProntaEntrega, getProductSignalAmount } from "@/lib/format";
import { getProductUrl } from "@/lib/subdomain";
import { formatStoreProductCardStock } from "@/lib/stock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, Package, ArrowUpRight } from "lucide-react";

interface BrandMiniaturesMarqueeProps {
  currentProductId: string;
  brand: string;
  storeId: string;
  storeSlug: string;
  storeName?: string;
  primaryColor?: string | null;
}

export function BrandMiniaturesMarquee({
  currentProductId,
  brand,
  storeId,
  storeSlug,
  storeName,
  primaryColor,
}: BrandMiniaturesMarqueeProps) {
  const [userPaused, setUserPaused] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const cleanBrand = brand?.trim() || "";

  // Busca miniaturas da mesma marca nesta loja
  const { data, isLoading } = useQuery({
    queryKey: ["brand-marquee-products", storeId, cleanBrand, currentProductId],
    enabled: !!storeId && !!currentProductId,
    queryFn: async () => {
      let sameBrandItems: any[] = [];
      const selectFields = "id, slug, model, brand, scale, price, image_url, is_open, stock, observation, store_id, down_payment_amount, release_date";

      // 1. Tenta buscar da mesma marca
      if (cleanBrand) {
        const { data: brandProducts, error } = await supabase
          .from("products")
          .select(selectFields)
          .eq("store_id", storeId)
          .ilike("brand", cleanBrand)
          .neq("id", currentProductId)
          .order("created_at", { ascending: false })
          .limit(16);

        if (!error && brandProducts && brandProducts.length > 0) {
          sameBrandItems = brandProducts;
        }
      }

      // Se temos 4 ou mais da mesma marca, exibimos exclusivamente a marca
      if (sameBrandItems.length >= 4) {
        return {
          items: sameBrandItems,
          mode: "brand_only" as const,
        };
      }

      // Se temos menos de 4 da mesma marca, complementamos com outros modelos da loja
      const excludedIds = [currentProductId, ...sameBrandItems.map((p) => p.id)];
      const { data: fallbackProducts } = await supabase
        .from("products")
        .select(selectFields)
        .eq("store_id", storeId)
        .not("id", "in", `(${excludedIds.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(12);

      const extraItems = fallbackProducts || [];
      const combined = [...sameBrandItems, ...extraItems];

      return {
        items: combined,
        mode: sameBrandItems.length > 0 ? ("brand_and_store" as const) : ("store_only" as const),
      };
    },
  });

  const rawItems = data?.items || [];
  const mode = data?.mode ?? "store_only";

  if (isLoading || rawItems.length === 0) {
    return null;
  }

  // Prepara itens para loop contínuo infinito
  // Duplicamos proporcionalmente para garantir trilha contínua em telas largas
  const repeatCount = rawItems.length < 3 ? 6 : rawItems.length < 6 ? 4 : 2;
  const loopItems = Array.from({ length: repeatCount }).flatMap(() => rawItems);

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const offset = direction === "left" ? -340 : 340;
    scrollContainerRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  const title =
    mode === "brand_only"
      ? `Mais da ${cleanBrand}`
      : mode === "brand_and_store"
        ? `Mais da ${cleanBrand} e destaques`
        : `Mais opções na ${storeName || "loja"}`;

  const subtitle =
    mode === "brand_only"
      ? `Outras miniaturas ${cleanBrand} selecionadas para você explorar`
      : mode === "brand_and_store"
        ? `Outras opções da mesma marca e destaques da vitrine`
        : "Outros modelos disponíveis nesta loja";

  return (
    <section className="relative mt-12 sm:mt-16 pt-8 border-t border-border/40" aria-label="Mais opções de miniaturas">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex size-6 items-center justify-center rounded-lg text-white text-xs shadow-sm"
              style={{ backgroundColor: primaryColor || "var(--color-primary)" }}
            >
              <Sparkles className="size-3.5" />
            </span>
            <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {title}
            </h2>
            {mode !== "store_only" && (
              <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0.5">
                {cleanBrand}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>

        {/* Controles: Play/Pause e Setas */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
            onClick={() => setUserPaused((prev) => !prev)}
            title={userPaused ? "Retomar movimento" : "Pausar movimento"}
            aria-label={userPaused ? "Retomar movimento do carrossel" : "Pausar movimento do carrossel"}
          >
            {userPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 rounded-lg border-border/40 text-muted-foreground hover:text-foreground"
            onClick={() => handleScroll("left")}
            aria-label="Rolar para a esquerda"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8 rounded-lg border-border/40 text-muted-foreground hover:text-foreground"
            onClick={() => handleScroll("right")}
            aria-label="Rolar para a direita"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Trilha do Carrossel Contínuo com Degrade Lateral */}
      <div className="relative overflow-hidden rounded-2xl">
        {/* Sombras suaves nas extremidades para fade in/out */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8 sm:w-16 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 sm:w-16 bg-gradient-to-l from-background to-transparent" />

        <div
          ref={scrollContainerRef}
          className="overflow-x-auto scrollbar-none py-1 px-1 focus:outline-none"
          tabIndex={0}
          aria-label="Lista de miniaturas em movimento contínuo"
        >
          <div
            className={`flex gap-3 sm:gap-4 py-1 animate-marquee-slow ${
              userPaused ? "[animation-play-state:paused]" : ""
            }`}
            style={{
              animationDuration: `${Math.max(35, loopItems.length * 4)}s`,
            }}
          >
            {loopItems.map((item, idx) => {
              const url = getProductUrl(storeSlug, item.slug || item.id);
              const ready = isProntaEntrega(item);
              const signal = getProductSignalAmount(item);
              const stockInfo = formatStoreProductCardStock(item);
              const isCurrentBrand = cleanBrand && item.brand?.toLowerCase() === cleanBrand.toLowerCase();

              return (
                <article
                  key={`${item.id}-${idx}`}
                  className="group relative flex-shrink-0 w-52 sm:w-60 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-2.5 sm:p-3 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 hover:bg-card"
                >
                  <a href={url} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
                    {/* Imagem */}
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted/40 transition-colors group-hover:bg-muted/60">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={`${item.brand} ${item.model}`}
                          loading="lazy"
                          className="h-full w-full object-contain p-2 transition-transform duration-300 motion-safe:group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <Package className="size-8 opacity-60" />
                        </div>
                      )}

                      {/* Badge Pronta Entrega / Pré-Venda */}
                      <span
                        className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm ${
                          ready ? "bg-emerald-600" : "bg-amber-600"
                        }`}
                      >
                        {ready ? "Pronta entrega" : "Pré-venda"}
                      </span>

                      {/* Selo Mesma Marca se estiver em modo combinado */}
                      {isCurrentBrand && mode === "brand_and_store" && (
                        <span className="absolute left-1.5 bottom-1.5 rounded bg-black/70 backdrop-blur-xs px-1.5 py-0.5 text-[9px] font-medium text-white border border-white/10">
                          Mesma marca
                        </span>
                      )}

                      {/* Ícone de link rápido ao passar o mouse */}
                      <div className="absolute right-1.5 top-1.5 size-6 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowUpRight className="size-3.5 text-foreground" />
                      </div>
                    </div>

                    {/* Informações */}
                    <div className="mt-2.5 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground line-clamp-1">
                        {item.brand} {item.scale ? `· ${item.scale}` : ""}
                      </p>
                      <h3 className="text-xs sm:text-sm font-semibold leading-tight text-foreground line-clamp-2 min-h-[2rem] group-hover:text-primary transition-colors">
                        {item.model}
                      </h3>

                      {/* Preço e Estoque */}
                      <div className="pt-1.5 border-t border-border/30 flex items-baseline justify-between gap-1">
                        <div>
                          <span className="text-[10px] text-muted-foreground block leading-none">À vista</span>
                          <strong
                            className="text-sm sm:text-base font-bold tabular-nums"
                            style={primaryColor ? { color: primaryColor } : undefined}
                          >
                            {brl(Number(item.price))}
                          </strong>
                        </div>

                        <span
                          className={`text-[10px] font-medium ${
                            stockInfo.isScarce
                              ? "text-rose-500 font-semibold"
                              : "text-muted-foreground"
                          }`}
                        >
                          {stockInfo.text}
                        </span>
                      </div>

                      {/* Previsão ou Sinal */}
                      {!ready && (
                        <p className="text-[10px] text-muted-foreground line-clamp-1 pt-0.5">
                          {signal.isSemSinal ? (
                            <span className="text-emerald-500 font-medium">Sem sinal prévio</span>
                          ) : (
                            <span>Sinal: <strong className="text-foreground">{brl(signal.amount)}</strong></span>
                          )}
                        </p>
                      )}
                    </div>
                  </a>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
