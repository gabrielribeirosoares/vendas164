import { useState } from "react";
import { useCartStore } from "@/lib/cart";
import { reserveQuota, reservationErrorMessage } from "@/lib/reservations";
import { brl } from "@/lib/format";
import { ShoppingBag, Trash2, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "@/lib/session";

export function CartDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [reserving, setReserving] = useState(false);
  const cart = useCartStore();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const totalDownPayment = cart.getCartDownPaymentTotal();
  const total = cart.getCartTotal();

  async function handleCheckout() {
    if (!user) {
      toast.info("Você precisa estar logado para finalizar as reservas.");
      // Fechamos o drawer e mandamos pro auth
      setIsOpen(false);
      navigate({ to: "/auth" });
      return;
    }

    if (cart.items.length === 0) return;

    setReserving(true);
    try {
      for (const item of cart.items) {
        // Reservar as unidades necessárias deste item (já salva o parcelamento)
        const orderIds: string[] = [];
        for (let i = 0; i < item.quantity; i++) {
          const orderId = await reserveQuota(item.productId, item.selectedInstallment);
          orderIds.push(orderId);
        }

        // Atualizar metadata da reserva (preço final, sem sinal, etc)
        if (orderIds.length > 0) {
          const updatePayload: any = {};
          if (item.unitPriceForChosenOption && item.unitPriceForChosenOption > 0) {
            updatePayload.total_price = item.unitPriceForChosenOption;
          }
          if (item.hasNoSignal) {
            updatePayload.payment_status = "sem_sinal";
            updatePayload.reservation_expires_at = null;
          }

          if (Object.keys(updatePayload).length > 0) {
            const { error: updateErr } = await supabase
              .from("orders")
              .update(updatePayload)
              .in("id", orderIds);
            if (updateErr) {
              throw new Error(
                "Erro ao salvar reserva: " + (updateErr.message || JSON.stringify(updateErr)),
              );
            }
          }
        }
      }

      toast.success("Reservas concluídas com sucesso!");
      cart.clearCart();
      setIsOpen(false);

      await queryClient.invalidateQueries();
      navigate({ to: "/painel" });
    } catch (error) {
      console.error("[Cart Checkout] error:", error);
      toast.error(reservationErrorMessage(error));
    } finally {
      setReserving(false);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative shrink-0">
          <ShoppingBag className="size-4" />
          {cart.items.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {cart.items.reduce((acc, i) => acc + i.quantity, 0)}
            </span>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent className="flex flex-col w-full sm:max-w-md bg-card/95 backdrop-blur-md p-0 border-l border-border/50">
        <SheetHeader className="p-5 border-b border-border/20 text-left">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="size-5 text-primary" />
            Seu Carrinho
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5">
          {cart.items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 text-muted-foreground opacity-60">
              <ShoppingBag className="size-16 stroke-[1]" />
              <p>Seu carrinho está vazio.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-3 rounded-xl border border-border/30 bg-background/50"
                >
                  <div className="size-16 rounded-lg bg-muted overflow-hidden shrink-0">
                    {item.productSnapshot.image_url ? (
                      <img
                        src={item.productSnapshot.image_url}
                        alt={item.productSnapshot.model}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingBag className="w-full h-full p-4 text-muted-foreground opacity-20" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h4 className="font-semibold text-sm truncate">
                        {item.productSnapshot.model}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.productSnapshot.brand}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-xs">
                        <span className="font-semibold">
                          {item.quantity} {item.quantity === 1 ? "unidade" : "unidades"}
                        </span>
                        {item.selectedInstallment > 1
                          ? ` — ${item.selectedInstallment}x de ${brl(item.unitPriceForChosenOption / item.selectedInstallment)}`
                          : ` — ${brl(item.unitPriceForChosenOption)}`}
                      </div>
                      <button
                        onClick={() => cart.removeItem(item.id)}
                        className="text-destructive/70 hover:text-destructive transition-colors p-1"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="p-5 border-t border-border/20 bg-background/80 space-y-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Total dos produtos:</span>
                <span className="font-medium text-foreground">{brl(total)}</span>
              </div>
              <div className="flex justify-between text-primary font-bold">
                <span>Sinal a pagar agora:</span>
                <span>{brl(totalDownPayment)}</span>
              </div>
            </div>

            <Button
              className="w-full h-12 text-base font-semibold group"
              disabled={reserving}
              onClick={handleCheckout}
            >
              {reserving ? (
                <>
                  <Loader2 className="size-5 mr-2 animate-spin" /> Finalizando...
                </>
              ) : (
                <>
                  Finalizar Reservas{" "}
                  <ChevronRight className="size-5 ml-1 transition-transform group-hover:translate-x-1" />
                </>
              )}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
