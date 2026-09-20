import type { MouseEvent } from "react";
import type { Product } from "@/lib/cart";
import { brl, getProductInstallmentInfo, getProductSignalAmount, isProntaEntrega } from "@/lib/format";
import { getProductUrl } from "@/lib/subdomain";
import { formatStoreProductCardStock } from "@/lib/stock";
import { getStoreTabColors, type StoreTabColors } from "@/lib/storeCustomizations";
import { Button } from "@/components/ui/button";
import { Package, ShoppingCart } from "lucide-react";

interface StoreProductCardProps {
  product: Product;
  storeSlug: string;
  primaryColor?: string | null;
  customBadge?: string | null;
  tabColors?: StoreTabColors | null;
  onAdd: (event: MouseEvent, product: Product) => void;
}

export function StoreProductCard({
  product,
  storeSlug,
  primaryColor,
  customBadge,
  tabColors: propTabColors,
  onAdd,
}: StoreProductCardProps) {
  const resolvedTabColors = propTabColors || getStoreTabColors(product.store_id);
  const available = product.is_open && product.stock > 0;
  const ready = isProntaEntrega(product);
  const signal = getProductSignalAmount(product);
  const installment = getProductInstallmentInfo(product);
  const url = getProductUrl(storeSlug, product.slug || product.id);
  const metadata = [product.brand, product.scale].filter(Boolean).join(" · ");

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-within:border-primary/40 sm:rounded-2xl">
      <a
        href={url}
        className="relative block aspect-[4/3] overflow-hidden bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Ver detalhes de ${product.model}`}
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={`${product.brand} ${product.model}`}
            loading="lazy"
            width="480"
            height="360"
            className="size-full object-contain p-2 transition-transform duration-300 motion-safe:group-hover:scale-105 sm:p-3"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <Package className="size-9 text-muted-foreground sm:size-10" />
          </div>
        )}

        <span
          className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full px-2 py-1 text-xs font-semibold text-white shadow-sm sm:left-3 sm:top-3"
          style={{ backgroundColor: ready ? (resolvedTabColors?.prontaEntregaColor || "#059669") : (resolvedTabColors?.preVendaColor || "#ea580c") }}
        >
          {ready ? "Pronta entrega" : "Pré-venda"}
        </span>
      </a>

      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {metadata || "Miniatura 1:64"}
          </p>
          <h3 className="mt-1 min-h-10 text-sm font-semibold leading-5 text-foreground sm:text-base">
            <a
              href={url}
              className="line-clamp-2 rounded-sm decoration-primary/40 underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {product.model}
            </a>
          </h3>

          {customBadge && (
            <p className="mt-2 inline-flex max-w-full truncate rounded-full bg-amber-500/15 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {customBadge}
            </p>
          )}

          {product.observation && (
            <p className="mt-2 line-clamp-2 text-xs leading-4 text-muted-foreground">
              {product.observation}
            </p>
          )}
        </div>

        <div className="border-t border-border/40 pt-3">
          <p className="text-xs font-medium text-muted-foreground">À vista</p>
          <p className="mt-0.5 text-lg font-bold leading-tight tabular-nums sm:text-xl" style={primaryColor ? { color: primaryColor } : undefined}>
            {brl(Number(product.price))}
          </p>

          <div className="mt-2 space-y-1 text-xs leading-4">
            <p className={signal.isSemSinal ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
              {signal.isSemSinal
                ? "Sem sinal antecipado"
                : <>Sinal: <strong className="font-semibold text-foreground">{brl(Math.min(Number(product.price), signal.amount))}</strong></>}
            </p>
            {installment && (
              <p className="text-muted-foreground">
                Até <strong className="font-semibold text-foreground">{installment.maxInstallments}x de {brl(installment.installmentValue)}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="mt-auto space-y-2">
          {(() => {
            const stockInfo = formatStoreProductCardStock(product);
            return (
              <p
                className={`text-xs font-medium ${
                  !available
                    ? "text-muted-foreground"
                    : stockInfo.isScarce
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {stockInfo.text}
              </p>
            );
          })()}

          {available ? (
            <Button
              className="min-h-11 w-full gap-2 px-2 text-xs font-semibold sm:text-sm"
              style={primaryColor ? { backgroundColor: primaryColor, color: "#fff" } : undefined}
              onClick={(event) => onAdd(event, product)}
            >
              <ShoppingCart className="size-4 shrink-0" />
              <span>Adicionar</span>
            </Button>
          ) : (
            <Button asChild variant="outline" className="min-h-11 w-full px-2 text-xs font-semibold sm:text-sm">
              <a href={url}>Ver disponibilidade</a>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
