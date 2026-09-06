import type { MouseEvent } from 'react';
import type { Product } from '@/lib/cart';
import { brl, getProductSignalAmount, isProntaEntrega } from '@/lib/format';
import { getProductUrl } from '@/lib/subdomain';
import { Button } from '@/components/ui/button';
import { Package, ShoppingCart } from 'lucide-react';

export function StoreProductCard({ product, storeSlug, onAdd }: {
  product: Product; storeSlug: string; onAdd: (event: MouseEvent, product: Product) => void;
}) {
  const available = product.is_open && product.stock > 0;
  const ready = isProntaEntrega(product);
  const signal = getProductSignalAmount(product);
  const url = getProductUrl(storeSlug, product.slug || product.id);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <a href={url} className="relative block aspect-[4/3] overflow-hidden bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`Ver detalhes de ${product.model}`}>
        {product.image_url ? <img src={product.image_url} alt={product.model} loading="lazy" width="480" height="360" className="size-full object-contain p-3 transition-transform duration-300 motion-safe:group-hover:scale-105" /> : <div className="flex size-full items-center justify-center"><Package className="size-10 text-muted-foreground" /></div>}
        <span className="absolute left-3 top-3 rounded-md border bg-background/95 px-2 py-1 text-xs font-medium">{ready ? 'Pronta entrega' : 'Pré-venda'}</span>
      </a>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div><p className="text-xs text-muted-foreground">{product.brand} · {product.scale}</p><h3 className="mt-1 min-h-10 text-sm font-semibold leading-5 sm:text-base"><a href={url} className="line-clamp-2 hover:underline">{product.model}</a></h3></div>
        <div><p className="text-xs text-muted-foreground">Preço total à vista</p><p className="mt-0.5 text-xl font-bold tabular-nums">{brl(product.price)}</p><p className="mt-1 text-sm text-muted-foreground">{signal.isSemSinal ? 'Sem sinal antecipado' : `Sinal de ${brl(Math.min(Number(product.price), signal.amount))}`}</p></div>
        <div className="mt-auto space-y-3"><p className="text-xs text-muted-foreground">{ready ? 'Disponível para envio pela loja' : product.release_date ? `Previsão: ${new Date(`${product.release_date}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}` : 'Previsão de chegada a confirmar'}</p>
          <p className={`text-xs ${available && product.stock <= 2 ? 'font-semibold text-warning' : 'text-muted-foreground'}`}>{available ? `${product.stock} ${product.stock === 1 ? 'unidade disponível' : 'unidades disponíveis'}` : 'Indisponível no momento'}</p>
          {available ? <Button className="min-h-11 w-full gap-2" onClick={event => onAdd(event, product)}><ShoppingCart className="size-4" />Adicionar</Button> : <Button asChild variant="outline" className="min-h-11 w-full"><a href={url}>Ver disponibilidade</a></Button>}
        </div>
      </div>
    </article>
  );
}
