import { useEffect, useState, useRef } from 'react';
import { useCartStore } from '@/lib/cart';
import { checkoutCart, reservationErrorMessage } from '@/lib/reservations';
import { notifySellerNewOrderServer } from '@/lib/push';
import { brl } from '@/lib/format';
import { ShoppingBag, Trash2, Loader2, ChevronRight, Minus, Plus, RefreshCw, Store as StoreIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useSession } from '@/lib/session';
import { getProductCardImageUrl } from '@/lib/imageUrls';

export function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const checkoutLock = useRef(false);
  const cart = useCartStore();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const busy = reserving || refreshing;
  const total = cart.getCartTotal();
  const signal = cart.getCartDownPaymentTotal();
  const stores = [...new Set(cart.items.map(item => item.storeId))];
  const unitCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  async function refreshPrices(options: { silent?: boolean } = {}) {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.from('products').select('*').in('id', cart.items.map(i => i.productId));
      if (error) throw error;
      cart.refreshPrices(data ?? []);
      setErrorMessage('');
      if (!options.silent) {
        toast.success('Valores atualizados. Confira o resumo antes de confirmar.');
      }
    } catch (error) {
      setErrorMessage(reservationErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!isOpen || cart.items.length === 0) return;
    void refreshPrices({ silent: true });
  }, [isOpen]);

  async function handleCheckout() {
    if (checkoutLock.current || busy || cart.items.length === 0) return;
    if (!user) {
      setIsOpen(false);
      toast.info('Entre na sua conta para confirmar as reservas. Seu carrinho está salvo.');
      navigate({ to: '/auth', search: { next: window.location.pathname } });
      return;
    }
    checkoutLock.current = true;
    setReserving(true);
    setErrorMessage('');
    try {
      await checkoutCart(cart.getRequestId(), cart.items.map(item => ({
        product_id: item.productId,
        quantity: item.quantity,
        installments: item.selectedInstallment,
        expected_total: item.totalPrice,
        expected_signal: item.downPaymentToPay,
      })));
      cart.clearCart();
      setIsOpen(false);
      toast.success('Reservas confirmadas! Acompanhe os pagamentos no seu painel.');
      
      // Notify sellers
      const storeIds = [...new Set(cart.items.map(i => i.storeId))];
      storeIds.forEach(storeId => {
        if (storeId) notifySellerNewOrderServer({ data: storeId }).catch(console.error);
      });

      await queryClient.invalidateQueries();
      navigate({ to: '/painel' });
    } catch (error) {
      setErrorMessage(reservationErrorMessage(error));
    } finally {
      checkoutLock.current = false;
      setReserving(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={open => { if (open || !reserving) setIsOpen(open); }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative shrink-0" aria-label={`Abrir carrinho, ${unitCount} unidades`}>
          <ShoppingBag className="size-4" aria-hidden />
          {cart.items.length > 0 && (
            <span aria-hidden className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
              {unitCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col bg-card p-0 sm:max-w-lg" aria-busy={busy}>
        <SheetHeader className="border-b bg-background/80 p-4 text-left sm:p-5">
          <div className="flex items-center gap-2">
            <SheetTitle>Seu carrinho</SheetTitle>
            {unitCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {unitCount} {unitCount === 1 ? 'unidade' : 'unidades'}
              </span>
            )}
          </div>
          <SheetDescription>Revise produtos, quantidades e valores antes de confirmar.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {cart.items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center text-muted-foreground">
              <ShoppingBag className="size-12" />
              <p>Seu carrinho está vazio.</p>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Continuar explorando</Button>
            </div>
          ) : (
            stores.map(storeId => {
              const storeItems = cart.getItemsByStore(storeId);
              const storeName = storeItems[0]?.storeName || 'Loja';
              const storeTotal = storeItems.reduce((sum, item) => sum + item.totalPrice, 0);
              return (
                <section key={storeId} className="mb-5 overflow-hidden rounded-2xl border border-border/50 bg-background/40" aria-label={storeName}>
                  <header className="flex items-center justify-between gap-3 border-b border-border/40 bg-muted/30 px-3.5 py-3">
                    <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <StoreIcon className="size-4" aria-hidden />
                      </span>
                      <span className="truncate">{storeName}</span>
                    </h3>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {storeItems.reduce((sum, item) => sum + item.quantity, 0)} un.
                    </span>
                  </header>

                  <div className="divide-y divide-border/40">
                    {storeItems.map(item => (
                      <article key={item.id} className="p-3.5">
                        <div className="flex gap-3">
                          <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border/30 bg-muted/50">
                            {item.productSnapshot.image_url ? (
                              <img
                                src={getProductCardImageUrl(item.productSnapshot.image_url)}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="size-full object-contain p-1"
                              />
                            ) : (
                              <ShoppingBag className="size-full p-5 text-muted-foreground" aria-hidden />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="line-clamp-2 text-sm font-semibold leading-snug">{item.productSnapshot.model}</h4>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {item.productSnapshot.brand} · {item.productSnapshot.scale}
                            </p>
                            {item.productSnapshot.sku && (
                              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">SKU: {item.productSnapshot.sku}</p>
                            )}
                            <p className="mt-2 font-bold tabular-nums">{brl(item.totalPrice)}</p>
                            {item.quantity > 1 && (
                              <p className="text-xs text-muted-foreground">{brl(item.unitPriceForChosenOption)} por unidade</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 shrink-0"
                            disabled={busy}
                            aria-label={`Remover ${item.productSnapshot.model}`}
                            onClick={() => {
                              cart.removeItem(item.id);
                              setErrorMessage('');
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                          <div className="flex w-fit items-center rounded-xl border border-border/50 bg-muted/20">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-11 rounded-xl"
                              disabled={busy || item.quantity <= 1}
                              aria-label={`Diminuir quantidade de ${item.productSnapshot.model}`}
                              onClick={() => {
                                cart.updateQuantity(item.id, item.quantity - 1);
                                setErrorMessage('');
                              }}
                            >
                              <Minus className="size-4" />
                            </Button>
                            <span className="min-w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{item.quantity}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-11 rounded-xl"
                              disabled={busy || item.quantity >= Math.min(100, item.pricingProduct?.stock ?? 100)}
                              aria-label={`Aumentar quantidade de ${item.productSnapshot.model}`}
                              onClick={() => {
                                cart.updateQuantity(item.id, item.quantity + 1);
                                setErrorMessage('');
                              }}
                            >
                              <Plus className="size-4" />
                            </Button>
                          </div>

                          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-muted/20 p-2.5 text-xs">
                            <div>
                              <dt className="text-muted-foreground">Sinal</dt>
                              <dd className="mt-0.5 font-semibold tabular-nums text-primary">{brl(item.downPaymentToPay)}</dd>
                            </div>
                            <div className="text-right">
                              <dt className="text-muted-foreground">Saldo</dt>
                              <dd className="mt-0.5 font-semibold tabular-nums text-foreground">{brl(item.remainingBalance)}</dd>
                            </div>
                            {item.selectedInstallment > 1 && (
                              <div className="col-span-2 border-t border-border/30 pt-2 text-muted-foreground">
                                Saldo em {item.selectedInstallment}x de aproximadamente {brl(item.remainingBalance / item.selectedInstallment)}
                              </div>
                            )}
                          </dl>
                        </div>
                      </article>
                    ))}
                  </div>

                  <footer className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-3.5 py-2.5 text-xs">
                    <span className="text-muted-foreground">Subtotal da loja</span>
                    <strong className="text-sm tabular-nums text-foreground">{brl(storeTotal)}</strong>
                  </footer>
                </section>
              );
            })
          )}
        </div>
        {cart.items.length > 0 && (
          <div className="shrink-0 space-y-3 border-t bg-background/95 p-4 shadow-[0_-8px_24px_-16px_rgba(0,0,0,0.45)] backdrop-blur sm:p-5">
            {errorMessage && (
              <div role="alert" aria-live="assertive" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <p>{errorMessage}</p>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void refreshPrices()} className="mt-2 gap-2 border-destructive/30">
                  <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                  Atualizar e tentar novamente
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refreshPrices()} className="gap-2">
                <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
                Atualizar valores
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={busy} className="text-destructive hover:text-destructive">
                    Limpar carrinho
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar todo o carrinho?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Todos os produtos e as quantidades selecionadas serão removidos. Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => {
                        cart.clearCart();
                        setErrorMessage('');
                      }}
                    >
                      Remover tudo
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>Total dos produtos</dt>
                <dd className="font-semibold tabular-nums">{brl(total)}</dd>
              </div>
              <div className="flex justify-between text-primary">
                <dt>Sinal a pagar</dt>
                <dd className="font-bold tabular-nums">{brl(signal)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Saldo restante</dt>
                <dd className="tabular-nums">{brl(total - signal)}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">A confirmação cria suas reservas. Os pagamentos são acompanhados no painel de cada pedido.</p>
            <Button className="h-12 w-full text-base font-semibold" disabled={busy} onClick={handleCheckout}>
              {reserving ? (
                <>
                  <Loader2 className="mr-2 size-5 animate-spin" />
                  Confirmando...
                </>
              ) : (
                <>
                  {user ? `Confirmar ${unitCount} ${unitCount === 1 ? 'reserva' : 'reservas'}` : 'Entrar para confirmar'}
                  <ChevronRight className="ml-2 size-5" />
                </>
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
