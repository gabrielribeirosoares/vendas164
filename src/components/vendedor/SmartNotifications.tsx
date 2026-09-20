import { ShieldAlert, AlertTriangle, Package, Clock } from "lucide-react";
import type { Product } from "@/lib/cart";
import type { OrderRow } from "@/components/vendedor/OrderManager";

interface SmartNotificationsProps {
  products: Product[];
  orders: OrderRow[];
  waitlistCount?: number;
  onOpenOrders: (filter: "atrasado" | "envios") => void;
  onOpenProducts: () => void;
  onOpenWaitlist?: () => void;
}

export function SmartNotifications({
  products,
  orders,
  waitlistCount = 0,
  onOpenOrders,
  onOpenProducts,
  onOpenWaitlist,
}: SmartNotificationsProps) {
  const outOfStock = products.filter(p => p.stock === 0 && p.is_open);
  
  const now = new Date();
  const lateOrders = orders.filter(o => {
    if (o.payment_status !== "aguardando_sinal" || !o.reservation_expires_at) return false;
    return new Date(o.reservation_expires_at) < now;
  });

  const pendingShipping = orders.filter(o => o.payment_status === "quitado" && o.delivery_status !== "enviado" && o.delivery_status !== "em_transito" && o.delivery_status !== "cancelado" && o.delivery_status !== "entregue");

  if (outOfStock.length === 0 && lateOrders.length === 0 && pendingShipping.length === 0 && waitlistCount === 0) return null;

  return (
    <div className="mb-8 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {lateOrders.length > 0 && (
        <button type="button" onClick={() => onOpenOrders("atrasado")} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <ShieldAlert className="size-5 shrink-0 mt-0.5 text-destructive/80" />
          <div>
            <h4 className="font-semibold text-sm text-foreground">Sinais Atrasados</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{lateOrders.length} {lateOrders.length === 1 ? "reserva passou" : "reservas passaram"} do prazo.</p>
          </div>
        </button>
      )}
      {outOfStock.length > 0 && (
        <button type="button" onClick={onOpenProducts} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="size-5 shrink-0 mt-0.5 text-amber-500/80" />
          <div>
            <h4 className="font-semibold text-sm text-foreground">Estoque Esgotado</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{outOfStock.length} {outOfStock.length === 1 ? "miniatura zerou" : "miniaturas zeraram"}.</p>
          </div>
        </button>
      )}
      {pendingShipping.length > 0 && (
        <button type="button" onClick={() => onOpenOrders("envios")} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <Package className="size-5 shrink-0 mt-0.5 text-blue-500/80" />
          <div>
            <h4 className="font-semibold text-sm text-foreground">Envios Pendentes</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{pendingShipping.length} {pendingShipping.length === 1 ? "pedido aguarda" : "pedidos aguardam"} envio.</p>
          </div>
        </button>
      )}
      {waitlistCount > 0 && onOpenWaitlist && (
        <button type="button" onClick={onOpenWaitlist} className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 hover:bg-amber-500/10 transition-colors">
          <Clock className="size-5 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <h4 className="font-semibold text-sm text-foreground">Fila de Espera</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{waitlistCount} {waitlistCount === 1 ? "cliente aguarda" : "clientes aguardam"} miniaturas.</p>
          </div>
        </button>
      )}
    </div>
  );
}
