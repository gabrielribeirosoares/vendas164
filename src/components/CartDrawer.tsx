import { useRef, useState } from 'react';
import { useCartStore } from '@/lib/cart';
import { checkoutCart, reservationErrorMessage } from '@/lib/reservations';
import { brl } from '@/lib/format';
import { ShoppingBag, Trash2, Loader2, ChevronRight, Minus, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useSession } from '@/lib/session';

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

  async function refreshPrices() {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.from('products').select('*').in('id', cart.items.map(i => i.productId));
      if (error) throw error;
      cart.refreshPrices(data ?? []);
      setErrorMessage('');
      toast.success('Valores atualizados. Confira o resumo antes de confirmar.');
    } catch (error) { setErrorMessage(reservationErrorMessage(error)); }
    finally { setRefreshing(false); }
  }

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
        product_id: item.productId, quantity: item.quantity, installments: item.selectedInstallment,
        expected_total: item.totalPrice, expected_signal: item.downPaymentToPay,
      })));
      cart.clearCart();
      setIsOpen(false);
      toast.success('Reservas confirmadas! Acompanhe os pagamentos no seu painel.');
      await queryClient.invalidateQueries();
      navigate({ to: '/painel' });
    } catch (error) {
      setErrorMessage(reservationErrorMessage(error));
    } finally { checkoutLock.current = false; setReserving(false); }
  }

  return (
    <Sheet open={isOpen} onOpenChange={open => { if (!busy) setIsOpen(open); }}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative shrink-0" aria-label={`Abrir carrinho, ${cart.items.reduce((sum, item) => sum + item.quantity, 0)} unidades`}>
          <ShoppingBag className="size-4" aria-hidden />
          {cart.items.length > 0 && <span aria-hidden className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">{cart.items.reduce((sum, item) => sum + item.quantity, 0)}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col bg-card p-0 sm:max-w-lg" aria-busy={busy}>
        <SheetHeader className="border-b p-5 text-left">
          <SheetTitle>Seu carrinho</SheetTitle>
          <SheetDescription>Confira os produtos e as condições de cada loja.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {cart.items.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-4 py-12 text-center text-muted-foreground"><ShoppingBag className="size-12" /><p>Seu carrinho está vazio.</p><Button variant="outline" onClick={() => setIsOpen(false)}>Continuar explorando</Button></div> : stores.map(storeId => (
            <section key={storeId} className="mb-6 space-y-3" aria-label={cart.getItemsByStore(storeId)[0]?.storeName || 'Loja'}>
              <h3 className="text-sm font-semibold">{cart.getItemsByStore(storeId)[0]?.storeName || 'Loja'}</h3>
              {cart.getItemsByStore(storeId).map(item => (
                <article key={item.id} className="rounded-xl border bg-background/50 p-3">
                  <div className="flex gap-3">
                    <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted">{item.productSnapshot.image_url ? <img src={item.productSnapshot.image_url} alt="" className="size-full object-contain" /> : <ShoppingBag className="size-full p-5 text-muted-foreground" />}</div>
                    <div className="min-w-0 flex-1"><h4 className="text-sm font-semibold leading-snug">{item.productSnapshot.model}</h4><p className="mt-1 text-xs text-muted-foreground">{item.productSnapshot.brand} · {item.productSnapshot.scale}</p><p className="mt-2 font-semibold">{brl(item.totalPrice)}</p></div>
                    <Button variant="ghost" size="icon" disabled={busy} aria-label={`Remover ${item.productSnapshot.model}`} onClick={() => cart.removeItem(item.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center rounded-lg border"><Button variant="ghost" size="icon" disabled={busy || item.quantity <= 1 || !item.pricingProduct} aria-label={`Diminuir quantidade de ${item.productSnapshot.model}`} onClick={() => cart.updateQuantity(item.id, item.quantity - 1)}><Minus className="size-4" /></Button><span className="min-w-7 text-center tabular-nums" aria-live="polite">{item.quantity}</span><Button variant="ghost" size="icon" disabled={busy || !item.pricingProduct || item.quantity >= Math.min(100, item.pricingProduct?.stock ?? 100)} aria-label={`Aumentar quantidade de ${item.productSnapshot.model}`} onClick={() => cart.updateQuantity(item.id, item.quantity + 1)}><Plus className="size-4" /></Button></div>
                    <div className="text-right text-xs leading-relaxed text-muted-foreground"><p>Sinal: {brl(item.downPaymentToPay)}</p><p>{item.selectedInstallment > 1 ? `Saldo em ${item.selectedInstallment}x de aproximadamente ${brl(item.remainingBalance / item.selectedInstallment)}` : `Saldo: ${brl(item.remainingBalance)}`}</p></div>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
        {cart.items.length > 0 && <div className="space-y-3 border-t bg-background p-5">
          {errorMessage && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">{errorMessage}</p>}
          <Button variant="ghost" size="sm" disabled={busy} onClick={refreshPrices} className="gap-2"><RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />Atualizar valores</Button>
          <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Total dos produtos</dt><dd className="font-semibold tabular-nums">{brl(total)}</dd></div><div className="flex justify-between text-primary"><dt>Sinal a pagar</dt><dd className="font-bold tabular-nums">{brl(signal)}</dd></div><div className="flex justify-between text-muted-foreground"><dt>Saldo restante</dt><dd className="tabular-nums">{brl(total - signal)}</dd></div></dl>
          <p className="text-xs text-muted-foreground">A confirmação cria suas reservas. Os pagamentos são acompanhados no painel de cada pedido.</p>
          <Button className="h-12 w-full text-base" disabled={busy} onClick={handleCheckout}>{reserving ? <><Loader2 className="mr-2 size-5 animate-spin" />Confirmando...</> : <>Confirmar reservas<ChevronRight className="ml-2 size-5" /></>}</Button>
        </div>}
      </SheetContent>
    </Sheet>
  );
}
